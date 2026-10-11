#!/bin/sh
# Sinh cấu hình Alertmanager từ file mẫu + biến môi trường (.env), rồi khởi động Alertmanager.
# Token Telegram chỉ nằm trong tmpfs /tmp của container, không ghi vào repo hay volume.
set -eu

SRC=/etc/alertmanager/alertmanager.yml
OUT=/tmp/alertmanager.yml

if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
  sed -e "s|__DEFAULT_RECEIVER__|telegram|g" \
      -e "s|__TELEGRAM_BOT_TOKEN__|${TELEGRAM_BOT_TOKEN}|" \
      -e "s|__TELEGRAM_CHAT_ID__|${TELEGRAM_CHAT_ID}|" \
      "$SRC" > "$OUT"
  echo "[alertmanager] Gửi cảnh báo qua Telegram (chat_id ${TELEGRAM_CHAT_ID})"
else
  # Không cấu hình Telegram -> bỏ receiver telegram, chỉ xem alert trên giao diện web
  sed -e "s|__DEFAULT_RECEIVER__|web-only|g" \
      -e "/# BEGIN-TELEGRAM/,/# END-TELEGRAM/d" \
      "$SRC" > "$OUT"
  echo "[alertmanager] Chưa cấu hình Telegram trong .env -> chỉ hiển thị alert trên giao diện"
fi

exec /bin/alertmanager \
  --config.file="$OUT" \
  --storage.path=/alertmanager \
  --web.external-url=https://localhost/alertmanager/ \
  --web.route-prefix=/alertmanager
