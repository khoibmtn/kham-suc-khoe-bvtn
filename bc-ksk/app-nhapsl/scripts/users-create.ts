import './_env';
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { closeDb, getSql } from '../src/db/client';
import { ghiNhatKy } from '../src/lib/nhat-ky';
import { generateReadablePassword, hashPassword } from '../src/lib/auth/password';
import type { UserRole } from '../src/lib/auth/session';

type CsvUserRow = {
  username?: string;
  ho_ten?: string;
  vai_tro?: string;
};

type ExistingUserRow = {
  id: number;
  username: string;
  ho_ten: string;
  role: UserRole;
  password_hash: string | null;
};

type OutputRow = {
  username: string;
  hoTen: string;
  matKhau: string;
  status: 'tao_moi' | 'cap_mat_khau' | 'giu_nguyen';
};

// Mật khẩu mặc định do anh Khôi chốt 11/11/2026 (app dùng 2 ngày, nhân viên tự đổi nếu muốn).
// --ngau-nhien: sinh mật khẩu ngẫu nhiên thay vì mặc định.
// --dat-lai: đặt lại mật khẩu cả user đã có mật khẩu (vô hiệu phiên cũ).
const MAT_KHAU_MAC_DINH = '123456';
let NGAU_NHIEN = false;
let DAT_LAI = false;
const taoMatKhau = () => (NGAU_NHIEN ? generateReadablePassword(10) : MAT_KHAU_MAC_DINH);

function parseArgs(argv: string[]): { pkgDir: string; outFile: string | null } {
  let pkgDir = '';
  let outFile: string | null = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        throw new Error('Thiếu đường dẫn file sau cờ --out');
      }
      outFile = next;
      i += 1;
    } else if (arg.startsWith('--out=')) {
      outFile = arg.slice('--out='.length);
      if (!outFile) {
        throw new Error('Thiếu đường dẫn file sau cờ --out=');
      }
    } else if (arg === '--ngau-nhien') {
      NGAU_NHIEN = true;
    } else if (arg === '--dat-lai') {
      DAT_LAI = true;
    } else if (arg.startsWith('--')) {
      throw new Error(`Cờ không hợp lệ: ${arg}`);
    } else if (!pkgDir) {
      pkgDir = arg;
    } else {
      throw new Error(`Tham số thừa: ${arg}`);
    }
  }

  if (!pkgDir) {
    throw new Error('Cách dùng: npm run users:create -- <thư_mục_gói> [--out <file>] [--ngau-nhien] [--dat-lai]');
  }

  return { pkgDir, outFile };
}

function resolveCsvPath(inputPath: string): string {
  const abs = path.resolve(process.cwd(), inputPath);
  if (!existsSync(abs)) {
    throw new Error(`Không tìm thấy đường dẫn: ${inputPath}`);
  }
  const st = statSync(abs);
  if (st.isDirectory()) {
    const csvFile = path.join(abs, 'nguoi_dung.csv');
    if (!existsSync(csvFile)) {
      throw new Error(`Không tìm thấy file nguoi_dung.csv trong ${inputPath}`);
    }
    return csvFile;
  }
  return abs;
}

function formatTable(rows: OutputRow[]): string {
  const headerUsername = 'username';
  const headerHoTen = 'họ tên';
  const headerMatKhau = 'mật khẩu';

  const wUser = Math.max(headerUsername.length, ...rows.map((r) => r.username.length));
  const wName = Math.max(headerHoTen.length, ...rows.map((r) => r.hoTen.length));
  const wPass = Math.max(headerMatKhau.length, ...rows.map((r) => r.matKhau.length));

  const pad = (s: string, w: number) => s.padEnd(w, ' ');
  const sep = `${'-'.repeat(wUser)}-+-${'-'.repeat(wName)}-+-${'-'.repeat(wPass)}`;

  const lines = [
    `${pad(headerUsername, wUser)} | ${pad(headerHoTen, wName)} | ${pad(headerMatKhau, wPass)}`,
    sep,
    ...rows.map(
      (r) => `${pad(r.username, wUser)} | ${pad(r.hoTen, wName)} | ${pad(r.matKhau, wPass)}`,
    ),
  ];

  return lines.join('\n');
}

