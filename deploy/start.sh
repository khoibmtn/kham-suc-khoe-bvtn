#!/usr/bin/env bash
# Khởi động trên server: khôi phục DB từ B2 (nếu chưa có) -> chạy uvicorn
# dưới sự giám sát của litestream (mọi thay đổi SQLite tự sao lưu lên B2).
set -e
DB=/srv/app/data/ksk.db
PORT="${PORT:-8000}"
UVICORN="python -m uvicorn main:app --app-dir /srv/app/backend --host 0.0.0.0 --port $PORT"

if [ -n "${S3_BUCKET:-}" ]; then
  if [ ! -f "$DB" ]; then
    echo "[start] Chưa có DB cục bộ — khôi phục từ B2..."
    litestream restore -if-replica-exists -config /srv/litestream.yml "$DB" || true
  fi
  if [ ! -f "$DB" ]; then
    echo "[start] ⚠ B2 chưa có bản sao DB — app sẽ chạy DB rỗng."
    echo "[start]   Seed từ máy cá nhân: xem DEPLOY.md mục 'Đưa dữ liệu lên lần đầu'."
  fi
  echo "[start] Chạy app + sao lưu liên tục lên B2 (bucket: $S3_BUCKET)"
  exec litestream replicate -config /srv/litestream.yml -exec "$UVICORN"
else
  echo "[start] ⚠ CHƯA cấu hình S3_* — chạy KHÔNG sao lưu, dữ liệu MẤT khi restart!"
  exec $UVICORN
fi
