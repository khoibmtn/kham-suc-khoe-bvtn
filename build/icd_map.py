# -*- coding: utf-8 -*-
"""
icd_map.py — Từ điển ánh xạ khái niệm bệnh (concept) -> ICD-10 + cơ quan khám.

Cách hoạt động: danh sách RULES được duyệt theo THỨ TỰ, mẫu cụ thể đặt TRƯỚC
mẫu tổng quát.  Mỗi rule = (regex, mã ICD, tên bệnh theo ICD, cơ quan).

Mã cơ quan (khớp với cột phân loại trong file import BYT):
  TH      Tuần hoàn                 HH      Hô hấp
  TIEUHOA Tiêu hóa                  THAN    Thận - Tiết niệu - Sinh dục
  NOITIET Nội tiết                  CXK     Cơ - Xương - Khớp
  TK      Thần kinh                 TT      Tâm thần
  NGOAI   Ngoại khoa                DALIEU  Da liễu
  SAN     Sản phụ khoa              MAT     Mắt
  TMH     Tai - Mũi - Họng          RHM     Răng - Hàm - Mặt
"""
import re

# (pattern, ICD, tên ICD, cơ quan)
_R = [
    # ================= RĂNG HÀM MẶT =================
    (r'^(cao răng|cr)( viêm lợi)?$', 'K03.6', 'Cặn lắng (tích tụ) trên răng', 'RHM'),
    (r'mòn mặt nhai|mòn răng', 'K03.0', 'Mòn răng quá mức', 'RHM'),
    (r'viêm quanh răng|vqr', 'K05.3', 'Viêm quanh răng mạn', 'RHM'),
    (r'viêm lợi|viêm nướu', 'K05.1', 'Viêm lợi mạn', 'RHM'),
    (r'hàm giả|răng giả|z97', 'Z97.2', 'Có răng giả (toàn bộ) (một phần)', 'RHM'),
    (r'sai khớp cắn|móm|khớp cắn ngược|vẩu', 'K07.2', 'Bất thường tương quan cung răng', 'RHM'),
    (r'sâu răng|răng sâu|^s\d$|^\d+s\d$', 'K02.9', 'Sâu răng, không đặc hiệu', 'RHM'),
    (r'mất\s*\d*\s*r(ăng)?\d*|mất (nhiều|toàn bộ|hết) ?r(ăng)?|răng mất', 'K08.1',
     'Mất răng do tai nạn, nhổ răng hoặc bệnh quanh răng khu trú', 'RHM'),
    (r'viêm tủy răng', 'K04.0', 'Viêm tủy răng', 'RHM'),
    (r'viêm khớp thái dương hàm', 'K07.6', 'Rối loạn khớp thái dương hàm', 'RHM'),

    # ================= MẮT =================
    (r'(ngoại|đã( mổ)?|đặt).{0,6}(thể thủy tinh|iol)|mt\s*i0?[l2]|mp\s*i0?[l2]',
     'Z96.1', 'Có thể thủy tinh nhân tạo', 'MAT'),
    (r'teo gai( thị)?|teo (dây )?thần kinh thị', 'H47.2',
     'Teo thần kinh thị giác', 'MAT'),
    (r'lác (trong|ngoài)|^lác', 'H50.9', 'Lác mắt, không đặc hiệu', 'MAT'),
    (r'(rối loạn|rl) điều tiết', 'H52.5', 'Rối loạn điều tiết', 'MAT'),
    (r'nhìn kém|giảm thị lực|thị lực kém', 'H54.7',
     'Giảm thị lực không xác định', 'MAT'),
    (r'đã đặt (thể thủy tinh|t3) nhân tạo|^iol$|iol$|^ioc$|đã mổ iol|^i0?2$|^2mi0?2$',
     'Z96.1', 'Có thể thủy tinh nhân tạo', 'MAT'),
    (r'đục bao sau', 'H26.4', 'Đục thể thủy tinh sau phẫu thuật', 'MAT'),
    (r'đã mổ (t3|thể thủy tinh|đục t3)|đã t3|ngoại t3', 'Z96.1', 'Có thể thủy tinh nhân tạo', 'MAT'),
    (r'đục (thể thủy tinh|thủy tinh thể|t3|ttt)', 'H25.9', 'Đục thể thủy tinh tuổi già, không đặc hiệu', 'MAT'),
    (r'mộng( thịt)?|^mộng', 'H11.0', 'Mộng thịt', 'MAT'),
    (r'viễn (lão )?thị', 'H52.0', 'Viễn thị', 'MAT'),
    (r'lão thị', 'H52.4', 'Lão thị', 'MAT'),
    (r'cận thị', 'H52.1', 'Cận thị', 'MAT'),
    (r'loạn thị', 'H52.2', 'Loạn thị', 'MAT'),
    (r'tật khúc xạ|tkx|tật kx', 'H52.7', 'Rối loạn khúc xạ, không đặc hiệu', 'MAT'),
    (r'viêm bờ mi', 'H01.0', 'Viêm bờ mi', 'MAT'),
    (r'viêm kết mạc|vkm', 'H10.9', 'Viêm kết mạc, không đặc hiệu', 'MAT'),
    (r'sẹo giác mạc|sẹo gm', 'H17.9', 'Sẹo và đục giác mạc, không đặc hiệu', 'MAT'),
    (r'(vẩn|vẫn|vân)?\s*đục\s*(dịch kính|dk)\b|^đục dk', 'H43.3',
     'Đục dịch kính khác', 'MAT'),
    (r'thoái hóa võng mạc|thoái hóa hoàng điểm', 'H35.3', 'Thoái hóa hoàng điểm và cực sau', 'MAT'),
    (r'glocom|glaucoma|thiên đầu thống', 'H40.9', 'Glôcôm, không đặc hiệu', 'MAT'),
    (r'(bán )?tắc lệ đạo|viêm túi lệ', 'H04.5', 'Hẹp và thiểu năng ống dẫn lệ', 'MAT'),
    (r'khô mắt', 'H04.1', 'Rối loạn tuyến lệ khác', 'MAT'),
    (r'sụp mi', 'H02.4', 'Sụp mi mắt', 'MAT'),
    (r'lông xiêu|lông quặm', 'H02.0', 'Lông quặm và lông xiêu mi mắt', 'MAT'),
    (r'u mi (trên|dưới)|u mi mắt', 'D23.1', 'U lành tính của da mi mắt', 'MAT'),
    (r'mù|mất chức năng( thị giác)?', 'H54.0', 'Mù hai mắt', 'MAT'),

    # ================= TAI MŨI HỌNG =================
    (r'nút ráy tai|ráy tai', 'H61.2', 'Nút ráy tai', 'TMH'),
    (r'viêm tai giữa|vtg', 'H66.3', 'Viêm tai giữa mủ mạn khác', 'TMH'),
    (r'(rối loạn|rl)(th|tuần hoàn)?.{0,10}tai( trong)?|rlthtt', 'H83.0',
     'Viêm mê nhĩ', 'TMH'),
    (r'viêm họng|vh( mạn| cấp)?', 'J31.2', 'Viêm họng mạn', 'TMH'),
    (r'điếc tuổi già|nghe kém tuổi già|lão thính', 'H91.1', 'Nghe kém tuổi già', 'TMH'),
    (r'nghe kém|giảm thính lực|^điếc', 'H91.9', 'Giảm thính lực, không đặc hiệu', 'TMH'),
    (r'viêm tai giữa', 'H66.3', 'Viêm tai giữa mủ mạn khác', 'TMH'),
    (r'(rối loạn|rl)( tuần hoàn)?( chức năng)? tai trong|rlth tai trong', 'H83.0',
     'Viêm mê nhĩ', 'TMH'),
    (r'(rối loạn|rl) tiền đình|rltđ|hội chứng tiền đình|hc tiền đình', 'H81.9',
     'Rối loạn chức năng tiền đình, không đặc hiệu', 'TMH'),
    (r'viêm mũi dị ứng', 'J30.4', 'Viêm mũi dị ứng, không đặc hiệu', 'TMH'),
    (r'viêm mũi (cấp)?', 'J00', 'Viêm mũi họng cấp (cảm thường)', 'TMH'),
    (r'viêm (mũi )?xoang', 'J32.9', 'Viêm xoang mạn, không đặc hiệu', 'TMH'),
    (r'viêm họng (mạn|mãn)|vhm|viêm họng hạt', 'J31.2', 'Viêm họng mạn', 'TMH'),
    (r'viêm họng( cấp)?|vhc', 'J02.9', 'Viêm họng cấp, không đặc hiệu', 'TMH'),
    (r'viêm (thanh quản|amidan|amiđan)', 'J35.0', 'Viêm amiđan mạn', 'TMH'),
    (r'polyp mũi', 'J33.9', 'Polyp mũi, không đặc hiệu', 'TMH'),

    # ================= TUẦN HOÀN =================
    (r'tăng huyết áp|tăng ha|\btha\b|huyết áp cao', 'I10',
     'Tăng huyết áp vô căn (nguyên phát)', 'TH'),
    (r'thiếu máu cơ tim|tmct|bệnh tim thiếu máu', 'I25.9',
     'Bệnh tim thiếu máu cục bộ mạn, không đặc hiệu', 'TH'),
    (r'cơn đau thắt ngực|cđtn|đau thắt ngực|cơn đau tn', 'I20.9',
     'Cơn đau thắt ngực, không đặc hiệu', 'TH'),
    (r'nhồi máu cơ tim', 'I25.2', 'Nhồi máu cơ tim cũ', 'TH'),
    (r'đau (ngực|vùng ngực)|tức ngực', 'R07.4', 'Đau ngực, không đặc hiệu', 'TH'),
    (r'rung nhĩ|cuồng nhĩ', 'I48', 'Rung nhĩ và cuồng động nhĩ', 'TH'),
    (r'ngoại tâm thu thất|ntt thất|nttt|ngoại ttt', 'I49.3', 'Khử cực sớm tâm thất', 'TH'),
    (r'ngoại tâm thu nhĩ|ntt nhĩ|nttn', 'I49.1', 'Khử cực sớm tâm nhĩ', 'TH'),
    (r'ngoại tâm thu|ntt', 'I49.4', 'Khử cực sớm khác và không đặc hiệu', 'TH'),
    (r'blo?[ck]k? nhánh (phải|p)', 'I45.1', 'Block nhánh phải khác và không đặc hiệu', 'TH'),
    (r'blo?[ck]k? nhánh (trái|t)', 'I44.7', 'Block nhánh trái, không đặc hiệu', 'TH'),
    (r'blo?[ck]k? nhĩ thất|block a-?v|bloc av', 'I44.3',
     'Block nhĩ thất độ II và III, không đặc hiệu', 'TH'),
    (r'blo?[ck]k?', 'I45.9', 'Rối loạn dẫn truyền, không đặc hiệu', 'TH'),
    (r'nhịp (tim )?nhanh( xoang)?|tim nhanh', 'R00.0', 'Nhịp tim nhanh, không đặc hiệu', 'TH'),
    (r'nhịp (tim )?chậm( xoang)?|tim chậm', 'R00.1', 'Nhịp tim chậm, không đặc hiệu', 'TH'),
    (r'(rối loạn|rl) nhịp', 'I49.9', 'Rối loạn nhịp tim, không đặc hiệu', 'TH'),
    (r'suy tim', 'I50.9', 'Suy tim, không đặc hiệu', 'TH'),
    (r'hở van (2|hai) lá|hở van tim', 'I34.0', 'Thiểu năng van hai lá', 'TH'),
    (r'hở van (3|ba) lá', 'I36.1', 'Thiểu năng van ba lá không do thấp', 'TH'),
    (r'hở van động mạch chủ|hở chủ', 'I35.1', 'Thiểu năng van động mạch chủ', 'TH'),
    (r'suy (giãn )?(tĩnh mạch|tm)', 'I83.9',
     'Giãn tĩnh mạch chi dưới không loét, không viêm', 'TH'),
    (r'đặt stent|can thiệp mạch vành', 'Z95.5', 'Có implant và mảnh ghép mạch vành', 'TH'),
    (r'đặt máy tạo nhịp|máy tạo nhịp', 'Z95.0', 'Có máy tạo nhịp tim', 'TH'),
    (r'dày thất trái|phì đại thất trái', 'I51.7', 'Tim to', 'TH'),

    # ================= HÔ HẤP =================
    (r'(bệnh )?phổi tắc nghẽn|copd', 'J44.9',
     'Bệnh phổi tắc nghẽn mạn tính, không đặc hiệu', 'HH'),
    (r'hen (phế quản|pq)|^hpq$', 'J45.9', 'Hen, không đặc hiệu', 'HH'),
    (r'viêm phế quản (mạn|mãn)|vpq mạn', 'J42', 'Viêm phế quản mạn, không đặc hiệu', 'HH'),
    (r'viêm phế quản|vpq', 'J40', 'Viêm phế quản, không rõ cấp hay mạn', 'HH'),
    (r'viêm phổi', 'J18.9', 'Viêm phổi, tác nhân không đặc hiệu', 'HH'),
    (r'giãn phế quản', 'J47', 'Giãn phế quản', 'HH'),
    (r'lao phổi', 'B90.9', 'Di chứng lao đường hô hấp và lao không đặc hiệu', 'HH'),
    (r'khí phế thũng', 'J43.9', 'Khí phế thũng, không đặc hiệu', 'HH'),

    # ================= TIÊU HÓA =================
    # LƯU Ý: dùng \w* để bắt mọi biến thể gõ dấu của "nhiễm" (nhiêễm, nhiêm...)
    (r'\bga?n?\s*nhi\w*\s*mỡ|\bgnm\b|thoái hóa mỡ gan|mỡ gan|gan thoái hóa mỡ',
     'K76.0', 'Thoái hóa mỡ gan, chưa được phân loại nơi khác', 'TIEUHOA'),
    (r'xơ gan', 'K74.6', 'Xơ gan khác và không đặc hiệu', 'TIEUHOA'),
    (r'gan thô|nhu mô gan thô', 'K76.9', 'Bệnh gan, không đặc hiệu', 'TIEUHOA'),
    (r'u máu gan', 'D18.0', 'U mạch máu ở mọi vị trí', 'TIEUHOA'),
    (r'nang gan', 'K76.8', 'Bệnh gan xác định khác', 'TIEUHOA'),
    (r'viêm gan b', 'B18.1', 'Viêm gan virus B mạn không có tác nhân delta', 'TIEUHOA'),
    (r'viêm gan c', 'B18.2', 'Viêm gan virus C mạn', 'TIEUHOA'),
    (r'viêm gan', 'K73.9', 'Viêm gan mạn, không đặc hiệu', 'TIEUHOA'),
    (r'(cắt|đã cắt) túi mật|túi mật đã cắt|pt cắt túi mật', 'Z90.4',
     'Mất bộ phận khác của ống tiêu hóa', 'TIEUHOA'),
    (r'sỏi (đường )?mật|sỏi ống mật', 'K80.5',
     'Sỏi ống mật không có viêm đường mật hay viêm túi mật', 'TIEUHOA'),
    (r'sỏi túi mật', 'K80.2', 'Sỏi túi mật không có viêm túi mật', 'TIEUHOA'),
    (r'poly?p túi mật', 'K82.8', 'Bệnh xác định khác của túi mật', 'TIEUHOA'),
    (r'túi mật (co nhỏ|thành dày)|viêm túi mật', 'K81.1', 'Viêm túi mật mạn', 'TIEUHOA'),
    # \b bắt buộc: không có nó, 'dd' khớp vào 'viêm aDD' (âm đạo) -> viêm dạ dày
    (r'(viêm )?(dạ dày|\bdd\b)( tá tràng)?|\bvdd\b|loét dạ dày', 'K29.7',
     'Viêm dạ dày, không đặc hiệu', 'TIEUHOA'),
    (r'trào ngược|trxhtt|grerd|gerd', 'K21.9',
     'Bệnh trào ngược dạ dày-thực quản không kèm viêm thực quản', 'TIEUHOA'),
    (r'viêm đại tràng|viêm ruột', 'K52.9',
     'Viêm dạ dày-ruột và viêm đại tràng không nhiễm khuẩn, không đặc hiệu', 'TIEUHOA'),
    (r'poly?p đại tràng', 'K63.5', 'Polyp đại tràng', 'TIEUHOA'),
    (r'trĩ', 'K64.9', 'Trĩ, không đặc hiệu', 'TIEUHOA'),
    (r'(cắt|pt).{0,12}(ruột thừa|rt)', 'Z90.4', 'Mất bộ phận khác của ống tiêu hóa', 'TIEUHOA'),
    (r'thoát vị bẹn', 'K40.9', 'Thoát vị bẹn một bên hoặc không xác định', 'NGOAI'),
    (r'k đại tràng|ung thư đại tràng', 'C18.9', 'U ác của đại tràng, không đặc hiệu', 'TIEUHOA'),
    (r'k gan|ung thư gan', 'C22.9', 'U ác của gan, không đặc hiệu', 'TIEUHOA'),
    (r'k dạ dày|ung thư dạ dày', 'C16.9', 'U ác của dạ dày, không đặc hiệu', 'TIEUHOA'),

    # ================= THẬN - TIẾT NIỆU - SINH DỤC =================
    (r'(u xơ|phì đại) (tuyến tiền liệt|ttl|tlt)|tlt to|tuyến tiền liệt to|^tuyến tiền liệt$',
     'N40', 'Tăng sản tuyến tiền liệt', 'THAN'),
    (r'(mổ|pt|cắt).{0,10}(tiền liệt|tlt|ttl)', 'Z90.7',
     'Mất cơ quan sinh dục mắc phải', 'THAN'),
    (r'nang thận', 'N28.1', 'Nang thận, mắc phải', 'THAN'),
    (r'sỏi (và nang )?thận', 'N20.0', 'Sỏi thận', 'THAN'),
    (r'sỏi niệu quản', 'N20.1', 'Sỏi niệu quản', 'THAN'),
    (r'sỏi bàng quang', 'N21.0', 'Sỏi bàng quang', 'THAN'),
    (r'cặn thận|cặn (vôi )?(thận|bàng quang)', 'N28.8',
     'Rối loạn xác định khác của thận và niệu quản', 'THAN'),
    (r'giãn đài bể thận|ứ nước thận|thận ứ nước', 'N13.3',
     'Thận ứ nước khác và không đặc hiệu', 'THAN'),
    (r'teo thận|thận.{0,6}teo|cắt thận', 'N26', 'Thận co nhỏ, không đặc hiệu', 'THAN'),
    (r'suy thận', 'N18.9', 'Bệnh thận mạn, không đặc hiệu', 'THAN'),
    (r'viêm (đường tiết niệu|bàng quang|tiết niệu)', 'N39.0',
     'Nhiễm khuẩn đường tiết niệu, vị trí không xác định', 'THAN'),
    (r'bàng quang tăng hoạt', 'N32.8', 'Rối loạn xác định khác của bàng quang', 'THAN'),

    # ================= SẢN PHỤ KHOA =================
    (r'viêm âm đạo|viêm (lộ tuyến )?cổ tử cung', 'N76.0', 'Viêm âm đạo cấp', 'SAN'),
    (r'sa (sinh dục|tử cung|thành âm đạo)', 'N81.9',
     'Sa cơ quan sinh dục nữ, không đặc hiệu', 'SAN'),
    (r'u xơ tử cung|u xơ tc|nhân xơ tử cung', 'D25.9', 'U xơ cơ tử cung, không đặc hiệu', 'SAN'),
    (r'(mổ|cắt|pt).{0,14}(tử cung|tc)', 'Z90.7', 'Mất cơ quan sinh dục mắc phải', 'SAN'),
    (r'poly?p cổ tử cung', 'N84.1', 'Polyp cổ tử cung', 'SAN'),
    (r'nang buồng trứng', 'N83.2', 'Nang buồng trứng khác và không đặc hiệu', 'SAN'),
    (r'(tử cung|phần phụ).{0,14}teo', 'N85.8',
     'Rối loạn không viêm xác định khác của tử cung', 'SAN'),
    (r'k vú|ung thư vú', 'C50.9', 'U ác của vú, không đặc hiệu', 'SAN'),
    (r'(mổ|cắt).{0,14}(u nang|nang) (bt|buồng trứng)', 'Z90.7',
     'Mất cơ quan sinh dục mắc phải', 'SAN'),
    (r'mổ đẻ|đẻ mổ|sinh mổ', 'Z98.8',
     'Trạng thái sau phẫu thuật xác định khác', 'SAN'),

    # ================= NỘI TIẾT - CHUYỂN HÓA =================
    (r'(đái tháo đường|đtđ|dtd).{0,10}(2|ii)', 'E11.9',
     'Đái tháo đường type 2 không có biến chứng', 'NOITIET'),
    (r'(đái tháo đường|đtđ|dtd).{0,10}(1|i)$', 'E10.9',
     'Đái tháo đường type 1 không có biến chứng', 'NOITIET'),
    (r'đái tháo đường|đtđ|dtd|td đtđ', 'E14.9',
     'Đái tháo đường không xác định không có biến chứng', 'NOITIET'),
    (r'tăng (đường (máu|huyết)|glucose|gluco|đh)|rối loạn dung nạp (đường|glucose)|'
     r'(đường máu|glucose) cao', 'R73.9', 'Tăng đường huyết, không đặc hiệu', 'NOITIET'),
    (r'(rối loạn|rl).{0,14}(lipid|mỡ máu)|rlmm|mỡ máu cao', 'E78.5',
     'Tăng lipid máu, không đặc hiệu', 'NOITIET'),
    (r'k tuyến giáp|ung thư tuyến giáp', 'C73', 'U ác của tuyến giáp', 'NOITIET'),
    (r'(cắt|pt|mổ).{0,14}(tuyến giáp|bướu giáp|bướu cổ)', 'Z90.8',
     'Mất cơ quan khác mắc phải', 'NOITIET'),
    (r'suy giáp', 'E03.9', 'Suy giáp, không đặc hiệu', 'NOITIET'),
    (r'basedow|cường giáp', 'E05.0', 'Nhiễm độc giáp có bướu giáp lan tỏa', 'NOITIET'),
    (r'(bướu giáp|bướu cổ).{0,10}nhân|nhân tuyến giáp|u tuyến giáp', 'E04.1',
     'Bướu giáp một nhân không độc', 'NOITIET'),
    (r'bướu (giáp|cổ)', 'E04.9', 'Bướu giáp không độc, không đặc hiệu', 'NOITIET'),
    (r'suy (tuyến )?thượng thận', 'E27.4',
     'Suy vỏ thượng thận khác và không đặc hiệu', 'NOITIET'),
    (r'béo phì', 'E66.9', 'Béo phì, không đặc hiệu', 'NOITIET'),

    # ================= CƠ - XƯƠNG - KHỚP =================
    (r'thoát vị đĩa đệm.{0,20}(thắt lưng|cstl|tl)|tvđ ?đ.{0,10}cstl', 'M51.2',
     'Di lệch đĩa đệm gian đốt sống xác định khác', 'CXK'),
    (r'thoát vị đĩa đệm.{0,20}(cổ|csc)', 'M50.2',
     'Di lệch đĩa đệm cổ khác', 'CXK'),
    (r'thoát vị đĩa đệm|tvđ ?đ|tvdd', 'M51.2',
     'Di lệch đĩa đệm gian đốt sống xác định khác', 'CXK'),
    (r'gù vẹo|vẹo cột sống|gù cột sống', 'M41.9', 'Vẹo cột sống, không đặc hiệu', 'CXK'),
    (r'gai (cột sống|cs)', 'M47.8', 'Thoái hóa đốt sống khác', 'CXK'),
    (r'(thoái hóa|th).{0,16}(cột sống|cs).{0,12}(cổ|c)$|thcsc|thoái hóa cs cổ', 'M47.8',
     'Thoái hóa đốt sống khác', 'CXK'),
    (r'(thoái hóa|th).{0,16}(cột sống|cs|cstl)|thcstl|^cstl$|^csc$', 'M47.8',
     'Thoái hóa đốt sống khác', 'CXK'),
    (r'(thoái hóa|th).{0,10}khớp gối|thkg|^gối$', 'M17.9',
     'Thoái hóa khớp gối, không đặc hiệu', 'CXK'),
    (r'(thoái hóa|th).{0,10}khớp vai', 'M19.0', 'Thoái hóa khớp nguyên phát ở khớp khác', 'CXK'),
    (r'(thoái hóa|th).{0,20}(khớp|xương khớp|đa khớp|nhiều khớp)|^th$|^thk$|^thoái hóa$',
     'M19.9', 'Thoái hóa khớp, không đặc hiệu', 'CXK'),
    (r'viêm (đa )?khớp dạng thấp', 'M06.9', 'Viêm khớp dạng thấp, không đặc hiệu', 'CXK'),
    (r'viêm (đa )?khớp', 'M13.0', 'Viêm đa khớp, không đặc hiệu', 'CXK'),
    (r'gout|gút', 'M10.9', 'Bệnh gút, không đặc hiệu', 'CXK'),
    (r'loãng xương|^lx$', 'M81.9', 'Loãng xương, không đặc hiệu', 'CXK'),
    (r'đau (khớp|lưng|vai|cổ)|đau cột sống', 'M25.5', 'Đau khớp', 'CXK'),
    # phải tách chi trên / chi dưới — mã ICD khác nhau
    (r'g[ãẫ]y .{0,40}(đùi|chày|mác|gót|bàn chân|cẳng chân|xương chậu|háng)',
     'T93.1', 'Di chứng gãy xương đùi', 'CXK'),
    (r'g[ãẫ]y (cũ )?.{0,40}(xương|tay|quay|trụ|cẳng|đòn|vai|chân)', 'T92.1',
     'Di chứng gãy xương chi trên', 'CXK'),
    (r'trật khớp', 'M24.3',
     'Bán trật khớp và trật khớp bệnh lý, chưa phân loại nơi khác', 'CXK'),
    (r'(cụt|mất|teo).{0,16}(chi|tay|chân|ngón)', 'Z89.9',
     'Mất chi mắc phải, không đặc hiệu', 'CXK'),
    (r'biến dạng.{0,20}(khớp|tay|chân|cổ tay)', 'M21.9',
     'Biến dạng mắc phải của chi, không đặc hiệu', 'CXK'),

    # ================= THẦN KINH =================
    (r'di chứng.{0,10}(tbmmn|tai biến)|tbmmn cũ|liệt.{0,10}(nửa người|1/2)|^liệt \d',
     'I69.4', 'Di chứng của đột quỵ, không xác định là xuất huyết hay nhồi máu', 'TK'),
    (r'tai biến mạch máu não|tbmmn|đột quỵ|nhồi máu não', 'I69.4',
     'Di chứng của đột quỵ, không xác định là xuất huyết hay nhồi máu', 'TK'),
    (r'parkinson', 'G20', 'Bệnh Parkinson', 'TK'),
    (r'đau (dây )?thần kinh (tọa|hông)', 'M54.3', 'Đau thần kinh tọa', 'TK'),
    (r'đau (dây )?thần kinh (vai gáy|cánh tay)|đtkv|hội chứng vai gáy', 'M54.2',
     'Đau vùng cổ', 'TK'),
    (r'(đau|viêm).{0,10}(dây )?thần kinh (ngoại biên|ngoại vi)|viêm đa dây thần kinh',
     'G62.9', 'Bệnh đa dây thần kinh, không đặc hiệu', 'TK'),
    (r'liệt (vii|7|dây vii)|liệt mặt', 'G51.0', 'Liệt Bell', 'TK'),
    (r'động kinh', 'G40.9', 'Động kinh, không đặc hiệu', 'TK'),
    (r'đau đầu|nhức đầu', 'G44.2', 'Đau đầu do căng thẳng', 'TK'),
    (r'chóng mặt|hoa mắt', 'R42', 'Chóng mặt và choáng váng', 'TK'),
    (r'rối loạn (giấc ngủ|tuần hoàn não)|mất ngủ|thiểu năng tuần hoàn não', 'G47.9',
     'Rối loạn giấc ngủ, không đặc hiệu', 'TK'),

    # ================= TÂM THẦN =================
    (r'sa sút trí tuệ|ssdt|alzheimer|suy giảm trí nhớ', 'F03',
     'Sa sút trí tuệ không đặc hiệu', 'TT'),
    (r'trầm cảm', 'F32.9', 'Giai đoạn trầm cảm, không đặc hiệu', 'TT'),
    (r'rối loạn lo âu|lo âu', 'F41.9', 'Rối loạn lo âu, không đặc hiệu', 'TT'),
    (r'tâm thần phân liệt', 'F20.9', 'Tâm thần phân liệt, không đặc hiệu', 'TT'),

    # ================= DA LIỄU =================
    (r'(xuất huyết|xh) dưới da', 'D69.2', 'Ban xuất huyết không do giảm tiểu cầu khác', 'DALIEU'),
    (r'u nhú|nhú hắc tố', 'D23.9', 'U lành tính của da, không đặc hiệu', 'DALIEU'),
    (r'sẩn ngứa|mẩn ngứa|ngứa', 'L28.2', 'Sẩn ngứa khác', 'DALIEU'),
    (r'viêm da (cơ địa|dị ứng)', 'L20.9', 'Viêm da cơ địa, không đặc hiệu', 'DALIEU'),
    (r'viêm da tiếp xúc', 'L25.9',
     'Viêm da tiếp xúc không đặc hiệu, nguyên nhân không xác định', 'DALIEU'),
    (r'(viêm da|chàm|eczema)', 'L30.9', 'Viêm da, không đặc hiệu', 'DALIEU'),
    (r'vẩy nến|vảy nến', 'L40.9', 'Vẩy nến, không đặc hiệu', 'DALIEU'),
    (r'bạch biến', 'L80', 'Bạch biến', 'DALIEU'),
    (r'lang ben', 'B36.0', 'Lang ben', 'DALIEU'),
    (r'nấm móng', 'B35.1', 'Nấm móng', 'DALIEU'),
    (r'nấm (da|kẽ|bẹn)|hắc lào', 'B35.9', 'Bệnh nấm da, không đặc hiệu', 'DALIEU'),
    (r'zona|herpes', 'B02.9', 'Zona không có biến chứng', 'DALIEU'),
    (r'u hắc tố|nốt ruồi|dày sừng', 'D22.9', 'Nơvi hắc tố, không đặc hiệu', 'DALIEU'),
    (r'mày đay', 'L50.9', 'Mày đay, không đặc hiệu', 'DALIEU'),
    (r'trứng cá', 'L70.9', 'Trứng cá, không đặc hiệu', 'DALIEU'),
    (r'rụng tóc', 'L65.9', 'Rụng tóc không sẹo, không đặc hiệu', 'DALIEU'),

    # ================= NGOẠI / U =================
    (r'^u (mỡ|bã)|u bã đậu', 'D17.9', 'U mỡ lành tính, không đặc hiệu', 'NGOAI'),
    (r'sẹo (mổ|vết mổ)|vết mổ cũ', 'L90.5', 'Tình trạng sẹo và xơ hóa da', 'NGOAI'),
    (r'^k |ung thư', 'C80.9', 'U ác không xác định vị trí', 'NGOAI'),
]

