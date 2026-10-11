// Metrics Prometheus cho ứng dụng POS — Prometheus scrape http://app:3000/metrics
// (Nginx chặn /metrics từ bên ngoài, chỉ mạng monitoring nội bộ mới truy cập được)
const client = require('prom-client');
const { pool } = require('./db');

const register = new client.Registry();
register.setDefaultLabels({ app: 'pos-app' });
// CPU, RAM, event loop lag, GC... của tiến trình Node.js
client.collectDefaultMetrics({ register });

const httpRequests = new client.Counter({
  name: 'http_requests_total',
  help: 'Tổng số HTTP request theo method/route/status',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Thời gian xử lý HTTP request (giây)',
  labelNames: ['method', 'route'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [register],
});

const invoicesCreated = new client.Counter({
  name: 'pos_invoices_created_total',
  help: 'Số hóa đơn đã tạo (từ lúc app khởi động)',
  registers: [register],
});

const revenue = new client.Counter({
  name: 'pos_revenue_vnd_total',
  help: 'Doanh thu từ hóa đơn đã tạo (VND, từ lúc app khởi động)',
  registers: [register],
});

const stockErrors = new client.Counter({
  name: 'pos_insufficient_stock_total',
  help: 'Số lần thanh toán bị từ chối do không đủ tồn kho',
  registers: [register],
});

// Gauge đọc trực tiếp từ DB mỗi lần Prometheus scrape
new client.Gauge({
  name: 'pos_products',
  help: 'Số sản phẩm theo trạng thái tồn kho (all / low / out)',
  labelNames: ['state'],
  registers: [register],
  async collect() {
    const [[row]] = await pool.query(
      'SELECT COUNT(*) AS total, COALESCE(SUM(stock <= min_stock), 0) AS low, COALESCE(SUM(stock = 0), 0) AS out_of_stock FROM products'
    );
    this.set({ state: 'all' }, Number(row.total));
    this.set({ state: 'low' }, Number(row.low));
    this.set({ state: 'out' }, Number(row.out_of_stock));
  },
});

// Ghi lại tiền tố router (/api/products...) lúc đang định tuyến; khi request lỗi,
// Express khôi phục req.baseUrl về '' trước khi sự kiện 'finish' chạy.
function captureBase(req, res, next) {
  res.locals.routeBase = req.baseUrl;
  next();
}

// Gom route theo mẫu (/api/products/:id) để không tạo quá nhiều chuỗi metrics
function routeLabel(req, res) {
  if (req.route?.path) {
    const full = `${res.locals.routeBase ?? req.baseUrl}${req.route.path}`;
    return full.length > 1 ? full.replace(/\/$/, '') : full;
  }
  if (req.path.startsWith('/api/')) return 'unmatched_api';
  return 'static';
}

function httpMetrics(req, res, next) {
  const end = httpDuration.startTimer();
  res.on('finish', () => {
    if (req.path === '/healthz' || req.path === '/metrics') return;
    const route = routeLabel(req, res);
    end({ method: req.method, route });
    httpRequests.inc({ method: req.method, route, status: res.statusCode });
  });
  next();
}

async function metricsHandler(_req, res) {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
}

module.exports = { httpMetrics, captureBase, metricsHandler, invoicesCreated, revenue, stockErrors };
