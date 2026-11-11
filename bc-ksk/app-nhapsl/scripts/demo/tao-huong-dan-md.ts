// Sinh docs/HUONG-DAN-NHANH.md từ cùng nội dung với trang /huong-dan.
// Chạy: npx tsx scripts/demo/tao-huong-dan-md.ts
import { writeFileSync } from 'node:fs';
import { MUC, NAM_BUOC, PHIM_TAT } from '../../src/components/huong-dan-noi-dung';

const SO = ['⓪', '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'];
const L: string[] = [];
L.push('# Hướng dẫn sử dụng nhanh — App rà soát hồ sơ KSK 2026', '');
L.push('Rà soát hồ sơ giấy khám sức khỏe toàn dân 2026. Làm theo từng bước, đối chiếu số trong khung đỏ ở ảnh với số đầu dòng bên dưới.', '');
L.push('> Bản trong app: mục **Hướng dẫn** trên menu (`/huong-dan`). Bản in: `docs/huong-dan-nhanh.pdf`. Ảnh chụp trên dữ liệu **giả**, không phải người dân thật.', '');
L.push('## Mục lục', '');
L.push('- [5 bước rà soát một hồ sơ](#5-bước-rà-soát-một-hồ-sơ)', '- [Phím tắt](#phím-tắt-trên-màn-rà-soát)');
MUC.forEach((m, i) => L.push(`- [${i + 1}. ${m.tieuDe}](#${m.id})`));
L.push('', '## 5 bước rà soát một hồ sơ', '');
L.push('| Bước | Việc làm | Cụ thể |', '|:--:|---|---|');
for (const b of NAM_BUOC) L.push(`| **${b.so}** | **${b.ten}** | ${b.mo} |`);
L.push('', '## Phím tắt trên màn rà soát', '');
L.push('| Phím | Việc làm |', '|---|---|');
for (const p of PHIM_TAT) L.push(`| \`${p.phim}\` | ${p.viec} |`);
MUC.forEach((m, i) => {
  L.push('', `<a id="${m.id}"></a>`, '', `## ${i + 1}. ${m.tieuDe}`, '', `**Khi nào dùng:** ${m.khiNao}`, '');
  for (const k of m.khoi) {
    if (k.tieuDe) L.push(`### ${k.tieuDe}`, '');
    if (k.anh) L.push(`![${k.anh.alt}](../public/huong-dan/${k.anh.file})`, '');
    k.buoc?.forEach((b, j) => L.push(`${SO[b.n ?? j + 1]} ${b.t}`, ''));
    k.ds?.forEach((d) => L.push(`- ${d}`));
    if (k.ds) L.push('');
  }
  if (m.luuY) {
    L.push('> **Lưu ý**');
    m.luuY.forEach((l) => L.push(`> - ${l}`));
    L.push('');
  }
});
writeFileSync('docs/HUONG-DAN-NHANH.md', L.join('\n').replace(/\n{3,}/g, '\n\n') + '\n');
console.log('Đã ghi docs/HUONG-DAN-NHANH.md');