# ============ BỔ SUNG ĐỢT 2 — từ file rà soát 100 ca đầy đủ nhất ============
# Chủ yếu là lỗi gõ phím trong dữ liệu nhập tay, đã giải mã chắc chắn nhờ ngữ
# cảnh các chẩn đoán khác trong cùng ca. Đặt TRƯỚC _R để ưu tiên khớp.
_R4 = [
    # ===== ĐỢT 4 — ánh xạ các "NGHĨA ĐẦY ĐỦ" do anh Khôi diễn giải =====
    # --- răng cụ thể ---
    (r'răng\s*\d*\s*viêm tủy', 'K04.0', 'Viêm tủy', 'RHM'),
    (r'răng\s*\d*\s*sâu ngà|sâu ngà', 'K02.1', 'Sâu ngà', 'RHM'),
    (r'chân răng còn sót|còn chân răng', 'K08.3', 'Chân răng còn sót', 'RHM'),
    (r'vỡ .{0,12}răng|mẻ răng', 'K08.0', 'Mẻ răng do nguyên nhân hệ thống', 'RHM'),
    (r'cấy (ghép )?(chân răng|implant)', 'Z96.5',
     'Sự có mặt của dụng cụ cấy chân răng và hàm má', 'RHM'),

    # --- đứt gân / dây chằng / thần kinh (phân biệt chi trên - chi dưới) ---
    (r'đứt .{0,30}(thần kinh|tk) .{0,16}(hông khoeo|đùi|chân|chày)', 'T93.4',
     'Di chứng tổn thương dây thần kinh chi dưới', 'TK'),
    (r'đứt .{0,30}(thần kinh|tk)', 'T92.4',
     'Di chứng tổn thương dây thần kinh chi trên', 'TK'),
    (r'đứt .{0,30}(gân|cơ) .{0,20}(chân|gối|đùi|khoeo|bàn chân)', 'T93.5',
     'Di chứng tổn thương cơ và gân chi dưới', 'CXK'),
    (r'đứt .{0,30}(gân|cơ)', 'T92.5',
     'Di chứng tổn thương cơ và gân chi trên', 'CXK'),
    (r'đứt .{0,20}dây chằng .{0,14}(gối|chân|đùi)', 'T93.3',
     'Di chứng sai khớp, bong gân và căng cơ chi dưới', 'CXK'),
    (r'đứt .{0,20}dây chằng', 'M24.2', 'Bệnh dây chằng', 'CXK'),
    (r'đứt lệ quản', 'H04.5', 'Hẹp và thiểu năng ống dẫn lệ', 'MAT'),

    # --- mất / cụt đốt ngón ---
    (r'(mất|cụt) .{0,30}(đốt|ngón) .{0,20}(bàn |)(chân)', 'T93.6',
     'Di chứng tổn thương dập nát và chấn thương cắt cụt chi dưới', 'CXK'),
    (r'(mất|cụt) .{0,30}(đốt|ngón)', 'T92.6',
     'Di chứng tổn thương dập nát và chấn thương cắt cụt chi trên', 'CXK'),
    (r'cứng .{0,20}ngón|dính khớp', 'M24.6', 'Dính khớp', 'CXK'),

    (r'can lệch xương .{0,20}(đùi|chày|mác|chân)', 'T93.2',
     'Di chứng gãy xương khác chi dưới', 'CXK'),
    (r'can lệch xương|can xấu', 'T92.1', 'Di chứng gãy xương chi trên', 'CXK'),
    (r'g[ãẫ]y .{0,20}bánh chè', 'T93.2',
     'Di chứng gãy xương khác chi dưới', 'CXK'),

    # --- cột sống / khớp ---
    (r'thoái hóa .{0,10}đốt sống', 'M47.8', 'Thoái hóa đốt sống khác', 'CXK'),
    (r'chèn ép .{0,10}(rễ )?(thần kinh|tk)|bệnh rễ thần kinh', 'M54.1',
     'Bệnh rễ thần kinh tủy sống', 'CXK'),
    (r'đau (tk|thần kinh) (vai gáy|cánh tay)|đau vùng cổ gáy', 'M54.2',
     'Đau vùng cổ gáy', 'CXK'),
    (r'đau (cột sống )?thắt lưng', 'M54.5', 'Đau cột sống thắt lưng', 'CXK'),
    (r'tràn dịch khớp', 'M25.4', 'Tràn dịch khớp', 'CXK'),
    (r'^khớp gối( 2 bên)?$', 'M17.9', 'Thoái hóa khớp gối không đặc hiệu', 'CXK'),
    (r'đổ xi măng cột sống|bơm xi măng', 'Z98.8',
     'Các tình trạng hậu phẫu xác định khác', 'CXK'),

    # --- tim mạch ---
    (r'(đã )?đặt \d*\s*sten?t?( mạch vành)?', 'Z95.5',
     'Sự có mặt của dụng cụ cấy ghép tạo hình động mạch vành', 'TH'),
    (r'(mổ|phẫu thuật) phình mạch não', 'Z98.8',
     'Các tình trạng hậu phẫu xác định khác', 'TH'),

    # --- đái tháo đường có biến chứng (từ LUUY: 'ĐTĐ tuyp II, BC TK') ---
    (r'(đái tháo đường|đtđ).{0,20}(type|typ|tuýp)?\s*2?.{0,14}biến chứng thần kinh',
     'E11.4', 'Đái tháo đường type 2 có biến chứng thần kinh', 'NOITIET'),
    (r'(đái tháo đường|đtđ).{0,24}biến chứng (thận|mắt|mạch)', 'E11.5',
     'Đái tháo đường type 2 có biến chứng tuần hoàn ngoại vi', 'NOITIET'),

    # --- trạng thái hậu phẫu chung (đặt SAU các mã chuyên biệt ở trên) ---
    (r'(đã )?(phẫu thuật|mổ) .{0,40}(thủy tinh thể|dịch kính|mắt)', 'Z96.1',
     'Sự có mặt của thấu kính nội nhãn', 'MAT'),
    (r'(đã )?(phẫu thuật|mổ) .{0,30}(túi mật|đường mật)', 'Z90.4',
     'Mất bộ phận khác của ống tiêu hóa', 'TIEUHOA'),
    (r'(đã )?(phẫu thuật|mổ) .{0,30}(tuyến yên|nội sọ|máu tụ|não)', 'Z98.8',
     'Các tình trạng hậu phẫu xác định khác', 'TK'),
    (r'(đã )?(phẫu thuật|mổ)', 'Z98.8',
     'Các tình trạng hậu phẫu xác định khác', 'NGOAI'),

    # --- mắt còn thiếu ---
    (r'mắt chức năng|mcn', 'H57.9',
     'Các bệnh của mắt và phần phụ, không đặc hiệu', 'MAT'),
    (r'sẹo (mắt|mi)|^mp sẹo|^mt sẹo', 'H02.5',
     'Các bệnh khác ảnh hưởng đến chức năng mi mắt', 'MAT'),
    (r'thị lực \d{1,2}/10', 'H54.7', 'Giảm thị lực không xác định', 'MAT'),

    # --- khác ---
    (r'rối loạn tuần hoàn ống tai', 'H83.0', 'Viêm mê nhĩ', 'TMH'),
    (r'rối loạn tâm thần', 'F99', 'Rối loạn tâm thần, không đặc hiệu', 'TT'),
    (r'^gan nhiễm$', 'K76.0',
     'Thoái hóa mỡ gan, chưa được phân loại nơi khác', 'TIEUHOA'),
    (r'tình trạng răng', 'K08.9',
     'Bệnh của răng và cấu trúc nâng đỡ, không đặc hiệu', 'RHM'),
]

