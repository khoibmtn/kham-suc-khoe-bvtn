-- 0005 — phase 11: đề nghị chuyển hai chiều (xin_ve = xin nhận về, gui_di = gửi sang buổi của người khác)
ALTER TABLE de_nghi_chuyen
  ADD COLUMN loai TEXT NOT NULL DEFAULT 'xin_ve' CHECK (loai IN ('xin_ve', 'gui_di'));
