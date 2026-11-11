// The ONLY 8 clinical tests in scope (CLAUDE.md). Do not add others.
export const CLS = [
  { key: 'ctm', col: 'ctm', csv: 'cls_ctm', nhan: 'CTM', ngan: 'CTM', ten: 'Tổng phân tích tế bào máu ngoại vi' },
  { key: 'glucose', col: 'glucose', csv: 'cls_glucose', nhan: 'Glucose', ngan: 'GLU', ten: 'Định lượng glucose máu' },
  { key: 'ure', col: 'ure', csv: 'cls_ure', nhan: 'Urê', ngan: 'URE', ten: 'Định lượng urê máu' },
  { key: 'creatinin', col: 'creatinin', csv: 'cls_creatinin', nhan: 'Creatinin', ngan: 'CRE', ten: 'Định lượng creatinin máu' },
  { key: 'got', col: 'got', csv: 'cls_got', nhan: 'GOT', ngan: 'GOT', ten: 'Đo hoạt độ AST (GOT)' },
  { key: 'gpt', col: 'gpt', csv: 'cls_gpt', nhan: 'GPT', ngan: 'GPT', ten: 'Đo hoạt độ ALT (GPT)' },
  { key: 'tpt_nuoc_tieu', col: 'tpt_nuoc_tieu', csv: 'cls_tpt_nuoc_tieu', nhan: 'TPT nước tiểu', ngan: 'NT', ten: 'Tổng phân tích nước tiểu' },
  { key: 'sieu_am', col: 'sieu_am', csv: 'cls_sieu_am', nhan: 'Siêu âm ổ bụng', ngan: 'SA', ten: 'Siêu âm ổ bụng' },
] as const;
export type ClsKey = (typeof CLS)[number]['key'];
export const CLS_KEYS = CLS.map((c) => c.key) as ClsKey[];

export const DON_VI = {
  TN: 'Phường Thủy Nguyên',
  LK: 'Phường Lưu Kiếm',
  VK: 'Xã Việt Khê',
} as const;
export type DonVi = keyof typeof DON_VI;

// Display terms chosen by anh Khôi (11/11/2026):
//   so_doan_tong → "DS google sheet"; co_tt_ksk → "DS đẩy cổng".
export const NHAN = {
  SO_DOAN: 'DS google sheet',
  TT_KSK: 'DS đẩy cổng',
} as const;

export const CANH_BAO_NHAN: Record<string, string> = {
  NGHI_SAO_CHEP_XN: 'Nghi sao chép XN',
  KHONG_CO_TT_KSK: 'Không có trong DS đẩy cổng',
  NGOAI_DS_SO_BO: 'Ngoài DS sơ bộ',
  CLS_LECH_NGUON: 'CLS: HIS khác PM KSK',
  LECH_NGAY: 'Ngày CLS khác ngày đăng ký',
  KHONG_BANG_CHUNG: 'Chưa có bằng chứng khám',
  CO_KQ_CLS_HIS: 'Có kết quả CLS trên HIS',
  NGUON_DOI_SAU_RA_SOAT: 'Nguồn đổi sau rà soát',
  DA_GO_KHOI_NGUON: 'Đã gỡ khỏi nguồn',
};

/** Longer explanation shown as tooltip / legend for each warning code. */
export const CANH_BAO_MO_TA: Record<string, string> = {
  NGHI_SAO_CHEP_XN: 'Kết quả xét nghiệm trùng y hệt hồ sơ khác — xem kỹ phiếu giấy.',
  KHONG_CO_TT_KSK: 'Có đăng ký trên HIS nhưng chưa có trong danh sách đẩy lên cổng (phần mềm KSK).',
  NGOAI_DS_SO_BO: 'Không thuộc danh sách sơ bộ 12.003 người — dễ là hồ sơ thừa của buổi.',
  CLS_LECH_NGUON:
    'Cận lâm sàng trên Sổ kết quả HIS khác với phần mềm KSK. Ô CLS đang theo HIS; rê chuột vào ô CLS để xem chi tiết khác nhau. Đối chiếu phiếu giấy để chốt.',
  LECH_NGAY: 'Ngày làm xét nghiệm/siêu âm trên HIS khác ngày của buổi khám.',
  KHONG_BANG_CHUNG: 'Không có kết quả CLS trên HIS và không có trong phần mềm KSK — phải tìm hồ sơ giấy.',
  CO_KQ_CLS_HIS: 'Người này có làm CLS trong đợt — nhiều khả năng đã khám, ưu tiên tìm giấy.',
  NGUON_DOI_SAU_RA_SOAT: 'Dữ liệu nguồn thay đổi sau khi đã rà soát — xem lại.',
  DA_GO_KHOI_NGUON: 'Hồ sơ không còn trong gói dữ liệu mới — xem lại.',
};
