#!/usr/bin/env bash
# run.sh — khởi động server KSK NCT, phục vụ TOÀN MẠNG LAN (macOS/Linux).
# Chạy lại nhiều lần vẫn an toàn.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
    echo "Tạo virtualenv tại app/.venv ..."
    python3 -m venv .venv
    ./.venv/bin/pip install --upgrade pip >/dev/null
    ./.venv/bin/pip install -r requirements.txt
fi

# CHỈ nạp dữ liệu khi CHƯA có DB. import_data.py cần các file Excel nguồn ở
# output/ (không có trên máy chỉ-chạy-server; ở đó DB được chép sang sẵn).
if [ ! -f "data/ksk.db" ]; then
    echo "Chưa có data/ksk.db — thử nạp từ file nguồn ..."
    ./.venv/bin/python backend/import_data.py || {
        echo "⚠ Không nạp được (thiếu file nguồn). Hãy CHÉP app/data/ksk.db"
        echo "  từ máy có dữ liệu sang, rồi chạy lại."
        exit 1
    }
fi

IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null \
     || hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1")
echo ""
echo "================================================================"
echo "  Server KSK NCT đang chạy — máy khác trong mạng truy cập bằng:"
echo "        http://$IP:8000"
echo "  (mở ngay trên máy này: http://127.0.0.1:8000). Ctrl+C để dừng."
echo "================================================================"
echo ""
exec ./.venv/bin/python -m uvicorn main:app --app-dir backend --host 0.0.0.0 --port 8000