_R3 = [
    # ===== ĐỢT 3 — từ rà soát TOÀN BỘ 13.326 ca =====
    # --- các cặp DỄ NHẦM: phải khai báo tường minh, không để tầng mờ đoán ---
    (r'viêm\s*(âm đạo|âd|ad|a\s*đ|âđ|aâm đạo)\b', 'N76.0', 'Viêm âm đạo cấp', 'SAN'),
    (r'viêm\s*(họng|hạng|hong|hòng)\s*(mạn|mãn)', 'J31.2', 'Viêm họng mạn', 'TMH'),
    (r'viêm\s*(họng|hạng|hong|hòng)', 'J02.9', 'Viêm họng cấp, không đặc hiệu', 'TMH'),
    # --- cột sống viết tắt trần (CSTL xuất hiện 103 lần, cao nhất) ---
    (r'^(cột sống thắt lưng|cột sống cổ|cột sống|đốt sống)( .*)?$|^cstl$|^csc$|'
     r'^xẹp (đốt sống|đstl|cột sống)|xẹp cột sống thắt lưng',
     'M47.8', 'Thoái hóa đốt sống khác', 'CXK'),
    (r'(trượt|phồng|xẹp|thoát vị|tcđ ?đ|tvdđ|tv ?đ ?đ) .{0,10}(đĩa đệm|đ ?đ)|'
     r'thoát vị( có chèn ép)?$', 'M51.2',
     'Di lệch đĩa đệm gian đốt sống xác định khác', 'CXK'),
    (r'nẹp cột sống|(còn )?dụng cụ khx|kết hợp xương', 'Z96.6',
     'Có implant khớp chỉnh hình', 'CXK'),
    (r'(khớp (háng|gối)|háng|gối).{0,12}nhân tạo|\d? ?khớp háng nhân tạo',
     'Z96.6', 'Có implant khớp chỉnh hình', 'CXK'),
    (r'cứng khớp|hạn chế vận động', 'M24.6', 'Cứng khớp, chưa phân loại nơi khác', 'CXK'),
    (r'viêm quanh khớp vai|hc vai gáy|hội chứng vai gáy', 'M75.0',
     'Viêm dính bao khớp vai', 'CXK'),
    (r'tê( bì)? (chân tay|tay chân)|tê chân tay|dị cảm', 'R20.2',
     'Dị cảm da', 'TK'),
    (r'suy (nhược|kiệt)( cơ thể| tk| thần kinh)?', 'R53', 'Khó ở và mệt mỏi', 'TT'),
    (r'co rút ngón|co rút gân', 'M72.0', 'Xơ hóa cân gan tay (Dupuytren)', 'CXK'),
    (r'thoái hóa xương gót|gai gót', 'M77.3', 'Viêm gai xương gót', 'CXK'),
    (r'u (bao hoạt dịch|khoeo)|kén khoeo', 'M71.2',
     'Kén hoạt dịch khoeo chân (Baker)', 'CXK'),
    (r'u cột sống', 'D16.6', 'U lành của cột sống', 'CXK'),

    # --- mắt ---
    (r'quặm|quặn mi|lông siêu', 'H02.0', 'Lông quặm và lông xiêu mi mắt', 'MAT'),
    (r'sa da mi|da mi (chùng|sa)', 'H02.3', 'Sa da mi mắt', 'MAT'),
    (r'mắt giả|lắp mắt giả', 'Z97.0', 'Có mắt giả', 'MAT'),
    (r'loạn dưỡng (gm|giác mạc)', 'H18.5', 'Loạn dưỡng di truyền giác mạc', 'MAT'),
    (r'tắc tuyến lệ|tắc lệ quản', 'H04.5', 'Hẹp và thiểu năng ống dẫn lệ', 'MAT'),
    (r'viêm màng bồ đào', 'H30.9', 'Viêm hắc võng mạc, không đặc hiệu', 'MAT'),
    (r'bong dịch kính', 'H43.8', 'Rối loạn khác của dịch kính', 'MAT'),
    (r'màng trước võng mạc', 'H35.3', 'Thoái hóa hoàng điểm và cực sau', 'MAT'),
    (r'(th|thoái hóa) (hoàng điểm|võng mạc|hắc võng mạc)|bệnh võng mạc',
     'H35.3', 'Thoái hóa hoàng điểm và cực sau', 'MAT'),
    (r'viêm (giác mạc|gm)', 'H16.9', 'Viêm giác mạc, không đặc hiệu', 'MAT'),
    (r'u kết mạc', 'D31.0', 'U lành của kết mạc', 'MAT'),
    (r'viêm mi( mạn| dị ứng)?', 'H01.0', 'Viêm bờ mi', 'MAT'),
    (r'(sẹo|sẹp|seok) (gm|giác mạc)', 'H17.9',
     'Sẹo và đục giác mạc, không đặc hiệu', 'MAT'),

    # --- tuần hoàn ---
    (r'(hc|hội chứng) (mạch vành|vành)', 'I25.9',
     'Bệnh tim thiếu máu cục bộ mạn, không đặc hiệu', 'TH'),
    (r'nmct', 'I25.2', 'Nhồi máu cơ tim cũ', 'TH'),
    (r'(nhịp|nhanh) xoang|nhịp không đều|nhịp xoang không đều|loạn nhịp|mạch nhanh',
     'I49.9', 'Rối loạn nhịp tim, không đặc hiệu', 'TH'),
    (r'tăng gánh (nhĩ|thất)', 'I51.7', 'Tim to', 'TH'),
    (r'(mổ|pt|thay) van|van .{0,10}cơ học', 'Z95.2', 'Có van tim nhân tạo', 'TH'),
    (r'mổ tim|phẫu thuật tim', 'Z95.8',
     'Có implant và mảnh ghép tim mạch khác', 'TH'),
    (r'ha thấp|huyết áp thấp|hạ huyết áp', 'I95.9', 'Hạ huyết áp, không đặc hiệu', 'TH'),
    (r'ngoại t{1,2} nhĩ|ngoại ttn', 'I49.1', 'Khử cực sớm tâm nhĩ', 'TH'),

    # --- thần kinh ---
    (r'tbmm não|tai biến mmn|tbmmn', 'I69.4',
     'Di chứng của đột quỵ, không xác định là xuất huyết hay nhồi máu', 'TK'),
    (r'thiếu máu não|tuần hoàn não', 'I67.9',
     'Bệnh mạch máu não, không đặc hiệu', 'TK'),
    (r'teo não', 'G31.9',
     'Bệnh thoái hóa hệ thần kinh, không đặc hiệu', 'TK'),
    (r'u (não|màng não)|mổ u não|pt u não', 'D33.2',
     'U lành của não, không đặc hiệu', 'TK'),
    (r'u tuyến yên', 'D35.2', 'U lành của tuyến yên', 'NOITIET'),
    (r'zona|zola', 'B02.9', 'Zona không có biến chứng', 'DALIEU'),
    (r'rl ?tk thực vật|rối loạn thần kinh thực vật', 'G90.9',
     'Rối loạn hệ thần kinh tự chủ, không đặc hiệu', 'TK'),
    (r'(biến chứng|bc) thần kinh|bctk', 'G62.9',
     'Bệnh đa dây thần kinh, không đặc hiệu', 'TK'),

    # --- tiêu hóa ---
    (r'viêm tụy|viêm tuỵ', 'K86.1', 'Viêm tụy mạn khác', 'TIEUHOA'),
    (r'(nốt )?vôi hóa gan|nốt vôi (ở )?gan', 'K76.8',
     'Bệnh gan xác định khác', 'TIEUHOA'),
    (r'sỏi (và khí )?(đường mật|gan)', 'K80.5',
     'Sỏi ống mật không có viêm đường mật hay viêm túi mật', 'TIEUHOA'),
    (r'(cắt|pt|mổ) (polyp|polup) (đại tràng|trực tràng)', 'Z86.0',
     'Tiền sử cá nhân u lành tính', 'TIEUHOA'),
    (r'(pt|mổ|cắt) u (đại tràng|trực tràng)', 'Z85.0',
     'Tiền sử cá nhân u ác của cơ quan tiêu hóa', 'TIEUHOA'),
    (r'(cắt|pt|mổ) lách|nang lách', 'D73.8', 'Bệnh khác của lách', 'TIEUHOA'),
    (r'mổ tắc ruột|tắc ruột', 'K56.7', 'Tắc ruột, không đặc hiệu', 'TIEUHOA'),
    (r'hậu môn nhân tạo', 'Z93.3', 'Có mở thông đại tràng', 'TIEUHOA'),
    (r'túi mật đã pt', 'Z90.4', 'Mất bộ phận khác của ống tiêu hóa', 'TIEUHOA'),

    # --- thận tiết niệu ---
    (r'(nốt )?vôi (hóa )?thận|nốt vôi thận', 'N28.8',
     'Rối loạn xác định khác của thận và niệu quản', 'THAN'),
    (r'thận đa nang', 'Q61.3', 'Thận đa nang, không đặc hiệu', 'THAN'),
    (r'thận .{0,8}lạc chỗ', 'Q63.2', 'Thận lạc chỗ', 'THAN'),
    (r'không có thận|mất thận', 'Z90.5', 'Mất thận mắc phải', 'THAN'),
    (r'(td|theo dõi) u thận|u thận', 'D30.0', 'U lành của thận', 'THAN'),
    (r'rối loạn tiểu tiện|đái khó|tiểu khó', 'R39.1',
     'Khó khăn khác khi tiểu tiện', 'THAN'),
    (r'pđtlt|phì đại tiền liệt tuyến|tiền liệt tuyến( to)?$', 'N40',
     'Tăng sản tuyến tiền liệt', 'THAN'),
    (r'mất tinh hoàn|cắt tinh hoàn', 'Z90.7',
     'Mất cơ quan sinh dục mắc phải', 'THAN'),
    (r'giãn bể thận|gian ?x? đài bể thận|giaxn đài bể thận', 'N13.3',
     'Thận ứ nước khác và không đặc hiệu', 'THAN'),

    # --- sản phụ khoa ---
    (r'triệt sản|mổ triệt sản|đình sản', 'Z98.8',
     'Trạng thái sau phẫu thuật xác định khác', 'SAN'),
    (r'mổ geu|geu|chửa ngoài tử cung', 'Z87.5',
     'Tiền sử cá nhân biến chứng thai nghén', 'SAN'),
    (r'u xơ (ctc|cổ tử cung)', 'D25.9', 'U xơ cơ tử cung, không đặc hiệu', 'SAN'),
    (r'u xơ vú|u vú', 'D24', 'U lành của vú', 'SAN'),
    (r'u nang (bt|buồng trứng)', 'N83.2',
     'Nang buồng trứng khác và không đặc hiệu', 'SAN'),

    # --- nội tiết ---
    (r'u nang tuyến giáp', 'E04.1', 'Bướu giáp một nhân không độc', 'NOITIET'),
    (r'rl dung nạp đường|rối loạn dung nạp', 'R73.0',
     'Test dung nạp glucose bất thường', 'NOITIET'),
    (r'tăng g$|tăng gluco', 'R73.9', 'Tăng đường huyết, không đặc hiệu', 'NOITIET'),

    # --- TMH / RHM / da liễu ---
    (r'thủng màng nhĩ', 'H72.9', 'Thủng màng nhĩ, không đặc hiệu', 'TMH'),
    (r'(viêm|nấm) ống tai( ngoài| 2 bên)?', 'H60.9',
     'Viêm tai ngoài, không đặc hiệu', 'TMH'),
    (r'nhạy cảm ngà|ê buốt răng', 'K03.8',
     'Bệnh xác định khác của mô cứng của răng', 'RHM'),
    (r'hở hàm ếch|khe hở vòm', 'Q35.9', 'Khe hở vòm miệng, không đặc hiệu', 'RHM'),
    (r'nám da|sạm da', 'L81.1', 'Sạm da', 'DALIEU'),
    (r'mề đay|mày đay', 'L50.9', 'Mày đay, không đặc hiệu', 'DALIEU'),
    (r'nấm tóc', 'B35.0', 'Nấm da đầu và râu', 'DALIEU'),
    (r'(đa )?u mỡ|u bã', 'D17.9', 'U mỡ lành tính, không đặc hiệu', 'DALIEU'),
    (r'u xơ vùng gáy|u sùi', 'D23.9', 'U lành tính của da, không đặc hiệu', 'DALIEU'),
    (r'u phế quản|u phổi', 'D14.3', 'U lành của phế quản và phổi', 'HH'),
    (r'^cop$|^copd', 'J44.9',
     'Bệnh phổi tắc nghẽn mạn tính, không đặc hiệu', 'HH'),
    (r'thiếu máu$', 'D64.9', 'Thiếu máu, không đặc hiệu', 'TH'),
]

