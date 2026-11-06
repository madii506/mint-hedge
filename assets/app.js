// mint, the site. Live data from /api/mint (Jupiter prices, Polymarket via Jupiter, the chain). Every transaction is built
// by the server and signed in the visitor's own wallet.
(function () {
  const A = window.MINTART, C = A.C;
  const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const S = { status: null, wallet: null, provider: null, sol: .25, gold: 60, betOn: true, market: null, quote: null, geo: null, mints: 0, gallery: [], busy: false };

  const usd = (x, d) => x == null || !isFinite(x) ? '—' : '$' + (+x).toLocaleString('en-US', { minimumFractionDigits: d ?? (Math.abs(x) >= 100 ? 2 : Math.abs(x) >= 1 ? 2 : 4), maximumFractionDigits: d ?? (Math.abs(x) >= 100 ? 2 : Math.abs(x) >= 1 ? 2 : 4) });
  const pct = x => x == null || !isFinite(x) ? '—' : (x < 0 ? '▼' : '▲') + Math.abs(x).toFixed(2) + '%';
  const cls = x => x == null ? '' : x < 0 ? 'dn' : 'up';
  const short = s => s ? s.slice(0, 4) + '…' + s.slice(-4) : '';
  const lvl = n => '$' + (+n).toLocaleString('en-US');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  async function api(a, params, body) {
    const q = new URLSearchParams({ a, ...(params || {}) });
    const r = await fetch('/api/mint?' + q, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
    const j = await r.json().catch(() => ({ error: 'bad response (' + r.status + ')' })); if (!r.ok || j.error) throw new Error(j.error || 'request failed'); return j;
  }
  let toastT; function toast(msg, ms = 4200) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms); }
  function sizeCanvas(c, w, h) { c.width = Math.round(w * DPR); c.height = Math.round(h * DPR); const g = c.getContext('2d'); g.setTransform(DPR, 0, 0, DPR, 0, 0); g.imageSmoothingEnabled = false; return g; }

  // ---------------------------------------------------------------- leaf marks everywhere
  function drawMarks() { $$('canvas.leafmark').forEach(c => { const wm = c.parentElement.querySelector('.wm'); const css = wm ? Math.round(parseFloat(getComputedStyle(wm).fontSize) * .74) : +c.dataset.size;
    const g = sizeCanvas(c, css * 1.06, css * 1.06); c.style.width = css * 1.06 + 'px'; c.style.height = css * 1.06 + 'px'; A.leaf(g, 0, 0, css, { body: C.ink, rib: C.mintL, shadow: css > 40 ? C.mintS : null }); }); }

  // ---------------------------------------------------------------- the intro: a wall of bears, the crash, the leaf lands
  function intro(done) {
    const cv = $('#intro'); if (RM || location.hash || scrollY > 10) { document.body.classList.remove('intro-on'); return done(); }
    history.scrollRestoration = 'manual'; scrollTo(0, 0);
    const W = innerWidth, H = innerHeight, g = sizeCanvas(cv, W, H); cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const ts = Math.max(58, Math.min(W, H) / 5.6), gap = ts * .24, step = ts + gap, cols = Math.ceil(W / step) + 1, rows = Math.ceil(H / step) + 1;
    const ox = (W - (cols * step - gap)) / 2, oy = (H - (rows * step - gap)) / 2, r = A.rng(42), tiles = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { const cx = ox + x * step, cy = oy + y * step, d = Math.hypot(cx + ts / 2 - W / 2, cy + ts / 2 - H / 2) / Math.hypot(W, H);
      tiles.push({ x: cx, y: cy, col: C.rows[y % 6], spec: A.bearSpec(r), pop: d * 900, fall: 1350 + (cx / W) * 900 + r() * 260, vr: (r() - .5) * .006, vx: (r() - .5) * .12, blink: r() * 3000 }); }
    const L = Math.min(W, H) * .36, lx = (W - L) / 2, ly = (H - L) / 2 - L * .02, px = L / 16;
    const cells = A.LEAF.map(([x, y, k]) => ({ x, y, k, sx: r() * W, sy: H + r() * H * .4, d: 2050 + r() * 650 + (x + y) * 12 }));
    let t0 = performance.now(), handoff = null, finished = false;
    const ease = t => 1 - Math.pow(1 - t, 3), back = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
    const skip = () => { if (!handoff) t0 = performance.now() - 3500; };
    addEventListener('pointerdown', skip, { once: true }); addEventListener('keydown', skip, { once: true });
    function frame(now) {
      const t = now - t0; g.clearRect(0, 0, W, H);
      let bgA = 1, lead = { x: lx, y: ly, s: L };
      if (t > 3650 && !handoff) { const tgt = $('#heroLeaf').getBoundingClientRect(); handoff = { t: now, x: tgt.left, y: tgt.top, s: tgt.width / 1.06 }; document.body.classList.add('handoff'); document.body.classList.remove('intro-on'); }
      if (handoff) { const k = Math.min(1, (now - handoff.t) / 950), e = ease(k); bgA = 1 - Math.min(1, k * 1.6); lead = { x: lx + (handoff.x - lx) * e, y: ly + (handoff.y - ly) * e, s: L + (handoff.s - L) * e }; if (k >= 1 && !finished) { finished = true; document.body.classList.remove('handoff'); cv.remove(); return done(); } }
      g.fillStyle = `rgba(63,230,166,${bgA})`; g.fillRect(0, 0, W, H);
      // the bears
      if (!handoff) for (const T of tiles) {
        const kp = Math.max(0, Math.min(1, (t - T.pop) / 420)); if (kp <= 0) continue; const sc = back(kp);
        let x = T.x, y = T.y, rot = 0; const tf = t - T.fall; if (tf > 0) { y += .0021 * tf * tf; x += T.vx * tf; rot = T.vr * tf; if (y > H + ts) continue; }
        g.save(); g.translate(x + ts / 2, y + ts / 2); g.rotate(rot); g.scale(sc, sc); g.translate(-ts / 2, -ts / 2);
        A.tile(g, 0, 0, ts, T.col, T.spec, { badge: t > 650 + T.pop * .3, blink: ((t + T.blink) % 2600) < 120 });
        g.restore(); }
      // the leaf, pixel by pixel
      const ps = lead.s / 16;
      if (t > 2000) { const ka = Math.min(1, (t - 3050) / 300); if (ka > 0) { g.fillStyle = C.mintS; g.globalAlpha = ka * (handoff ? 1 : 1); for (const c of A.LEAF) g.fillRect(lead.x + c.x * ps + lead.s * .05, lead.y + c.y * ps + lead.s * .05, ps + .5, ps + .5); g.globalAlpha = 1; }
        for (const c of cells) { const k = Math.max(0, Math.min(1, (t - c.d) / 620)); if (k <= 0) continue; const e = ease(k);
          const x = c.sx + (lead.x + c.x * ps - c.sx) * e, y = c.sy + (lead.y + c.y * ps - c.sy) * e;
          g.fillStyle = c.k === 'r' ? C.mintL : C.ink; g.fillRect(x, y, ps + .5, ps + .5); } }
      requestAnimationFrame(frame); }
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- the hero wall: 8 x 6 bears; every mint turns one into a leaf
  const WALL = { cols: 8, rows: 6, ts: 62, gap: 14, tiles: [], flips: {} };
  function wallInit() { const r = A.rng(17); WALL.tiles = []; for (let y = 0; y < 6; y++) for (let x = 0; x < 8; x++) WALL.tiles.push({ x, y, spec: A.bearSpec(r), ph: r() * 6.28, blink: r() * 4000 });
    // leaves fill from the bright right edge, top to bottom, column by column
    WALL.order = []; for (let x = 7; x >= 0; x--) for (let y = 0; y < 6; y++) WALL.order.push(y * 8 + x); }
  let wallHover = -1;
  function wallFrame(now) {
    const c = $('#wall'); if (!c) return; const box = c.getBoundingClientRect();
    if (box.bottom > 0 && box.top < innerHeight) {
      const w = 608, h = 456; if (c.width !== Math.round(box.width * DPR)) { c.width = Math.round(box.width * DPR); c.height = Math.round(box.height * DPR); }
      const g = c.getContext('2d'), k = c.width / w; g.setTransform(k, 0, 0, k, 0, 0); g.clearRect(0, 0, w, h);
      const spy = S.status && S.status.prices && S.status.prices.spy, ch = spy ? spy.ch24 : null, leaves = Math.min(48, S.mints || 0);
      const isLeaf = new Set(WALL.order.slice(0, leaves));
      WALL.tiles.forEach((T, i) => {
        const x = 7 + T.x * (WALL.ts + WALL.gap), y0 = 7 + T.y * (WALL.ts + WALL.gap), bob = RM ? 0 : Math.sin(now / 900 + T.ph) * 1.6 - (i === wallHover ? 5 : 0);
        const a = .18 + .82 * Math.pow(T.x / 7, 1.3); g.save(); g.globalAlpha = i === wallHover ? 1 : a;
        A.tile(g, x, y0 + bob, WALL.ts, isLeaf.has(i) ? C.mint : C.rows[T.y], T.spec, { leaf: isLeaf.has(i), badge: ch == null || ch < 0, blink: ((now + T.blink) % 3600) < 130 });
        if (ch != null && ch >= 0 && !isLeaf.has(i)) { // stocks up: the bears get a little green ▲
          const p = 9 / 5, X = x + WALL.ts - 15, Y = y0 + bob + 7; g.fillStyle = C.mintD; ['..X..', '.XXX.', 'XXXXX'].forEach((row, j) => [...row].forEach((q, m) => { if (q === 'X') g.fillRect(X + m * p, Y + j * p, p + .3, p + .3); })); }
        g.restore(); });
    }
    requestAnimationFrame(wallFrame);
  }
  function wallHoverInit() { const c = $('#wall'); c.addEventListener('pointermove', e => { const b = c.getBoundingClientRect(), k = 608 / b.width, x = (e.clientX - b.left) * k - 7, y = (e.clientY - b.top) * k - 7, s = WALL.ts + WALL.gap; const cx = Math.floor(x / s), cy = Math.floor(y / s); wallHover = cx >= 0 && cy >= 0 && cx < 8 && cy < 6 && x % s < WALL.ts && y % s < WALL.ts ? cy * 8 + cx : -1; }); c.addEventListener('pointerleave', () => wallHover = -1); }

  // ---------------------------------------------------------------- 01: the exploded vault
  const PX_FONT = { '#': ['01010', '11111', '01010', '11111', '01010'], 0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 2: ['111', '001', '111', '100', '111'], 3: ['111', '001', '111', '001', '111'], 4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'], 6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'], 8: ['111', '101', '111', '101', '111'], 9: ['111', '101', '111', '001', '111'] };
  // the same 64x64 picture the API serves as the NFT image
  const PALS = [['#3fe6a6', '#0c1512'], ['#f2b63f', '#0c1512'], ['#3d63dd', '#effff8'], ['#8a6cf0', '#effff8'], ['#f06b7e', '#0c1512'], ['#0c1512', '#3fe6a6']];
  const darken = h => '#' + [1, 3, 5].map(i => Math.round(parseInt(h.slice(i, i + 2), 16) * .72).toString(16).padStart(2, '0')).join('');
  // the same 64x64 picture the API serves as the NFT image
  function nftArt(g, size, n, pal = PALS[0]) {
    const [bg, fg] = pal, u = size / 64, put = (x, y, col) => { g.fillStyle = col; g.fillRect(x * u, y * u, u + .3, u + .3); };
    g.fillStyle = bg; g.fillRect(0, 0, size, size);
    const sh = bg === '#0c1512' ? '#0a4d38' : darken(bg), rib = bg === '#0c1512' ? '#effff8' : bg;
    for (const [x, y] of A.LEAF) for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) put(16 + x * 2 + a + 2, 13 + y * 2 + b + 2, sh);
    for (const [x, y, k] of A.LEAF) for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) put(16 + x * 2 + a, 13 + y * 2 + b, k === 'r' ? rib : fg);
    let cx = 5; for (const ch of '#' + String(n)) { const gl = PX_FONT[ch]; if (!gl) continue; gl.forEach((row, yy) => [...row].forEach((v, xx) => { if (v === '1') put(cx + xx, 4 + yy, fg); })); cx += gl[0].length + 1; }
    for (let x = 0; x < 9; x++) for (let y = 0; y < 3; y++) put(50 + x, 56 + y, C.gold); put(50, 56, bg); put(58, 56, bg);
  }
  function layerArt() {
    $$('.layer canvas').forEach(c => { const s = 330, g = sizeCanvas(c, s, s), k = c.dataset.art;
      if (k === 'nft') nftArt(g, s, (S.mints || 0) + 1);
      if (k === 'gold') { g.fillStyle = C.gold; g.fillRect(0, 0, s, s); A.grain(g, s, s, .12, 3); const p = 9; A.goldBar(g, s / 2 - 7 * p - 7 * p - 6, s / 2 + 10, p); A.goldBar(g, s / 2 + 6, s / 2 + 10, p); A.goldBar(g, s / 2 - 7 * p, s / 2 + 10 - 5 * p - 4, p); }
      if (k === 'usd') { g.fillStyle = C.paper; g.fillRect(0, 0, s, s); for (let i = 0; i < 5; i++) { const y = 92 + i * 22; g.fillStyle = C.ink; g.fillRect(62, y + 6, 206, 70); g.fillStyle = i % 2 ? '#bff3dc' : '#d4fbe9'; g.fillRect(56, y, 206, 70); g.fillStyle = C.mintD; g.fillRect(56, y, 206, 6); g.fillRect(56, y + 64, 206, 6); }
        g.font = '700 74px PX'; g.fillStyle = C.ink; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', s / 2 - 3, 230); }
      if (k === 'bet') { g.fillStyle = C.coral; g.fillRect(0, 0, s, s); g.fillStyle = C.ink; g.fillRect(52, 98, 236, 150); g.fillStyle = '#fff4ef'; g.fillRect(44, 90, 236, 150); g.fillStyle = C.coral; for (let y = 98; y < 236; y += 16) g.fillRect(188, y, 4, 8);
        g.fillStyle = C.ink; g.font = '700 26px PX'; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillText('S&P 500', 62, 132); g.font = '700 42px PX'; g.fillStyle = C.coral; g.fillText('↓', 62, 186); g.fillStyle = C.ink; g.font = '700 22px PX'; g.fillText('by dec 31', 62, 222); g.font = '700 30px PX'; g.fillText('YES', 204, 176); }
    });
  }
  function stackScroll() { const sec = $('#inside'), st = $('#stack'); if (!sec || !st) return; const b = sec.getBoundingClientRect(); const p = Math.max(0, Math.min(1, (innerHeight * .75 - b.top) / (b.height * .7))); const gap = 12 + p * 62; st.style.setProperty('--gap', gap.toFixed(1) + 'px'); st.style.setProperty('--lab', Math.max(0, Math.min(1, (p - .3) * 3)).toFixed(2));
    // the legend: each label sits just right of its layer's projected outline, with a little leader line
    const wrap = st.parentElement, wb = wrap.getBoundingClientRect(), lg = $('.legend', wrap); if (!lg) return;
    const map = { nft: '.l-nft', gold: '.l-gold', usd: '.l-usd', bet: '.l-bet' }; let lastY = -1e9;
    ['nft', 'gold', 'usd', 'bet'].forEach(k => { const L = $(map[k], st).getBoundingClientRect(), el = $(`[data-l="${k}"]`, lg); const w = el.offsetWidth, h = el.offsetHeight;
      let x = L.right - wb.left + 20, y = L.top + L.height * .5 - wb.top - h / 2; if (x + w > wb.width) x = wb.width - w; y = Math.max(y, lastY + h + 6); lastY = y;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`; el.style.setProperty('--lead', '14px'); });
    lg.style.setProperty('--lab', st.style.getPropertyValue('--lab')); }

  // ---------------------------------------------------------------- live status: tape, mood, board, ladder, levels
  async function loadStatus() {
    try { const s = await api('status'); S.status = s; if (s.mints != null) S.mints = s.mints; renderStatus(); } catch (e) { $('#moodText').textContent = 'live prices offline right now'; }
  }
  function renderStatus() {
    const s = S.status, P = s.prices || {}, cm = s.crash, mk = cm && cm.markets || [];
    // tape
    const items = [];
    if (P.spy) items.push(`S&amp;P 500 (SPYx) <em>${usd(P.spy.usd)}</em> <span class="${cls(P.spy.ch24)}">${pct(P.spy.ch24)}</span>`);
    if (P.gold) items.push(`gold (GLDx) <em>${usd(P.gold.usd)}</em> <span class="${cls(P.gold.ch24)}">${pct(P.gold.ch24)}</span>`);
    if (P.sol) items.push(`SOL <em>${usd(P.sol.usd)}</em> <span class="${cls(P.sol.ch24)}">${pct(P.sol.ch24)}</span>`);
    mk.forEach(m => items.push(`S&amp;P ↓${lvl(m.level)} by Dec 31 · YES <em>${usd(m.yes, 2)}</em>`));
    items.push(`mints <em>${S.mints}</em>`);
    if (items.length) { const one = items.map(x => `<span>${x}</span>`).join(''); $('#tape').innerHTML = one + one; }
    // mood
    const mood = $('#mood'); if (P.spy) { const d = P.spy.ch24 < 0; mood.className = 'mood ' + (d ? 'down' : 'up'); $('#moodText').innerHTML = `S&amp;P 500 ${pct(P.spy.ch24)} today · ${d ? 'the bears are out' : 'the bears are hiding'}`; }
    // board
    ['spy', 'gold', 'sol', 'usdc'].forEach(k => { const el = $(`.bt[data-k="${k}"]`), v = P[k]; if (!el || !v) return; $('.bt-px', el).textContent = usd(v.usd, k === 'usdc' ? 4 : 2); const c = $('.bt-ch', el); c.textContent = pct(v.ch24) + ' 24h'; c.className = 'bt-ch ' + cls(v.ch24); });
    if (P.spy && P.gold) { const d = P.gold.ch24 - P.spy.ch24, a = Math.abs(d).toFixed(2);
      $('#verdictTxt').innerHTML = d >= 0 ? `Gold ${pct(P.gold.ch24)} vs the S&amp;P&nbsp;500 ${pct(P.spy.ch24)}: gold beat stocks by ${a} points in the last 24 hours.` : `The S&amp;P&nbsp;500 ${pct(P.spy.ch24)} vs gold ${pct(P.gold.ch24)}: stocks beat gold by ${a} points in the last 24 hours. A hedge costs something on green days.`; }
    // machine levels + crash ladder
    if (mk.length) { if (!S.market || !mk.find(m => m.id === S.market)) S.market = (mk.find(m => m.level === 7000) || mk[Math.min(1, mk.length - 1)]).id; renderLevels(); renderLadder(); }
    else { $('#levels').innerHTML = '<div class="skel">no open crash levels right now</div>'; $('#ladder').innerHTML = '<div class="skel">no open crash levels right now</div>'; }
    if (cm && cm.volume) $('#crashSrc').innerHTML = `Live from Polymarket's “${esc(cm.title)}” via Jupiter (${usd(cm.volume, 0)} traded). A bet costs the YES price per $1 it pays, and resolves on Polymarket's rules.`;
    updateQuote(); layerArt();
  }
  function renderLevels() {
    const mk = S.status.crash.markets, stake = 5.4;
    $('#levels').innerHTML = mk.map(m => `<button class="lv${m.id === S.market ? ' on' : ''}" data-id="${m.id}"><b>${lvl(m.level)}</b><span>YES ${usd(m.yes, 2)} · pays ${(1 / m.yes).toFixed(1)}×</span><span>$5.40 → ${usd(stake / m.yes, 2)}</span></button>`).join('');
    $$('#levels .lv').forEach(b => b.onclick = () => { S.market = b.dataset.id; renderLevels(); updateQuote(); });
    $('#levels').classList.toggle('off', !S.betOn);
  }
  function renderLadder() {
    const mk = S.status.crash.markets, T = +$('#touch').value; $('#touchVal').textContent = lvl(T);
    $('#ladder').innerHTML = mk.map(m => { const hit = m.level >= T, pay = 5.4 / m.yes;
      return `<div class="rung${hit ? ' hit' : ''}"><span class="lvl">↓${lvl(m.level)}</span><span class="bar"><i style="width:${Math.max(3, m.yes * 100)}%"></i></span><span class="pay">${hit ? `$5.40 → <b>${usd(pay, 2)}</b>` : `YES ${usd(m.yes, 2)} → $0`}</span></div>`; }).join('');
  }

  // ---------------------------------------------------------------- 02: the machine
  let qT, qN = 0;
  function readMachine() { S.sol = Math.max(0, +$('#sol').value || 0); S.gold = +$('#mix').value; S.betOn = $('#betOn').checked && !blocked(); }
  const blocked = () => S.geo && /^(US|KR)$/.test(S.geo);
  function estimate() { // a local estimate from live prices while the real Jupiter quote loads
    const P = S.status && S.status.prices; if (!P || !P.sol) return null; const solUsd = P.sol.usd;
    const total = S.sol * 1e9, betL = S.betOn ? Math.ceil(5.4 / solUsd * 1e9 * 1.015) : 0, vault = total - betL - 12e6; if (vault < 8e6) return { err: true, need: (betL + 12e6 + 8e6) / 1e9 };
    const goldL = vault * S.gold / 100, usdL = vault - goldL; return { goldUsd: goldL / 1e9 * solUsd, usdUsd: usdL / 1e9 * solUsd, goldOut: P.gold ? goldL / 1e9 * solUsd / P.gold.usd : 0, est: true };
  }
  function updateQuote() {
    readMachine(); const P = S.status && S.status.prices;
    $('#solUsd').textContent = P && P.sol ? '≈ ' + usd(S.sol * P.sol.usd, 2) : '—';
    $('#mixVal').textContent = S.gold === 100 ? 'all gold' : S.gold === 0 ? 'all dollars' : `${S.gold}% gold · ${100 - S.gold}% dollars`;
    $('#mixGold').style.width = S.gold + '%'; $('#mixUsd').style.width = (100 - S.gold) + '%'; $('#mixUsd').style.display = S.gold === 100 ? 'none' : '';
    $('#betOnTxt').textContent = blocked() ? 'not in your country' : S.betOn ? 'on' : 'off'; $('#levels').classList.toggle('off', !S.betOn);
    const m = S.status && S.status.crash && S.status.crash.markets.find(x => x.id === S.market);
    $('#rBet').innerHTML = S.betOn && m ? `$5.40 → ${(5.4 / m.yes).toFixed(1)} YES on ↓${lvl(m.level)}` : 'none';
    const e = estimate();
    if (e && e.err) { $('#rGold').textContent = '—'; $('#rUsd').textContent = '—'; setMintBtn(`needs at least ${e.need.toFixed(3)} SOL`, true); drawPreview(); return; }
    if (e) { $('#rGold').textContent = S.gold ? `≈ ${usd(e.goldUsd, 2)}` : 'none'; $('#rUsd').textContent = S.gold < 100 ? `≈ ${usd(e.usdUsd, 2)}` : 'none'; }
    setMintBtn(); drawPreview();
    clearTimeout(qT); const n = ++qN; qT = setTimeout(async () => { try { const q = await api('quote', { sol: S.sol, gold: S.gold, bet: S.betOn ? '1' : '0' }); if (n !== qN) return; S.quote = q;
      $('#rGold').textContent = S.gold ? `${q.goldOut.toFixed(5)} GLDx (${usd(q.goldOut * (q.prices.gold ? q.prices.gold.usd : 0), 2)})` : 'none';
      $('#rUsd').textContent = S.gold < 100 ? `${q.usdOut.toFixed(2)} USDC` : 'none'; } catch (err) { /* keep the estimate */ } }, 450);
  }
  function setMintBtn(txt, dis) { const b = $('#mintBtn'); if (S.busy) return; b.disabled = !!dis; b.textContent = txt || (S.wallet ? `mint #${(S.mints || 0) + 1}` : 'connect a wallet to mint'); }
  let palI = 0; function drawPreview() { const c = $('#preview'); const g = sizeCanvas(c, 280, 280); nftArt(g, 280, (S.mints || 0) + 1, PALS[palI % PALS.length]); }
  function machineInit() {
    $$('#solChips button').forEach(b => b.onclick = () => { $$('#solChips button').forEach(x => x.classList.toggle('on', x === b)); $('#sol').value = b.dataset.v; updateQuote(); });
    $('#sol').oninput = () => { $$('#solChips button').forEach(x => x.classList.toggle('on', x.dataset.v === $('#sol').value)); updateQuote(); };
    $('#mix').oninput = updateQuote; $('#betOn').onchange = updateQuote;
    $('#touch').oninput = () => S.status && S.status.crash && S.status.crash.markets.length && renderLadder();
    $('#mintBtn').onclick = () => S.wallet ? doMint() : openWallet();
  }

  // ---------------------------------------------------------------- wallets
  function providers() { const out = []; const ph = window.phantom && window.phantom.solana || (window.solana && window.solana.isPhantom && window.solana);
    if (ph) out.push(['Phantom', ph]); if (window.solflare && window.solflare.isSolflare) out.push(['Solflare', window.solflare]); if (window.backpack && window.backpack.isBackpack) out.push(['Backpack', window.backpack]); return out; }
  function openWallet() { const list = providers(), m = $('#walletModal'), u = encodeURIComponent(location.href), ref = encodeURIComponent(location.origin);
    $('#walletList').innerHTML = list.length ? list.map(([n], i) => `<button data-i="${i}">${n}<span>→</span></button>`).join('') : `<p class="fine" style="margin:0">No Solana wallet in this browser. Open this page inside one:</p><a href="https://phantom.app/ul/browse/${u}?ref=${ref}">Phantom<span>↗</span></a><a href="https://solflare.com/ul/v1/browse/${u}?ref=${ref}">Solflare<span>↗</span></a>`;
    $$('#walletList button').forEach(b => b.onclick = () => connect(list[+b.dataset.i][1]));
    m.hidden = false; }
  async function connect(p) { try { const r = await p.connect(); const k = (r && r.publicKey) || p.publicKey; S.wallet = k.toString(); S.provider = p; $('#walletModal').hidden = true;
      $('#connect').textContent = short(S.wallet); toast('connected ' + short(S.wallet)); setMintBtn(); loadMine(); } catch (e) { toast('wallet: ' + (e.message || 'not connected')); } }
  const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0)), b64e = u => { let s = ''; u.forEach(c => s += String.fromCharCode(c)); return btoa(s); };
  const toTx = s => solanaWeb3.VersionedTransaction.deserialize(b64d(s));
  async function signAll(list) { const txs = list.map(toTx); const p = S.provider; const signed = p.signAllTransactions ? await p.signAllTransactions(txs) : await Promise.all(txs.map(t => p.signTransaction(t))); return signed.map(t => b64e(t.serialize())); }
  async function sendTx(b64) { const r = await api('send', null, { tx: b64 }); if (!r.ok) throw Object.assign(new Error(r.err || 'failed'), { sig: r.sig }); return r.sig; }

  // ---------------------------------------------------------------- the mint flow
  const LABEL = { create: 'create the NFT and its vault', gold: 'buy gold into the vault', dollars: 'buy dollars into the vault', 'bet-usdc': 'get $5.40 of USDC for the bet', order: 'place the crash bet' };
  function prog(steps) { const el = $('#progress'); el.hidden = false; el.innerHTML = steps.map(k => `<li data-k="${k}"><i></i><span>${LABEL[k] || k}</span></li>`).join(''); }
  function mark(k, st, sig) { const li = $(`#progress li[data-k="${k}"]`); if (!li) return; li.className = st; if (sig && !$('a', li)) li.insertAdjacentHTML('beforeend', `<a href="https://solscan.io/tx/${sig}" target="_blank" rel="noopener">tx ↗</a>`); }
  async function doMint() {
    if (S.busy) return; readMachine(); S.busy = true; const btn = $('#mintBtn'); btn.disabled = true; btn.textContent = 'building…';
    try {
      const b = await api('build', null, { wallet: S.wallet, sol: S.sol, gold: S.gold, bet: S.betOn ? S.market : '' });
      const keys = b.txs.map(t => t.kind); if (b.bet) keys.push('order'); prog(keys);
      btn.textContent = 'approve in your wallet…'; const signed = await signAll(b.txs.map(t => t.tx));
      for (let i = 0; i < signed.length; i++) { const k = b.txs[i].kind; mark(k, 'run'); btn.textContent = LABEL[k] + '…';
        try { const sig = await sendTx(signed[i]); mark(k, 'ok', sig); } catch (e) { mark(k, 'err', e.sig); if (k === 'create') throw e; toast(`${LABEL[k]} failed: ${e.message}. Your mint exists; add to it from “my mints”.`, 7000); } }
      if (b.bet) { mark('order', 'run'); btn.textContent = 'approve the bet…';
        try { const o = await api('order', null, { wallet: S.wallet, market: b.bet.market, usdc: b.bet.usdc }); const [sx] = await signAll([o.tx]); const sig = await sendTx(sx); mark('order', 'ok', sig); }
        catch (e) { mark('order', 'err', e.sig); toast('the crash bet did not go through: ' + e.message + '. The USDC is in your wallet.', 8000); } }
      S.mints = b.n; toast(`mint #${b.n} is yours.`, 6000); loadGallery(); loadMine(); renderStatus();
    } catch (e) { toast(e.message || 'mint failed', 7000); }
    S.busy = false; btn.disabled = false; setMintBtn();
  }

  // ---------------------------------------------------------------- gallery + my mints
  const goldUsd = () => S.status && S.status.prices && S.status.prices.gold ? S.status.prices.gold.usd : 0;
  const img = x => `/api/mint?a=img&id=${x.asset}&n=${(x.name || '').replace(/\D/g, '') || 0}`;
  async function loadGallery() {
    try { const { items } = await api('gallery'); S.gallery = items; const live = items.filter(x => x.alive);
      $('#galleryGrid').innerHTML = items.length ? items.map(x => { const v = x.gold * goldUsd() + x.usd;
        return `<a class="card${x.alive ? '' : ' dead'}" href="https://solscan.io/token/${x.asset}" target="_blank" rel="noopener"><img src="${img(x)}" alt="${esc(x.name || 'mint')}" loading="lazy"><div class="c-b"><span class="c-n">${esc(x.name || 'mint')}</span><span class="c-v">${x.alive ? 'vault ' + usd(v, 2) : 'redeemed'}</span><span class="c-s">${x.alive ? `${x.gold.toFixed(4)} GLDx · ${x.usd.toFixed(2)} USDC<br>owner ${short(x.owner)}` : 'burned, vault paid out'}</span></div></a>`; }).join('')
        : `<div class="empty"><b style="font:700 26px/1 var(--disp)">no mints yet.</b>The first one lands here, live from the chain.<a class="btn btn-ink btn-sm" href="#mint">mint #1</a></div>`;
      if (live.length > S.mints) S.mints = items.length; } catch (e) { $('#galleryGrid').innerHTML = `<div class="empty">couldn't read the chain right now (${esc(e.message)}). Try again in a minute.</div>`; }
  }
  async function loadMine() {
    const box = $('#mineBox'); if (!S.wallet) return; box.innerHTML = '<div class="empty">reading your wallet…</div>';
    try { const { items, positions } = await api('mine', { wallet: S.wallet }); const live = items.filter(x => x.alive);
      let h = live.length ? live.map(x => { const v = x.gold * goldUsd() + x.usd; return `<div class="mrow" data-a="${x.asset}"><img src="${img(x)}" alt=""><div><h4>${esc(x.name)}</h4><p>vault ${usd(v, 2)} · ${x.gold.toFixed(5)} GLDx · ${x.usd.toFixed(2)} USDC</p></div><div class="acts"><button class="btn btn-line btn-sm" data-act="gold">+ gold</button><button class="btn btn-line btn-sm" data-act="dollars">+ dollars</button><button class="btn btn-ink btn-sm" data-act="redeem">redeem</button></div></div>`; }).join('')
        : `<div class="empty">No mints in ${short(S.wallet)} yet. <a class="btn btn-ink btn-sm" href="#mint">mint one</a></div>`;
      const pos = Array.isArray(positions) ? positions : [];
      if (pos.length) h += `<h3>crash bets</h3>` + pos.map(p => `<div class="mrow" style="grid-template-columns:minmax(0,1fr) auto"><div><h4>${esc(p.title || p.market)}</h4><p>${p.contracts.toFixed(2)} YES · pays ${usd(p.contracts, 2)} if it hits${p.claimed ? ' · claimed' : ''}</p></div><div class="acts">${p.claimable && !p.claimed ? `<button class="btn btn-ink btn-sm" data-claim="${p.pubkey}">claim</button>` : `<span class="fine" style="margin:0">${p.claimed ? 'paid' : 'open until it resolves'}</span>`}</div></div>`).join('');
      box.innerHTML = h;
      $$('.mrow [data-act]', box).forEach(b => b.onclick = () => act(b.closest('.mrow').dataset.a, b.dataset.act, b));
      $$('[data-claim]', box).forEach(b => b.onclick = () => claim(b.dataset.claim, b));
    } catch (e) { box.innerHTML = `<div class="empty">couldn't read your mints (${esc(e.message)}).</div>`; }
  }
  async function act(asset, what, btn) {
    try { btn.disabled = true;
      if (what === 'redeem') { if (!confirm('Redeem burns this mint and sends its gold and dollars to your wallet. Continue?')) { btn.disabled = false; return; } const r = await api('redeem', null, { wallet: S.wallet, asset }); const [sx] = await signAll([r.tx]); await sendTx(sx); toast('redeemed. the vault is in your wallet.'); }
      else { const amt = prompt(`How much SOL of ${what} to add?`, '0.05'); if (!amt) { btn.disabled = false; return; } const r = await api('topup', null, { wallet: S.wallet, asset, sol: +amt, what }); const signed = await signAll(r.txs.map(t => t.tx)); for (const s of signed) await sendTx(s); toast(`added ${what} to the vault.`); }
      loadMine(); loadGallery(); } catch (e) { toast(e.message || 'failed', 6000); btn.disabled = false; }
  }
  async function claim(position, btn) { try { btn.disabled = true; const r = await api('claim', null, { wallet: S.wallet, position }); const [sx] = await signAll([r.tx]); await sendTx(sx); toast('claimed.'); loadMine(); } catch (e) { toast(e.message, 6000); btn.disabled = false; } }

  // ---------------------------------------------------------------- board art, reveals, nav
  function boardArt() { $$('.bt-art').forEach(c => { const s = 76, g = sizeCanvas(c, s, s);
    if (c.dataset.bear) { g.fillStyle = C.rows[0]; g.fillRect(0, 0, s, s); A.bear(g, 6, 8, 4, A.bearSpec(A.rng(5))); A.down(g, s - 20, 8, 12); }
    else if (c.dataset.leaf) { g.fillStyle = C.mint; g.fillRect(0, 0, s, s); A.leaf(g, 13, 11, 50, { shadow: C.mintS, off: 3 }); }
    else if (c.dataset.art === 'goldbar') { g.fillStyle = '#fff4cf'; g.fillRect(0, 0, s, s); A.goldBar(g, 10, 28, 4); }
    else { g.fillStyle = C.paper; g.fillRect(0, 0, s, s); g.fillStyle = C.ink; g.fillRect(17, 25, 46, 30); g.fillStyle = '#d4fbe9'; g.fillRect(13, 21, 46, 30); g.fillStyle = C.mintD; g.fillRect(13, 21, 46, 4); g.fillRect(13, 47, 46, 4); g.font = '700 22px PX'; g.fillStyle = C.ink; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', 36, 37); } }); }
  function reveals() { const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('shown'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' }); $$('.reveal').forEach(el => io.observe(el)); }
  function navSpy() { const links = $$('.nav-links a'), secs = links.map(a => $(a.getAttribute('href'))); const y = innerHeight * .35; let on = -1; secs.forEach((s, i) => { if (s && s.getBoundingClientRect().top < y) on = i; }); links.forEach((a, i) => a.classList.toggle('on', i === on)); }

  // ---------------------------------------------------------------- go
  function start() {
    drawMarks(); wallInit(); wallHoverInit(); machineInit(); layerArt(); boardArt(); drawPreview(); reveals();
    $('#connect').onclick = () => S.wallet ? toast('connected ' + short(S.wallet)) : openWallet();
    $$('[data-connect]').forEach(b => b.onclick = openWallet);
    $('#walletModal').addEventListener('click', e => { if (e.target.id === 'walletModal' || e.target.hasAttribute('data-close')) $('#walletModal').hidden = true; });
    addEventListener('scroll', () => { stackScroll(); navSpy(); }, { passive: true }); stackScroll();
    addEventListener('resize', () => { drawMarks(); });
    requestAnimationFrame(wallFrame); if (!RM) setInterval(() => { palI++; drawPreview(); }, 2600);
    loadStatus(); setInterval(loadStatus, 30000); loadGallery(); setInterval(loadGallery, 60000);
    api('geo').then(g => { S.geo = g.country; if (blocked()) { $('#betOn').checked = false; $('#betOn').disabled = true; $('#betNote').textContent = 'The crash bet runs on Jupiter, which is closed in your country. You can still mint with gold and dollars.'; updateQuote(); } }).catch(() => {});
    const p = providers(); if (p.length) p[0][1].connect && p[0][1].connect({ onlyIfTrusted: true }).then(r => { if (r && r.publicKey) { S.wallet = r.publicKey.toString(); S.provider = p[0][1]; $('#connect').textContent = short(S.wallet); setMintBtn(); loadMine(); } }).catch(() => {});
  }
  Promise.all([document.fonts.load('700 100px ID'), document.fonts.load('700 30px PX')]).catch(() => {}).then(() => { start(); intro(() => {}); });
})();
