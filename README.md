# Hệ thống Quản lý Cửa hàng / POS

Đề tài 21 — môn **Triển khai và Quản trị Hệ thống Phần mềm**

| | |
|---|---|
| Sinh viên | Dương Ngô Hùng |
| MSSV | DTC245200279 |
| Stack | Node.js (Express) · MySQL 8.4 · phpMyAdmin · Nginx · Prometheus · Grafana · Docker Compose |

Ứng dụng web quản lý bán hàng tại cửa hàng: quản lý sản phẩm (CRUD), tạo hóa đơn **tự động trừ tồn kho**, nhập hàng nhanh và **cảnh báo tồn kho thấp**. Hệ thống được giám sát bằng Prometheus + Grafana. Toàn bộ chạy bằng Docker Compose.

## Kiến trúc

```
                         Trình duyệt
                             │ HTTPS :443 (HTTP :80 → chuyển hướng HTTPS)
                  ┌──────────▼──────────┐
                  │   Nginx (non-root)  │  reverse proxy, TLS tự ký, security headers, rate limit
                  └─┬───────┬────────┬──┘
     frontend       │ /     │ /phpmyadmin/     /grafana/  /prometheus/ (basic auth)
     network        ▼       ▼                       │          │
             ┌──────────┐ ┌────────────┐            │          │
             │ POS app  │ │ phpMyAdmin │            │          │
             │ /metrics │ └─────┬──────┘            │          │
             └────┬─────┘       │                   │          │
     backend      │             │                   │          │
     (internal)   ▼             ▼                   │          │
             ┌─────────────────────┐   ┌─────────────────┐     │
             │      MySQL 8.4      │◄──┤ mysqld-exporter │     │
             └─────────────────────┘   └────────┬────────┘     │
                                                │              │
     monitoring (internal)                      ▼              ▼
             ┌──────────┐  ┌────────────────┐  ┌────────────┐  ┌─────────┐
             │ cAdvisor │  │ nginx-exporter │─►│ Prometheus │◄─┤ Grafana │
             └────┬─────┘  └────────────────┘  └────────────┘  └─────────┘
                  └──────────── scrape ──────────────┘
```

Prometheus thu thập metrics mỗi 15 giây từ 5 nguồn: chính nó, app (`app:3000/metrics`), `nginx-exporter` (đọc `stub_status` của Nginx), `mysqld-exporter` và `cAdvisor`. Grafana đọc Prometheus và hiển thị dashboard.

| Service | Image | Mạng | Port ra host |
|---|---|---|---|
| `nginx` | nginxinc/nginx-unprivileged:1.27-alpine | frontend, monitoring | 80, 443 |
| `app` | build từ `./app` (node:22-alpine) | frontend, backend, monitoring | — |
| `mysql` | mysql:8.4 | backend | — |
| `phpmyadmin` | phpmyadmin:5.2-apache | frontend, backend | — |
| `prometheus` | prom/prometheus:v3.4.0 | monitoring | — |
| `grafana` | grafana/grafana:11.6.0 | monitoring | — |
| `cadvisor` | ghcr.io/google/cadvisor:v0.53.0 | monitoring | — |
| `nginx-exporter` | nginx/nginx-prometheus-exporter:1.4.2 | monitoring | — |
| `mysqld-exporter` | prom/mysqld-exporter:v0.17.2 | backend, monitoring | — |
| `certgen` | alpine:3.20 (sinh chứng chỉ + basic auth rồi thoát) | — | — |

## Cấu trúc thư mục

```
.
├── docker-compose.yml
├── .env.example              # mẫu biến môi trường (copy thành .env)
├── app/                      # ứng dụng POS
│   ├── Dockerfile
│   ├── src/                  # server.js, db.js, routes/products.js, routes/invoices.js
│   └── public/               # giao diện web (HTML/CSS/JS)
├── mysql/init/               # chạy tự động lần đầu khởi tạo DB
│   ├── 01-schema.sql         # bảng products, invoices, invoice_items
│   ├── 02-seed.sql           # dữ liệu mẫu
│   ├── 03-app-user.sh        # tạo user app với quyền tối thiểu
│   └── 04-exporter-user.sh   # user chỉ đọc trạng thái cho mysqld-exporter
├── monitoring/
│   ├── prometheus/
│   │   ├── prometheus.yml    # danh sách target scrape
│   │   └── alert-rules.yml   # luật cảnh báo
│   └── grafana/
│       ├── provisioning/     # tự tạo datasource + nạp dashboard
│       └── dashboards/pos-overview.json
└── nginx/
    ├── conf.d/default.conf   # reverse proxy + HTTPS + stub_status
    ├── snippets/security-headers.conf
    ├── generate-cert.sh      # sinh chứng chỉ tự ký
    ├── generate-htpasswd.sh  # sinh basic auth cho Prometheus
    ├── certs/                # chứng chỉ sinh ra (không commit)
    └── auth/                 # .htpasswd sinh ra (không commit)
```