_R2 = [
    # --- lỗi gõ phím rõ ràng ---
    (r'^th khớ$|thoái hóa klhớp|thoai hóa khớp|th khơp', 'M19.9',
     'Thoái hóa khớp, không đặc hiệu', 'CXK'),
    (r'nhipk chậm|nhịp châm', 'R00.1', 'Nhịp tim chậm, không đặc hiệu', 'TH'),
    (r'nhịp itm nhanh|nhip tim nhanh', 'R00.0', 'Nhịp tim nhanh, không đặc hiệu', 'TH'),
    (r'hở van 2\s*las?\b|hở van hai lá', 'I34.0', 'Thiểu năng van hai lá', 'TH'),
    (r'vjh mạn|vh mạn', 'J31.2', 'Viêm họng mạn', 'TMH'),
    (r'cắt dahj dày|cắt dạ dày|cắt 2/3 dạ dày', 'Z90.3',
     'Mất một phần dạ dày mắc phải', 'TIEUHOA'),
    (r'tu dihcj kính|tủ dịch kính|đục dihcj kính', 'H43.3',
     'Đục dịch kính khác', 'MAT'),
    (r'đọt qu[ịy]|đột qu[ịy]', 'I69.4',
     'Di chứng của đột quỵ, không xác định là xuất huyết hay nhồi máu', 'TK'),
    (r'tăng glocose|tăng glucoze', 'R73.9', 'Tăng đường huyết, không đặc hiệu', 'NOITIET'),
    (r'^đt tuýp (ii|2)|^đt typ', 'E11.9',
     'Đái tháo đường type 2 không có biến chứng', 'NOITIET'),
    (r'đặt sten\b', 'Z95.5', 'Có implant và mảnh ghép mạch vành', 'TH'),
    (r'bazedow|basedow', 'E05.0', 'Nhiễm độc giáp có bướu giáp lan tỏa', 'NOITIET'),
    (r'sụp mí', 'H02.4', 'Sụp mi mắt', 'MAT'),
    # 'tlt' đã được TYPO đổi thành 'tuyến tiền liệt' trước khi tới đây,
    # nên phải bắt theo dạng đã bung: 'tuyến tiền liệt tó/to/25g'
    (r'ưỡ (tlt|tuyến tiền liệt)|tuyến tiền liệt\s*(tó|to|\d+\s*g)|tlt tó',
     'N40', 'Tăng sản tuyến tiền liệt', 'THAN'),
    (r'mất nhều răng|mât nhiều răng', 'K08.1',
     'Mất răng do tai nạn, nhổ răng hoặc bệnh quanh răng khu trú', 'RHM'),
    (r'sổ thận', 'N20.0', 'Sỏi thận', 'THAN'),
    (r'gan thôi', 'K76.9', 'Bệnh gan, không đặc hiệu', 'TIEUHOA'),

    # --- thuật ngữ chuyên khoa còn thiếu ---
    (r'hội chứng cushing|h/c cushing|cushing', 'E24.9',
     'Hội chứng Cushing, không đặc hiệu', 'NOITIET'),
    (r'yếu tứ chi|liệt tứ chi', 'G82.5', 'Liệt tứ chi, không đặc hiệu', 'TK'),
    (r'mổ cắt bè|cắt bè (củng giác mạc|cgm)', 'Z98.8',
     'Trạng thái sau phẫu thuật xác định khác', 'MAT'),
    (r'xẹp (đốt|thân đốt) s', 'M48.5',
     'Đốt sống bị xẹp, chưa phân loại nơi khác', 'CXK'),
    (r'dính mống (mắt)?( trước)?', 'H21.5',
     'Dính và rách mống mắt và thể mi khác', 'MAT'),
    (r'giãn đồng tử', 'H57.0', 'Bất thường chức năng đồng tử', 'MAT'),
    (r'giãn mạch lưỡi|giãn tĩnh mạch lưỡi', 'K14.8',
     'Bệnh xác định khác của lưỡi', 'TIEUHOA'),
    (r'đau (dây )?thần kinh liên sườn', 'G58.0', 'Bệnh thần kinh liên sườn', 'TK'),
    (r'(pt|mổ|phẫu thuật) vrt|viêm ruột thừa', 'Z90.4',
     'Mất bộ phận khác của ống tiêu hóa', 'TIEUHOA'),
    (r'(pt|mổ) cs\b|(pt|mổ) cột sống', 'Z98.8',
     'Trạng thái sau phẫu thuật xác định khác', 'CXK'),
    (r'(đã )?(pt|mổ|phẫu thuật) (thay )?khớp háng', 'Z96.6',
     'Có implant khớp chỉnh hình', 'CXK'),
    (r'(pt|mổ) thay van', 'Z95.2', 'Có van tim nhân tạo', 'TH'),
    (r'(mổ|pt) thoát vị thành bụng|thoát vị thành bụng', 'K43.9',
     'Thoát vị thành bụng không có tắc nghẽn hoặc hoại thư', 'TIEUHOA'),
    (r'(mổ|pt) chấn thương bụng', 'Z98.8',
     'Trạng thái sau phẫu thuật xác định khác', 'TIEUHOA'),
    (r'bệnh thận mạn|suy thận mạn', 'N18.9', 'Bệnh thận mạn, không đặc hiệu', 'THAN'),
    (r'giãn thận|thận giãn', 'N13.3', 'Thận ứ nước khác và không đặc hiệu', 'THAN'),
    (r'thận .{0,4}(đã )?cắt|cắt thận', 'Z90.5', 'Mất thận mắc phải', 'THAN'),
    (r'u đại tràng( đã)? (pt|mổ)', 'Z85.0',
     'Tiền sử cá nhân u ác của cơ quan tiêu hóa', 'TIEUHOA'),
    (r'u vú( đã)? (pt|mổ)', 'Z85.3', 'Tiền sử cá nhân u ác của vú', 'SAN'),
    (r'(td|theo dõi) u gan|u gan', 'D13.4', 'U lành tính của gan', 'TIEUHOA'),
    (r'giãn (tm|tĩnh mạch) chi dưới', 'I83.9',
     'Giãn tĩnh mạch chi dưới không loét, không viêm', 'TH'),
]
RULES = [(re.compile(p, re.IGNORECASE), c, n, o)
         for p, c, n, o in _R4 + _R3 + _R2 + _R]

