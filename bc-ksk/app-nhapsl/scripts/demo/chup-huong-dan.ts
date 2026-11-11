// Chụp ảnh có chú thích cho hướng dẫn sử dụng — CHỈ trên CSDL demo (dữ liệu giả).
// Chạy: DATABASE_URL=postgres://…/nhapsl_demo npx tsx scripts/demo/chup-huong-dan.ts [--pdf]
// Yêu cầu: server đang chạy ở cổng 3300 với cùng CSDL demo (npx next start -p 3300).
import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import { chromium, type BrowserContext, type Locator, type Page } from 'playwright-core';

const DB = process.env.DATABASE_URL ?? '';
const BASE = 'http://localhost:3300';
const GOI = '/tmp/goi-demo-ksk';
const OUT = path.resolve('public/huong-dan');
const MAT_KHAU = '123456';

// ---------------------------------------------------------------- an toàn
if (!/\/nhapsl_demo(\?|$)/.test(DB)) {
  console.error('DỪNG: DATABASE_URL phải trỏ tới CSDL nhapsl_demo.');
  process.exit(1);
}
if (/nhapsl_(dev|import|test)|supabase|neon|vercel/i.test(DB)) {
  console.error('DỪNG: DATABASE_URL không được là CSDL thật/dev/test.');
  process.exit(1);
}

const sql = postgres(DB, { max: 1 });
async function kiemTraDuLieuGia() {
  const [a] = await sql`select count(*)::int as n from ho_so where cccd <> '' and cccd not like '0990%'`;
  const [b] = await sql`select count(*)::int as n from ho_so where ma_kcb <> '' and ma_kcb not like '99000%'`;
  if (a.n > 0 || b.n > 0) {
    console.error(`DỪNG: CSDL có hồ sơ không phải dữ liệu giả (CCCD lạ: ${a.n}, mã KCB lạ: ${b.n}).`);
    process.exit(1);
  }
}

function datLai() {
  const env = { ...process.env, DATABASE_URL: DB };
  execSync('npx tsx scripts/demo/tao-goi-demo.ts ' + GOI, { stdio: 'ignore' });
  return env;
}
async function datLaiDb() {
  const env = datLai();
  await sql`truncate nhat_ky, de_nghi_chuyen, ho_so, buoi_kham, import_batches, users restart identity cascade`;
  execSync(`npx tsx scripts/import.ts ${GOI} --apply`, { env, stdio: 'ignore' });
  execSync(`npx tsx scripts/users-create.ts ${GOI}`, { env, stdio: 'ignore' });
}

// ---------------------------------------------------------------- chú thích
type Hop = { x: number; y: number; w: number; h: number };
type Vung = Locator | Locator[] | Hop;
type Dau = {
  vung: Vung;
  n?: number;
  nhan?: string;
  /** vị trí vòng số quanh khung */
  vitri?: 'tl' | 'tr' | 'bl' | 'br' | 'l' | 'r';
  /** nhãn hiện ở đâu so với vòng số */
  pad?: number;
  /** khung chỉ có số, không viền */
  khongVien?: boolean;
};

async function hopCua(v: Vung): Promise<Hop> {
  if ('x' in (v as Hop) && 'w' in (v as Hop)) return v as Hop;
  const ds = Array.isArray(v) ? v : [v as Locator];
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const l of ds) {
    const b = await l.first().boundingBox();
    if (!b) throw new Error('Không tìm thấy phần tử để chú thích: ' + String(l));
    x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.width); y2 = Math.max(y2, b.y + b.height);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

