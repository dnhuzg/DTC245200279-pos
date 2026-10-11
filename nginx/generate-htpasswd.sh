#!/bin/sh
# Sinh file .htpasswd (basic auth cho Prometheus UI) từ PROMETHEUS_USER / PROMETHEUS_PASSWORD trong .env.
# Chạy mỗi lần "docker compose up" -> đổi mật khẩu trong .env là có hiệu lực sau khi up lại.
set -eu

: "${PROMETHEUS_USER:?Thiếu PROMETHEUS_USER}"
: "${PROMETHEUS_PASSWORD:?Thiếu PROMETHEUS_PASSWORD}"

command -v openssl >/dev/null 2>&1 || apk add --no-cache openssl >/dev/null

HASH=$(printf '%s' "$PROMETHEUS_PASSWORD" | openssl passwd -apr1 -stdin)
printf '%s:%s\n' "$PROMETHEUS_USER" "$HASH" > /auth/.htpasswd
chmod 644 /auth/.htpasswd 2>/dev/null || true
echo "[certgen] Đã tạo basic auth cho user '${PROMETHEUS_USER}' (Prometheus UI)."
