#!/bin/sh
# Sinh chứng chỉ HTTPS tự ký cho localhost (chạy trong container "certgen" lúc docker compose up).
# Chỉ tạo khi chưa có -> không ghi đè chứng chỉ cũ. Muốn tạo lại: xóa nginx/certs/server.* rồi chạy lại.
set -eu

CERT_DIR=/certs
if [ -s "$CERT_DIR/server.crt" ] && [ -s "$CERT_DIR/server.key" ]; then
  echo "[certgen] Đã có chứng chỉ, bỏ qua."
  exit 0
fi

apk add --no-cache openssl >/dev/null

openssl req -x509 -nodes -newkey rsa:2048 -sha256 -days 365 \
  -keyout "$CERT_DIR/server.key" \
  -out "$CERT_DIR/server.crt" \
  -subj "/C=VN/ST=Thai Nguyen/O=DTC245200279 POS/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

# Nginx (unprivileged) chạy với uid 101 -> chỉ user này đọc được private key.
# Trên Docker Desktop (Windows) bind mount không hỗ trợ chown/chmod thật -> bỏ qua lỗi.
chown 101:101 "$CERT_DIR/server.key" "$CERT_DIR/server.crt" 2>/dev/null || true
chmod 600 "$CERT_DIR/server.key" 2>/dev/null || true
chmod 644 "$CERT_DIR/server.crt" 2>/dev/null || true
echo "[certgen] Đã tạo chứng chỉ tự ký cho localhost (hiệu lực 365 ngày)."
