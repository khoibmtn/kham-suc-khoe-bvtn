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

export const CANH_BAO_NHAN: Record<string, string> = {
  NGHI_SAO_CHEP_XN: 'Nghi sao chép XN',
  KHONG_CO_TT_KSK: 'Không có trong TT KSK',
  NGOAI_DS_SO_BO: 'Ngoài DS sơ bộ',
  CLS_LECH_NGUON: 'CLS lệch nguồn',
  LECH_NGAY: 'Ngày CLS khác ngày đăng ký',
  KHONG_BANG_CHUNG: 'Chưa có bằng chứng khám',
  CO_KQ_CLS_HIS: 'Có kết quả CLS trên HIS',
  NGUON_DOI_SAU_RA_SOAT: 'Nguồn đổi sau rà soát',
  DA_GO_KHOI_NGUON: 'Đã gỡ khỏi nguồn',
};