## Hướng dẫn chạy

Yêu cầu: **Docker Desktop** (Windows/macOS) hoặc Docker Engine + Compose v2 (Linux). Cổng 80 và 443 trên máy phải đang trống.

```powershell
# 1. Clone
git clone https://github.com/<tai-khoan-DTC245200279>/<ten-repo>.git
cd <ten-repo>

# 2. Tạo file .env từ mẫu, rồi mở .env và ĐỔI tất cả mật khẩu
copy .env.example .env          # Linux/macOS: cp .env.example .env

# 3. Build và khởi chạy
docker compose up -d --build

# 4. Kiểm tra trạng thái (đợi tất cả "healthy" / "running")
docker compose ps
```

Lần đầu chạy, MySQL tự tạo bảng, nạp dữ liệu mẫu, tạo user cho app và cho mysqld-exporter; container `certgen` tự sinh chứng chỉ HTTPS vào `nginx/certs/` và file basic auth của Prometheus vào `nginx/auth/`.

> **Docker Desktop trên Windows:** cAdvisor không đọc được container khi bật *containerd image store*. Vào **Settings → General**, bỏ tick **“Use containerd for pulling and storing images”** → *Apply & restart* (Docker phải dùng storage driver `overlay2`, kiểm tra bằng `docker info`).

> Trình duyệt sẽ cảnh báo “Kết nối không riêng tư” do chứng chỉ **tự ký** — chọn *Nâng cao → Tiếp tục truy cập localhost*.

Các lệnh hữu ích:

```powershell
docker compose logs -f app          # xem log ứng dụng
docker compose down                 # dừng hệ thống (giữ dữ liệu)
docker compose down -v              # dừng và XÓA dữ liệu MySQL (lần sau sẽ nạp lại dữ liệu mẫu)
```

## Địa chỉ truy cập

| Thành phần | URL |
|---|---|
| Website POS | https://localhost |
| phpMyAdmin | https://localhost/phpmyadmin/ |
| Grafana (dashboard “POS - Tổng quan hệ thống”) | https://localhost/grafana/ |
| Prometheus (targets, alerts, truy vấn PromQL) | https://localhost/prometheus/ |
| API kiểm tra sức khỏe | https://localhost/healthz |

## Tài khoản demo

| Dịch vụ | Tài khoản | Mật khẩu |
|---|---|---|
| phpMyAdmin | giá trị `APP_DB_USER` trong `.env` (mặc định `pos_app`) | giá trị `APP_DB_PASSWORD` trong `.env` |
| Grafana | giá trị `GRAFANA_ADMIN_USER` (mặc định `admin`) | giá trị `GRAFANA_ADMIN_PASSWORD` |
| Prometheus (basic auth) | giá trị `PROMETHEUS_USER` (mặc định `prometheus`) | giá trị `PROMETHEUS_PASSWORD` |
| MySQL root | `root` — **chỉ đăng nhập được từ bên trong container** | giá trị `MYSQL_ROOT_PASSWORD` |

Đăng nhập root để quản trị:

```powershell
docker compose exec mysql mysql -uroot -p
```

## Chức năng ứng dụng

- **Tổng quan:** doanh thu & số hóa đơn hôm nay, số sản phẩm, danh sách cảnh báo tồn kho thấp (tồn ≤ ngưỡng), nút nhập hàng nhanh.
- **Bán hàng:** chọn sản phẩm vào giỏ, sửa số lượng, thanh toán → tạo hóa đơn và trừ tồn kho trong **một transaction** (`SELECT ... FOR UPDATE` chống bán vượt tồn kho khi nhiều quầy thanh toán cùng lúc). Sau thanh toán hiện cảnh báo nếu sản phẩm xuống dưới ngưỡng.
- **Sản phẩm:** thêm / sửa / xóa, tìm kiếm, lọc tồn kho thấp, điều chỉnh tồn kho nhanh (+/−).
- **Hóa đơn:** danh sách và chi tiết hóa đơn.

