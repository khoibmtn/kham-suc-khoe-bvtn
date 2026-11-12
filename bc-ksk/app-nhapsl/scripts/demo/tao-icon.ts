/**
 * Sinh các file icon PNG cho PWA và thông báo đẩy từ SVG đơn giản (không tải từ Internet).
 * Chạy: npx tsx scripts/demo/tao-icon.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { chromium } from 'playwright-core';

const OUT_DIR = path.resolve(process.cwd(), 'public/icons');

function mainIconSvg(size: number, maskable = false): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  html, body {
    margin: 0;
    padding: 0;
    width: ${size}px;
    height: ${size}px;
    overflow: hidden;
    background: transparent;
  }
  svg { display: block; width: ${size}px; height: ${size}px; }
</style>
</head>
<body>
<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="512" height="512" rx="${maskable ? 0 : 104}" fill="#0f6cbd" />
  <g transform="translate(${maskable ? 56 : 24}, ${maskable ? 56 : 24}) scale(${maskable ? 0.78 : 0.90625})">
    <!-- Tờ hồ sơ giấy -->
    <rect x="96" y="56" width="272" height="368" rx="26" fill="#ffffff" />
    <!-- Nếp gấp góc phải trên -->
    <path d="M296 56 L368 128 L314 128 A18 18 0 0 1 296 110 Z" fill="#dbeafe" />
    <!-- Chữ thập y tế nhỏ đầu trang -->
    <rect x="142" y="100" width="18" height="50" rx="4" fill="#0f6cbd" />
    <rect x="126" y="116" width="50" height="18" rx="4" fill="#0f6cbd" />
    <!-- Các dòng chữ trên hồ sơ -->
    <rect x="196" y="108" width="90" height="14" rx="7" fill="#0f6cbd" />
    <rect x="196" y="132" width="128" height="12" rx="6" fill="#64748b" />
    <rect x="132" y="182" width="200" height="14" rx="7" fill="#94a3b8" />
    <rect x="132" y="216" width="176" height="14" rx="7" fill="#94a3b8" />
    <rect x="132" y="250" width="144" height="14" rx="7" fill="#94a3b8" />
    <rect x="132" y="284" width="120" height="14" rx="7" fill="#cbd5e1" />
    <!-- Huy hiệu dấu kiểm xác nhận -->
    <circle cx="348" cy="348" r="84" fill="#107c41" stroke="#ffffff" stroke-width="16" />
    <path d="M310 348 L336 374 L388 320" fill="none" stroke="#ffffff" stroke-width="22" stroke-linecap="round" stroke-linejoin="round" />
  </g>
</svg>
</body>
</html>`;
}

function badgeSvg(size: number): string {
  // Badge 96x96 đơn sắc trắng trên nền trong suốt cho thanh trạng thái Android
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  html, body {
    margin: 0;
    padding: 0;
    width: ${size}px;
    height: ${size}px;
    overflow: hidden;
    background: transparent;
  }
  svg { display: block; width: ${size}px; height: ${size}px; }
</style>
</head>
<body>
<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
  <!-- Tờ hồ sơ trắng đơn sắc, khoét nét trong suốt -->
  <path fill="#ffffff" fill-rule="evenodd" d="
    M18 10
    H58
    L76 28
    V82
    A6 6 0 0 1 70 88
    H18
    A6 6 0 0 1 12 82
    V16
    A6 6 0 0 1 18 10
    Z
    M33 22 H41 V30 H49 V38 H41 V46 H33 V38 H25 V30 H33 Z
    M24 56 H56 V62 H24 Z
    M24 68 H44 V74 H24 Z
  "/>
  <circle cx="68" cy="68" r="20" fill="#ffffff" />
  <path d="M59 68 L65 74 L78 61" fill="none" stroke="#000000" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" />
</svg>
</body>
</html>`;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const specs: Array<{ file: string; size: number; html: string; omitBackground: boolean }> = [
      { file: 'icon-192.png', size: 192, html: mainIconSvg(192, false), omitBackground: true },
      { file: 'icon-512.png', size: 512, html: mainIconSvg(512, false), omitBackground: true },
      { file: 'icon-maskable-512.png', size: 512, html: mainIconSvg(512, true), omitBackground: false },
      { file: 'apple-touch-icon.png', size: 180, html: mainIconSvg(180, true), omitBackground: false },
      { file: 'badge-96.png', size: 96, html: badgeSvg(96), omitBackground: true },
    ];

    for (const s of specs) {
      const page = await browser.newPage({
        viewport: { width: s.size, height: s.size },
        deviceScaleFactor: 1,
      });
      await page.setContent(s.html, { waitUntil: 'load' });
      const outPath = path.join(OUT_DIR, s.file);
      await page.screenshot({
        path: outPath,
        omitBackground: s.omitBackground,
      });
      await page.close();
      console.log(`Đã tạo ${outPath} (${s.size}x${s.size})`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
