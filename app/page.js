'use client';
import { useEffect, useState } from 'react';

const Stamp = ({ a }) =>
  a === null ? <span className="stamp w">MENUNGGU</span>
  : a ? <span className="stamp t">BENAR</span> : <span className="stamp f">SALAH</span>;

const Thread = ({ items, side }) => (
  <div className="thread">
    {items.length === 0 && <div className="empty">Belum ada clue.</div>}
    {items.map((c) => (
      <div key={c.id} className={`msg ${side}`}><span>{c.text}</span><Stamp a={c.answer} /></div>
    ))}
  </div>
);

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
  const act = (action, extra = {}) => call({ action, ...sess, ...extra });

  if (!sess || !st) {
    return (
      <main>
        <div className="hero">
          <h1>Siapa Aku?</h1>
          <p>Duel tebak karakter berdua. Tulis karakter rahasiamu, lalu bongkar karakter lawan lewat clue yang kamu tulis sendiri.</p>
        </div>
        <div className="card stack">
          <input placeholder="Nickname kamu" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="go" onClick={() => enter('create')}>Buat room baru</button>
          <div className="sep">atau gabung</div>
          <input placeholder="Kode room (4 huruf)" value={code} maxLength={4}
            onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <button onClick={() => enter('join')}>Gabung room</button>
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
  const locked = !myTurn || !!pendingClue;

  const Player = ({ n, on, turnNow, self }) => (
    <div className={`pl ${turnNow ? 'turn' : ''}`}>
      <div className="av">{(n || '?')[0].toUpperCase()}</div>
      <div>{self ? `${n} (kamu)` : n}
        <small>{on === undefined ? '' : <><i className={`dot ${on ? 'on' : ''}`} />{on ? 'online' : 'offline'}</>}</small>
      </div>
    </div>
  );

  return (
    <main>
      <div className="top">
        <div className="duel">
          <Player n={me.name} self turnNow={phase === 'play' && myTurn} />
          <span className="vs">VS</span>
          {op ? <Player n={op.name} on={op.online} turnNow={phase === 'play' && !myTurn} />
              : <span className="mut">Menunggu lawan…</span>}
        </div>
        <div className="row" style={{ margin: 0 }}>
          <span className="chip">{st.code}</span>
          <button className="ghost" onClick={leave}>Keluar</button>
        </div>
      </div>
      {err && <p className="err">{err}</p>}

      {phase === 'lobby' && (
        <div className="card">
          <h2>Ajak temanmu masuk</h2>
          <p className="mut">Bagikan kode ini. Game dimulai setelah pemain kedua bergabung.</p>
          <div className="code">{st.code.split('').map((c, i) => <span key={i}>{c}</span>)}</div>
        </div>
      )}

      {phase === 'setup' && (
        <div className="card">
          <h2>Pilih karakter rahasiamu</h2>
          {me.ready ? (
            <p>Karakter <b>{me.character}</b> tersimpan. Menunggu {op?.name} siap…</p>
          ) : (
            <div className="stack" style={{ maxWidth: 480 }}>
              <p className="mut">Lawan tidak bisa melihat ini sampai game selesai.</p>
              <input placeholder="Nama karakter, mis. Itachi Uchiha" value={ch} onChange={(e) => setCh(e.target.value)} />
              <input placeholder="Nama lain, pisahkan koma: Itachi, Uchiha Itachi" value={al} onChange={(e) => setAl(e.target.value)} />
              <button className="go" disabled={!ch.trim()} onClick={() => act('set_character', { character: ch, aliases: al })}>Kunci karakter</button>
            </div>
          )}
        </div>
      )}

      {phase === 'play' && (
        <>
          {toAnswer && (
            <div className="card hot">
              <p className="mut">{op.name} bertanya tentang karakter kamu ({me.character}):</p>
              <div className="q">{toAnswer.text}</div>
              <div className="row">
                <button className="ok big" onClick={() => act('validate', { answer: true })}>Benar</button>
                <button className="no big" onClick={() => act('validate', { answer: false })}>Salah</button>
              </div>
            </div>
          )}

          <div className="grid">
            <div className="card">
              <h3>Karakter {op.name}</h3>
              <p className="mut">
                {myTurn ? (pendingClue ? 'Menunggu jawaban lawan…' : 'Giliranmu. Kirim clue, tebak, atau akhiri giliran.') : `Menunggu giliran ${op.name}.`}
                {st.lastGuess && ` Tebakan terakhir ("${st.lastGuess.text}") salah.`}
              </p>
              <Thread items={mine} side="me" />
              <div className="row">
                <input placeholder="Tulis clue atau pertanyaan" value={clue} disabled={locked}
                  onChange={(e) => setClue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && clue.trim() && act('send_clue', { text: clue }).then((d) => d && setClue(''))} />
                <button disabled={locked || !clue.trim()}
                  onClick={async () => { if (await act('send_clue', { text: clue })) setClue(''); }}>Kirim</button>
              </div>
              <div className="row">
                <input placeholder="Tebak nama karakternya" value={guess} disabled={locked}
                  onChange={(e) => setGuess(e.target.value)} />
                <button className="go" disabled={locked || !guess.trim()}
                  onClick={async () => { if (await act('guess', { text: guess })) setGuess(''); }}>Tebak</button>
              </div>
              <div className="row">
                <button className="ghost" disabled={locked} onClick={() => act('end_turn')}>Akhiri giliran</button>
                <button className="ghost" onClick={() => confirm('Yakin menyerah?') && act('surrender')}>Menyerah</button>
              </div>
            </div>

            <div className="card">
              <h3>Karakter kamu</h3>
              <div className="secret">{me.character}</div>
              <h3>Pertanyaan dari {op.name}</h3>
              <Thread items={theirs} side="op" />
            </div>
          </div>
        </>
      )}

      {phase === 'done' && (
        <div className="card">
          <h2>{st.winner === myId ? 'Kamu menang!' : 'Kamu kalah'}</h2>
          <p className="mut">{st.reason}</p>
          <div className="result">
            <div><p className="mut">Karakter {op.name}</p><div className="secret">{op.character}</div><Thread items={mine} side="me" /></div>
            <div><p className="mut">Karakter kamu</p><div className="secret">{me.character}</div><Thread items={theirs} side="op" /></div>
          </div>
          <button className="go" onClick={() => act('rematch')}>Main lagi</button>
        </div>
      )}
    </main>
  );
}