# Mã "không đặc hiệu" theo cơ quan — dùng khi nhận diện được cơ quan nhưng
# không khớp rule nào (fallback tầng 2).
ORGAN_FALLBACK = {
    'TH':      ('I99',   'Rối loạn khác và không xác định của hệ tuần hoàn'),
    'HH':      ('J98.9', 'Rối loạn hô hấp, không đặc hiệu'),
    'TIEUHOA': ('K92.9', 'Bệnh của hệ tiêu hóa, không đặc hiệu'),
    'THAN':    ('N39.9', 'Rối loạn hệ tiết niệu, không đặc hiệu'),
    'NOITIET': ('E34.9', 'Rối loạn nội tiết, không đặc hiệu'),
    'CXK':     ('M99.9', 'Tổn thương sinh cơ học, không đặc hiệu'),
    'TK':      ('G98',   'Rối loạn khác của hệ thần kinh, chưa phân loại nơi khác'),
    'TT':      ('F99',   'Rối loạn tâm thần, không đặc hiệu'),
    'NGOAI':   ('R69',   'Nguyên nhân bệnh không rõ và không đặc hiệu'),
    'DALIEU':  ('L98.9', 'Rối loạn da và mô dưới da, không đặc hiệu'),
    'SAN':     ('N94.9', 'Bệnh không xác định của cơ quan sinh dục nữ', ),
    'MAT':     ('H57.9', 'Rối loạn mắt và phần phụ, không đặc hiệu'),
    'TMH':     ('H93.9', 'Rối loạn tai, không đặc hiệu'),
    'RHM':     ('K08.9', 'Rối loạn của răng và cấu trúc nâng đỡ, không đặc hiệu'),
}

