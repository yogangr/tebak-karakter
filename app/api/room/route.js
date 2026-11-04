import { NextResponse } from 'next/server';
import { load, create, save } from '../../../lib/db';

export const dynamic = 'force-dynamic';

const norm = (s) =>
  String(s || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
const other = (s, pid) => s.players.find((p) => p.id !== pid);
const pending = (s) => s.clues.find((c) => c.answer === null);
const fail = (m) => { throw new Error(m); };
const finish = (s, winner, reason) => { s.phase = 'done'; s.winner = winner; s.reason = reason; };
const setTurn = (s, pid) => { s.turn = pid; s.turnAt = Date.now(); };
// Siapa yang sedang harus bertindak: penjawab jika ada clue menunggu, selain itu pemegang giliran
const actorId = (s) => { const c = pending(s); return c ? other(s, c.from).id : s.turn; };

// Timer dicek saat ada request (tanpa cron). Return true jika state berubah.
function tick(s) {
  const t = s.settings?.turnSeconds;
  if (s.phase !== 'play' || !t || Date.now() - s.turnAt < t * 1000) return false;
  const c = pending(s);
  if (c) {
    const v = other(s, c.from);
    c.answer = 'skip';
    s.notice = `Waktu ${v.name} habis, clue tidak dijawab`;
    setTurn(s, v.id);
  } else {
    const cur = s.players.find((x) => x.id === s.turn);
    s.notice = `Waktu ${cur.name} habis, giliran dilewati`;
    setTurn(s, other(s, s.turn).id);
  }
  return true;
}

// Hanya kirim data yang boleh dilihat pemain ini (karakter lawan disembunyikan)
function view(s, code, pid) {
  const me = s.players.find((p) => p.id === pid);
  if (!me) return null;
  const op = other(s, pid);
  return {
    code, phase: s.phase, turn: s.turn, winner: s.winner, reason: s.reason,
    clues: s.clues, guesses: s.guesses || [], notice: s.notice || null, myId: pid,
    settings: { turnSeconds: s.settings?.turnSeconds || 0 },
    isHost: s.players[0].id === pid,
    actor: s.phase === 'play' ? actorId(s) : null,
    timeLeft: s.phase === 'play' && s.settings?.turnSeconds
      ? Math.max(0, s.settings.turnSeconds - (Date.now() - s.turnAt) / 1000) : null,
    me: { name: me.name, character: me.character, aliases: me.aliases, ready: me.ready },
    opponent: op && {
      name: op.name, ready: op.ready, online: Date.now() - op.seen < 15000,
      character: s.phase === 'done' ? op.character : undefined,
      aliases: s.phase === 'done' ? op.aliases : undefined,
    },
  };
}

const actions = {
  set_character(s, p, b) {
    if (s.phase !== 'setup') fail('Belum waktunya menulis karakter');
    const c = String(b.character || '').trim().slice(0, 80);
    if (!c) fail('Karakter tidak boleh kosong');
    p.character = c;
    p.aliases = String(b.aliases || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 10);
    p.ready = true;
    if (s.players.every((x) => x.ready)) { s.phase = 'play'; setTurn(s, s.players[Math.random() < 0.5 ? 0 : 1].id); }
  },
  send_clue(s, p, b) {
    if (s.phase !== 'play' || s.turn !== p.id) fail('Bukan giliranmu');
    if (pending(s)) fail('Tunggu clue sebelumnya dijawab');
    const text = String(b.text || '').trim().slice(0, 200);
    if (!text) fail('Clue kosong');
    s.clues.push({ id: s.clues.length + 1, from: p.id, text, answer: null });
    s.turnAt = Date.now(); // timer penjawab dimulai
  },
  validate(s, p, b) {
    const c = pending(s);
    if (s.phase !== 'play' || !c || c.from === p.id) fail('Tidak ada clue untuk dijawab');
    if (typeof b.answer !== 'boolean') fail('Jawaban tidak valid');
    c.answer = b.answer;
    setTurn(s, p.id); // setelah menjawab, giliran bertanya pindah ke pemain yang menjawab
  },
  guess(s, p, b) {
    if (s.phase !== 'play' || s.turn !== p.id) fail('Bukan giliranmu');
    if (pending(s)) fail('Tunggu clue sebelumnya dijawab');
    const op = other(s, p.id);
    const ok = [op.character, ...op.aliases].map(norm).includes(norm(b.text));
    s.guesses = s.guesses || [];
    s.guesses.push({ id: s.guesses.length + 1, by: p.id, text: String(b.text || '').trim().slice(0, 80), correct: ok });
    if (ok) finish(s, p.id, 'Tebakan benar!');
    else setTurn(s, op.id);
  },
  end_turn(s, p) {
    if (s.phase !== 'play' || s.turn !== p.id) fail('Bukan giliranmu');
    if (pending(s)) fail('Tunggu clue sebelumnya dijawab');
    setTurn(s, other(s, p.id).id);
  },
  surrender(s, p) {
    if (s.phase !== 'play') fail('Game belum berjalan');
    finish(s, other(s, p.id).id, 'Lawan menyerah');
  },
  set_timer(s, p, b) {
    if (!['lobby', 'setup'].includes(s.phase)) fail('Timer hanya bisa diubah sebelum game mulai');
    if (s.players[0].id !== p.id) fail('Hanya room master yang bisa mengubah timer');
    const n = Math.round(Number(b.seconds));
    if (!Number.isFinite(n) || n < 0 || n > 600) fail('Timer tidak valid');
    s.settings = { turnSeconds: n };
  },
  rematch(s, p) {
    if (s.phase !== 'done') fail('Game belum selesai');
    Object.assign(s, { phase: 'setup', turn: null, winner: null, reason: null, clues: [], guesses: [], notice: null });
    s.players.forEach((x) => { x.character = null; x.aliases = []; x.ready = false; });
  },
};

async function mutate(code, pid, fn) {
  for (let i = 0; i < 4; i++) {
    const row = await load(code);
    if (!row) fail('Room tidak ditemukan');
    const s = row.state;
    const p = s.players.find((x) => x.id === pid);
    if (!p) fail('Kamu bukan pemain di room ini');
    p.seen = Date.now();
    s.notice = null;
    tick(s);
    fn(s, p);
    if (await save(code, s, row.version)) return s;
  }
  fail('Server sibuk, coba lagi');
}

export async function GET(req) {
  const u = new URL(req.url);
  const code = u.searchParams.get('code'), pid = u.searchParams.get('pid');
  const row = code && (await load(code));
  if (!row) return NextResponse.json({ error: 'Room tidak ditemukan' }, { status: 404 });
  const s = row.state, me = s.players.find((p) => p.id === pid);
  if (!me) return NextResponse.json({ error: 'Bukan pemain' }, { status: 403 });
  let dirty = tick(s);
  if (Date.now() - me.seen > 10000) { me.seen = Date.now(); dirty = true; }
  if (dirty) await save(code, s, row.version);
  return NextResponse.json(view(s, code, pid));
}

export async function POST(req) {
  try {
    const b = await req.json();
    const name = String(b.name || '').trim().slice(0, 20);
    if (b.action === 'create') {
      if (!name) fail('Isi nickname dulu');
      const code = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');
      const pid = crypto.randomUUID();
      const s = { phase: 'lobby', turn: null, turnAt: 0, settings: { turnSeconds: 0 }, clues: [], guesses: [], notice: null, winner: null, reason: null,
        players: [{ id: pid, name, character: null, aliases: [], ready: false, seen: Date.now() }] };
      await create(code, s);
      return NextResponse.json({ code, pid, state: view(s, code, pid) });
    }
    if (b.action === 'join') {
      const code = String(b.code || '').trim().toUpperCase();
      if (!name) fail('Isi nickname dulu');
      const pid = crypto.randomUUID();
      let joined;
      for (let i = 0; i < 4 && !joined; i++) {
        const row = await load(code);
        if (!row) fail('Room tidak ditemukan');
        if (row.state.players.length >= 2) fail('Room sudah penuh');
        row.state.players.push({ id: pid, name, character: null, aliases: [], ready: false, seen: Date.now() });
        row.state.phase = 'setup';
        if (await save(code, row.state, row.version)) joined = row.state;
      }
      if (!joined) fail('Gagal bergabung, coba lagi');
      return NextResponse.json({ code, pid, state: view(joined, code, pid) });
    }
    const fn = actions[b.action] || fail('Aksi tidak dikenal');
    const s = await mutate(b.code, b.pid, (st, p) => fn(st, p, b));
    return NextResponse.json({ state: view(s, b.code, b.pid) });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
