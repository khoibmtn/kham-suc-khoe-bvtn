#!/usr/bin/env bash
# run.sh — khởi động ứng dụng quản lý & rà soát KSK NCT.
# Nếu DB chưa tồn tại (hoặc rỗng) thì chạy import_data.py trước, sau đó khởi
# động uvicorn. Chạy lại nhiều lần vẫn an toàn (import_data.py idempotent).
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
    echo "Tạo virtualenv tại app/.venv ..."
    python3 -m venv .venv
    ./.venv/bin/pip install --upgrade pip >/dev/null
    ./.venv/bin/pip install -r requirements.txt
fi

echo "Nạp dữ liệu (bỏ qua nếu đã có) ..."
./.venv/bin/python backend/import_data.py

echo "Khởi động server tại http://127.0.0.1:8000 ..."
exec ./.venv/bin/python -m uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000
