-- 0003 — phase 4: remember where/why a record was moved (shown in the shared pool / personal pool)
ALTER TABLE ho_so ADD COLUMN chuyen_tu     TEXT NOT NULL DEFAULT '';   -- e.g. 'TN-20260907' or 'kho_ca_nhan:ngan'
ALTER TABLE ho_so ADD COLUMN chuyen_boi    INT REFERENCES users(id);
ALTER TABLE ho_so ADD COLUMN chuyen_luc    TIMESTAMPTZ;
ALTER TABLE ho_so ADD COLUMN chuyen_ly_do  TEXT NOT NULL DEFAULT '';
ALTER TABLE de_nghi_chuyen ADD COLUMN xu_ly_ghi_chu TEXT NOT NULL DEFAULT '';
CREATE INDEX de_nghi_chuyen_trang_thai ON de_nghi_chuyen (trang_thai);