### REST API

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/api/products?q=&category=&low=1` | Danh sách sản phẩm |
| GET | `/api/products/low-stock` | Sản phẩm tồn kho thấp |
| GET | `/api/products/:id` | Chi tiết sản phẩm |
| POST | `/api/products` | Thêm sản phẩm |
| PUT | `/api/products/:id` | Sửa sản phẩm |
| DELETE | `/api/products/:id` | Xóa (409 nếu đã có trong hóa đơn) |
| POST | `/api/products/:id/stock` | Điều chỉnh tồn kho `{ "delta": 10 }` |
| GET | `/api/invoices` | Danh sách hóa đơn |
| GET | `/api/invoices/:id` | Chi tiết hóa đơn |
| POST | `/api/invoices` | Tạo hóa đơn `{ "customer_name": "...", "items": [{ "product_id": 1, "quantity": 2 }] }` |
| GET | `/api/stats` | Thống kê nhanh |
| GET | `/healthz` | Kiểm tra app + kết nối DB |

## Giám sát (Prometheus + Grafana)

Grafana tự tạo datasource Prometheus và tự nạp dashboard **POS - Tổng quan hệ thống** (thư mục *POS*), không cần cấu hình tay. Dashboard gồm:

| Nhóm | Panel |
|---|---|
| Trạng thái | Số target UP, App / MySQL / Nginx UP-DOWN, số sản phẩm tồn kho thấp, doanh thu 1 giờ |
| Ứng dụng | Request/giây theo mã trạng thái và theo route, độ trễ p50/p95/p99, hóa đơn tạo mới, số lần bị từ chối do thiếu tồn kho |
| Nginx | Kết nối đang mở, request/giây, trạng thái kết nối (reading/writing/waiting) |
| MySQL | Kết nối, truy vấn/giây, lệnh SQL theo loại (select/insert/update/delete) |
| Container | CPU %, RAM, network theo từng container (cAdvisor) |

Metrics riêng của app (`app/src/metrics.js`):

| Metric | Ý nghĩa |
|---|---|
| `http_requests_total{method,route,status}` | Tổng số request |
| `http_request_duration_seconds` | Histogram thời gian xử lý |
| `pos_invoices_created_total` | Số hóa đơn đã tạo |
| `pos_revenue_vnd_total` | Doanh thu (VND) |
| `pos_insufficient_stock_total` | Số lần thanh toán bị từ chối do thiếu tồn kho |
| `pos_products{state="all\|low\|out"}` | Số sản phẩm theo trạng thái tồn kho (đọc từ DB) |

Luật cảnh báo trong `monitoring/prometheus/alert-rules.yml` (xem tại *Prometheus → Alerts*): `TargetDown`, `MySQLDown`, `NginxDown`, `HighErrorRate`, `LowStockProducts`, `ContainerHighMemory`.

Một số truy vấn PromQL thử trong Prometheus:

```promql
up                                                            # trạng thái 5 target
sum by (status) (rate(http_requests_total[1m]))               # request/giây theo mã trạng thái
pos_products{state="low"}                                     # số sản phẩm tồn kho thấp
sum by (container_label_com_docker_compose_service) (container_memory_working_set_bytes{container_label_com_docker_compose_service!=""})
```

## Bảo mật (Hardening)

| Biện pháp | Áp dụng |
|---|---|
| Container non-root | `app` (uid 1000), `nginx` *unprivileged* (uid 101, cổng 8080/8443), `prometheus`/exporters (`nobody` 65534), `grafana` (uid 472) |
| Tách mạng | `frontend` (Nginx ↔ app/phpMyAdmin); `backend` **internal** (app/phpMyAdmin/mysqld-exporter ↔ MySQL); `monitoring` **internal** (Prometheus, Grafana, exporters). Hai mạng internal không ra được Internet |
| Không publish port nội bộ | Chỉ Nginx publish 80/443. MySQL, Prometheus, Grafana, exporters, stub_status (8081) **không publish port** |
| Mật khẩu mạnh qua `.env` | Không hard-code mật khẩu; `.env` nằm trong `.gitignore`; compose báo lỗi nếu thiếu biến |
| Quyền DB tối thiểu | User app chỉ có `SELECT, INSERT, UPDATE, DELETE` trên `pos_db`; user exporter chỉ `PROCESS, REPLICATION CLIENT` + đọc `performance_schema`, tối đa 3 kết nối; root chỉ đăng nhập từ `localhost` trong container; tắt `local-infile` |
| Giám sát có xác thực | Grafana bắt đăng nhập (tắt anonymous, tắt đăng ký, cookie secure); Prometheus UI bảo vệ bằng basic auth; `/metrics` của app bị Nginx chặn từ ngoài (trả 404) |
| Giảm đặc quyền container | `no-new-privileges` cho mọi service; `cap_drop: ALL` và `read_only` filesystem cho app, nginx, prometheus, grafana, exporters. Ngoại lệ: cAdvisor cần `privileged` + mount chỉ đọc `/sys`, `/var/lib/docker` để đọc cgroup |
| Nginx | HTTPS (TLS 1.2/1.3), chuyển hướng HTTP→HTTPS, ẩn version (`server_tokens off`), rate limit API, chặn file ẩn (`.env`, `.git`) |
| Security headers | `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` |
| Ứng dụng | Truy vấn tham số hóa (chống SQL injection), validate input, giới hạn body 100 KB, không trả stack trace ra client, escape HTML phía giao diện |
| Giới hạn tài nguyên | CPU/RAM limit cho từng container; log xoay vòng (10 MB × 3 file) |

Kiểm tra nhanh security headers:

```powershell
curl.exe -skI https://localhost
```