async function chup(page: Page, ten: string, dau: Dau[], clip?: Hop, fullPage = false) {
  await page.evaluate((hienThongBao: boolean) => {
    document.getElementById('__an-thong-bao')?.remove();
    const s = document.createElement('style');
    s.id = '__an-thong-bao';
    s.textContent = hienThongBao
      ? '.toast-region{display:none!important}[class*="popupStack"] [role="alert"]{animation:none!important;opacity:1!important;transform:none!important}'
      : '.toast-region,[class*="banner"]:has([class*="bannerLink"]),[class*="popupStack"]{display:none!important}';
    document.head.appendChild(s);
  }, ten === '13b-thong-bao-de-nghi');
  await page.waitForTimeout(50);
  const cacHop = [];
  for (const d of dau) cacHop.push({ d: { n: d.n, nhan: d.nhan, vitri: d.vitri, pad: d.pad, khongVien: d.khongVien }, h: await hopCua(d.vung) });
  type Muc = { d: Pick<Dau, 'n' | 'nhan' | 'vitri' | 'pad' | 'khongVien'>; h: Hop };
  await page.evaluate((items: Muc[]) => {
    const sx = window.scrollX, sy = window.scrollY;
    const root = document.createElement('div');
    root.id = '__chu-thich';
    root.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none;';
    for (const { d, h } of items) {
      const pad = d.pad ?? 4;
      const x = h.x + sx - pad, y = h.y + sy - pad, w = h.w + pad * 2, hh = h.h + pad * 2;
      if (!d.khongVien) {
        const f = document.createElement('div');
        f.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${hh}px;border:3px solid #dc2626;border-radius:8px;box-sizing:border-box;`;
        root.appendChild(f);
      }
      const vt = d.vitri ?? 'tl';
      const R = 13;
      let cx = x, cy = y;
      if (vt === 'tr') { cx = x + w; cy = y; }
      if (vt === 'bl') { cx = x; cy = y + hh; }
      if (vt === 'br') { cx = x + w; cy = y + hh; }
      if (vt === 'l') { cx = x - 4; cy = y + hh / 2; }
      if (vt === 'r') { cx = x + w + 4; cy = y + hh / 2; }
      if (d.n) {
        const c = document.createElement('div');
        c.textContent = String(d.n);
        c.style.cssText = `position:absolute;left:${cx - R}px;top:${cy - R}px;width:${R * 2}px;height:${R * 2}px;border-radius:50%;background:#dc2626;color:#fff;font:700 15px/26px system-ui,-apple-system,sans-serif;text-align:center;box-shadow:0 0 0 2px #fff;`;
        root.appendChild(c);
      }
      if (d.nhan) {
        const t = document.createElement('div');
        t.textContent = d.nhan;
        const lx = d.n ? cx + R + 4 : cx;
        t.style.cssText = `position:absolute;left:${lx}px;top:${cy - 13}px;height:26px;padding:0 9px;border-radius:13px;background:#dc2626;color:#fff;font:600 14px/26px system-ui,-apple-system,sans-serif;white-space:nowrap;box-shadow:0 0 0 2px #fff;`;
        root.appendChild(t);
      }
    }
    document.documentElement.appendChild(root);
  }, cacHop);
  const file = path.join(OUT, ten + '.png');
  await page.screenshot({ path: file, clip: clip ? { x: clip.x, y: clip.y, width: clip.w, height: clip.h } : { x: 0, y: 0, ...(page.viewportSize() ?? { width: 1366, height: 768 }) }, fullPage });
  await page.evaluate(() => document.getElementById('__chu-thich')?.remove());
  const kb = Math.round(statSync(file).size / 1024);
  console.log(`  ${ten}.png  ${kb} KB${kb > 350 ? '  <-- QUÁ 350 KB' : ''}`);
}

// ---------------------------------------------------------------- tiện ích
async function dangNhap(ctx: BrowserContext, username: string) {
  const r = await ctx.request.post(BASE + '/api/auth/login', { data: { username, password: MAT_KHAU } });
  if (!r.ok()) throw new Error('Đăng nhập thất bại: ' + username);
}
async function moiCtx(browser: import('playwright-core').Browser, username?: string) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1, locale: 'vi-VN', baseURL: BASE });
  if (username) await dangNhap(ctx, username);
  return ctx;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
