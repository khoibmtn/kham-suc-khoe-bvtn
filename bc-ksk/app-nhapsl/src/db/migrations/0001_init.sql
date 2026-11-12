-- 0001_init — schema app rà soát hồ sơ giấy KSK (docs/03-THIET-KE.md mục 2)
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE users (
  id              SERIAL PRIMARY KEY,
  username        TEXT NOT NULL UNIQUE,
  ho_ten          TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('admin','nhan_vien')),
  password_hash   TEXT,                       -- NULL = chưa cấp mật khẩu, không đăng nhập được
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  session_version INT NOT NULL DEFAULT 1,     -- tăng khi đổi/đặt lại mật khẩu, khóa → vô hiệu phiên cũ
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at    TIMESTAMPTZ
);

-- Giới hạn 10 lần đăng nhập sai / 15 phút / username
CREATE TABLE dang_nhap_that_bai (
  id        BIGSERIAL PRIMARY KEY,
  username  TEXT NOT NULL,
  at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX dang_nhap_that_bai_username_at ON dang_nhap_that_bai (username, at);

CREATE TABLE import_batches (
  id         SERIAL PRIMARY KEY,
  phien_ban  TEXT NOT NULL UNIQUE,
  manifest   JSONB NOT NULL,
  tom_tat    JSONB NOT NULL,
  che_do     TEXT NOT NULL CHECK (che_do IN ('lan_dau','nap_lai')),
  nap_boi    TEXT NOT NULL,                   -- username hoặc 'cli:<os-user>'
  nap_luc    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE buoi_kham (
  id                 SERIAL PRIMARY KEY,
  ma_buoi            TEXT NOT NULL UNIQUE,
  don_vi             TEXT NOT NULL CHECK (don_vi IN ('TN','LK','VK')),
  ten_don_vi         TEXT NOT NULL,
  ngay_kham          DATE NOT NULL,
  diem_kham          TEXT NOT NULL DEFAULT '',
  doan_kham          TEXT NOT NULL DEFAULT '',
  nv_goi_y           TEXT NOT NULL DEFAULT '',
  so_doan_tong       INT NOT NULL,
  so_doan            JSONB NOT NULL DEFAULT '{}'::jsonb,   -- các cột so_doan_* khác
  phu_trach_user_id  INT REFERENCES users(id),
  trang_thai         TEXT NOT NULL DEFAULT 'chua_ra_soat'
                     CHECK (trang_thai IN ('chua_ra_soat','dang_ra_soat','da_xac_nhan')),
  xac_nhan_by        INT REFERENCES users(id),
  xac_nhan_at        TIMESTAMPTZ,
  giai_trinh         TEXT,
  nguon              TEXT NOT NULL DEFAULT 'cowork' CHECK (nguon IN ('cowork','admin_them')),
  UNIQUE (don_vi, ngay_kham)
);
CREATE INDEX buoi_kham_phu_trach ON buoi_kham (phu_trach_user_id);

CREATE TABLE ho_so (
  id                    SERIAL PRIMARY KEY,
  ma_ho_so              TEXT UNIQUE,          -- NULL với hồ sơ thêm tay
  nguon                 TEXT NOT NULL CHECK (nguon IN ('cowork','them_tay')),
  trang_thai_nguon      TEXT NOT NULL DEFAULT 'co_trong_goi'
                        CHECK (trang_thai_nguon IN ('co_trong_goi','da_go_khoi_goi')),
  version               INT NOT NULL DEFAULT 1,   -- khóa lạc quan

  -- giá trị hiện hành (sửa được)
  ma_kcb                TEXT NOT NULL DEFAULT '',
  ho_ten                TEXT NOT NULL,
  ho_ten_kd             TEXT NOT NULL,            -- bỏ dấu, chữ thường (khongDau)
  gioi_tinh             TEXT NOT NULL CHECK (gioi_tinh IN ('Nam','Nữ')),
  nam_sinh              INT NOT NULL,
  cccd                  TEXT NOT NULL DEFAULT '',
  so_the_bhyt           TEXT NOT NULL DEFAULT '',
  so_dt                 TEXT NOT NULL DEFAULT '',
  dia_chi_chi_tiet      TEXT NOT NULL DEFAULT '',
  ctm                   SMALLINT NOT NULL DEFAULT 0 CHECK (ctm IN (0,1)),
  glucose               SMALLINT NOT NULL DEFAULT 0 CHECK (glucose IN (0,1)),
  ure                   SMALLINT NOT NULL DEFAULT 0 CHECK (ure IN (0,1)),
  creatinin             SMALLINT NOT NULL DEFAULT 0 CHECK (creatinin IN (0,1)),
  got                   SMALLINT NOT NULL DEFAULT 0 CHECK (got IN (0,1)),
  gpt                   SMALLINT NOT NULL DEFAULT 0 CHECK (gpt IN (0,1)),
  tpt_nuoc_tieu         SMALLINT NOT NULL DEFAULT 0 CHECK (tpt_nuoc_tieu IN (0,1)),
  sieu_am               SMALLINT NOT NULL DEFAULT 0 CHECK (sieu_am IN (0,1)),

  -- giá trị theo gói nhập mới nhất (chỉ import sửa); NULL với hồ sơ thêm tay
  -- {ma_kcb, ho_ten, gioi_tinh, nam_sinh, cccd, dia_chi_chi_tiet, cls:{ctm,glucose,…8}}
  src                   JSONB,

  -- tham chiếu (luôn theo gói)
  dia_chi_the           TEXT NOT NULL DEFAULT '',
  ngay_gio_dang_ky_his  TEXT NOT NULL DEFAULT '',  -- giữ nguyên chuỗi 'dd/mm/yyyy HH:MM'
  cls_ghi_chu           TEXT NOT NULL DEFAULT '',
  co_tt_ksk             SMALLINT NOT NULL DEFAULT 0 CHECK (co_tt_ksk IN (0,1)),
  so_ksk                TEXT NOT NULL DEFAULT '',
  ky_so                 SMALLINT CHECK (ky_so IN (0,1)),
  ket_luan_phan_loai    TEXT NOT NULL DEFAULT '',
  canh_bao              TEXT[] NOT NULL DEFAULT '{}',
  ghi_chu_cowork        TEXT NOT NULL DEFAULT '',
  don_vi_goi_y          TEXT NOT NULL DEFAULT '',

  -- cờ "người rà soát đã chạm"
  sua_nhan_than         BOOLEAN NOT NULL DEFAULT FALSE,
  sua_cls               BOOLEAN NOT NULL DEFAULT FALSE,
  da_di_chuyen          BOOLEAN NOT NULL DEFAULT FALSE,

  -- vị trí
  vi_tri                TEXT NOT NULL CHECK (vi_tri IN ('buoi','kho_ca_nhan','kho_chung','an')),
  buoi_id               INT REFERENCES buoi_kham(id),
  kho_user_id           INT REFERENCES users(id),
  ma_buoi_ban_dau       TEXT NOT NULL DEFAULT '',
  nhan_tu_kho_chung     BOOLEAN NOT NULL DEFAULT FALSE,  -- phục vụ chỉ số "bổ sung"

  -- xác nhận
  da_xac_nhan           BOOLEAN NOT NULL DEFAULT FALSE,
  xac_nhan_by           INT REFERENCES users(id),
  xac_nhan_at           TIMESTAMPTZ,

  ghi_chu               TEXT NOT NULL DEFAULT '',
  created_by            INT REFERENCES users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by            INT REFERENCES users(id),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT ho_so_vi_tri_nhat_quan CHECK (
    (vi_tri = 'buoi'        AND buoi_id IS NOT NULL AND kho_user_id IS NULL) OR
    (vi_tri = 'kho_ca_nhan' AND buoi_id IS NULL     AND kho_user_id IS NOT NULL) OR
    (vi_tri IN ('kho_chung','an') AND buoi_id IS NULL AND kho_user_id IS NULL)
  ),
  CONSTRAINT ho_so_nguon_ma CHECK (
    (nguon = 'cowork' AND ma_ho_so IS NOT NULL) OR (nguon = 'them_tay')
  )
);
CREATE INDEX ho_so_buoi_id   ON ho_so (buoi_id);
CREATE INDEX ho_so_vi_tri    ON ho_so (vi_tri);
CREATE INDEX ho_so_kho_user  ON ho_so (kho_user_id);
CREATE INDEX ho_so_ma_kcb    ON ho_so (ma_kcb);
CREATE INDEX ho_so_cccd      ON ho_so (cccd);
CREATE INDEX ho_so_nam_sinh  ON ho_so (nam_sinh);
CREATE INDEX ho_so_ho_ten_kd_trgm ON ho_so USING GIN (ho_ten_kd gin_trgm_ops);

CREATE TABLE nhat_ky (
  id            BIGSERIAL PRIMARY KEY,
  at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id       INT REFERENCES users(id),     -- NULL = hệ thống / CLI
  hanh_dong     TEXT NOT NULL,
  doi_tuong     TEXT NOT NULL,                -- 'ho_so' | 'buoi_kham' | 'user' | 'import' | 'auth' ...
  doi_tuong_id  TEXT,
  truong        TEXT,
  gia_tri_cu    TEXT,
  gia_tri_moi   TEXT,
  ghi_chu       TEXT
);
CREATE INDEX nhat_ky_doi_tuong ON nhat_ky (doi_tuong, doi_tuong_id);
CREATE INDEX nhat_ky_user_at   ON nhat_ky (user_id, at);
CREATE INDEX nhat_ky_at        ON nhat_ky (at);

CREATE TABLE de_nghi_chuyen (
  id           SERIAL PRIMARY KEY,
  ho_so_id     INT NOT NULL REFERENCES ho_so(id),
  tu_user_id   INT NOT NULL REFERENCES users(id),
  den_buoi_id  INT NOT NULL REFERENCES buoi_kham(id),
  ly_do        TEXT NOT NULL DEFAULT '',
  trang_thai   TEXT NOT NULL DEFAULT 'cho_xu_ly' CHECK (trang_thai IN ('cho_xu_ly','dong_y','tu_choi')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  xu_ly_by     INT REFERENCES users(id),
  xu_ly_at     TIMESTAMPTZ
);
