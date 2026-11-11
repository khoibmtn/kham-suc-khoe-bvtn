// npm run import -- <thư mục gói> [--apply] [--force]
// Mặc định CHẠY THỬ (không ghi). Có --apply mới ghi (một transaction).
import './_env';
import os from 'node:os';
import path from 'node:path';
import { closeDb, getSql } from '@/db/client';
import { CLS } from '@/lib/cls';
import { docGoiTuThuMuc } from '@/lib/import/doc-thu-muc';
import { apDung, docTongThucTe, lapKeHoach, NapTuChoi, type KeHoach } from '@/lib/import/nap';

const n = (x: number) => String(x).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const lech = (s: string, w: number) => s.padStart(w);
const MAX_DONG_LOI = 50;
const DON_VI = ['TN', 'LK', 'VK'] as const;

function inKeHoach(kh: KeHoach) {
  console.log(`\nPhiên bản: ${kh.phienBan}   Chế độ: ${kh.cheDo === 'lan_dau' ? 'nạp lần đầu' : 'nạp lại'}`);
  console.log(`Buổi thêm: ${n(kh.buoiThem)}`);
  console.log(`Hồ sơ thêm: ${n(kh.hoSoThemTong)} (trong buổi ${n(kh.hoSoThemTrongBuoi.tong)}: ` +
    `TN ${n(kh.hoSoThemTrongBuoi.TN)}, LK ${n(kh.hoSoThemTrongBuoi.LK)}, VK ${n(kh.hoSoThemTrongBuoi.VK)}; kho chung ${n(kh.hoSoThemKhoChung)})`);
  console.log(`User thêm: ${n(kh.userThem.length)}${kh.userThem.length ? ` (${kh.userThem.join(', ')})` : ''}; giữ nguyên: ${n(kh.userGiu.length)}`);
  console.log('\nTổng sẽ có sau nạp:');
  console.log(`  ${'Đơn vị'.padEnd(8)}${lech('Số buổi', 9)}${lech('Sổ đoàn', 10)}${lech('Hồ sơ/buổi', 12)}`);
  for (const dv of DON_VI) {
    const t = kh.tongSauNap[dv];
    console.log(`  ${dv.padEnd(8)}${lech(n(t.so_buoi), 9)}${lech(n(t.so_doan), 10)}${lech(n(t.ho_so_trong_buoi), 12)}`);
  }
}

