const express = require('express');
const { pool, withTransaction } = require('../db');
const { HttpError, toInt, toText } = require('../errors');
const log = require('../logger');

const router = express.Router();

const COLUMNS = 'id, sku, name, category, unit, price, stock, min_stock, (stock <= min_stock) AS is_low, created_at, updated_at';

function normalize(row) {
  return { ...row, is_low: Boolean(row.is_low) };
}

function parseProduct(body) {
  return {
    sku: toText(body.sku, 'sku', { max: 32 }).toUpperCase(),
    name: toText(body.name, 'name', { max: 150 }),
    category: toText(body.category, 'category', { max: 60, required: false, fallback: 'Khác' }),
    unit: toText(body.unit, 'unit', { max: 20, required: false, fallback: 'cái' }),
    price: toInt(body.price, 'price', { min: 0, max: 1_000_000_000 }),
    stock: toInt(body.stock ?? 0, 'stock', { min: 0, max: 1_000_000 }),
    min_stock: toInt(body.min_stock ?? 5, 'min_stock', { min: 0, max: 1_000_000 }),
  };
}

async function findById(id, conn = pool) {
  const [rows] = await conn.query(`SELECT ${COLUMNS} FROM products WHERE id = ?`, [id]);
  if (rows.length === 0) throw new HttpError(404, 'Không tìm thấy sản phẩm');
  return normalize(rows[0]);
}

// GET /api/products?q=&category=&low=1
router.get('/', async (req, res) => {
  const where = [];
  const params = [];
  if (req.query.q) {
    where.push('(name LIKE ? OR sku LIKE ?)');
    const q = `%${String(req.query.q).slice(0, 100)}%`;
    params.push(q, q);
  }
  if (req.query.category) {
    where.push('category = ?');
    params.push(String(req.query.category).slice(0, 60));
  }
  if (req.query.low === '1') where.push('stock <= min_stock');

  const sql = `SELECT ${COLUMNS} FROM products ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY name`;
  const [rows] = await pool.query(sql, params);
  res.json(rows.map(normalize));
});

// GET /api/products/low-stock — danh sách sản phẩm tồn kho thấp (stock <= min_stock)
router.get('/low-stock', async (_req, res) => {
  const [rows] = await pool.query(
    // CAST sang SIGNED: cột UNSIGNED trừ ra số âm sẽ bị lỗi "out of range"
    `SELECT ${COLUMNS} FROM products WHERE stock <= min_stock
      ORDER BY CAST(stock AS SIGNED) - CAST(min_stock AS SIGNED), name`
  );
  res.json(rows.map(normalize));
});

router.get('/categories', async (_req, res) => {
  const [rows] = await pool.query('SELECT DISTINCT category FROM products ORDER BY category');
  res.json(rows.map((r) => r.category));
});

router.get('/:id', async (req, res) => {
  res.json(await findById(toInt(req.params.id, 'id', { min: 1 })));
});

router.post('/', async (req, res) => {
  const p = parseProduct(req.body ?? {});
  const [result] = await pool.query(
    'INSERT INTO products (sku, name, category, unit, price, stock, min_stock) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [p.sku, p.name, p.category, p.unit, p.price, p.stock, p.min_stock]
  );
  log.info('product_created', { product_id: result.insertId, sku: p.sku });
  res.status(201).json(await findById(result.insertId));
});

router.put('/:id', async (req, res) => {
  const id = toInt(req.params.id, 'id', { min: 1 });
  const p = parseProduct(req.body ?? {});
  const [result] = await pool.query(
    'UPDATE products SET sku = ?, name = ?, category = ?, unit = ?, price = ?, stock = ?, min_stock = ? WHERE id = ?',
    [p.sku, p.name, p.category, p.unit, p.price, p.stock, p.min_stock, id]
  );
  if (result.affectedRows === 0) throw new HttpError(404, 'Không tìm thấy sản phẩm');
  log.info('product_updated', { product_id: id, sku: p.sku });
  res.json(await findById(id));
});

router.delete('/:id', async (req, res) => {
  const id = toInt(req.params.id, 'id', { min: 1 });
  try {
    const [result] = await pool.query('DELETE FROM products WHERE id = ?', [id]);
    if (result.affectedRows === 0) throw new HttpError(404, 'Không tìm thấy sản phẩm');
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      throw new HttpError(409, 'Sản phẩm đã có trong hóa đơn nên không thể xóa');
    }
    throw err;
  }
  log.info('product_deleted', { product_id: id });
  res.status(204).end();
});

// POST /api/products/:id/stock  { "delta": 10 }  — nhập thêm (+) hoặc điều chỉnh giảm (-) tồn kho nhanh
router.post('/:id/stock', async (req, res) => {
  const id = toInt(req.params.id, 'id', { min: 1 });
  const delta = toInt(req.body?.delta, 'delta', { min: -1_000_000, max: 1_000_000 });
  if (delta === 0) throw new HttpError(400, 'Số lượng điều chỉnh phải khác 0');

  const product = await withTransaction(async (conn) => {
    // Khóa dòng (FOR UPDATE) để tránh 2 request cùng sửa tồn kho một lúc
    const [rows] = await conn.query('SELECT stock, unit FROM products WHERE id = ? FOR UPDATE', [id]);
    if (rows.length === 0) throw new HttpError(404, 'Không tìm thấy sản phẩm');
    const { stock, unit } = rows[0];
    const next = stock + delta;
    if (next < 0) throw new HttpError(409, `Tồn kho hiện có ${stock} ${unit}, không thể giảm ${-delta}`);
    await conn.query('UPDATE products SET stock = ? WHERE id = ?', [next, id]);
    return findById(id, conn);
  });

  log.info('stock_adjusted', { product_id: id, sku: product.sku, delta, stock: product.stock });
  if (product.is_low) log.warn('low_stock', { product_id: id, sku: product.sku, stock: product.stock, min_stock: product.min_stock });
  res.json(product);
});

module.exports = router;
