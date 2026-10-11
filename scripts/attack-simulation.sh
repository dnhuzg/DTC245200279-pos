#!/usr/bin/env bash
# =============================================================================
#  KỊCH BẢN GIẢ LẬP SỰ CỐ AN TOÀN THÔNG TIN  —  Hệ thống POS (DTC245200279)
# -----------------------------------------------------------------------------
#  Mục đích: tái hiện các cuộc tấn công phổ biến vào hệ thống để minh họa
#  chuỗi  TẤN CÔNG  ->  HỆ THỐNG CẢNH BÁO (Telegram)  ->  TRUY VẾT BẰNG LOG (LogQL).
#
#  Chạy TỪ MÁY HOST (không phải trong container) khi hệ thống đang up:
#      bash scripts/attack-simulation.sh
#
#  CHỈ dùng cho mục đích học tập trên chính hệ thống của mình (localhost).
# =============================================================================
set -u
TARGET="${TARGET:-https://localhost}"
CURL="curl -sk -o /dev/null -w %{http_code}"

banner() { echo; echo "=============================================================="; echo " $1"; echo "=============================================================="; }
step()   { printf '  [%s] %s\n' "$1" "$2"; }

banner "BẮT ĐẦU GIẢ LẬP TẤN CÔNG -> $TARGET"
echo "  Thời điểm: $(date '+%H:%M:%S %d/%m/%Y')"
echo "  Mở sẵn để theo dõi:"
echo "    - Telegram: bot cảnh báo POS"
echo "    - Grafana : $TARGET/grafana/d/pos-security (POS - An ninh & Log)"

# -----------------------------------------------------------------------------
# 1. BRUTE-FORCE: dò mật khẩu trang quản trị có basic auth (Prometheus)
#    -> sinh hàng loạt 401 -> luật BruteForceLogin (401 > 10 lần/phút)
# -----------------------------------------------------------------------------
banner "1/4  BRUTE-FORCE đăng nhập (dò mật khẩu Prometheus)"
n401=0
for i in $(seq 1 40); do
  code=$($CURL -u "admin:wrongpass$i" "$TARGET/prometheus/")
  [ "$code" = "401" ] && n401=$((n401+1))
done
step "KQ" "Đã thử 40 lần đăng nhập sai -> $n401 phản hồi 401 (Unauthorized)"

# -----------------------------------------------------------------------------
# 2. DÒ QUÉT LỖ HỔNG: quét các đường dẫn/file nhạy cảm thường bị lộ
#    -> sinh nhiều 404 vào path nhạy cảm -> luật SensitivePathScan
# -----------------------------------------------------------------------------
banner "2/4  DÒ QUÉT file/đường dẫn nhạy cảm (scanner)"
for p in "/.env" "/.git/config" "/wp-login.php" "/wp-admin/" "/phpinfo.php" \
         "/backup.sql" "/config.php.bak" "/admin" "/server-status" "/.htaccess"; do
  code=$($CURL "$TARGET$p")
  step "$code" "GET $p"
done

# -----------------------------------------------------------------------------
# 3. SQL INJECTION: nhét mẫu SQLi vào tham số tìm kiếm sản phẩm
#    -> luật SQLInjectionAttempt. Ứng dụng dùng truy vấn tham số hóa nên
#       KHÔNG bị khai thác (trả 200 với kết quả rỗng) — log vẫn ghi lại.
# -----------------------------------------------------------------------------
banner "3/4  Thử SQL INJECTION qua tham số URL"
for q in "' OR 1=1--" "' UNION SELECT username,password FROM users--" \
         "1' AND SLEEP(5)--" "admin'--" "%27%20OR%20%271%27%3D%271"; do
  code=$($CURL "$TARGET/api/products?q=$(printf '%s' "$q" | sed 's/ /%20/g')")
  step "$code" "q=$q"
done
step "!!" "Ứng dụng trả 200 nhưng dữ liệu rỗng -> truy vấn tham số hóa đã chặn khai thác"

# -----------------------------------------------------------------------------
# 4. FLOOD / DoS cơ bản: bắn request dồn dập vào /api/ -> Nginx rate limit (429)
#    -> luật RequestFlood (429 > 20 lần/phút)
# -----------------------------------------------------------------------------
banner "4/4  FLOOD request (DoS cơ bản) -> kích hoạt rate limit Nginx"
# Bắn song song (30 luồng) để vượt ngưỡng rate limit (20r/s) -> sinh 429
codes=$(seq 1 200 | xargs -P 30 -I{} curl -sk -o /dev/null -w '%{http_code}\n' "$TARGET/api/products")
n429=$(printf '%s\n' "$codes" | grep -c 429)
n200=$(printf '%s\n' "$codes" | grep -c 200)
step "KQ" "Bắn 200 request song song -> $n200 thành công, $n429 bị chặn 429 (Too Many Requests)"

banner "HOÀN TẤT"
cat <<EOF
  Trong ~15-30 giây tới, các cảnh báo sẽ:
    1) Hiện FIRING tại  $TARGET/prometheus/alerts  và  $TARGET/alertmanager/
    2) Gửi tin nhắn về Telegram (nếu đã cấu hình trong .env)

  TRUY VẾT bằng LogQL trong Grafana (Explore -> datasource Loki), ví dụ:

    # Toàn bộ sự kiện 401/403/404/429 kèm IP nguồn
    {service="nginx"} | json | status=~"401|403|404|429"

    # Xác định IP tấn công và số lần, trong 5 phút
    sum by (remote_addr) (count_over_time({service="nginx"} | json | status="401" [5m]))

    # Các request thử SQL Injection
    {service="nginx"} | json | request_uri =~ "(?i).*(union.*select|or.*1=1|sleep\\(|--).*"

    # Các đường dẫn nhạy cảm bị dò quét
    {service="nginx"} | json | request_uri =~ "(?i).*(\\.env|\\.git|wp-admin|phpinfo|backup).*"
EOF
