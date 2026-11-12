-- 0004 — phase 10: cài đặt hệ thống, tự duyệt đề nghị chuyển, đăng ký Web Push
CREATE TABLE cai_dat (
  khoa       TEXT PRIMARY KEY,
  gia_tri    JSONB NOT NULL,
  updated_by INT REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE de_nghi_chuyen
  ADD COLUMN tu_dong BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN tu_dong_loi TEXT NOT NULL DEFAULT '';
CREATE TABLE push_dang_ky (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id),
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  thiet_bi   TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_ok_at TIMESTAMPTZ
);
CREATE INDEX push_dang_ky_user ON push_dang_ky (user_id);