# Từ khóa suy ra cơ quan khi không khớp rule (fallback tầng 2)
ORGAN_HINT = [
    # BẪY: 'lệ' trần khớp vào "lệch" ("can lệch xương" -> bị xếp vào Mắt).
    ('MAT',     r'mắt|\bmi\b|thị lực|giác mạc|kết mạc|võng mạc|đồng tử|nhãn|'
                r'(tuyến|túi|ống|đường)\s*lệ|lệ đạo|mộng|\bt3\b'),
    # BẪY ĐỒNG ÂM: 'tai biến' không phải bệnh tai; 'nhịp xoang' không phải
    # viêm xoang; 'màng nhĩ' không phải tâm nhĩ. Phải loại trừ tường minh.
    ('TMH',     r'\btai\b(?!\s*biến)|mũi|họng|(viêm|mũi)\s*xoang|thanh quản|'
                r'amidan|thính|điếc|tiền đình|màng nhĩ|ống tai'),
    ('RHM',     r'răng|lợi|nướu|hàm|khớp cắn|nha chu|miệng'),
    ('TH',      r'tim|mạch vành|huyết áp|nhịp|van |tâm nhĩ|rung nhĩ|thất|'
                r'động mạch|tĩnh mạch|ecg|điện tim'),
    ('HH',      r'phổi|phế quản|hô hấp|khó thở|ho |màng phổi'),
    ('TIEUHOA', r'gan|mật|dạ dày|ruột|đại tràng|tá tràng|thực quản|tụy|trĩ|tiêu hóa|bụng'),
    ('THAN',    r'thận|niệu|bàng quang|tiền liệt|sinh dục nam|tinh hoàn'),
    ('SAN',     r'tử cung|buồng trứng|âm đạo|phần phụ|vú|sản|phụ khoa|kinh nguyệt'),
    ('NOITIET', r'giáp|đường huyết|đường máu|tiểu đường|nội tiết|lipid|mỡ máu|thượng thận'),
    ('CXK',     r'khớp|xương|cột sống|cs|đĩa đệm|gân|cơ |chi |gối|vai|tay|chân'),
    ('TT',      r'trí tuệ|trí nhớ|trầm cảm|lo âu|tâm thần|loạn thần'),
    ('TK',      r'thần kinh|liệt|não|đau đầu|chóng mặt|co giật|động kinh|run'),
    ('DALIEU',  r'da |móng|tóc|ngứa|chàm|nấm|sẹo|mụn'),
]
ORGAN_HINT = [(o, re.compile(p, re.IGNORECASE)) for o, p in ORGAN_HINT]


