import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
let ready;
const init = () =>
  (ready ??= sql`CREATE TABLE IF NOT EXISTS rooms (
    code text PRIMARY KEY,
    state jsonb NOT NULL,
    version int NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);

export async function load(code) {
  await init();
  const r = await sql`SELECT state, version FROM rooms WHERE code = ${code}`;
  return r[0] || null;
}
export async function create(code, state) {
  await init();
  await sql`INSERT INTO rooms (code, state) VALUES (${code}, ${JSON.stringify(state)}::jsonb)`;
}
// Optimistic locking: hanya tersimpan jika versi belum berubah
export async function save(code, state, version) {
  const r = await sql`UPDATE rooms SET state = ${JSON.stringify(state)}::jsonb,
    version = version + 1, updated_at = now()
    WHERE code = ${code} AND version = ${version} RETURNING version`;
  return r.length > 0;
}