async function api(ctx: BrowserContext, method: 'get' | 'post' | 'patch' | 'put', url: string, data?: unknown): Promise<Json> {
  const r = await ctx.request[method](BASE + url, data === undefined ? {} : { data });
  const text = await r.text();
  if (!r.ok()) throw new Error(`${method} ${url} -> ${r.status()} ${text}`);
  return text ? JSON.parse(text) : null;
}
const hoSoCua = async (ctx: BrowserContext, ma: string): Promise<Json[]> => (await api(ctx, 'get', `/api/buoi/${ma}/ho-so`)).ho_so;
async function xacNhanNhieu(ctx: BrowserContext, ma: string, tu: number, den: number) {
  const ds = await hoSoCua(ctx, ma);
  for (const h of ds.slice(tu, den)) await api(ctx, 'post', `/api/ho-so/${h.id}/xac-nhan`, { version: h.version });
}
async function hopAside(page: Page, sel: string, lề = 10, trai = 0): Promise<Hop> {
  const b = await page.locator(sel).first().boundingBox();
  if (!b) throw new Error('Không thấy ' + sel);
  const vp = page.viewportSize() ?? { width: 1366, height: 768 };
  const y = Math.max(0, b.y - lề);
  const x = Math.max(0, b.x - lề - trai);
  return { x, y, w: Math.min(vp.width - x, b.width + lề * 2 + trai), h: Math.min(vp.height - y, b.height + lề * 2) };
}
async function dauTrang(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll('aside.rasoat-detail-pane, aside.rasoat-detail-pane *').forEach((e) => { (e as HTMLElement).scrollTop = 0; });
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(200);
}
const doi = (page: Page, ms = 700) => page.waitForTimeout(ms);
const TEN_CLS = ['Tổng phân tích tế bào máu ngoại vi', 'Định lượng glucose máu', 'Định lượng urê máu', 'Định lượng creatinin máu', 'Đo hoạt độ AST (GOT)', 'Đo hoạt độ ALT (GPT)', 'Tổng phân tích nước tiểu', 'Siêu âm ổ bụng'];
const clsBtn = (row: Locator, i: number) => row.locator(`button[aria-label^="${TEN_CLS[i]}:"]`);
const hang = (page: Page, ten: string) => page.locator('tbody tr', { hasText: ten }).first();

async function vaoRaSoat(page: Page, ma: string) {
  await page.goto(`/ra-soat/${ma}`);
  await page.waitForSelector('tbody tr[data-hoso-id]');
  await doi(page, 500);
}

