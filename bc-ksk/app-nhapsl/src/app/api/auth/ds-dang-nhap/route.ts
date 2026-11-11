import { getSql } from '@/db/client';

// Public (before login): list of selectable accounts for the login dropdown.
// Returns only username + display name of active accounts that have a password.

export async function GET(): Promise<Response> {
  const rows = await getSql()<{ username: string; ho_ten: string; role: string }[]>`
    SELECT username, ho_ten, role FROM users
     WHERE active AND password_hash IS NOT NULL
     ORDER BY (role = 'admin') DESC, ho_ten`;
  return Response.json(rows.map((r) => ({ username: r.username, ho_ten: r.ho_ten })), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