_FUZZY_ON = False

def bat_fuzzy(concept_freq):
    """Bật tầng khớp mờ. Gọi 1 lần ở đầu pipeline sau khi có tần suất corpus."""
    global _FUZZY_ON
    import fuzzy
    n = fuzzy.build(concept_freq, _map_rule_only)
    _FUZZY_ON = True
    return n


def _map_rule_only(concept):
    """Chỉ tra rule — dùng để dựng mỏ neo cho tầng fuzzy (tránh đệ quy)."""
    for pat, code, name, organ in RULES:
        if pat.search(concept):
            return {'icd': code, 'ten_icd': name, 'co_quan': organ,
                    'nguon': 'rule'}
    return None


def map_concept(concept):
    """
    concept (đã qua normalize.concept_key) -> dict:
      {icd, ten_icd, co_quan, nguon}
      nguon: 'rule' | 'organ_fallback' | 'unmapped'
    """
    if not concept:
        return None
    for pat, code, name, organ in RULES:
        if pat.search(concept):
            return {'icd': code, 'ten_icd': name, 'co_quan': organ, 'nguon': 'rule'}
    # tầng 2: khớp mờ với các khái niệm đã biết (bắt lỗi gõ sai)
    if _FUZZY_ON:
        import fuzzy
        m = fuzzy.tim(concept)
        if m:
            return m
    for organ, pat in ORGAN_HINT:
        if pat.search(concept):
            code, name = ORGAN_FALLBACK[organ]
            return {'icd': code, 'ten_icd': name, 'co_quan': organ,
                    'nguon': 'organ_fallback'}
    return {'icd': '', 'ten_icd': '', 'co_quan': '', 'nguon': 'unmapped'}