async function lamPdf(ngan: BrowserContext) {
  // PDF: mở /huong-dan (đã đăng nhập, CSDL demo) rồi in
  const pPdf = await ngan.newPage();
  await pPdf.goto('/huong-dan');
  await pPdf.waitForSelector('.hd-trang');
  await pPdf.evaluate(async () => {
    const imgs = Array.from(document.images);
    imgs.forEach((i) => { i.loading = 'eager'; });
    await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
  });
  await pPdf.emulateMedia({ media: 'print' });
  const file = path.resolve('docs/huong-dan-nhanh.pdf');
  await pPdf.pdf({ path: file, format: 'A4', printBackground: true, margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' } });
  console.log(`  docs/huong-dan-nhanh.pdf  ${(statSync(file).size / 1048576).toFixed(2)} MB`);
  await pPdf.close();
}

let PG: Page | null = null;
// ================================================================== chính
async function main() {
  await kiemTraDuLieuGia();
  if (process.argv.includes('--chi-pdf')) {
    const br = await chromium.launch({ channel: 'chrome' });
    const c = await moiCtx(br, 'ngan');
    await lamPdf(c);
    await br.close();
    await sql.end();
    return;
  }
  await datLaiDb();
  await kiemTraDuLieuGia();
  const meta = JSON.parse(readFileSync(GOI + '-meta.json', 'utf8')) as { khoChung: { ma_ho_so: string; ho_ten: string; cccd: string; dv: string; gioi_tinh: string; nam_sinh: string }[] };

  const browser = await chromium.launch({ channel: 'chrome' });

  // ---- admin: phân công theo gợi ý ----
  const adm = await moiCtx(browser, 'admin');
  await api(adm, 'post', '/api/phan-cong/theo-goi-y', {});

  // ---- 01 đăng nhập ----
  {
    const ctx = await moiCtx(browser);
    const page = await ctx.newPage();
    await page.goto('/dang-nhap');
    await page.waitForSelector('select#username');
    await page.selectOption('select#username', 'ngan');
    await page.fill('#password', MAT_KHAU);
    await doi(page, 300);
    await chup(page, '01-dang-nhap', [
      { vung: page.locator('#username'), n: 1, vitri: 'l' },
      { vung: page.locator('#password'), n: 2, vitri: 'l' },
      { vung: page.getByRole('button', { name: 'Đăng nhập' }), n: 3, vitri: 'l' },
    ], { x: 383, y: 100, w: 600, h: 520 });
    await ctx.close();
  }

  const ngan = await moiCtx(browser, 'ngan');
  const trinh = await moiCtx(browser, 'trinh');
  const page = await ngan.newPage();
  PG = page;

  // nền: đã xác nhận sẵn một số hồ sơ để thanh tiến độ có số
  await xacNhanNhieu(ngan, 'TN-20260908', 0, 20);
  await xacNhanNhieu(ngan, 'TN-20260907', 10, 22);

  // ---- 04 tìm kiếm ----
  await vaoRaSoat(page, 'TN-20260907');
  const oTim = page.getByPlaceholder(/Tìm họ tên/).first();
  await oTim.fill('hung');
  await doi(page, 800);
  await oTim.press('ArrowDown');
  await doi(page, 200);
  await chup(page, '04-tim-kiem-trong-danh-sach', [
    { vung: oTim, n: 1, vitri: 'tl' },
    { vung: page.getByText(/Đang hiển thị/).first(), n: 2, vitri: 'tr' },
    { vung: page.locator('tbody tr.hoso-row-selected').first(), n: 3, vitri: 'tl', pad: 2 },
  ], { x: 0, y: 0, w: 1366, h: 540 });
  await page.getByRole('button', { name: 'Xóa nội dung tìm kiếm' }).click();
  await doi(page, 500);

  // ---- 05 kiểm tra & sửa CLS (Trần Thị Hoa: URE khác giấy) ----
  const hHoa = hang(page, 'TRẦN THỊ HOA');
  await hHoa.click({ position: { x: 20, y: 20 } });
  await clsBtn(hHoa, 2).click();
  await doi(page, 600);
  await chup(page, '05-kiem-tra-sua-cls', [
    { vung: [clsBtn(hHoa, 0), clsBtn(hHoa, 7)], n: 1, vitri: 'tl' },
    { vung: clsBtn(hHoa, 2), n: 2, vitri: 'br', pad: 3 },
    { vung: hHoa.getByText('CLS: HIS khác PM KSK'), n: 3, vitri: 'bl' },
  ], { x: 0, y: 300, w: 1366, h: 468 });

  // ---- 06 sửa thông tin hành chính (Nguyễn Văn Hùng) ----
  await page.setViewportSize({ width: 1366, height: 1100 });
  await doi(page, 400);
  const hHung = hang(page, 'NGUYỄN VĂN HÙNG');
  await hHung.dblclick({ position: { x: 20, y: 20 } });
  await page.waitForSelector('aside.rasoat-detail-pane');
  await page.fill('#detail-nam-sinh', '1967');
  await page.fill('#detail-dia-chi', 'Tổ dân phố Hoa Động 3');
  await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await doi(page, 1200);
  await dauTrang(page);
  await chup(page, '06-sua-thong-tin-hanh-chinh', [
    { vung: [page.locator('#detail-ho-ten'), page.locator('#detail-dia-chi')], n: 1, vitri: 'tl', pad: 18, khongVien: true },
    { vung: page.locator('.src-diff-note').first(), n: 2, vitri: 'r' },
    { vung: page.locator('.src-diff-note').last(), n: 2, vitri: 'r' },
    { vung: page.getByRole('button', { name: 'Lưu thay đổi' }), n: 3, vitri: 'tl' },
    { vung: page.getByRole('tab', { name: 'Lịch sử' }), n: 4, vitri: 'tr' },
  ], await hopAside(page, 'aside.rasoat-detail-pane', 10, 440));

  // ---- 07 xác nhận hồ sơ (Nguyễn Văn Hùng) ----
  await page.getByRole('button', { name: /Đóng khung chi tiết/ }).click();
  await page.setViewportSize({ width: 1366, height: 768 });
  await doi(page, 400);
  await hHung.click({ position: { x: 20, y: 20 } });
  await hHung.locator('label.confirm-cell-label').click();
  await doi(page, 900);
  await chup(page, '07-xac-nhan-ho-so', [
    { vung: hHung.locator('label.confirm-cell-label'), n: 1, vitri: 'tl' },
    { vung: page.locator('.metric-item', { hasText: 'Đã xác nhận' }), n: 2, vitri: 'tl', pad: 2 },
  ]);

  // ---- 03 tổng thể ----
  await chup(page, '03-man-ra-soat-tong-the', [
    { vung: page.locator('.rasoat-metrics-bar'), n: 1, vitri: 'tr', pad: 2 },
    { vung: oTim, n: 2, vitri: 'tl' },
    { vung: page.getByText('Lọc nhanh:').locator('xpath=..'), n: 3, vitri: 'tl', pad: 2 },
    { vung: { x: 13, y: 323, w: 1340, h: 388 }, n: 4, vitri: 'tl', pad: 0 },
  ]);

  // ---- 08 lọc chưa xác nhận + bộ lọc chi tiết ----
  await page.getByRole('button', { name: /^Chưa xác nhận \(/ }).click();
  await doi(page, 500);
  await page.getByRole('button', { name: 'Bộ lọc chi tiết' }).click();
  await doi(page, 600);
  await chup(page, '08-loc-chua-xac-nhan', [
    { vung: page.getByRole('button', { name: /^Chưa xác nhận \(/ }), n: 1, vitri: 'tl' },
    { vung: page.getByText(/Đang hiển thị/).first(), n: 2, vitri: 'tl', pad: 3 },
    { vung: page.locator('[aria-label^="Lọc theo 8 cận lâm sàng"]'), n: 3, vitri: 'tr' },
  ], { x: 0, y: 160, w: 1366, h: 460 });
  await page.getByRole('button', { name: 'Xóa bộ lọc' }).click();
  await page.getByRole('button', { name: 'Thu gọn bộ lọc' }).click();
  await doi(page, 500);

  // ---- 09 loại khỏi danh sách (Đỗ Văn Thắng) ----
  await page.setViewportSize({ width: 1366, height: 1100 });
  await doi(page, 400);
  const hThang = hang(page, 'ĐỖ VĂN THẮNG');
  await hThang.scrollIntoViewIfNeeded();
  await hThang.dblclick({ position: { x: 20, y: 20 } });
  await page.waitForSelector('aside.rasoat-detail-pane');
  await page.evaluate(() => document.querySelector('.detail-move-box')?.scrollIntoView({ block: 'center' }));
  await page.evaluate(() => window.scrollTo(0, 0));
  await doi(page, 400);
  const nutK = page.getByRole('button', { name: /Đưa vào kho của tôi/ });
  const nutC = page.getByRole('button', { name: /Đưa vào kho chờ chung/ });
  const nutB = page.getByRole('button', { name: /Chuyển sang buổi khác/ });
  await chup(page, '09-loai-khoi-danh-sach', [
    { vung: nutK, n: 1, vitri: 'l' },
    { vung: nutC, n: 2, vitri: 'l' },
    { vung: nutB, n: 3, vitri: 'l' },
  ], await hopAside(page, 'aside.rasoat-detail-pane', 10, 440));

  // ---- 09b hộp thoại chuyển buổi ----
  await nutB.click();
  await page.waitForSelector('#chuyen-ly-do');
  await page.selectOption('#chuyen-don-vi', 'LK');
  await doi(page, 500);
  await page.fill('#chuyen-ly-do', 'Hồ sơ giấy ghi ngày khám 14/09');
  await doi(page, 300);
  await page.setViewportSize({ width: 1366, height: 768 });
  await doi(page, 400);
  await chup(page, '09b-chuyen-sang-buoi-khac', [
    { vung: [page.locator('#chuyen-don-vi'), page.locator('#chuyen-ngay-kham')], n: 1, vitri: 'tl', pad: 6 },
    { vung: page.locator('#chuyen-ly-do'), n: 2, vitri: 'tl' },
    { vung: page.getByRole('button', { name: 'Chuyển sang buổi đã chọn' }), n: 3, vitri: 'tl' },
  ]);
  await page.getByRole('button', { name: 'Hủy bỏ' }).click();
  await doi(page, 400);

  // thật sự đưa Thắng và Lan vào kho của tôi (để chụp trang Kho chờ)
  await page.setViewportSize({ width: 1366, height: 1100 });
  await doi(page, 400);
  await page.getByRole('button', { name: /Đưa vào kho của tôi/ }).click();
  await doi(page, 1200);
  const hLan = hang(page, 'LÊ THỊ LAN');
  await hLan.click({ position: { x: 20, y: 20 } });
  await page.keyboard.press('k');
  await doi(page, 1200);

  // ---- 10 thêm hồ sơ + trùng ----
  const khoT = meta.khoChung[0]; // TRẦN VĂN QUÝ (kho chung)
  await page.getByRole('button', { name: '+ Thêm hồ sơ' }).click();
  await page.waitForSelector('#them-cccd');
  await page.fill('#them-cccd', khoT.cccd);
  await page.fill('#them-ho-ten', khoT.ho_ten);
  await page.selectOption('#them-gioi-tinh', khoT.gioi_tinh);
  await page.fill('#them-nam-sinh', khoT.nam_sinh);
  await page.fill('#them-dia-chi', 'Tổ dân phố Hoa Động 2');
  await page.waitForSelector('.dup-warning-box');
  await doi(page, 800);
  await page.screenshot({ path: '/tmp/kham/them.png' });
  await chup(page, '10-them-ho-so', [
    { vung: [page.locator('#them-ma-kcb'), page.locator('#them-dia-chi')], n: 1, vitri: 'tl', pad: 8 },
    { vung: page.locator('.dup-warning-box'), n: 2, vitri: 'tl', pad: 2 },
    { vung: page.getByRole('button', { name: 'Nhận hồ sơ này về buổi' }), n: 3, vitri: 'tl' },
  ], await hopAside(page, '.modal-card', 24));
  await page.getByRole('button', { name: 'Đóng', exact: true }).click();
  await page.setViewportSize({ width: 1366, height: 768 });

  // ---- 11 kho chờ ----
  await page.goto('/kho');
  await page.getByRole('tab', { name: /Kho của tôi/ }).click();
  await page.waitForSelector('table.kho-table tbody tr');
  await doi(page, 600);
  await chup(page, '11-kho-cua-toi', [
    { vung: page.locator('th.col-nguongoc'), n: 1, vitri: 'tl' },
    { vung: page.getByRole('button', { name: /Nhận về buổi/ }).first(), n: 2, vitri: 'tl' },
  ], { x: 0, y: 0, w: 1366, h: 430 });
  await page.getByRole('tab', { name: /Kho chờ chung/ }).click();
  await doi(page, 1000);
  await chup(page, '11b-kho-cho-chung', [
    { vung: page.locator('#kho-filter-bar, .filter-bar').first(), n: 1, vitri: 'tl', pad: 2 },
    { vung: page.getByRole('button', { name: /Nhận về buổi/ }).first(), n: 2, vitri: 'tl' },
  ], { x: 0, y: 120, w: 1366, h: 420 });

  // ---- 12 tìm toàn app ----
  const hTrinh = await hoSoCua(trinh, 'LK-20260915');
  const tenDuyNhat = new Set((await sql`select ho_ten from ho_so group by ho_ten having count(*) = 1`).map((r) => r.ho_ten as string));
  const nguoiKhac = hTrinh.find((h, i) => i > 2 && tenDuyNhat.has(h.ho_ten))!;
  const khongDau = nguoiKhac.ho_ten.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/Đ/g, 'D').toLowerCase();
  await page.goto('/tim-kiem');
  await page.getByPlaceholder(/Tìm họ tên/).fill(khongDau);
  await page.getByRole('button', { name: 'Toàn bộ app' }).click();
  await doi(page, 1500);
  await page.evaluate(() => document.querySelectorAll('.table-wrap').forEach((e) => { e.scrollLeft = 9999; }));
  await doi(page, 400);
  await chup(page, '12-tim-kiem-toan-app', [
    { vung: page.locator('[aria-label="Phạm vi tìm kiếm"]'), n: 1, vitri: 'tl' },
    { vung: page.getByText('Chỉ xem').first(), n: 2, vitri: 'tl' },
    { vung: page.getByRole('button', { name: /Đề nghị chuyển về buổi của tôi/ }).first(), n: 3, vitri: 'tl' },
  ], { x: 0, y: 100, w: 1366, h: 360 });
  for (const h of hTrinh.filter((h) => h.id !== nguoiKhac.id).slice(0, 1).concat([nguoiKhac])) {
    await api(ngan, 'post', '/api/de-nghi-chuyen', { ho_so_id: h.id, den_buoi: 'TN-20260907', ly_do: 'Có phiếu giấy trong tập ngày 07/09 của tôi' });
  }

  // ---- 13b thông báo đề nghị chuyển (Trinh vừa đăng nhập, thấy dải vàng + popup) ----
  const pTrinh = await trinh.newPage();
  await pTrinh.goto('/');
  const daiVang = pTrinh.locator('[class*="banner"]:has([class*="bannerLink"])').first();
  await daiVang.waitFor({ state: 'visible' });
  const popup = pTrinh.locator('[class*="popupStack"] [role="alert"]').first();
  await popup.waitFor({ state: 'visible' });
  await doi(pTrinh, 400);
  const bDai = (await daiVang.boundingBox())!;
  await chup(pTrinh, '13b-thong-bao-de-nghi', [
    { vung: { x: 14, y: bDai.y + 2, w: 1338, h: bDai.height - 4 }, n: 1, vitri: 'tl', pad: 0 },
    { vung: pTrinh.locator('[class*="bannerLink"]').first(), n: 2, vitri: 'l', pad: 2 },
    { vung: popup, n: 3, vitri: 'tl', pad: 2 },
  ], { x: 0, y: 0, w: 1366, h: 480 });

  // ---- 13 đề nghị chuyển (Trinh xử lý) ----
  await pTrinh.goto('/kho');
  await pTrinh.getByRole('tab', { name: /Đề nghị chuyển/ }).click();
  await pTrinh.waitForSelector('button:has-text("Đồng ý")');
  await doi(pTrinh, 600);
  await chup(pTrinh, '13-de-nghi-chuyen', [
    { vung: pTrinh.getByRole('button', { name: 'Đồng ý', exact: true }).first(), n: 1, vitri: 'tl' },
    { vung: pTrinh.getByRole('button', { name: 'Từ chối', exact: true }).first(), n: 2, vitri: 'tl' },
  ], { x: 0, y: 0, w: 1366, h: 560 });
  await pTrinh.screenshot({ path: '/tmp/kham/denghi.png' });

  // ---- 14 chốt danh sách (LK-20260914, thiếu 2 so với DS google sheet) ----
  await xacNhanNhieu(ngan, 'LK-20260914', 0, 99);
  await vaoRaSoat(page, 'LK-20260914');
  await page.getByRole('button', { name: 'Xác nhận rà soát xong danh sách' }).click();
  await page.waitForSelector('#xac-nhan-giai-trinh');
  await page.fill('#xac-nhan-giai-trinh', 'Thiếu 2 người: 2 phiếu giấy khám ngày 15/09 bị nhập nhầm sang buổi 14/09 trên máy.');
  await doi(page, 400);
  await chup(page, '14-chot-danh-sach', [
    { vung: page.locator('.confirm-buoi-summary-grid'), n: 1, vitri: 'tl', pad: 4 },
    { vung: page.locator('#xac-nhan-giai-trinh'), n: 2, vitri: 'tl' },
    { vung: page.getByRole('button', { name: 'Xác nhận và khóa danh sách' }), n: 3, vitri: 'tl' },
  ], await hopAside(page, '.modal-card', 24));
  await page.getByRole('button', { name: 'Xác nhận và khóa danh sách' }).click();
  await doi(page, 1500);
  await chup(page, '14b-danh-sach-da-khoa', [
    { vung: page.getByText(/Đã xác nhận bởi/).locator('xpath=../..'), n: 1, vitri: 'tl', pad: 2 },
    { vung: page.getByText('Đã xác nhận', { exact: true }).first(), n: 2, vitri: 'tr' },
  ], { x: 0, y: 0, w: 1366, h: 400 });

  // ---- 02 dashboard nhân viên ----
  await page.goto('/');
  await page.waitForSelector('table tbody tr');
  await doi(page, 1000);
  await chup(page, '02-dashboard-nhan-vien', [
    { vung: page.locator('.summary-card-progress'), n: 1, vitri: 'tl', pad: 2 },
    { vung: page.locator('.summary-card', { hasText: 'Thừa / Thiếu' }), n: 2, vitri: 'tl', pad: 2 },
    { vung: page.locator('table').last(), n: 3, vitri: 'tl', pad: 0 },
    { vung: page.getByPlaceholder(/Tìm hồ sơ/), n: 4, vitri: 'tl' },
  ], { x: 0, y: 0, w: 1366, h: 1185 }, true);

  // ---- 15 admin tổng quan ----
  const pAdm = await adm.newPage();
  await pAdm.goto('/admin');
  await pAdm.waitForSelector('section[aria-label="Tiến độ theo nhân viên"] table');
  await doi(pAdm, 1000);
  await chup(pAdm, '15-admin-tong-quan', [
    { vung: pAdm.locator('section[aria-label="Tiến độ theo nhân viên"]'), n: 1, vitri: 'tl', pad: 0 },
    { vung: pAdm.locator('section[aria-label="Thống kê theo đơn vị"]'), n: 2, vitri: 'tl', pad: 0 },
    { vung: pAdm.getByRole('button', { name: 'Xuất báo cáo Excel' }), n: 3, vitri: 'tl' },
    { vung: pAdm.getByRole('button', { name: /Xuất gói cho Cowork/ }), n: 3, vitri: 'tl' },
  ], { x: 0, y: 440, w: 1366, h: 1075 }, true);

  // ---- 15b admin phân công ----
  await pAdm.goto('/admin/phan-cong');
  await pAdm.waitForSelector('[aria-label="Chọn buổi LK-20260915"]');
  await doi(pAdm, 800);
  await pAdm.locator('[aria-label="Chọn buổi LK-20260915"]').check();
  await pAdm.locator('[aria-label="Chọn buổi LK-20260916"]').check();
  await pAdm.selectOption('#assign-user-select', { label: 'Giang (giang)' }).catch(async () => {
    const opts = await pAdm.locator('#assign-user-select option').allTextContents();
    await pAdm.selectOption('#assign-user-select', { index: Math.max(1, opts.findIndex((o) => /giang/i.test(o))) });
  });
  await doi(pAdm, 400);
  await chup(pAdm, '15b-admin-phan-cong', [
    { vung: pAdm.locator('.filter-bar'), n: 1, vitri: 'tl', pad: 2 },
    { vung: pAdm.locator('.bulk-action-bar'), n: 2, vitri: 'tl', pad: 2 },
    { vung: pAdm.getByRole('button', { name: 'Gán', exact: true }), n: 3, vitri: 'tl' },
  ]);

  if (process.argv.includes('--pdf')) await lamPdf(ngan);

  await browser.close();
  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await PG?.screenshot({ path: '/tmp/kham/loi.png' }).catch(() => {});
  await sql.end().catch(() => {});
  process.exit(1);
});
