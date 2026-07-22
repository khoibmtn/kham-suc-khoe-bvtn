#!/usr/bin/env bash
# Khởi động trên server: khôi phục DB từ B2 (nếu chưa có) -> chạy uvicorn
# dưới sự giám sát của litestream (mọi thay đổi SQLite tự sao lưu lên B2).
set -e
DB=/srv/app/data/ksk.db
PORT="${PORT:-8000}"
UVICORN="python -m uvicorn main:app --app-dir /srv/app/backend --host 0.0.0.0 --port $PORT"

if [ -z "${S3_BUCKET:-}" ]; then
  echo "[start] ⚠ CHƯA cấu hình S3_* — chạy KHÔNG sao lưu, dữ liệu MẤT khi restart!"
  exec $UVICORN
fi

if [ ! -f "$DB" ]; then
  echo "[start] Chưa có DB cục bộ — khôi phục từ B2..."
  litestream restore -if-replica-exists -config /srv/litestream.yml "$DB" || true
fi

# ── CHỐT CHẶN AN TOÀN (sự cố 2026-07-22) ─────────────────────────────────────
# Trước đây: nếu khôi phục thất bại -> DB rỗng -> litestream vẫn replicate ->
# ĐẨY DB RỖNG ĐÈ LÊN B2, xóa sạch bản sao tốt. Nay: đếm ho_so, nếu 0 (rỗng/
# thiếu) thì DỪNG HẲN (exit 1) — KHÔNG replicate rỗng. Render giữ bản cũ / báo
# deploy fail; ta seed lại B2 từ máy cá nhân (DEPLOY.md) rồi deploy lại.
COUNT=0
if [ -f "$DB" ]; then
  COUNT=$(python - "$DB" <<'PY' 2>/dev/null || echo 0
import sqlite3, sys
try:
    print(sqlite3.connect(sys.argv[1]).execute("SELECT COUNT(*) FROM ho_so").fetchone()[0])
except Exception:
    print(0)
PY
)
fi
if [ "${COUNT:-0}" -lt 1 ]; then
  echo "[start] ❌ DB RỖNG/THIẾU sau khôi phục (ho_so=$COUNT)."
  echo "[start]    DỪNG để KHÔNG đẩy rỗng đè bản sao B2. Cần seed lại B2 từ máy"
  echo "[start]    cá nhân (DEPLOY.md 'Đưa dữ liệu lên B2') rồi deploy lại."
  exit 1
fi

echo "[start] DB OK: ho_so=$COUNT — chạy app + sao lưu liên tục lên B2 (bucket: $S3_BUCKET)"
exec litestream replicate -config /srv/litestream.yml -exec "$UVICORN"
