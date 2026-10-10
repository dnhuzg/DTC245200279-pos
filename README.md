# Hệ thống Quản lý Cửa hàng / POS

Đề tài 21 — môn **Triển khai và Quản trị Hệ thống Phần mềm**

| | |
|---|---|
| Sinh viên | Dương Ngô Hùng |
| MSSV | DTC245200279 |
| Stack | Node.js (Express) · MySQL 8.4 · phpMyAdmin · Nginx · Docker Compose |

Ứng dụng web quản lý bán hàng tại cửa hàng: quản lý sản phẩm (CRUD), tạo hóa đơn **tự động trừ tồn kho**, nhập hàng nhanh và **cảnh báo tồn kho thấp**. Toàn bộ hệ thống chạy bằng Docker Compose.

## Kiến trúc

```
                 Trình duyệt
                     │ HTTPS :443 (HTTP :80 → chuyển hướng HTTPS)
          ┌──────────▼──────────┐
          │   Nginx (non-root)  │  reverse proxy, TLS tự ký, security headers, rate limit
          └───┬─────────────┬───┘
   frontend   │ /           │ /phpmyadmin/
   network    ▼             ▼
        ┌──────────┐  ┌────────────┐
        │ POS app  │  │ phpMyAdmin │
        │ Node.js  │  └─────┬──────┘
        └────┬─────┘        │
   backend   │  (internal network, không ra Internet, không publish port)
   network   ▼              ▼
        ┌─────────────────────────┐
        │        MySQL 8.4        │  volume: mysql_data
        └─────────────────────────┘
```

| Service | Image | Mạng | Port ra host |
|---|---|---|---|
| `nginx` | nginxinc/nginx-unprivileged:1.27-alpine | frontend | 80, 443 |
| `app` | build từ `./app` (node:22-alpine) | frontend, backend | — |
| `mysql` | mysql:8.4 | backend | — |
| `phpmyadmin` | phpmyadmin:5.2-apache | frontend, backend | — |
| `certgen` | alpine:3.20 (chạy 1 lần sinh chứng chỉ) | — | — |

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
│   └── 03-app-user.sh        # tạo user app với quyền tối thiểu
└── nginx/
    ├── conf.d/default.conf   # reverse proxy + HTTPS
    ├── snippets/security-headers.conf
    ├── generate-cert.sh      # sinh chứng chỉ tự ký
    └── certs/                # chứng chỉ sinh ra (không commit)
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

Lần đầu chạy, MySQL tự tạo bảng, nạp dữ liệu mẫu và tạo user cho app; container `certgen` tự sinh chứng chỉ HTTPS vào `nginx/certs/`.

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
| API kiểm tra sức khỏe | https://localhost/healthz |

## Tài khoản demo

| Dịch vụ | Tài khoản | Mật khẩu |
|---|---|---|
| phpMyAdmin | giá trị `APP_DB_USER` trong `.env` (mặc định `pos_app`) | giá trị `APP_DB_PASSWORD` trong `.env` |
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

## Bảo mật (Hardening)

| Biện pháp | Áp dụng |
|---|---|
| Container non-root | `app` chạy user `node` (uid 1000); `nginx` dùng image *unprivileged* (uid 101, cổng 8080/8443) |
| Tách mạng | `frontend` (Nginx ↔ app/phpMyAdmin) và `backend` (**internal**: chỉ app/phpMyAdmin ↔ MySQL, không ra Internet) |
| DB không lộ ra ngoài | MySQL **không publish port**; phpMyAdmin chỉ truy cập qua Nginx HTTPS |
| Mật khẩu mạnh qua `.env` | Không hard-code mật khẩu; `.env` nằm trong `.gitignore`; compose báo lỗi nếu thiếu biến |
| Quyền DB tối thiểu | User app chỉ có `SELECT, INSERT, UPDATE, DELETE` trên `pos_db`; root chỉ đăng nhập từ `localhost` trong container; tắt `local-infile` |
| Giảm đặc quyền container | `no-new-privileges` cho mọi service; `cap_drop: ALL` cho app & nginx; `read_only` filesystem cho app & nginx (chỉ `/tmp` ghi được) |
| Nginx | HTTPS (TLS 1.2/1.3), chuyển hướng HTTP→HTTPS, ẩn version (`server_tokens off`), rate limit API, chặn file ẩn (`.env`, `.git`) |
| Security headers | `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` |
| Ứng dụng | Truy vấn tham số hóa (chống SQL injection), validate input, giới hạn body 100 KB, không trả stack trace ra client, escape HTML phía giao diện |
| Giới hạn tài nguyên | CPU/RAM limit cho từng container; log xoay vòng (10 MB × 3 file) |

Kiểm tra nhanh security headers:

```powershell
curl.exe -skI https://localhost
```
