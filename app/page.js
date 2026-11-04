'use client';
import { useEffect, useState } from 'react';

export default function Page() {
  const [sess, setSess] = useState(null);
  const [st, setSt] = useState(null);
  const [err, setErr] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [clue, setClue] = useState('');
  const [guess, setGuess] = useState('');
  const [ch, setCh] = useState('');
  const [al, setAl] = useState('');

  useEffect(() => {
    const s = localStorage.getItem('sess');
    if (s) setSess(JSON.parse(s));
  }, []);

  const leave = () => { localStorage.removeItem('sess'); setSess(null); setSt(null); };

  useEffect(() => {
    if (!sess) return;
    const tick = async () => {
      const r = await fetch(`/api/room?code=${sess.code}&pid=${sess.pid}`, { cache: 'no-store' });
      if (r.ok) setSt(await r.json());
      else if (r.status === 404 || r.status === 403) leave();
    };
    tick();
    const t = setInterval(tick, 1500);
    return () => clearInterval(t);
  }, [sess]);

  const call = async (body) => {
    setErr('');
    const r = await fetch('/api/room', { method: 'POST', body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) { setErr(d.error); return null; }
    if (d.state) setSt(d.state);
    return d;
  };
  const enter = async (action) => {
    const d = await call({ action, name, code });
    if (d) { const s = { code: d.code, pid: d.pid }; localStorage.setItem('sess', JSON.stringify(s)); setSess(s); }
  };
  const act = async (action, extra = {}) => {
    const d = await call({ action, ...sess, ...extra });
    return d;
  };

  if (!sess || !st) {
    return (
      <main>
        <h1>🍥 Tebak Karakter</h1>
        <div className="card" style={{ maxWidth: 420 }}>
          <input placeholder="Nickname" value={name} onChange={(e) => setName(e.target.value)} />
          <button onClick={() => enter('create')}>Buat Room</button>
          <hr style={{ borderColor: '#2c3042', margin: '14px 0' }} />
          <input placeholder="Kode room" value={code} maxLength={4}
            onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <button className="alt" onClick={() => enter('join')}>Gabung</button>
          {err && <p className="err">{err}</p>}
        </div>
      </main>
    );
  }

  const { phase, turn, me, opponent: op, clues, myId } = st;
  const myTurn = turn === myId;
  const pendingClue = clues.find((c) => c.answer === null);
  const mine = clues.filter((c) => c.from === myId);
  const theirs = clues.filter((c) => c.from !== myId);
  const toAnswer = pendingClue && pendingClue.from !== myId ? pendingClue : null;
  const label = (c) => (c.answer === null ? <span className="w">menunggu…</span>
    : c.answer ? <span className="t">BENAR</span> : <span className="f">SALAH</span>);

  const ClueList = ({ items }) => (
    <div className="list">
      {items.length === 0 && <p className="muted">Belum ada clue.</p>}
      {items.map((c) => (<div className="clue" key={c.id}><span>{c.text}</span>{label(c)}</div>))}
    </div>
  );

  return (
    <main>
      <h1>🍥 Tebak Karakter</h1>
      <p className="muted">
        Kamu: <b>{me.name}</b> · Lawan: <b>{op?.name || '—'}</b>
        {op && <> ({op.online ? '🟢 online' : '🔴 offline'})</>} · Room {st.code}
        {' '}<button className="alt" onClick={leave}>Keluar</button>
      </p>
      {err && <p className="err">{err}</p>}

      {phase === 'lobby' && (
        <div className="card">
          <p>Bagikan kode ini ke temanmu:</p>
          <div className="code">{st.code}</div>
          <p className="muted">Menunggu pemain kedua bergabung…</p>
        </div>
      )}

      {phase === 'setup' && (
        <div className="card">
          <h2>Tulis karakter rahasiamu</h2>
          {me.ready ? (
            <p>✅ Karakter tersimpan. Menunggu {op?.name} siap…</p>
          ) : (
            <>
              <input placeholder="Nama karakter, mis. Itachi Uchiha" value={ch} onChange={(e) => setCh(e.target.value)} />
              <input placeholder="Alias (pisahkan koma), mis. Itachi, Uchiha Itachi" value={al} onChange={(e) => setAl(e.target.value)} />
              <button onClick={() => act('set_character', { character: ch, aliases: al })}>Siap</button>
            </>
          )}
        </div>
      )}

      {phase === 'play' && (
        <>
          <div className="card">
            <b>{myTurn ? '🎯 Giliranmu' : `⏳ Giliran ${op.name}`}</b>
            {st.lastGuess && <p className="muted">Tebakan terakhir salah: "{st.lastGuess.text}"</p>}
            <button className="no" style={{ float: 'right' }}
              onClick={() => confirm('Yakin menyerah?') && act('surrender')}>Menyerah</button>
          </div>

          {toAnswer && (
            <div className="card" style={{ borderColor: '#f58a1f' }}>
              <h3>{op.name} bertanya:</h3>
              <p style={{ fontSize: 18 }}>{toAnswer.text}</p>
              <p className="muted">Karakter kamu: <b>{me.character}</b></p>
              <button className="ok" onClick={() => act('validate', { answer: true })}>Benar</button>
              <button className="no" onClick={() => act('validate', { answer: false })}>Salah</button>
            </div>
          )}

          <div className="grid">
            <div className="card">
              <h3>Karakter Lawan</h3>
              <ClueList items={mine} />
              <input placeholder="Tulis clue / pertanyaan…" value={clue}
                disabled={!myTurn || !!pendingClue} onChange={(e) => setClue(e.target.value)} />
              <button disabled={!myTurn || !!pendingClue || !clue.trim()}
                onClick={async () => { if (await act('send_clue', { text: clue })) setClue(''); }}>Kirim Clue</button>
              <hr style={{ borderColor: '#2c3042', margin: '14px 0' }} />
              <input placeholder="Tebak nama karakter…" value={guess}
                disabled={!myTurn || !!pendingClue} onChange={(e) => setGuess(e.target.value)} />
              <button disabled={!myTurn || !!pendingClue || !guess.trim()}
                onClick={async () => { if (await act('guess', { text: guess })) setGuess(''); }}>Submit Tebakan</button>
              <button className="alt" disabled={!myTurn || !!pendingClue}
                onClick={() => act('end_turn')}>Akhiri Giliran</button>
            </div>
            <div className="card">
              <h3>Karakterku: {me.character}</h3>
              <p className="muted">Pertanyaan dari {op.name}</p>
              <ClueList items={theirs} />
            </div>
          </div>
        </>
      )}

      {phase === 'done' && (
        <div className="card">
          <h2>{st.winner === myId ? '🏆 Kamu menang!' : '😵 Kamu kalah'}</h2>
          <p>{st.reason}</p>
          <p>Karakter {op.name}: <b>{op.character}</b> · Karakter kamu: <b>{me.character}</b></p>
          <div className="grid">
            <div><h3>Clue kamu</h3><ClueList items={mine} /></div>
            <div><h3>Clue {op.name}</h3><ClueList items={theirs} /></div>
          </div>
          <button onClick={() => act('rematch')}>Main Lagi</button>
        </div>
      )}
    </main>
  );
}
