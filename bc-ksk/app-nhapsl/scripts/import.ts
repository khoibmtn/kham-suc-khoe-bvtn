// npm run import -- <thư mục gói> [--apply] [--force]
// Mặc định CHẠY THỬ (không ghi). Có --apply mới ghi (một transaction).
import './_env';
import os from 'node:os';
import path from 'node:path';
import { closeDb, getSql } from '@/db/client';
import { CLS } from '@/lib/cls';
import { docGoiTuThuMuc } from '@/lib/import/goi';
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

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const force = args.includes('--force');
  const dirArg = args.find((a) => !a.startsWith('--'));
  if (!dirArg) {
    console.error('Cách dùng: npm run import -- <thư mục gói> [--apply] [--force]');
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
    await apDung(sql, kq.goi, napBoi, { force });
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
