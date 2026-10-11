#!/bin/bash
# User cho mysqld-exporter (Prometheus) — chỉ đủ quyền đọc trạng thái server:
#   PROCESS, REPLICATION CLIENT (SHOW STATUS/PROCESSLIST), SELECT trên performance_schema.
# Giới hạn tối đa 3 kết nối đồng thời. Không đọc được dữ liệu nghiệp vụ trong pos_db.

: "${MYSQL_EXPORTER_USER:?Thiếu biến MYSQL_EXPORTER_USER}"
: "${MYSQL_EXPORTER_PASSWORD:?Thiếu biến MYSQL_EXPORTER_PASSWORD}"

mysql --protocol=socket -uroot -p"${MYSQL_ROOT_PASSWORD}" <<-EOSQL
	CREATE USER IF NOT EXISTS '${MYSQL_EXPORTER_USER}'@'%' IDENTIFIED BY '${MYSQL_EXPORTER_PASSWORD}' WITH MAX_USER_CONNECTIONS 3;
	GRANT PROCESS, REPLICATION CLIENT ON *.* TO '${MYSQL_EXPORTER_USER}'@'%';
	GRANT SELECT ON performance_schema.* TO '${MYSQL_EXPORTER_USER}'@'%';
	FLUSH PRIVILEGES;
EOSQL

echo "[init] Đã tạo user '${MYSQL_EXPORTER_USER}' cho mysqld-exporter (chỉ đọc trạng thái server)"