async function main(): Promise<void> {
  const { pkgDir, outFile } = parseArgs(process.argv.slice(2));
  const csvPath = resolveCsvPath(pkgDir);
  const raw = readFileSync(csvPath, 'utf8');

  const records = parse<CsvUserRow>(raw, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  if (records.length === 0) {
    throw new Error('File nguoi_dung.csv không có dữ liệu');
  }

  const first = records[0];
  if (
    !('username' in first) ||
    !('ho_ten' in first) ||
    !('vai_tro' in first)
  ) {
    throw new Error('File nguoi_dung.csv thiếu cột bắt buộc (username, ho_ten, vai_tro)');
  }

  const seenUsernames = new Set<string>();
  const validated: { username: string; hoTen: string; vaiTro: UserRole }[] = [];

  for (let idx = 0; idx < records.length; idx += 1) {
    const row = records[idx];
    const username = (row.username ?? '').trim().toLowerCase();
    const hoTen = (row.ho_ten ?? '').trim();
    const vaiTro = (row.vai_tro ?? '').trim();

    if (!username || !hoTen) {
      throw new Error(`Dòng ${idx + 2}: thiếu username hoặc ho_ten`);
    }
    if (vaiTro !== 'admin' && vaiTro !== 'nhan_vien') {
      throw new Error(`Dòng ${idx + 2} (${username}): vai_tro không hợp lệ "${vaiTro}"`);
    }
    if (seenUsernames.has(username)) {
      throw new Error(`Dòng ${idx + 2}: trùng username "${username}"`);
    }
    seenUsernames.add(username);
    validated.push({ username, hoTen, vaiTro });
  }

  const sql = getSql();
  const outputRows: OutputRow[] = [];

  for (const item of validated) {
    const existingRows = await sql<ExistingUserRow[]>`
      SELECT id, username, ho_ten, role, password_hash
      FROM users
      WHERE username = ${item.username}
      LIMIT 1
    `;
    const existing = existingRows[0];

    if (!existing) {
      const plainPassword = taoMatKhau();
      const passwordHash = await hashPassword(plainPassword);

      await sql.begin(async (tx) => {
        const q = tx as unknown as typeof sql;
        const inserted = await q<{ id: number }[]>`
          INSERT INTO users (username, ho_ten, role, password_hash, active, session_version)
          VALUES (${item.username}, ${item.hoTen}, ${item.vaiTro}, ${passwordHash}, true, 1)
          RETURNING id
        `;
        await ghiNhatKy(
          {
            userId: null,
            hanhDong: 'tao_user',
            doiTuong: 'user',
            doiTuongId: inserted[0].id,
            ghiChu: item.username,
          },
          tx,
        );
      });

      outputRows.push({
        username: item.username,
        hoTen: item.hoTen,
        matKhau: plainPassword,
        status: 'tao_moi',
      });
    } else if (existing.password_hash === null || DAT_LAI) {
      const plainPassword = taoMatKhau();
      const passwordHash = await hashPassword(plainPassword);

      await sql.begin(async (tx) => {
        const q = tx as unknown as typeof sql;
        await q`
          UPDATE users
          SET password_hash = ${passwordHash},
              ho_ten = ${item.hoTen},
              role = ${item.vaiTro},
              session_version = session_version + 1
          WHERE id = ${existing.id}
        `;
        await ghiNhatKy(
          {
            userId: null,
            hanhDong: 'cap_mat_khau',
            doiTuong: 'user',
            doiTuongId: existing.id,
            ghiChu: item.username,
          },
          tx,
        );
      });

      outputRows.push({
        username: item.username,
        hoTen: item.hoTen,
        matKhau: plainPassword,
        status: 'cap_mat_khau',
      });
    } else {
      outputRows.push({
        username: existing.username,
        hoTen: existing.ho_ten,
        matKhau: 'đã có, giữ nguyên',
        status: 'giu_nguyen',
      });
    }
  }

  const tableText = formatTable(outputRows);
  const createdCount = outputRows.filter((r) => r.status === 'tao_moi').length;
  const grantedCount = outputRows.filter((r) => r.status === 'cap_mat_khau').length;
  const keptCount = outputRows.filter((r) => r.status === 'giu_nguyen').length;
  const summaryLine = `Tổng: ${outputRows.length} tài khoản (tạo mới: ${createdCount}, cấp mật khẩu: ${grantedCount}, đã có, giữ nguyên: ${keptCount}).`;

  console.log(tableText);
  console.log('');
  console.log(summaryLine);

  if (outFile) {
    const absOut = path.resolve(process.cwd(), outFile);
    mkdirSync(path.dirname(absOut), { recursive: true });
    // Nếu có mật khẩu mới được sinh ra hoặc file chưa tồn tại thì ghi ra file với quyền 600.
    // Nếu tất cả đều "đã có, giữ nguyên" và file đã tồn tại từ lần chạy trước, giữ nguyên file để không làm mất mật khẩu đã lưu.
    if (createdCount + grantedCount > 0 || !existsSync(absOut)) {
      writeFileSync(absOut, `${tableText}\n\n${summaryLine}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      });
      chmodSync(absOut, 0o600);
      console.log(`Đã ghi bảng mật khẩu vào: ${outFile} (quyền 600)`);
    } else {
      chmodSync(absOut, 0o600);
      console.log(`Không ghi đè ${outFile} vì cả ${keptCount} tài khoản đã có, giữ nguyên.`);
    }
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
