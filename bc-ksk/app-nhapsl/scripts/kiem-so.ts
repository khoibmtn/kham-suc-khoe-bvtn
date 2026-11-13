// npm run kiem-so — tính lại ho_so.canh_bao_so cho MỌI hồ sơ (điền cho hồ sơ cũ, hoặc sau khi đổi quy tắc kiem-so.ts).
// Idempotent: chỉ UPDATE dòng có giá trị đổi; không ghi nhật ký, không đổi version. Chỉ in số đếm theo mã — không in họ tên/CCCD/SĐT.
import './_env';
import { closeDb, getSql } from '@/db/client';
import { tinhLaiCanhBaoSo } from '@/lib/ra-soat/kiem-so-ghi';

const n = (x: number) => String(x).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

async function main() {
  const t0 = Date.now();
  const kq = await tinhLaiCanhBaoSo(getSql());
  console.log(`Đã duyệt ${n(kq.tong)} hồ sơ; ${n(kq.coVanDe)} hồ sơ có vấn đề về số; cập nhật ${n(kq.capNhat)} dòng (${((Date.now() - t0) / 1000).toFixed(1)}s).`);
  const ma = Object.entries(kq.theoMa).sort((a, b) => b[1] - a[1]);
  if (ma.length === 0) console.log('Không có vấn đề nào.');
  for (const [m, c] of ma) console.log(`  ${m.padEnd(22)}${n(c).padStart(8)}`);
  console.log(`Theo mức: lỗi ${n(kq.theoMuc.loi ?? 0)}, cảnh báo ${n(kq.theoMuc.canh_bao ?? 0)}`);
}
main()
  .catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); })
  .finally(closeDb);
