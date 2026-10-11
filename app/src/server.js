const path = require('path');
const express = require('express');
const { pool } = require('./db');
const { HttpError } = require('./errors');
const log = require('./logger');
const { httpMetrics, captureBase, metricsHandler } = require('./metrics');

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.disable('x-powered-by');
// Chạy sau Nginx: tin header X-Forwarded-* từ đúng 1 proxy
app.set('trust proxy', 1);

// Log mỗi request dạng JSON (bỏ qua healthcheck/metrics cho đỡ nhiễu)
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    if (req.path === '/healthz' || req.path === '/metrics') return;
    const fields = {
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      duration_ms: Number((process.hrtime.bigint() - start) / 1_000_000n),
      ip: req.ip,
    };
    if (res.statusCode >= 500) log.error('http_request', fields);
    else if (res.statusCode >= 400) log.warn('http_request', fields);
    else log.info('http_request', fields);
  });
  next();
});

app.use(httpMetrics);
app.use(express.json({ limit: '100kb' }));

// Prometheus scrape trực tiếp qua mạng monitoring; Nginx chặn đường dẫn này từ bên ngoài
app.get('/metrics', metricsHandler);

app.get('/healthz', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'unreachable' });
  }
});

app.get('/api/stats', async (_req, res) => {
  const [[products]] = await pool.query(
    'SELECT COUNT(*) AS total, COALESCE(SUM(stock <= min_stock), 0) AS low, COALESCE(SUM(stock = 0), 0) AS out_of_stock FROM products'
  );
  const [[today]] = await pool.query(
    'SELECT COUNT(*) AS invoices, COALESCE(SUM(total), 0) AS revenue FROM invoices WHERE created_at >= CURDATE()'
  );
  res.json({
    products: Number(products.total),
    low_stock: Number(products.low),
    out_of_stock: Number(products.out_of_stock),
    invoices_today: Number(today.invoices),
    revenue_today: Number(today.revenue),
  });
});

app.use('/api/products', captureBase, require('./routes/products'));
app.use('/api/invoices', captureBase, require('./routes/invoices'));

app.use('/api', (_req, _res) => {
  throw new HttpError(404, 'API không tồn tại');
});

app.use(express.static(path.join(__dirname, '..', 'public'), { index: 'index.html', maxAge: '1h' }));

// Xử lý lỗi tập trung: không lộ stack trace / chi tiết SQL ra client
app.use((err, req, res, _next) => {
  if (err.type === 'entity.parse.failed') err = new HttpError(400, 'JSON không hợp lệ');
  if (err.code === 'ER_DUP_ENTRY') err = new HttpError(409, 'Mã SKU đã tồn tại');

  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  log.error('unhandled_error', { method: req.method, path: req.originalUrl, error: err.message, code: err.code });
  res.status(500).json({ error: 'Lỗi máy chủ, vui lòng thử lại sau' });
});

const server = app.listen(PORT, () => log.info('server_started', { port: PORT }));

function shutdown(signal) {
  log.info('server_stopping', { signal });
  server.close(() => pool.end().finally(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