function inNapLai(kh: KeHoach) {
  const t = kh.napLai;
  if (!t) return;
  console.log('\nTóm tắt nạp lại:');
  const dong: [string, number][] = [
    ['Buổi thêm mới', t.buoi_them.length],
    ['Buổi cập nhật mô tả / DS google sheet', t.buoi_cap_nhat],
    ['Buổi không còn trong gói (giữ nguyên)', t.buoi_khong_con_trong_goi.length],
    ['Hồ sơ thêm mới', t.ho_so_them_moi],
    ['Hồ sơ cập nhật (chưa chạm, ghi đè)', t.ho_so_cap_nhat],
    ['Hồ sơ chỉ cập nhật trường tham chiếu', t.ho_so_cap_nhat_tham_chieu],
    ['Hồ sơ giữ giá trị người rà soát (nguồn đổi)', t.ho_so_giu_do_da_cham],
    ['Hồ sơ chuyển vị trí theo gói', t.ho_so_chuyen_vi_tri],
    ['  trong đó không vào được buổi đã khóa', t.khong_vao_buoi_khoa],
    ['Hồ sơ gỡ khỏi nguồn → ẩn', t.ho_so_go_khoi_nguon_an],
    ['Hồ sơ gỡ khỏi nguồn → giữ chỗ + cảnh báo', t.ho_so_go_khoi_nguon_giu],
    ['Hồ sơ không đổi', t.ho_so_khong_doi],
  ];
  for (const [nhan, v] of dong) console.log(`  ${nhan.padEnd(48)}${lech(n(v), 8)}`);
  console.log('\nSo sánh tổng trước → sau:');
  console.log(`  ${'Đơn vị'.padEnd(8)}${lech('Buổi', 10)}${lech('Sổ đoàn', 18)}${lech('Hồ sơ/buổi', 20)}`);
  for (const dv of DON_VI) {
    const a = t.tong_truoc[dv], b = t.tong_sau[dv];
    console.log(`  ${dv.padEnd(8)}${lech(`${n(a.so_buoi)}→${n(b.so_buoi)}`, 10)}${lech(`${n(a.so_doan)}→${n(b.so_doan)}`, 18)}${lech(`${n(a.ho_so_trong_buoi)}→${n(b.ho_so_trong_buoi)}`, 20)}`);
  }
  const CAP = 20;
  const liet = (tieuDe: string, ds: string[]) => {
    if (!ds.length) return;
    console.log(`\n${tieuDe} (${n(ds.length)}):`);
    for (const d of ds.slice(0, CAP)) console.log(`  - ${d}`);
    if (ds.length > CAP) console.log(`  … và ${n(ds.length - CAP)} mục nữa`);
  };
  console.log('\nCẦN ADMIN XỬ LÝ:');
  if (!t.buoi_khong_con_trong_goi.length && !t.da_xac_nhan_nguon_doi.length && !t.them_tay_trung_goi.length && !t.khong_vao_buoi_khoa) {
    console.log('  (không có)');
  }
  liet('Buổi không còn trong gói', t.buoi_khong_con_trong_goi);
  liet('Hồ sơ ĐÃ XÁC NHẬN mà nguồn đổi (cần rà soát lại)', t.da_xac_nhan_nguon_doi.map((x) => `${x.ma_ho_so} (buổi ${x.ma_buoi}): ${x.truong.join(', ')}`));
  liet('Hồ sơ thêm tay trùng hồ sơ mới trong gói (gộp tay)', t.them_tay_trung_goi.map((x) => `hồ sơ #${x.ho_so_id} trùng ${x.ma_ho_so_goi} theo ${x.theo === 'cccd' ? 'CCCD' : 'mã KCB'}`));
  if (t.khong_vao_buoi_khoa) console.log(`\nCó ${n(t.khong_vao_buoi_khoa)} hồ sơ không vào được buổi đã khóa → đã để kho chung (xem ghi chú chuyển).`);
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const force = args.includes('--force');
  const dirArg = args.find((a) => !a.startsWith('--'));
  if (!dirArg) {
    console.error('Cách dùng: npm run import -- <thư mục gói> [--apply] [--force]  (--force: cho nạp lại cùng/cũ hơn phiên bản đã nạp)');
    process.exitCode = 1;
    return;
  }
  const dir = path.resolve(dirArg);
  console.log(`Gói: ${dir}`);
  console.log(apply ? 'Chế độ: GHI (--apply)' : 'Chế độ: CHẠY THỬ (không ghi gì; thêm --apply để ghi)');

  const kq = await docGoiTuThuMuc(dir);
  for (const w of kq.warnings) console.log(`Cảnh báo: ${w}`);
  if (!kq.ok || !kq.goi) {
    console.error(`\nGÓI KHÔNG HỢP LỆ — ${kq.errors.length} lỗi, không ghi gì:`);
    for (const e of kq.errors.slice(0, MAX_DONG_LOI)) console.error(`  - ${e}`);
    if (kq.errors.length > MAX_DONG_LOI) console.error(`  … và ${kq.errors.length - MAX_DONG_LOI} lỗi nữa`);
    process.exitCode = 1;
    return;
  }
  console.log(`Gói hợp lệ: ${n(kq.goi.buoi.length)} buổi, ${n(kq.goi.hoSo.length)} hồ sơ, ${n(kq.goi.nguoiDung.length)} người dùng.`);

  try {
    const sql = getSql();
    const kh = await lapKeHoach(sql, kq.goi, { force });
    inKeHoach(kh);
    inNapLai(kh);
    if (kh.tuChoi) {
      console.error(`\nTỪ CHỐI: ${kh.tuChoi}`);
      process.exitCode = 1;
      return;
    }
    if (!apply) {
      console.log('\nChạy thử xong, chưa ghi gì. Thêm --apply để nạp.');
      return;
    }
    const napBoi = `cli:${os.userInfo().username}`;
    const t0 = Date.now();
    await apDung(sql, kq.goi, napBoi, { force });
    console.log(`\nThời gian ghi: ${((Date.now() - t0) / 1000).toFixed(1)} giây.`);
    const t = await docTongThucTe(sql);
    console.log('\nĐÃ GHI. Tổng thực tế đọc từ CSDL:');
    console.log(`  ${'Đơn vị'.padEnd(8)}${lech('Số buổi', 9)}${lech('Sổ đoàn', 10)}${lech('Hồ sơ/buổi', 12)}  ` + CLS.map((c) => c.ngan.padStart(6)).join(''));
    for (const dv of DON_VI) {
      const b = t.buoi[dv] ?? { so_buoi: 0, so_doan: 0 };
      console.log(`  ${dv.padEnd(8)}${lech(n(b.so_buoi), 9)}${lech(n(b.so_doan), 10)}${lech(n(t.hoSoTrongBuoi[dv] ?? 0), 12)}  ` +
        CLS.map((c) => n(t.cls[dv]?.[c.csv] ?? 0).padStart(6)).join(''));
    }
    console.log(`  Kho chung: ${n(t.khoChung)}   Tổng hồ sơ: ${n(t.tong)}   Người dùng: ${n(t.users)}   Lần nạp: ${n(t.batches)}`);
  } catch (e) {
    if (e instanceof NapTuChoi) console.error(`\nTỪ CHỐI: ${e.message}`);
    else console.error(`\nLỗi khi nạp (đã hoàn tác): ${(e as Error).message}`);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

main().catch(async (e) => {
  console.error((e as Error).message ?? e);
  process.exitCode = 1;
  await closeDb().catch(() => {});
});
