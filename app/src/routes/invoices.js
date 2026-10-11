const express = require('express');
const { pool, withTransaction } = require('../db');
const { HttpError, toInt, toText } = require('../errors');
const log = require('../logger');
const { invoicesCreated, revenue, stockErrors } = require('../metrics');

const router = express.Router();

const invoiceCode = (id) => `HD${String(id).padStart(6, '0')}`;

async function findInvoice(id, conn = pool) {
  const [rows] = await conn.query('SELECT * FROM invoices WHERE id = ?', [id]);
  if (rows.length === 0) throw new HttpError(404, 'Không tìm thấy hóa đơn');
  const [items] = await conn.query(
    'SELECT product_id, product_name, unit_price, quantity, line_total FROM invoice_items WHERE invoice_id = ? ORDER BY id',
    [id]
  );
  return { ...rows[0], code: invoiceCode(id), total: Number(rows[0].total), items: items.map((i) => ({ ...i, line_total: Number(i.line_total) })) };
}

// GET /api/invoices?limit=50
router.get('/', async (req, res) => {
  const limit = req.query.limit ? toInt(req.query.limit, 'limit', { min: 1, max: 500 }) : 50;
  const [rows] = await pool.query(
    `SELECT i.id, i.customer_name, i.total, i.note, i.created_at, COALESCE(SUM(it.quantity), 0) AS item_count
       FROM invoices i LEFT JOIN invoice_items it ON it.invoice_id = i.id
      GROUP BY i.id ORDER BY i.id DESC LIMIT ?`,
    [limit]
  );
  res.json(rows.map((r) => ({ ...r, code: invoiceCode(r.id), total: Number(r.total), item_count: Number(r.item_count) })));
});

router.get('/:id', async (req, res) => {
  res.json(await findInvoice(toInt(req.params.id, 'id', { min: 1 })));
});

// POST /api/invoices
// { "customer_name": "Khách lẻ", "note": "", "items": [ { "product_id": 1, "quantity": 2 }, ... ] }
// Tạo hóa đơn và TỰ ĐỘNG TRỪ TỒN KHO trong cùng một transaction.
router.post('/', async (req, res) => {
  const body = req.body ?? {};
  const customer = toText(body.customer_name, 'customer_name', { max: 100, required: false, fallback: 'Khách lẻ' });
  const note = toText(body.note, 'note', { max: 255, required: false, fallback: null });

  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new HttpError(400, 'Hóa đơn phải có ít nhất 1 sản phẩm');
  }
  if (body.items.length > 100) throw new HttpError(400, 'Hóa đơn tối đa 100 dòng');

  // Gộp các dòng trùng sản phẩm
  const wanted = new Map();
  for (const item of body.items) {
    const productId = toInt(item?.product_id, 'product_id', { min: 1 });
    const qty = toInt(item?.quantity, 'quantity', { min: 1, max: 10_000 });
    wanted.set(productId, (wanted.get(productId) ?? 0) + qty);
  }
  const ids = [...wanted.keys()];

  const { invoice, lowStock } = await withTransaction(async (conn) => {
    // Khóa các sản phẩm liên quan để không bán vượt tồn kho khi có nhiều quầy cùng thanh toán
    const [products] = await conn.query(
      'SELECT id, sku, name, unit, price, stock, min_stock FROM products WHERE id IN (?) ORDER BY id FOR UPDATE',
      [ids]
    );
    const byId = new Map(products.map((p) => [p.id, p]));

    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length) throw new HttpError(404, `Không tìm thấy sản phẩm id: ${missing.join(', ')}`);

    const shortages = ids
      .map((id) => ({ p: byId.get(id), qty: wanted.get(id) }))
      .filter(({ p, qty }) => p.stock < qty)
      .map(({ p, qty }) => ({ product_id: p.id, name: p.name, requested: qty, available: p.stock }));
    if (shortages.length) {
      stockErrors.inc();
      throw new HttpError(409, 'Không đủ tồn kho', shortages);
    }

    const lines = ids.map((id) => {
      const p = byId.get(id);
      const qty = wanted.get(id);
      return { p, qty, lineTotal: p.price * qty };
    });
    const total = lines.reduce((sum, l) => sum + l.lineTotal, 0);

    const [result] = await conn.query(
      'INSERT INTO invoices (customer_name, total, note) VALUES (?, ?, ?)',
      [customer, total, note]
    );
    const invoiceId = result.insertId;

    await conn.query(
      'INSERT INTO invoice_items (invoice_id, product_id, product_name, unit_price, quantity, line_total) VALUES ?',
      [lines.map((l) => [invoiceId, l.p.id, l.p.name, l.p.price, l.qty, l.lineTotal])]
    );

    for (const l of lines) {
      await conn.query('UPDATE products SET stock = stock - ? WHERE id = ?', [l.qty, l.p.id]);
    }

    const low = lines
      .map((l) => ({ product_id: l.p.id, sku: l.p.sku, name: l.p.name, unit: l.p.unit, stock: l.p.stock - l.qty, min_stock: l.p.min_stock }))
      .filter((p) => p.stock <= p.min_stock);

    return { invoice: await findInvoice(invoiceId, conn), lowStock: low };
  });

  invoicesCreated.inc();
  revenue.inc(invoice.total);
  log.info('invoice_created', { invoice_id: invoice.id, code: invoice.code, total: invoice.total, lines: invoice.items.length });
  for (const p of lowStock) {
    log.warn('low_stock', { product_id: p.product_id, sku: p.sku, stock: p.stock, min_stock: p.min_stock });
  }

  res.status(201).json({ ...invoice, low_stock: lowStock });
});

module.exports = router;
