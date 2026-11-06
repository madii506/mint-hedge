// mint, the site. Live data from /api/mint (prices, Polymarket via Jupiter, the chain), Jupiter (quotes and swaps, straight
// from the browser) and GeckoTerminal (15-day history). Every transaction is signed in the visitor's own wallet.
(function () {
  const A = window.MINTART, C = A.C;
  const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SOLM = 'So11111111111111111111111111111111111111112', USDCM = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', GOLDM = 'Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re', SPYM = 'XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W';
  const JUP = 'https://lite-api.jup.ag', GT = 'https://api.geckoterminal.com/api/v2/networks/solana';
  const S = { status: null, wallet: null, provider: null, sol: .25, gold: 60, betOn: true, market: null, geo: null, mints: 0, gallery: [], busy: false, hist: null, pools: null, sort: 'new' };

  const usd = (x, d) => x == null || !isFinite(x) ? '—' : (x < 0 ? '-' : '') + '$' + Math.abs(+x).toLocaleString('en-US', { minimumFractionDigits: d ?? (Math.abs(x) >= 1 ? 2 : 4), maximumFractionDigits: d ?? (Math.abs(x) >= 1 ? 2 : 4) });
  const big = x => x == null || !isFinite(x) ? '—' : x >= 1e9 ? '$' + (x / 1e9).toFixed(2) + 'B' : x >= 1e6 ? '$' + (x / 1e6).toFixed(2) + 'M' : x >= 1e3 ? '$' + (x / 1e3).toFixed(1) + 'K' : usd(x, 0);
  const pct = x => x == null || !isFinite(x) ? '—' : (x < 0 ? '▼' : '▲') + Math.abs(x).toFixed(2) + '%';
  const spct = x => x == null || !isFinite(x) ? '—' : (x >= 0 ? '+' : '') + x.toFixed(2) + '%';
  const cls = x => x == null ? '' : x < 0 ? 'dn' : 'up';
  const short = s => s ? s.slice(0, 4) + '…' + s.slice(-4) : '';
  const lvl = n => '$' + (+n).toLocaleString('en-US');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const cue = n => window.MINTSOUND && MINTSOUND.cue(n);
  async function api(a, params, body) {
    const q = new URLSearchParams({ a, ...(params || {}) });
    const r = await fetch('/api/mint?' + q, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
    const j = await r.json().catch(() => ({ error: 'bad response (' + r.status + ')' })); if (!r.ok || j.error) throw new Error(j.error || 'request failed'); return j;
  }
  // Jupiter and GeckoTerminal straight from the browser: each visitor gets their own rate limit
  async function jget(url, opt, tries = 4) { for (let i = 0; ; i++) { const r = await fetch(url, opt ? { ...opt, headers: { 'content-type': 'application/json' } } : undefined); if (r.status === 429 && i < tries) { await sleep(700 * Math.pow(1.8, i)); continue; }
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || j.message || 'Jupiter ' + r.status); return j; } }
  const jQuote = (out, lamports) => jget(`${JUP}/swap/v1/quote?inputMint=${SOLM}&outputMint=${out}&amount=${lamports}&slippageBps=100&maxAccounts=40`);
  async function jSwap(q, wallet, dest) { const s = await jget(`${JUP}/swap/v1/swap`, { method: 'POST', body: JSON.stringify({ quoteResponse: q, userPublicKey: wallet, ...(dest ? { destinationTokenAccount: dest } : {}), wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true, prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 400000, priorityLevel: 'high' } } }) }); if (!s.swapTransaction) throw new Error('Jupiter returned no swap'); return s.swapTransaction; }
  const jOrder = (wallet, market, usdc) => jget(`${JUP}/prediction/v1/orders`, { method: 'POST', body: JSON.stringify({ ownerPubkey: wallet, marketId: market, isYes: true, isBuy: true, depositAmount: String(usdc), depositMint: USDCM }) });
  let toastT; function toast(msg, ms = 4200) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms); }
  function sizeCanvas(c, w, h) { c.width = Math.round(w * DPR); c.height = Math.round(h * DPR); const g = c.getContext('2d'); g.setTransform(DPR, 0, 0, DPR, 0, 0); g.imageSmoothingEnabled = false; return g; }

  // ---------------------------------------------------------------- leaf marks
  function drawMarks() { $$('canvas.leafmark').forEach(c => { const wm = c.parentElement.querySelector('.wm'); const css = wm ? Math.round(parseFloat(getComputedStyle(wm).fontSize) * .74) : +c.dataset.size;
    const g = sizeCanvas(c, css * 1.06, css * 1.06); c.style.width = css * 1.06 + 'px'; c.style.height = css * 1.06 + 'px'; A.leaf(g, 0, 0, css, { body: C.ink, rib: C.mintL, shadow: css > 40 ? C.mintS : null }); }); }

  // ---------------------------------------------------------------- the intro (about 5 s), clean: one bear tile drops in and
  // gets its ▼, flips over into the leaf, the tile falls away, the leaf lands, "mint" drops in letter by letter, the line types
  // itself, and the logo flies into the page
  function intro(done) {
    const cv = $('#intro'); if (RM || location.hash || scrollY > 10 || document.hidden) { cv.remove(); document.body.classList.remove('intro-on'); return done(); }
    setTimeout(() => { if (document.body.contains(cv)) { cv.remove(); document.body.classList.remove('intro-on', 'handoff'); } }, 12000); // never leave the page behind a stuck intro
    history.scrollRestoration = 'manual'; scrollTo(0, 0);
    const W = innerWidth, H = innerHeight, g = sizeCanvas(cv, W, H); cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const ease = t => 1 - Math.pow(1 - t, 3), inOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2, clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
    const back = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
    // the lockup's final size and place (centred), and where the tile sits before it
    const L = Math.min(W * .17, H * .22), F = L / .74; g.font = `700 ${F}px ID`; const ww = g.measureText('mint').width, gapL = L * .14, lockW = L * 1.06 + gapL + ww;
    const lx = (W - lockW) / 2, ly = H * .46 - L / 2, cx0 = W / 2, cy0 = H * .46, TS = L * 1.25;
    const spec = A.bearSpec(A.rng(11)), r = A.rng(7), dust = Array.from({ length: 28 }, () => ({ a: r() * 6.283, v: .3 + r() * .7, s: 3 + Math.floor(r() * 3) * 2 }));
    const TAG = 'the NFT that hedges against the stock market';
    let t0 = performance.now(), handoff = null, finished = false, cues = {};
    const once = (k, n) => { if (!cues[k]) { cues[k] = 1; cue(n); } };
    const skip = () => { if (!handoff && performance.now() - t0 < 3900) t0 = performance.now() - 3900; };
    addEventListener('pointerdown', skip, { once: true }); addEventListener('keydown', skip, { once: true });
    function frame(now) {
      const t = now - t0; g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, W, H);
      if (t > 4300 && !handoff) { const tl = $('#heroLeaf').getBoundingClientRect(); handoff = { t: now, x: tl.left, y: tl.top, s: (tl.width / 1.06) / L }; document.body.classList.add('handoff'); document.body.classList.remove('intro-on'); }
      let bgA = 1, X = lx, Y = ly, sc = 1;
      if (handoff) { const k = clamp((now - handoff.t) / 950), e = inOut(k); bgA = 1 - clamp((k - .45) / .55); X = lx + (handoff.x - lx) * e; Y = ly + (handoff.y - ly) * e; sc = 1 + (handoff.s - 1) * e;
        if (k >= 1 && !finished) { finished = true; document.body.classList.remove('handoff'); cv.remove(); return done(); } }
      g.globalAlpha = bgA; g.fillStyle = C.mint; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
      // 1 · the bear tile drops in, gets its ▼, shivers, flips over
      if (!handoff && t < 2100) {
        const kin = clamp(t / 520), drop = (1 - back(kin)) * -H * .25, shake = t > 700 && t < 1050 ? Math.sin(t / 18) * 3 * (1 - (t - 700) / 350) : 0;
        const kf = clamp((t - 1050) / 520), flip = Math.abs(Math.cos(kf * Math.PI)), front = kf < .5, kOut = clamp((t - 1650) / 450);
        if (t > 60) { once('in', 'tick'); }
        g.save(); g.translate(cx0 + shake, cy0 + drop); g.scale(Math.max(.03, kf > 0 && kf < 1 ? flip : 1) * (1 + Math.sin(kin * Math.PI) * .04), 1);
        g.globalAlpha = 1 - kOut; g.fillStyle = 'rgba(12,21,18,.18)'; A.rr(g, -TS / 2 + TS * .06, -TS / 2 + TS * .08, TS, TS, TS * .18); g.fill(); g.globalAlpha = 1;
        if (front) A.tile(g, -TS / 2, -TS / 2, TS, C.rows[0], spec, { badge: t > 620, blink: t > 380 && t < 470 });
        else { g.globalAlpha = 1 - kOut; A.rr(g, -TS / 2 - TS * .05, -TS / 2 - TS * .05, TS * 1.1, TS * 1.1, TS * .21); g.fillStyle = '#fff'; g.fill(); A.rr(g, -TS / 2, -TS / 2, TS, TS, TS * .16); g.fillStyle = C.mintL; g.fill(); g.globalAlpha = 1; }
        g.restore(); if (t > 620) once('badge', 'pop'); if (kf > .5) once('flip', 'tick'); }
      // 2 · the leaf: born on the back of the tile, grows to full size, lands with a puff of pixels
      if (t > 1310) { const kg = clamp((t - 1310) / 700), e = handoff ? 1 : ease(kg), s0 = TS * .62, size = (s0 + (L - s0) * e) * sc;
        const moveK = handoff ? 1 : inOut(clamp((t - 2150) / 650)), startX = cx0 - size / 2, startY = cy0 - size / 2;
        const px = handoff ? X : startX + (lx - startX) * moveK, py = handoff ? Y : startY + (ly - startY) * moveK;
        const landK = clamp((t - 2020) / 900);
        if (!handoff && landK > 0 && landK < 1) { const R = ease(landK) * L * 1.6; g.strokeStyle = `rgba(12,21,18,${.28 * (1 - landK)})`; g.lineWidth = 6 * (1 - landK) + 1; g.beginPath(); g.arc(px + size / 2, py + size / 2, R, 0, 7); g.stroke();
          g.fillStyle = C.ink; for (const d of dust) { const dd = ease(landK) * L * 1.3 * d.v; g.globalAlpha = (1 - landK) * .8; g.fillRect(px + size / 2 + Math.cos(d.a) * dd, py + size / 2 + Math.sin(d.a) * dd, d.s, d.s); } g.globalAlpha = 1; once('land', 'chime'); }
        const flipping = !handoff && t < 1570; if (flipping) { const fl = Math.abs(Math.cos(clamp((t - 1050) / 520) * Math.PI)); g.save(); g.translate(px + size / 2, 0); g.scale(Math.max(.03, fl), 1); g.translate(-(px + size / 2), 0); }
        const shK = handoff ? 1 : clamp((t - 2000) / 200), off = size * .05; if (shK > 0) { g.globalAlpha = shK; A.leaf(g, px + off * shK, py + off * shK, size, { body: C.mintS, rib: C.mintS, shadow: null }); g.globalAlpha = 1; }
        A.leaf(g, px, py, size, { body: C.ink, rib: C.mintL, shadow: null }); if (flipping) g.restore();
        // a shimmer runs up the rib once
        if (!handoff && t > 2300 && t < 3000) { const k = (t - 2300) / 700, P = size / 16; g.fillStyle = '#ffffff'; for (const [x, y, kk] of A.LEAF) if (kk === 'r' && Math.abs((15 - y) / 15 - k) < .09) g.fillRect(px + x * P, py + y * P, P + .4, P + .4); }
        // 3 · the name, letter by letter, then the line
        const fs = F * sc; g.font = `700 ${fs}px ID`; g.textBaseline = 'middle'; g.textAlign = 'left'; let wx = px + (L * 1.06 + gapL) * sc; const wy = py + size * .5 - fs * .04;
        if (t > 2500 || handoff) [...'mint'].forEach((ch, i) => { const k = handoff ? 1 : clamp((t - 2550 - i * 95) / 360); const cw = g.measureText(ch).width; if (k <= 0) { wx += cw; return; }
          const e2 = back(k), dy = (1 - e2) * -fs * .45; g.globalAlpha = clamp(k * 2.5); g.fillStyle = C.mintS; g.fillText(ch, wx + fs * .045, wy + dy + fs * .045); g.fillStyle = C.ink; g.fillText(ch, wx, wy + dy); g.globalAlpha = 1; wx += cw; if (k > .2) once('l' + i, 'tick'); });
        if (!handoff) { const n = Math.floor(clamp((t - 3100) / 800) * TAG.length); if (n > 0) { g.font = `500 ${Math.max(13, F * .12)}px JB`; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillStyle = C.ink; g.globalAlpha = .85; g.fillText(TAG.slice(0, n) + (n < TAG.length && Math.floor(t / 110) % 2 ? '▌' : ''), W / 2, ly + L + L * .3); g.globalAlpha = 1; } } }
      requestAnimationFrame(frame); }
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- the hero wall: 8 x 6 bears; every mint turns one into a leaf
  const WALL = { ts: 62, gap: 14, tiles: [], order: [] };
  function wallInit() { const r = A.rng(17); WALL.tiles = []; for (let y = 0; y < 6; y++) for (let x = 0; x < 8; x++) WALL.tiles.push({ x, y, spec: A.bearSpec(r), ph: r() * 6.28, blink: r() * 4000, flip: 0 });
    WALL.order = []; for (let x = 7; x >= 0; x--) for (let y = 0; y < 6; y++) WALL.order.push(y * 8 + x);
    if (!RM) setInterval(() => { const T = WALL.tiles[Math.floor(Math.random() * 48)]; T.flip = performance.now(); }, 900); }
  let wallHover = -1;
  function wallFrame(now) {
    const c = $('#wall'); if (!c) return; const box = c.getBoundingClientRect();
    if (box.bottom > 0 && box.top < innerHeight) {
      const w = 608; if (c.width !== Math.round(box.width * DPR)) { c.width = Math.round(box.width * DPR); c.height = Math.round(box.height * DPR); }
      const g = c.getContext('2d'), k = c.width / w; g.setTransform(k, 0, 0, k, 0, 0); g.clearRect(0, 0, w, 456);
      const spy = S.status && S.status.prices && S.status.prices.spy, ch = spy ? spy.ch24 : null, leaves = Math.min(48, S.mints || 0), isLeaf = new Set(WALL.order.slice(0, leaves));
      WALL.tiles.forEach((T, i) => {
        const x = 7 + T.x * (WALL.ts + WALL.gap), y0 = 7 + T.y * (WALL.ts + WALL.gap), bob = RM ? 0 : Math.sin(now / 900 + T.ph) * 1.6 - (i === wallHover ? 5 : 0);
        const a = .18 + .82 * Math.pow(T.x / 7, 1.3), fk = T.flip ? Math.min(1, (now - T.flip) / 520) : 1, sx = Math.abs(Math.cos(fk * Math.PI));
        g.save(); g.globalAlpha = i === wallHover ? 1 : a; g.translate(x + WALL.ts / 2, 0); g.scale(fk < 1 ? Math.max(.04, sx) : 1, 1); g.translate(-x - WALL.ts / 2, 0);
        A.tile(g, x, y0 + bob, WALL.ts, isLeaf.has(i) ? C.mint : C.rows[T.y], T.spec, { leaf: isLeaf.has(i), badge: ch == null || ch < 0, blink: ((now + T.blink) % 3600) < 130 });
        if (ch != null && ch >= 0 && !isLeaf.has(i)) { const p = 9 / 5, X = x + WALL.ts - 15, Y = y0 + bob + 7; g.fillStyle = C.mintD; ['..X..', '.XXX.', 'XXXXX'].forEach((row, j) => [...row].forEach((q, m) => { if (q === 'X') g.fillRect(X + m * p, Y + j * p, p + .3, p + .3); })); }
        g.restore(); });
    }
    requestAnimationFrame(wallFrame);
  }
  function wallHoverInit() { const c = $('#wall'); c.addEventListener('pointermove', e => { const b = c.getBoundingClientRect(), k = 608 / b.width, x = (e.clientX - b.left) * k - 7, y = (e.clientY - b.top) * k - 7, s = WALL.ts + WALL.gap; const cx = Math.floor(x / s), cy = Math.floor(y / s); const h = cx >= 0 && cy >= 0 && cx < 8 && cy < 6 && x % s < WALL.ts && y % s < WALL.ts ? cy * 8 + cx : -1; if (h !== wallHover && h >= 0) cue('tick'); wallHover = h; }); c.addEventListener('pointerleave', () => wallHover = -1); }

  // ---------------------------------------------------------------- NFT art (the same 64x64 picture the API serves)
  const PX_FONT = { '#': ['01010', '11111', '01010', '11111', '01010'], 0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 2: ['111', '001', '111', '100', '111'], 3: ['111', '001', '111', '001', '111'], 4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'], 6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'], 8: ['111', '101', '111', '101', '111'], 9: ['111', '101', '111', '001', '111'] };
  const PALS = [['#3fe6a6', '#0c1512'], ['#f2b63f', '#0c1512'], ['#3d63dd', '#effff8'], ['#8a6cf0', '#effff8'], ['#f06b7e', '#0c1512'], ['#0c1512', '#3fe6a6']];
  const darken = h => '#' + [1, 3, 5].map(i => Math.round(parseInt(h.slice(i, i + 2), 16) * .72).toString(16).padStart(2, '0')).join('');
  function nftArt(g, size, n, pal = PALS[0]) {
    const [bg, fg] = pal, u = size / 64, put = (x, y, col) => { g.fillStyle = col; g.fillRect(x * u, y * u, u + .3, u + .3); };
    g.fillStyle = bg; g.fillRect(0, 0, size, size);
    const sh = bg === '#0c1512' ? '#0a4d38' : darken(bg), rib = bg === '#0c1512' ? '#effff8' : bg;
    for (const [x, y] of A.LEAF) for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) put(16 + x * 2 + a + 2, 13 + y * 2 + b + 2, sh);
    for (const [x, y, k] of A.LEAF) for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) put(16 + x * 2 + a, 13 + y * 2 + b, k === 'r' ? rib : fg);
    let cx = 5; for (const ch of '#' + String(n)) { const gl = PX_FONT[ch]; if (!gl) continue; gl.forEach((row, yy) => [...row].forEach((v, xx) => { if (v === '1') put(cx + xx, 4 + yy, fg); })); cx += gl[0].length + 1; }
    for (let x = 0; x < 9; x++) for (let y = 0; y < 3; y++) put(50 + x, 56 + y, C.gold); put(50, 56, bg); put(58, 56, bg);
  }

  // ---------------------------------------------------------------- 01: the exploded vault
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
  function stackScroll() { const sec = $('#inside'), st = $('#stack'); if (!sec || !st) return; const b = sec.getBoundingClientRect(); const p = Math.max(0, Math.min(1, (innerHeight * .75 - b.top) / (b.height * .7))); st.style.setProperty('--gap', (12 + p * 62).toFixed(1) + 'px');
    const lab = Math.max(0, Math.min(1, (p - .3) * 3)).toFixed(2); st.style.transform = `rotateX(${58 - p * 6}deg) rotateZ(${-38 + p * 8}deg)`;
    const wrap = st.parentElement, wb = wrap.getBoundingClientRect(), lg = $('.legend', wrap); if (!lg) return; lg.style.setProperty('--lab', lab);
    const map = { nft: '.l-nft', gold: '.l-gold', usd: '.l-usd', bet: '.l-bet' }; let lastY = -1e9;
    ['nft', 'gold', 'usd', 'bet'].forEach(k => { const L = $(map[k], st).getBoundingClientRect(), el = $(`[data-l="${k}"]`, lg), w = el.offsetWidth, h = el.offsetHeight;
      let x = L.right - wb.left + 20, y = L.top + L.height * .5 - wb.top - h / 2; if (x + w > wb.width) x = wb.width - w; y = Math.max(y, lastY + h + 6); lastY = y; el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`; el.style.setProperty('--lead', '14px'); }); }
  function crashScroll() { const sec = $('#crash'), p = $('#crashPath'); if (!sec || !p) return; const len = p.__len || (p.__len = p.getTotalLength()); const b = sec.getBoundingClientRect(); const k = Math.max(0, Math.min(1, (innerHeight - b.top) / (b.height + innerHeight * .2))); p.style.strokeDasharray = len; p.style.strokeDashoffset = (len * (1 - k)).toFixed(1); }

  // ---------------------------------------------------------------- live status
  async function loadStatus() { try { const s = await api('status'); S.status = s; if (s.mints != null && s.mints > S.mints) S.mints = s.mints; renderStatus(); } catch (e) { } }
  function renderStatus() {
    const s = S.status, P = s.prices || {}, cm = s.crash, mk = cm && cm.markets || [];
    const items = [];
    if (P.spy) items.push(`S&amp;P 500 (SPYx) <em>${usd(P.spy.usd)}</em> <span class="${cls(P.spy.ch24)}">${pct(P.spy.ch24)}</span>`);
    if (P.gold) items.push(`gold (GLDx) <em>${usd(P.gold.usd)}</em> <span class="${cls(P.gold.ch24)}">${pct(P.gold.ch24)}</span>`);
    if (P.sol) items.push(`SOL <em>${usd(P.sol.usd)}</em> <span class="${cls(P.sol.ch24)}">${pct(P.sol.ch24)}</span>`);
    mk.forEach(m => items.push(`S&amp;P ↓${lvl(m.level)} by Dec 31 · YES <em>${usd(m.yes, 2)}</em>`));
    items.push(`mints <em>${S.mints}</em>`);
    if (items.length) { const one = items.map(x => `<span>${x}</span>`).join(''); $('#tape').innerHTML = one + one; }
    ['spy', 'gold', 'sol', 'usdc'].forEach(k => { const el = $(`.bt[data-k="${k}"]`), v = P[k]; if (!el || !v) return; MINTFX.tween($('.bt-px', el), v.usd, x => usd(x, k === 'usdc' ? 4 : 2)); const c = $('.bt-ch', el); c.textContent = pct(v.ch24) + ' 24h'; c.className = 'bt-ch ' + cls(v.ch24);
      if (v.liquidity) $('.bt-liq', el).textContent = `${big(v.liquidity)} of liquidity on Solana`; });
    if (P.spy && P.gold) { const d = P.gold.ch24 - P.spy.ch24, a = Math.abs(d).toFixed(2);
      $('#verdictTxt').innerHTML = d >= 0 ? `Gold ${pct(P.gold.ch24)} vs the S&amp;P&nbsp;500 ${pct(P.spy.ch24)}: gold beat stocks by ${a} points in the last 24 hours.` : `The S&amp;P&nbsp;500 ${pct(P.spy.ch24)} vs gold ${pct(P.gold.ch24)}: stocks beat gold by ${a} points in the last 24 hours. A hedge costs something on green days.`; }
    if (mk.length) { if (!S.market || !mk.find(m => m.id === S.market)) S.market = (mk.find(m => m.level === 7000) || mk[Math.min(1, mk.length - 1)]).id; renderLevels(); renderLadder(); renderOdds(); }
    else ['#levels', '#ladder', '#odds'].forEach(id => $(id).innerHTML = '<div class="skel">no open crash levels right now</div>');
    if (cm) { S.closes = cm.closes; if (cm.volume) { $('#cvol').textContent = usd(cm.volume, 0); $('#bsVol').textContent = big(cm.volume); } if (cm.rules) $('#rules').textContent = cm.rules.split('\n\n').slice(0, 2).join('\n\n'); if (cm.slug) $('#plink').href = 'https://polymarket.com/event/' + cm.slug;
      if (cm.volume) $('#crashSrc').innerHTML = `Live from Polymarket's “${esc(cm.title)}” via Jupiter. A bet costs the YES price per $1 it pays, and resolves on Polymarket's rules.`; }
    MINTFX.tween($('#hsMints'), S.mints, x => Math.round(x).toLocaleString('en-US')); MINTFX.tween($('#bsMints'), S.mints, x => Math.round(x).toLocaleString('en-US'));
    countdown(); updateQuote(); layerArt();
  }
  function countdown() { if (!S.closes) return; const ms = new Date(S.closes) - Date.now(); if (ms <= 0) { ['#cdown', '#bsClose'].forEach(i => $(i) && ($(i).textContent = 'closed')); return; }
    const d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4), sec = Math.floor(ms % 6e4 / 1e3), pad = n => String(n).padStart(2, '0');
    $('#cdown').textContent = `${d}d ${pad(h)}h ${pad(m)}m ${pad(sec)}s`; $('#bsClose').textContent = `${d}d ${pad(h)}h ${pad(m)}m`; }
  function renderLevels() {
    const mk = S.status.crash.markets;
    $('#levels').innerHTML = mk.map(m => `<button class="lv${m.id === S.market ? ' on' : ''}" data-id="${m.id}"><b>${lvl(m.level)}</b><span>YES ${usd(m.yes, 2)} · pays ${(1 / m.yes).toFixed(1)}×</span><span>$5.40 → ${usd(5.4 / m.yes, 2)}</span></button>`).join('');
    $$('#levels .lv').forEach(b => b.onclick = () => { S.market = b.dataset.id; cue('tick'); renderLevels(); updateQuote(); });
    $('#levels').classList.toggle('off', !S.betOn);
  }
  function renderLadder() {
    const mk = S.status.crash.markets, T = +$('#touch').value; $('#touchVal').textContent = lvl(T);
    $('#ladder').innerHTML = mk.map((m, i) => { const hit = m.level >= T, pay = 5.4 / m.yes;
      return `<div class="rung${hit ? ' hit' : ''}" style="--d:${i}"><span class="lvl">↓${lvl(m.level)}</span><span class="bar"><i style="width:${Math.max(3, m.yes * 100)}%"></i></span><span class="pay">${hit ? `$5.40 → <b>${usd(pay, 2)}</b>` : `YES ${usd(m.yes, 2)} → $0`}</span></div>`; }).join('');
  }
  function renderOdds() { const mk = S.status.crash.markets;
    $('#odds').innerHTML = `<div class="olist">${mk.map((m, i) => `<div class="orow" style="--d:${i}"><span>↓ ${lvl(m.level)}</span><span class="obar"><i style="--w:${Math.max(2, m.yes * 100)}%"></i></span><b>${Math.round(m.yes * 100)}¢</b></div>`).join('')}</div>`; }

  // ---------------------------------------------------------------- 15 days of history (GeckoTerminal, from the browser)
  async function loadHistory() {
    try { const out = {}, pools = {};
      for (const [k, m] of [['spy', SPYM], ['gold', GOLDM]]) {
        const p = await jget(`${GT}/tokens/${m}/pools?page=1`); const list = (p.data || []).map(d => ({ id: d.attributes.address, name: d.attributes.name, liq: +d.attributes.reserve_in_usd, vol: +(d.attributes.volume_usd || {}).h24, ch: +((d.attributes.price_change_percentage || {}).h24) }));
        pools[k] = list.slice(0, 3); const pick = list.find(x => /USDC/.test(x.name)) || list[0]; if (!pick) continue;
        const o = await jget(`${GT}/pools/${pick.id}/ohlcv/hour?aggregate=4&limit=90&currency=usd&token=${m}`); out[k] = o.data.attributes.ohlcv_list.map(r => [r[0], +r[4]]).sort((a, b) => a[0] - b[0]); }
      S.pools = pools; if (out.spy && out.gold) { S.hist = out; renderHistory(); } renderPools();
    } catch (e) { $('#w15spy').textContent = 'offline'; $('#pools').innerHTML = `<div class="skel">history is offline right now</div>`; }
  }
  function series() { const h = S.hist; if (!h) return null; const n = Math.min(h.spy.length, h.gold.length), spy = h.spy.slice(-n), gold = h.gold.slice(-n);
    const s0 = spy[0][1], g0 = gold[0][1]; return { t: spy.map(p => p[0]), spy: spy.map(p => (p[1] / s0 - 1) * 100), gold: gold.map(p => (p[1] / g0 - 1) * 100), mint: gold.map(p => .6 * (p[1] / g0 - 1) * 100) }; }
  function renderHistory() { const s = series(); if (!s) return; const L = a => a[a.length - 1];
    [['#w15spy', L(s.spy)], ['#w15gold', L(s.gold)], ['#w15mint', L(s.mint)]].forEach(([id, v]) => { const el = $(id); el.textContent = spct(v); el.className = v < 0 ? 'dn' : 'up'; });
    const d = L(s.mint) - L(s.spy); $('#verdict15').innerHTML = `Over the last 15 days the S&amp;P&nbsp;500 moved ${spct(L(s.spy))}, gold ${spct(L(s.gold))}, and a 60/40 mint vault ${spct(L(s.mint))}: ${d >= 0 ? `the mint was ${d.toFixed(2)} points ahead of stocks` : `stocks were ${(-d).toFixed(2)} points ahead of the mint`}, before counting any crash bet.`;
    drawSpark($('#whySpark'), s); $$('.bt-spark').forEach(c => drawMini(c, s[c.dataset.h])); CH.data = s; CH.t0 = 0; }
  function drawSpark(c, s) { if (!c) return; const w = c.clientWidth || 300, h = c.clientHeight || 80, g = sizeCanvas(c, w, h); g.imageSmoothingEnabled = true;
    const all = [...s.spy, ...s.gold, ...s.mint], mn = Math.min(...all), mx = Math.max(...all), Y = v => h - 6 - (v - mn) / (mx - mn || 1) * (h - 12), X = i => i / (s.spy.length - 1) * w;
    g.strokeStyle = 'rgba(12,21,18,.2)'; g.setLineDash([3, 4]); g.beginPath(); g.moveTo(0, Y(0)); g.lineTo(w, Y(0)); g.stroke(); g.setLineDash([]);
    [['spy', C.coral], ['gold', C.goldD], ['mint', C.ink]].forEach(([k, col]) => { g.strokeStyle = col; g.lineWidth = k === 'mint' ? 3 : 2.2; g.beginPath(); s[k].forEach((v, i) => i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))); g.stroke(); }); }
  function drawMini(c, arr) { if (!c || !arr) return; const w = c.clientWidth || 200, h = 40, g = sizeCanvas(c, w, h); g.imageSmoothingEnabled = true; const mn = Math.min(...arr), mx = Math.max(...arr), Y = v => h - 4 - (v - mn) / (mx - mn || 1) * (h - 8);
    const up = arr[arr.length - 1] >= 0, col = up ? C.mintD : C.coral; const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, up ? 'rgba(22,168,116,.25)' : 'rgba(255,90,95,.25)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.beginPath(); arr.forEach((v, i) => { const x = i / (arr.length - 1) * w; i ? g.lineTo(x, Y(v)) : g.moveTo(x, Y(v)); }); g.lineTo(w, h); g.lineTo(0, h); g.closePath(); g.fillStyle = grd; g.fill();
    g.beginPath(); arr.forEach((v, i) => { const x = i / (arr.length - 1) * w; i ? g.lineTo(x, Y(v)) : g.moveTo(x, Y(v)); }); g.strokeStyle = col; g.lineWidth = 2; g.stroke(); }
  // the big board chart: draws itself in when it scrolls into view, crosshair on hover
  const CH = { data: null, t0: 0, hover: -1 };
  function chartFrame(now) { const c = $('#chart'); requestAnimationFrame(chartFrame); if (!c || !CH.data) return; const b = c.getBoundingClientRect(); if (b.bottom < 0 || b.top > innerHeight) return;
    if (!CH.t0) CH.t0 = now; const k = RM ? 1 : Math.min(1, (now - CH.t0) / 1600), s = CH.data, w = c.clientWidth, h = c.clientHeight; if (c.width !== Math.round(w * DPR)) { c.width = Math.round(w * DPR); c.height = Math.round(h * DPR); }
    if (k >= 1 && CH.drawnHover === CH.hover && CH.drawnW === w) return; CH.drawnHover = k >= 1 ? CH.hover : null; CH.drawnW = w;
    const g = c.getContext('2d'); g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, w, h); const padL = 46, padR = 14, padT = 14, padB = 28, iw = w - padL - padR, ih = h - padT - padB;
    const all = [...s.spy, ...s.gold, ...s.mint, 0], mn = Math.floor(Math.min(...all)) - .5, mx = Math.ceil(Math.max(...all)) + .5, Y = v => padT + ih - (v - mn) / (mx - mn) * ih, X = i => padL + i / (s.spy.length - 1) * iw;
    g.font = '500 11px JB'; g.fillStyle = 'rgba(12,21,18,.6)'; g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let v = Math.ceil(mn); v <= mx; v += Math.max(1, Math.round((mx - mn) / 5))) { g.strokeStyle = v === 0 ? 'rgba(12,21,18,.45)' : 'rgba(12,21,18,.1)'; g.lineWidth = 1; g.setLineDash(v === 0 ? [] : [3, 4]); g.beginPath(); g.moveTo(padL, Y(v)); g.lineTo(w - padR, Y(v)); g.stroke(); g.fillText((v > 0 ? '+' : '') + v + '%', padL - 8, Y(v)); }
    g.setLineDash([]); g.textAlign = 'center'; g.textBaseline = 'top'; for (let i = 0; i < s.t.length; i += Math.ceil(s.t.length / 6)) { const d = new Date(s.t[i] * 1000); g.fillText(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), X(i), h - padB + 8); }
    const n = Math.max(2, Math.floor(k * s.spy.length));
    [['spy', C.coral, 2.5], ['gold', C.goldD, 2.5], ['mint', C.ink, 4]].forEach(([key, col, lw]) => { g.strokeStyle = col; g.lineWidth = lw; g.lineJoin = 'round'; g.beginPath(); for (let i = 0; i < n; i++) i ? g.lineTo(X(i), Y(s[key][i])) : g.moveTo(X(i), Y(s[key][i])); g.stroke();
      const v = s[key][n - 1]; g.fillStyle = col; g.beginPath(); g.arc(X(n - 1), Y(v), lw + 2, 0, 7); g.fill(); });
    if (k >= 1) { const L = s.spy.length - 1; [['spy', C.coral], ['gold', C.goldD], ['mint', C.ink]].forEach(([key, col]) => { const v = s[key][L]; g.fillStyle = col; g.font = '700 12px JB'; g.textAlign = 'right'; g.textBaseline = 'bottom'; g.fillText(spct(v), X(L) - 8, Y(v) - 6); }); }
    const tip = $('#chartTip'); if (k >= 1 && CH.hover >= 0) { const i = CH.hover; g.strokeStyle = 'rgba(12,21,18,.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(X(i), padT); g.lineTo(X(i), padT + ih); g.stroke();
      tip.hidden = false; const d = new Date(s.t[i] * 1000); tip.innerHTML = `<b>${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</b><span class="spy">S&amp;P ${spct(s.spy[i])}</span><span class="gold">gold ${spct(s.gold[i])}</span><span class="mint">mint ${spct(s.mint[i])}</span>`;
      tip.style.left = Math.min(w - 170, Math.max(0, X(i) + 12)) + 'px'; } else if (tip) tip.hidden = true; }
  function chartHover() { const c = $('#chart'); c.addEventListener('pointermove', e => { if (!CH.data) return; const b = c.getBoundingClientRect(), x = e.clientX - b.left; CH.hover = Math.max(0, Math.min(CH.data.t.length - 1, Math.round((x - 46) / (b.width - 60) * (CH.data.t.length - 1)))); }); c.addEventListener('pointerleave', () => CH.hover = -1); }
  function renderPools() { const p = S.pools; if (!p) return; const row = (k, x) => `<a class="prow" href="https://www.geckoterminal.com/solana/pools/${x.id}" target="_blank" rel="noopener"><span class="pn">${esc(x.name)}</span><span>${big(x.liq)} <i>liquidity</i></span><span>${big(x.vol)} <i>24h volume</i></span></a>`;
    $('#pools').innerHTML = ['spy', 'gold'].map(k => (p[k] || []).slice(0, 2).map(x => row(k, x)).join('')).join('') || '<div class="skel">no pools found</div>'; }

  // ---------------------------------------------------------------- the stock wall: every tokenized stock on Solana, live
  const SW = { items: [], sort: 'cap', first: true };
  async function loadStocks() { try { const d = await api('stocks'); SW.items = d.items.filter(x => x.price > 0); renderStocks(); } catch (e) { if (!SW.items.length) $('#swall').innerHTML = `<div class="skel">the stock feed is busy right now (${esc(e.message)}), retrying soon</div>`; } }
  function renderStocks() { const it = [...SW.items]; if (!it.length) return;
    const byCap = [...it].sort((a, b) => (b.mcap || 0) - (a.mcap || 0)), rank = new Map(byCap.map((x, i) => [x.id, i]));
    if (SW.sort === 'cap') it.sort((a, b) => (b.mcap || 0) - (a.mcap || 0)); if (SW.sort === 'az') it.sort((a, b) => a.s.localeCompare(b.s));
    if (SW.sort === 'move') it.sort((a, b) => (b.ch24 == null ? -1 : Math.abs(b.ch24)) - (a.ch24 == null ? -1 : Math.abs(a.ch24)));
    const moved = it.filter(x => x.ch24 != null), up = moved.filter(x => x.ch24 >= 0).length;
    $('#swCount').textContent = `${it.length} stocks · ${up} up · ${moved.length - up} down`;
    const shade = c => c == null ? '' : c >= 0 ? (c > 2 ? 'u3' : c > .7 ? 'u2' : 'u1') : (c < -2 ? 'd3' : c < -.7 ? 'd2' : 'd1');
    const cap = x => x >= 1e12 ? '$' + (x / 1e12).toFixed(2) + 'T' : x >= 1e9 ? '$' + (x / 1e9).toFixed(1) + 'B' : x >= 1e6 ? '$' + (x / 1e6).toFixed(0) + 'M' : '';
    $('#swall').innerHTML = it.map((x, i) => { const r = rank.get(x.id), size = SW.sort === 'cap' ? (r < 4 ? 'sz4' : r < 14 ? 'sz2' : '') : '';
      return `<a class="st ${size} ${shade(x.ch24)}" style="--i:${Math.min(i, 60)}" href="https://jup.ag/tokens/${x.id}" target="_blank" rel="noopener" title="${esc(x.n)}"><b>${esc(x.s.replace(/x$/, ''))}</b><span class="st-n">${esc(x.n)}</span><span class="st-p">${usd(x.price, 2)}</span><span class="st-c">${x.ch24 == null ? (x.mcap ? cap(x.mcap) : '') : pct(x.ch24)}</span></a>`; }).join('');
    if (SW.first) { SW.first = false; $('#swall').classList.add('intro'); setTimeout(() => $('#swall').classList.remove('intro'), 2400); } }

  // ---------------------------------------------------------------- 02: the machine
  let qT, qN = 0;
  const blocked = () => S.geo && /^(US|KR)$/.test(S.geo);
  function readMachine() { S.sol = Math.max(0, +$('#sol').value || 0); S.gold = +$('#mix').value; S.betOn = $('#betOn').checked && !blocked(); }
  function split() { const P = S.status && S.status.prices; if (!P || !P.sol) return null; const solUsd = P.sol.usd, total = Math.floor(S.sol * 1e9), betL = S.betOn ? Math.ceil(5.4 / solUsd * 1e9 * 1.015) : 0, vault = total - betL - 12e6;
    if (vault < 8e6) return { err: true, need: (betL + 12e6 + 8e6) / 1e9 }; const goldL = Math.round(vault * S.gold / 100); return { total, betL, goldL, usdL: vault - goldL, solUsd }; }
  function updateQuote() {
    readMachine(); const P = S.status && S.status.prices, m = S.status && S.status.crash && S.status.crash.markets.find(x => x.id === S.market);
    $('#solUsd').textContent = P && P.sol ? '≈ ' + usd(S.sol * P.sol.usd, 2) : '—';
    $('#mixVal').textContent = S.gold === 100 ? 'all gold' : S.gold === 0 ? 'all dollars' : `${S.gold}% gold · ${100 - S.gold}% dollars`;
    $('#mixNote').textContent = S.gold >= 80 ? 'Mostly gold: the vault rises and falls with the price of gold.' : S.gold <= 20 ? 'Mostly dollars: the vault barely moves. The bet does the hedging.' : 'A mix: gold for the long haul, dollars for the part that holds still.';
    $('#mixGold').style.width = S.gold + '%'; $('#mixUsd').style.width = (100 - S.gold) + '%'; $('#mixUsd').style.display = S.gold === 100 ? 'none' : '';
    $('#betOnTxt').textContent = blocked() ? 'not in your country' : S.betOn ? 'on' : 'off'; $('#levels').classList.toggle('off', !S.betOn);
    $('#rBet').innerHTML = S.betOn && m ? `$5.40 → ${(5.4 / m.yes).toFixed(1)} YES on ↓${lvl(m.level)}` : 'none';
    $('#rPay').innerHTML = S.betOn && m ? `<b>${usd(5.4 / m.yes, 2)}</b> if the S&amp;P touches ${lvl(m.level)}` : 'no bet: the vault only';
    const sp = split();
    if (sp && sp.err) { $('#rGold').textContent = '—'; $('#rUsd').textContent = '—'; setMintBtn(`needs at least ${sp.need.toFixed(3)} SOL`, true); drawPreview(); VV.set(0, 0, 0); return; }
    if (sp) { const gU = sp.goldL / 1e9 * sp.solUsd, uU = sp.usdL / 1e9 * sp.solUsd; $('#rGold').textContent = S.gold ? `≈ ${usd(gU, 2)}` : 'none'; $('#rUsd').textContent = S.gold < 100 ? `≈ ${usd(uU, 2)}` : 'none'; VV.set(gU, uU, S.betOn ? 5.4 : 0); }
    setMintBtn(); drawPreview();
    clearTimeout(qT); const n = ++qN; qT = setTimeout(async () => { if (!sp || sp.err) return; try {
      let goldOut = 0, usdOut = 0; try { const [gq, uq] = [sp.goldL ? await jQuote(GOLDM, sp.goldL) : null, sp.usdL ? await jQuote(USDCM, sp.usdL) : null]; goldOut = gq ? +gq.outAmount / 1e8 : 0; usdOut = uq ? +uq.outAmount / 1e6 : 0; }
      catch (e) { const q = await api('quote', { sol: S.sol, gold: S.gold, bet: S.betOn ? '1' : '0' }); goldOut = q.goldOut; usdOut = q.usdOut; }
      if (n !== qN) return; const gp = P && P.gold ? P.gold.usd : 0;
      $('#rGold').textContent = S.gold ? `${goldOut.toFixed(5)} GLDx (${usd(goldOut * gp, 2)})` : 'none'; $('#rUsd').textContent = S.gold < 100 ? `${usdOut.toFixed(2)} USDC` : 'none'; } catch (err) { /* keep the estimate */ } }, 650);
  }
  // the vault meter: gold bars and dollar notes stack up as the mix changes, the bet ticket sits on the end
  const VV = { items: [], set(g, u, b) { const cap = 26, tot = g + u + b || 1, per = Math.max(1, tot / cap); const want = [...Array(Math.round(g / per)).fill('g'), ...Array(Math.round(u / per)).fill('u'), ...(b ? Array(Math.max(1, Math.round(b / per))).fill('b') : [])].slice(0, cap + 2);
      const now = performance.now(); this.items = want.map((k, i) => { const old = this.items[i]; return old && old.k === k ? old : { k, t: now + i * 22 }; }); if (!this.run) { this.run = true; requestAnimationFrame(t => this.draw(t)); } },
    draw(now) { const c = $('#vaultViz'); if (!c) return; const w = c.clientWidth || 300, h = 96; if (c.width !== Math.round(w * DPR)) { c.width = Math.round(w * DPR); c.height = Math.round(h * DPR); } const g = c.getContext('2d'); g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, w, h); g.imageSmoothingEnabled = false;
      const n = this.items.length, cw = Math.min(26, (w - 8) / Math.max(1, n)); let busy = false;
      this.items.forEach((it, i) => { const k = Math.max(0, Math.min(1, (now - it.t) / 380)); if (k < 1) busy = true; const e = 1 - Math.pow(1 - k, 3), x = 4 + i * cw, y = h - 8 - (it.k === 'b' ? 52 : 40) + (1 - e) * -70; g.globalAlpha = Math.min(1, k * 2);
        if (it.k === 'g') A.goldBar(g, x, y + 22, Math.max(1.4, (cw - 2) / 14)); else if (it.k === 'u') { g.fillStyle = '#d4fbe9'; g.fillRect(x, y + 14, cw - 3, 26); g.fillStyle = C.mintD; g.fillRect(x, y + 14, cw - 3, 3); g.fillRect(x, y + 37, cw - 3, 3); } else { g.fillStyle = C.coral; g.fillRect(x, y + 4, cw - 3, 48); g.fillStyle = '#fff4ef'; g.fillRect(x + 3, y + 10, cw - 9, 6); } });
      g.globalAlpha = 1; g.fillStyle = 'rgba(233,255,246,.25)'; g.fillRect(0, h - 6, w, 2); if (busy) requestAnimationFrame(t => this.draw(t)); else this.run = false; } };
  function setMintBtn(txt, dis) { const b = $('#mintBtn'); if (S.busy) return; b.disabled = !!dis; b.textContent = txt || (S.wallet ? `mint #${(S.mints || 0) + 1}` : 'connect a wallet to mint'); }
  let palI = 0; function drawPreview() { const c = $('#preview'); const g = sizeCanvas(c, 280, 280); nftArt(g, 280, (S.mints || 0) + 1, PALS[palI % PALS.length]);
    const h = $('#heroCard'); if (h) { const gh = sizeCanvas(h, 176, 176); nftArt(gh, 176, (S.mints || 0) + 1, PALS[(palI + 2) % PALS.length]); $('#hcName').textContent = `mint #${(S.mints || 0) + 1}`; } }
  function machineInit() {
    $$('#solChips button').forEach(b => b.onclick = () => { $$('#solChips button').forEach(x => x.classList.toggle('on', x === b)); $('#sol').value = b.dataset.v; cue('tick'); updateQuote(); });
    $('#sol').oninput = () => { $$('#solChips button').forEach(x => x.classList.toggle('on', x.dataset.v === $('#sol').value)); updateQuote(); };
    $('#mix').oninput = updateQuote; $('#betOn').onchange = () => { cue('tick'); updateQuote(); };
    $('#touch').oninput = () => { if (S.status && S.status.crash && S.status.crash.markets.length) { const before = $$('#ladder .hit').length; renderLadder(); if ($$('#ladder .hit').length !== before) cue('tick'); } };
    $('#mintBtn').onclick = () => S.wallet ? doMint() : openWallet();
  }

  // ---------------------------------------------------------------- wallets
  function providers() { const out = []; const ph = window.phantom && window.phantom.solana || (window.solana && window.solana.isPhantom && window.solana);
    if (ph) out.push(['Phantom', ph]); if (window.solflare && window.solflare.isSolflare) out.push(['Solflare', window.solflare]); if (window.backpack && window.backpack.isBackpack) out.push(['Backpack', window.backpack]); return out; }
  function openWallet() { const list = providers(), m = $('#walletModal'), u = encodeURIComponent(location.href), ref = encodeURIComponent(location.origin);
    $('#walletList').innerHTML = list.length ? list.map(([n], i) => `<button data-i="${i}">${n}<span>→</span></button>`).join('') : `<p class="fine" style="margin:0">No Solana wallet in this browser. Open this page inside one:</p><a href="https://phantom.app/ul/browse/${u}?ref=${ref}">Phantom<span>↗</span></a><a href="https://solflare.com/ul/v1/browse/${u}?ref=${ref}">Solflare<span>↗</span></a>`;
    $$('#walletList button').forEach(b => b.onclick = () => connect(list[+b.dataset.i][1])); m.hidden = false; }
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
      const b = await api('build', null, { wallet: S.wallet, sol: S.sol, gold: S.gold, bet: S.betOn ? S.market : '', client: true });
      const txs = [{ kind: 'create', tx: b.txs[0].tx }]; let betUsdc = 0;
      btn.textContent = 'getting live quotes…';
      if (b.legs.gold) txs.push({ kind: 'gold', tx: await jSwap(await jQuote(GOLDM, b.legs.gold), S.wallet, b.vaults.gold) });
      if (b.legs.dollars) txs.push({ kind: 'dollars', tx: await jSwap(await jQuote(USDCM, b.legs.dollars), S.wallet, b.vaults.dollars) });
      if (b.bet && b.legs.bet) { const q = await jQuote(USDCM, b.legs.bet); betUsdc = Math.floor(Math.min(+q.outAmount, 5.4e6) * .995); txs.push({ kind: 'bet-usdc', tx: await jSwap(q, S.wallet, null) }); }
      const keys = txs.map(t => t.kind); if (b.bet) keys.push('order'); prog(keys);
      btn.textContent = 'approve in your wallet…'; const signed = await signAll(txs.map(t => t.tx));
      for (let i = 0; i < signed.length; i++) { const k = txs[i].kind; mark(k, 'run'); btn.textContent = LABEL[k] + '…';
        try { const sig = await sendTx(signed[i]); mark(k, 'ok', sig); cue('pop'); } catch (e) { mark(k, 'err', e.sig); if (k === 'create') throw e; if (k === 'bet-usdc') betUsdc = 0; toast(`${LABEL[k]} failed: ${e.message}. Your mint exists; add to it from “my mints”.`, 7000); } }
      if (b.bet && betUsdc >= 5e6) { mark('order', 'run'); btn.textContent = 'approve the bet…';
        try { const o = await jOrder(S.wallet, b.bet.market, betUsdc); const [sx] = await signAll([o.transaction]); const sig = await sendTx(sx); mark('order', 'ok', sig); }
        catch (e) { mark('order', 'err', e.sig); toast('the crash bet did not go through: ' + e.message + '. The USDC is in your wallet.', 8000); } }
      else if (b.bet) mark('order', 'err');
      S.mints = Math.max(S.mints, b.n); cue('chime'); toast(`mint #${b.n} is yours.`, 6000); loadGallery(); loadMine(); renderStatus();
    } catch (e) { toast(e.message || 'mint failed', 7000); }
    S.busy = false; btn.disabled = false; setMintBtn();
  }

  // ---------------------------------------------------------------- gallery, feed, my mints
  const goldUsd = () => S.status && S.status.prices && S.status.prices.gold ? S.status.prices.gold.usd : 0;
  const img = x => `/api/mint?a=img&id=${x.asset}&n=${(x.name || '').replace(/\D/g, '') || 0}`;
  const ago = t => { if (!t) return ''; const s = Date.now() / 1000 - t; return s < 90 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' d ago'; };
  function renderGallery() { const items = [...S.gallery], v = x => x.gold * goldUsd() + x.usd;
    if (S.sort === 'big') items.sort((a, b) => v(b) - v(a)); if (S.sort === 'gold') items.sort((a, b) => b.gold - a.gold);
    $('#gcount').textContent = items.length ? `${items.length} mint${items.length > 1 ? 's' : ''}` : '';
    $('#galleryGrid').innerHTML = items.length ? items.map((x, i) => `<a class="card${x.alive ? '' : ' dead'}" style="animation-delay:${Math.min(i, 12) * 50}ms" href="https://solscan.io/token/${x.asset}" target="_blank" rel="noopener"><img src="${img(x)}" alt="${esc(x.name || 'mint')}" loading="lazy"><div class="c-b"><span class="c-n">${esc(x.name || 'mint')}</span><span class="c-v">${x.alive ? 'vault ' + usd(v(x), 2) : 'redeemed'}</span><span class="c-s">${x.alive ? `${x.gold.toFixed(4)} GLDx · ${x.usd.toFixed(2)} USDC<br>owner ${short(x.owner)} · ${ago(x.time)}` : 'burned, vault paid out'}</span></div></a>`).join('')
      : `<div class="empty"><b style="font:700 26px/1 var(--disp)">no mints yet.</b>The first one lands here, live from the chain.<a class="btn btn-ink btn-sm" href="#mint">mint #1</a></div>`; }
  async function loadGallery() {
    try { const { items } = await api('gallery'); S.gallery = items; const live = items.filter(x => x.alive); if (items.length > S.mints) S.mints = items.length;
      renderGallery(); const gsum = live.reduce((a, x) => a + x.gold, 0), usum = live.reduce((a, x) => a + x.usd, 0), tvl = gsum * goldUsd() + usum;
      MINTFX.tween($('#hsVault'), tvl, x => usd(x, 2)); MINTFX.tween($('#bsTvl'), tvl, x => usd(x, 2)); $('#bsGold').textContent = gsum.toFixed(4); $('#bsUsd').textContent = usd(usum, 2);
      MINTFX.tween($('#hsMints'), S.mints, x => Math.round(x).toLocaleString('en-US')); MINTFX.tween($('#bsMints'), S.mints, x => Math.round(x).toLocaleString('en-US'));
      $('#feed').innerHTML = items.length ? `<div class="flist">${items.slice(0, 6).map(x => `<a class="frow" href="https://solscan.io/token/${x.asset}" target="_blank" rel="noopener"><img src="${img(x)}" alt=""><span><b>${esc(x.name)}</b><i>${short(x.minter)} · ${ago(x.time)}</i></span><em>${x.alive ? usd(x.gold * goldUsd() + x.usd, 2) : 'redeemed'}</em></a>`).join('')}</div>` : '<div class="skel">No mints yet. The first one shows up here within seconds.</div>';
    } catch (e) { $('#galleryGrid').innerHTML = `<div class="empty">couldn't read the chain right now (${esc(e.message)}). Try again in a minute.</div>`; $('#feed').innerHTML = '<div class="skel">the chain is busy, retrying soon</div>'; }
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
      if (what === 'redeem') { if (!confirm('Redeem burns this mint and sends its gold and dollars to your wallet. Continue?')) { btn.disabled = false; return; } const r = await api('redeem', null, { wallet: S.wallet, asset }); const [sx] = await signAll([r.tx]); await sendTx(sx); cue('chime'); toast('redeemed. the vault is in your wallet.'); }
      else { const amt = prompt(`How much SOL of ${what} should go into the vault?`, '0.05'); if (!amt) { btn.disabled = false; return; }
        const r = await api('topup', null, { wallet: S.wallet, asset, sol: +amt, what, client: true }); const sw = await jSwap(await jQuote(r.mint, r.lamports), S.wallet, r.vault); const signed = await signAll([r.txs[0].tx, sw]); for (const s of signed) await sendTx(s); cue('pop'); toast(`added ${what} to the vault.`); }
      loadMine(); loadGallery(); } catch (e) { toast(e.message || 'failed', 6000); btn.disabled = false; }
  }
  async function claim(position, btn) { try { btn.disabled = true; const r = await api('claim', null, { wallet: S.wallet, position }); const [sx] = await signAll([r.tx]); await sendTx(sx); toast('claimed.'); loadMine(); } catch (e) { toast(e.message, 6000); btn.disabled = false; } }

  // ---------------------------------------------------------------- the outro: a wall of bears flipping into leaves
  function flipwall() { const c = $('#flipwall'); if (!c) return; const r = A.rng(99); let tiles = [], W = 0, H = 0, ts = 56;
    const size = () => { const b = c.parentElement.getBoundingClientRect(); W = b.width; H = b.height; c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); tiles = []; const s = ts * 1.3; for (let y = 10; y < H; y += s) for (let x = 10; x < W; x += s) tiles.push({ x, y, spec: A.bearSpec(r), col: C.rows[Math.floor(y / s) % 6], leaf: false, t: -1e9 }); };
    size(); addEventListener('resize', size); let vis = false; new IntersectionObserver(es => vis = es[0].isIntersecting).observe(c);
    const loop = now => { requestAnimationFrame(loop); if (!vis) return; const g = c.getContext('2d'); g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, W, H);
      if (!RM && Math.random() < .12) { const T = tiles[Math.floor(Math.random() * tiles.length)]; if (now - T.t > 1400) { T.t = now; T.next = !T.leaf; } }
      for (const T of tiles) { const k = Math.min(1, (now - T.t) / 600); if (k >= .5 && T.next !== undefined) { T.leaf = T.next; T.next = undefined; } const sx = Math.abs(Math.cos(k * Math.PI));
        g.save(); g.globalAlpha = .2; g.translate(T.x + ts / 2, 0); g.scale(k < 1 ? Math.max(.04, sx) : 1, 1); g.translate(-T.x - ts / 2, 0); A.tile(g, T.x, T.y, ts, T.leaf ? C.mint : T.col, T.spec, { leaf: T.leaf }); g.restore(); } };
    requestAnimationFrame(loop); }

  // ---------------------------------------------------------------- board art, reveals, nav
  function boardArt() { $$('.bt-art').forEach(c => { const s = 76, g = sizeCanvas(c, s, s);
    if (c.dataset.bear) { g.fillStyle = C.rows[0]; g.fillRect(0, 0, s, s); A.bear(g, 6, 8, 4, A.bearSpec(A.rng(5))); A.down(g, s - 20, 8, 12); }
    else if (c.dataset.leaf) { g.fillStyle = C.mint; g.fillRect(0, 0, s, s); A.leaf(g, 13, 11, 50, { shadow: C.mintS, off: 3 }); }
    else if (c.dataset.art === 'goldbar') { g.fillStyle = '#fff4cf'; g.fillRect(0, 0, s, s); A.goldBar(g, 10, 28, 4); }
    else { g.fillStyle = C.paper; g.fillRect(0, 0, s, s); g.fillStyle = C.ink; g.fillRect(17, 25, 46, 30); g.fillStyle = '#d4fbe9'; g.fillRect(13, 21, 46, 30); g.fillStyle = C.mintD; g.fillRect(13, 21, 46, 4); g.fillRect(13, 47, 46, 4); g.font = '700 22px PX'; g.fillStyle = C.ink; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', 36, 37); } }); }
  function reveals() { const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('shown'); if (e.target.classList.contains('ladder-wrap')) setTimeout(() => e.target.classList.add('settled'), 1600); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' }); $$('.reveal').forEach(el => io.observe(el)); }
  function navSpy() { const links = $$('.nav-links a[href^="#"]'), secs = links.map(a => $(a.getAttribute('href'))); const y = innerHeight * .35; let on = -1; secs.forEach((s, i) => { if (s && s.getBoundingClientRect().top < y) on = i; }); links.forEach((a, i) => a.classList.toggle('on', i === on)); }

  // ---------------------------------------------------------------- go
  function start() {
    MINTFX.splitHeads(); drawMarks(); wallInit(); wallHoverInit(); machineInit(); chartHover(); layerArt(); boardArt(); drawPreview(); reveals(); MINTFX.bgInit(); MINTFX.progress(); MINTFX.burst(); MINTFX.tilt(); flipwall(); setInterval(countdown, 1000);
    const snd = $('#snd'), sndUi = () => snd.classList.toggle('on', MINTSOUND.on); snd.onclick = e => { e.stopPropagation(); MINTSOUND.toggle(); }; document.addEventListener('mintsound', sndUi); sndUi();
    if (!RM && matchMedia('(hover: hover)').matches) addEventListener('pointermove', e => { if (scrollY > innerHeight) return; const x = e.clientX / innerWidth - .5, y = e.clientY / innerHeight - .5; $('.hero-wall').style.transform = `translate(${(-x * 14).toFixed(1)}px, ${(-y * 10).toFixed(1)}px) rotate(${(x * .8).toFixed(2)}deg)`; }, { passive: true });
    $('#connect').onclick = () => S.wallet ? toast('connected ' + short(S.wallet)) : openWallet();
    $$('[data-connect]').forEach(b => b.onclick = openWallet);
    $$('.sw-tools [data-ss]').forEach(b => b.onclick = () => { SW.sort = b.dataset.ss; $$('.sw-tools [data-ss]').forEach(x => x.classList.toggle('on', x === b)); cue('tick'); renderStocks(); });
    loadStocks(); setInterval(loadStocks, 60000);
    $$('.gtools [data-sort]').forEach(b => b.onclick = () => { S.sort = b.dataset.sort; $$('.gtools [data-sort]').forEach(x => x.classList.toggle('on', x === b)); renderGallery(); });
    $('#walletModal').addEventListener('click', e => { if (e.target.id === 'walletModal' || e.target.hasAttribute('data-close')) $('#walletModal').hidden = true; });
    addEventListener('scroll', () => { stackScroll(); crashScroll(); navSpy(); }, { passive: true }); stackScroll(); crashScroll();
    addEventListener('resize', () => { drawMarks(); if (S.hist) renderHistory(); });
    requestAnimationFrame(wallFrame); requestAnimationFrame(chartFrame); if (!RM) setInterval(() => { palI++; drawPreview(); }, 2600);
    setInterval(loadStatus, 30000); loadGallery(); setInterval(loadGallery, 60000);
    api('geo').then(g => { S.geo = g.country; if (blocked()) { $('#betOn').checked = false; $('#betOn').disabled = true; $('#betNote').textContent = 'The crash bet runs on Jupiter, which is closed in your country. You can still mint with gold and dollars.'; updateQuote(); } }).catch(() => {});
    const p = providers(); if (p.length) p[0][1].connect && p[0][1].connect({ onlyIfTrusted: true }).then(r => { if (r && r.publicKey) { S.wallet = r.publicKey.toString(); S.provider = p[0][1]; $('#connect').textContent = short(S.wallet); setMintBtn(); loadMine(); } }).catch(() => {});
  }
  // data first (briefly), so the intro can draw the real S&P line and the real ticker
  const fonts = Promise.all([document.fonts.load('700 100px ID'), document.fonts.load('700 30px PX'), document.fonts.load('600 14px JB')]).catch(() => {});
  const data = Promise.all([loadStatus(), loadHistory()]);
  Promise.race([Promise.all([fonts, data]), new Promise(r => setTimeout(r, 1200))]).then(() => { start(); intro(() => {}); });
})();
