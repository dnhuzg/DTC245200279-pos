#!/bin/bash
# Tạo user riêng cho ứng dụng với quyền TỐI THIỂU (least privilege):
#   - chỉ thao tác dữ liệu (SELECT/INSERT/UPDATE/DELETE) trên DB của app
#   - không có quyền DDL (CREATE/DROP/ALTER), không có quyền trên DB khác
# Script được entrypoint của image mysql chạy 1 lần khi khởi tạo volume.
# Lưu ý: file .sh được entrypoint "source" (không chạy subshell) nên không dùng "set -u".

: "${APP_DB_USER:?Thiếu biến APP_DB_USER}"
: "${APP_DB_PASSWORD:?Thiếu biến APP_DB_PASSWORD}"

mysql --protocol=socket -uroot -p"${MYSQL_ROOT_PASSWORD}" <<-EOSQL
	CREATE USER IF NOT EXISTS '${APP_DB_USER}'@'%' IDENTIFIED BY '${APP_DB_PASSWORD}';
	GRANT SELECT, INSERT, UPDATE, DELETE ON \`${MYSQL_DATABASE}\`.* TO '${APP_DB_USER}'@'%';
	FLUSH PRIVILEGES;
EOSQL

echo "[init] Đã tạo user '${APP_DB_USER}' (chỉ SELECT/INSERT/UPDATE/DELETE trên ${MYSQL_DATABASE})"
