// Mint on BNB Chain, the site. Live data from /api/bnb (prices, the contract, every vault), KyberSwap (routes, straight from the
// browser), GeckoTerminal (15-day history) and BNB Chain's public RPC. Every transaction is signed in the visitor's own wallet.
(function () {
  const A = window.MINTART, C = A.C, E = window.ethers;
  const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const BNBY = '#f0b90b';
  const RPCS = ['https://bsc-dataseed.bnbchain.org', 'https://bsc-dataseed1.defibit.io', 'https://bsc-rpc.publicnode.com'];
  const KY = 'https://aggregator-api.kyberswap.com/bsc/api/v1', GT = 'https://api.geckoterminal.com/api/v2/networks/bsc';
  const NATIVE = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', ROUTER = '0x6131B5fae19EA4f9D964eAc0408E4408b66337b5';
  const TOK = { gold: { address: '0x21cAef8A43163Eea865baeE23b9C2E327696A3bf', symbol: 'XAUt', decimals: 6 }, usd: { address: '0x55d398326f99059fF775485246999027B3197955', symbol: 'USDT', decimals: 18 }, short: { address: '0x17515B68378d86C38F394c666e79907dA05dcBA9', symbol: 'SQQQon', decimals: 18 } };
  const MINT_GAS = 3.4e6; // measured: a three-swap mint on BNB Chain mainnet state
  const NFT = new E.Interface(['function nextId(address) view returns (uint256)', 'function vaultOf(uint256) view returns (address)', 'function minted() view returns (uint256)', 'function mint(uint256 expectedId, (uint256 value, bytes data, address token, uint256 minOut)[] legs) payable returns (uint256)', 'event Minted(uint256 indexed id, address indexed owner, address indexed vault, uint256 number, uint256 value)']);
  const ERC20 = new E.Interface(['function balanceOf(address) view returns (uint256)', 'function transfer(address to, uint256 amount) returns (bool)']);
  const ACC = new E.Interface(['function executeBatch((address to, uint256 value, bytes data, uint8 operation)[] operations) payable returns (bytes[])', 'function owner() view returns (address)']);
  const S = { status: null, deployed: null, contract: '0xDb9e809bdDB9B6e0efF61D2E3713B5a7ccA76C4A', wallet: null, provider: null, bnb: .05, crash: 30, gold: 60, mints: 0, gallery: [], busy: false, hist: null, pools: null, sort: 'new', gas: null, quotes: {} };

  const usd = (x, d) => x == null || !isFinite(x) ? '—' : (x < 0 ? '-' : '') + '$' + Math.abs(+x).toLocaleString('en-US', { minimumFractionDigits: d ?? (Math.abs(x) >= 1 ? 2 : 4), maximumFractionDigits: d ?? (Math.abs(x) >= 1 ? 2 : 4) });
  const big = x => x == null || !isFinite(x) ? '—' : x >= 1e9 ? '$' + (x / 1e9).toFixed(2) + 'B' : x >= 1e6 ? '$' + (x / 1e6).toFixed(2) + 'M' : x >= 1e3 ? '$' + (x / 1e3).toFixed(1) + 'K' : usd(x, 0);
  const pct = x => x == null || !isFinite(x) ? '—' : (x < 0 ? '▼' : '▲') + Math.abs(x).toFixed(2) + '%';
  const spct = x => x == null || !isFinite(x) ? '—' : (x >= 0 ? '+' : '') + x.toFixed(2) + '%';
  const cls = x => x == null ? '' : x < 0 ? 'dn' : 'up';
  const short = s => s ? s.slice(0, 6) + '…' + s.slice(-4) : '';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const cue = n => window.MINTSOUND && MINTSOUND.cue(n);
  const P = () => (S.status && S.status.prices) || {};
  const px = k => (P()[k] && P()[k].usd) || (k === 'usd' ? 1 : 0);
  async function api(a, params) { const r = await fetch('/api/bnb?' + new URLSearchParams({ a, ...(params || {}) })); const j = await r.json().catch(() => ({ error: 'bad response (' + r.status + ')' })); if (!r.ok || j.error) throw new Error(j.error || 'request failed'); return j; }
  async function jget(url, opt, tries = 3) { for (let i = 0; ; i++) { const r = await fetch(url, opt); if (r.status === 429 && i < tries) { await sleep(700 * Math.pow(1.8, i)); continue; } const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.message || j.error || 'HTTP ' + r.status); return j; } }
  // BNB Chain's public RPC, straight from the browser. A revert is an answer, not a reason to try the next node.
  let rpcI = 0;
  async function rpc(method, params) { let err; for (let k = 0; k < RPCS.length; k++) { const url = RPCS[(rpcI + k) % RPCS.length];
    try { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }); const j = await r.json(); if (j.error) throw Object.assign(new Error(reason(j.error)), { rpc: true }); rpcI = (rpcI + k) % RPCS.length; return j.result; }
    catch (e) { if (e.rpc) throw e; err = e; } } throw err; }
  function reason(e) { const d = e && (e.data && (e.data.data || e.data) || ''); if (typeof d === 'string' && d.startsWith('0x08c379a0')) { try { return E.AbiCoder.defaultAbiCoder().decode(['string'], '0x' + d.slice(10))[0]; } catch (x) {} } return (e && e.message || 'failed').replace(/^execution reverted:?\s*/i, '') || 'reverted'; }
  const ethCall = (to, data, from, value) => rpc('eth_call', [{ to, data, ...(from ? { from } : {}), ...(value ? { value } : {}) }, 'latest']);
  const hex = v => '0x' + BigInt(v).toString(16);
  function friendly(e) { const m = (e && (e.shortMessage || e.message)) || String(e); if (e && (e.code === 4001 || e.code === 'ACTION_REJECTED') || /reject|denied|cancel/i.test(m)) return 'cancelled in your wallet';
    if (/stale id/.test(m)) return 'this wallet just minted; try again'; if (/too little|Return amount|minReturn|INSUFFICIENT_OUTPUT/i.test(m)) return 'the price moved while you were approving; try again'; if (/insufficient funds/i.test(m)) return 'not enough BNB in this wallet for the mint plus gas'; return m.slice(0, 180); }
  let toastT; function toast(msg, ms = 4200) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms); }
  function sizeCanvas(c, w, h) { c.width = Math.round(w * DPR); c.height = Math.round(h * DPR); const g = c.getContext('2d'); g.setTransform(DPR, 0, 0, DPR, 0, 0); g.imageSmoothingEnabled = false; return g; }

  // ---------------------------------------------------------------- leaf marks
  function drawMarks() { $$('canvas.leafmark').forEach(c => { const wm = c.parentElement.querySelector('.wm'); const css = wm ? Math.round(parseFloat(getComputedStyle(wm).fontSize) * .74) : +c.dataset.size;
    const g = sizeCanvas(c, css * 1.06, css * 1.06); c.style.width = css * 1.06 + 'px'; c.style.height = css * 1.06 + 'px'; A.leaf(g, 0, 0, css, { body: C.ink, rib: C.mintL, shadow: css > 40 ? C.mintS : null }); }); }

  // ---------------------------------------------------------------- the intro (about 6 s), the same film as the Solana site, ending on "on BNB Chain"
  function intro(done) {
    const cv = $('#intro'); if (RM || location.hash || scrollY > 10 || document.hidden) { cv.remove(); document.body.classList.remove('intro-on'); return done(); }
    setTimeout(() => { if (document.body.contains(cv)) { cv.remove(); document.body.classList.remove('intro-on', 'handoff'); } }, 12000); // never leave the page behind a stuck intro
    history.scrollRestoration = 'manual'; scrollTo(0, 0);
    const W = innerWidth, H = innerHeight, g = sizeCanvas(cv, W, H); cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v)), out = t => 1 - Math.pow(1 - t, 3), io = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2, sm = t => t * t * (3 - 2 * t);
    const back = t => { const c1 = 1.2, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
    // the wall: square tiles, centred, one tile exactly in the middle
    const ts = Math.round(Math.max(44, Math.min(W, H) / 8.2)), gap = Math.round(ts * .26), step = ts + gap;
    const cols = 2 * Math.ceil((W / 2) / step) + 1, rows = 2 * Math.ceil((H / 2) / step) + 1, cx0 = W / 2, cy0 = H / 2, r = A.rng(23), maxD = Math.hypot(W / 2, H / 2);
    const SPECS = Array.from({ length: 8 }, () => A.bearSpec(r)), sprites = {};
    function sprite(key, draw) { if (sprites[key]) return sprites[key]; const c = document.createElement('canvas'), s = Math.ceil(ts * 1.12 * DPR); c.width = c.height = s; const x = c.getContext('2d'); x.scale(DPR, DPR); draw(x, ts * .06); return sprites[key] = c; }
    const bearS = (ci, si, badge) => sprite(`b${ci}-${si}-${badge}`, (x, o) => A.tile(x, o, o, ts, C.rows[ci], SPECS[si], { badge }));
    const leafS = () => sprite('leaf', (x, o) => { A.rr(x, o - ts * .05, o - ts * .05, ts * 1.1, ts * 1.1, ts * .21); x.fillStyle = '#fff'; x.fill(); A.rr(x, o, o, ts, ts, ts * .16); x.fillStyle = C.mintL; x.fill(); A.leaf(x, o + ts * .17, o + ts * .17, ts * .66, { body: C.ink, rib: C.mintL, shadow: 'rgba(12,21,18,.18)', off: ts * .03 }); });
    const tiles = []; for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const x = cx0 + (i - (cols - 1) / 2) * step, y = cy0 + (j - (rows - 1) / 2) * step, d = Math.hypot(x - cx0, y - cy0) / maxD;
      tiles.push({ x, y, d, ci: (j + Math.floor(rows / 2) * 6) % 6, si: Math.floor(r() * 8), centre: i === (cols - 1) / 2 && j === (rows - 1) / 2, wave: (x + ts / 2) / W, jit: r() * 120 }); }
    // the logo
    const NAME = 'Mint', TAG = 'the NFT that hedges against the stock market';
    const L = Math.min(W * .16, H * .21), F = L / .74; g.font = `700 ${F}px ID`; const ww = g.measureText(NAME).width, gapL = L * .14, lockW = L * 1.06 + gapL + ww, lx = (W - lockW) / 2, ly = cy0 - L / 2;
    let t0 = performance.now(), handoff = null, finished = false, lastTick = 0; const said = {}; const once = (k, n) => { if (!said[k]) { said[k] = 1; cue(n); } };
    const tickSoft = now => { if (now - lastTick > 70) { lastTick = now; cue('tick'); } };
    const skip = () => { if (!handoff && performance.now() - t0 < 4500) t0 = performance.now() - 4500; };
    addEventListener('pointerdown', skip, { once: true }); addEventListener('keydown', skip, { once: true });
    const T_IN = 0, T_DOWN = 1000, T_FLIP = 1900, T_MELT = 3150, T_GROW = 3350, T_NAME = 4000, T_TAG = 4350, T_GO = 6000;
    function frame(now) {
      const t = now - t0; g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, W, H);
      if (t > T_GO && !handoff) { const tl = $('#heroLeaf').getBoundingClientRect(); handoff = { t: now, x: tl.left, y: tl.top, s: (tl.width / 1.06) / L }; document.body.classList.add('handoff'); document.body.classList.remove('intro-on'); }
      let bgA = 1, X = lx, Y = ly, sc = 1;
      if (handoff) { const k = clamp((now - handoff.t) / 1100), e = io(k); bgA = 1 - sm(clamp((k - .35) / .65)); X = lx + (handoff.x - lx) * e; Y = ly + (handoff.y - ly) * e; sc = 1 + (handoff.s - 1) * e;
        if (k >= 1 && !finished) { finished = true; document.body.classList.remove('handoff'); cv.remove(); return done(); } }
      g.globalAlpha = bgA; g.fillStyle = C.mint; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
      // the wall
      const zoom = 1.07 - .07 * io(clamp(t / 3000)); if (!handoff) { g.save(); g.translate(cx0, cy0); g.scale(zoom, zoom); g.translate(-cx0, -cy0); }
      if (!handoff && t < T_GROW + 700) for (const T of tiles) {
        const kin = clamp((t - T_IN - T.d * 700) / 480); if (kin <= 0) continue;
        const kd = clamp((t - T_DOWN - T.wave * 600 - T.jit * .5) / 360), badge = kd > .25, dip = Math.sin(clamp(kd) * Math.PI) * ts * .07 + (kd >= 1 ? 0 : 0);
        const kf = clamp((t - T_FLIP - T.d * 800 - T.jit) / 420), flipX = Math.abs(Math.cos(io(kf) * Math.PI)), isLeaf = kf >= .5;
        if (kf > .5 && !T.f) { T.f = 1; tickSoft(now); }
        const km = T.centre ? 0 : clamp((t - T_MELT - (1 - T.d) * 450) / 420), melt = sm(km); if (km >= 1) continue;
        const s = back(kin) * (1 - melt * .7), a = Math.min(1, kin * 2) * (1 - melt) * (T.centre && t > T_GROW ? 1 - sm(clamp((t - T_GROW) / 300)) : 1);
        const mx = T.x + (cx0 - T.x) * melt * .35, my = T.y + (cy0 - T.y) * melt * .35 + dip;
        g.save(); g.globalAlpha = a; g.translate(mx, my); g.scale(s * Math.max(.02, kf > 0 && kf < 1 ? flipX : 1), s); const spr = isLeaf ? leafS() : bearS(T.ci, T.si, badge);
        g.drawImage(spr, -ts * .56, -ts * .56, ts * 1.12, ts * 1.12);
        if (kd > 0 && kd < 1 && !isLeaf) { g.globalAlpha = a * .5 * Math.sin(kd * Math.PI); A.rr(g, -ts / 2, -ts / 2, ts, ts, ts * .16); g.fillStyle = C.coral; g.fill(); }
        g.restore(); }
      if (!handoff) g.restore();
      if (t > T_DOWN && t < T_DOWN + 900) once('down', 'thud');
      // the logo grows out of the centre tile
      if (t > T_GROW || handoff) { const kg = handoff ? 1 : io(clamp((t - T_GROW) / 700)), s0 = ts * .66, size = (s0 + (L - s0) * kg) * sc;
        const mk = handoff ? 1 : io(clamp((t - T_GROW - 350) / 750)), sx0 = cx0 - size / 2, sy0 = cy0 - size / 2, px = handoff ? X : sx0 + (lx - sx0) * mk, py = handoff ? Y : sy0 + (ly - sy0) * mk;
        const shK = handoff ? 1 : sm(clamp((t - T_GROW - 300) / 500)), off = size * .05;
        if (shK > 0) { g.globalAlpha = shK; A.leaf(g, px + off * shK, py + off * shK, size, { body: C.mintS, rib: C.mintS, shadow: null }); g.globalAlpha = 1; }
        A.leaf(g, px, py, size, { body: C.ink, rib: C.mintL, shadow: null }); if (kg > .95) once('chime', 'chime');
        if (!handoff && t > T_GROW + 500 && t < T_GROW + 1300) { const k = (t - T_GROW - 500) / 800, P = size / 16; g.fillStyle = '#ffffff'; for (const [x, y, kk] of A.LEAF) if (kk === 'r' && Math.abs((15 - y) / 15 - k) < .09) g.fillRect(px + x * P, py + y * P, P + .4, P + .4); }
        const fs = F * sc; g.font = `700 ${fs}px ID`; g.textBaseline = 'middle'; g.textAlign = 'left'; let wx = px + (L * 1.06 + gapL) * sc; const wy = py + size * .5 - fs * .04;
        [...NAME].forEach((ch, i) => { const k = handoff ? 1 : out(clamp((t - T_NAME - i * 85) / 520)), cw = g.measureText(ch).width; if (k > 0) { const dy = (1 - k) * fs * .3;
          g.globalAlpha = k; g.fillStyle = C.mintS; g.fillText(ch, wx + fs * .045, wy + dy + fs * .045); g.fillStyle = C.ink; g.fillText(ch, wx, wy + dy); g.globalAlpha = 1; } wx += cw; });
        const kt = handoff ? 1 - clamp((now - handoff.t) / 350) : sm(clamp((t - T_TAG) / 600)); if (kt > 0) { g.globalAlpha = kt * .85; const tf = Math.max(13, Math.min(F * .12, (W - 32) / (TAG.length * .62))); g.font = `500 ${tf}px JB`; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillStyle = C.ink; const ty = ly + L + L * .3 + (handoff ? 0 : (1 - kt) * 8); g.fillText(TAG, W / 2, ty);
          const pf = Math.max(13, tf * 1.05), pw = g.measureText('on BNB Chain').width * (pf / tf) + pf * 1.6, ph = pf * 1.9, pxl = W / 2 - pw / 2, pyl = ty + tf * 1.9, pcy = pyl + ph / 2;
          const kp = handoff ? 1 : clamp((t - T_TAG - 250) / 450), psc = handoff ? 1 : back(kp); if (kp > 0) { once('bnb', 'pop'); g.save(); g.globalAlpha = handoff ? kt : Math.min(1, kp * 3); g.translate(W / 2, pcy); g.scale(psc, psc); g.translate(-W / 2, -pcy);
            A.rr(g, pxl + 3, pyl + 3, pw, ph, ph / 2); g.fillStyle = C.ink; g.fill(); A.rr(g, pxl, pyl, pw, ph, ph / 2); g.fillStyle = BNBY; g.fill(); g.lineWidth = 2; g.strokeStyle = C.ink; g.stroke();
            g.font = `700 ${pf}px JB`; g.fillStyle = C.ink; g.textBaseline = 'middle'; g.fillText('on BNB Chain', W / 2, pcy + 1); g.restore(); } g.globalAlpha = 1; } }
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
      const sq = S.status && S.status.prices && S.status.prices.short, ch = sq && sq.ch24 != null ? -sq.ch24 : null, leaves = Math.min(48, S.mints || 0), isLeaf = new Set(WALL.order.slice(0, leaves));
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

  // ---------------------------------------------------------------- NFT art (the same 64x64 picture the API serves: leaf, number, a small yellow diamond)
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
    for (let x = 0; x < 7; x++) for (let y = 0; y < 7; y++) if (Math.abs(x - 3) + Math.abs(y - 3) <= 3) put(52 + x, 52 + y, BNBY);
  }

  // ---------------------------------------------------------------- 01: the exploded vault
  function layerArt() {
    $$('.layer canvas').forEach(c => { const s = 330, g = sizeCanvas(c, s, s), k = c.dataset.art;
      if (k === 'nft') nftArt(g, s, (S.mints || 0) + 1);
      if (k === 'gold') { g.fillStyle = C.gold; g.fillRect(0, 0, s, s); A.grain(g, s, s, .12, 3); const p = 9; A.goldBar(g, s / 2 - 7 * p - 7 * p - 6, s / 2 + 10, p); A.goldBar(g, s / 2 + 6, s / 2 + 10, p); A.goldBar(g, s / 2 - 7 * p, s / 2 + 10 - 5 * p - 4, p); }
      if (k === 'usd') { g.fillStyle = C.paper; g.fillRect(0, 0, s, s); for (let i = 0; i < 5; i++) { const y = 92 + i * 22; g.fillStyle = C.ink; g.fillRect(62, y + 6, 206, 70); g.fillStyle = i % 2 ? '#bff3dc' : '#d4fbe9'; g.fillRect(56, y, 206, 70); g.fillStyle = C.mintD; g.fillRect(56, y, 206, 6); g.fillRect(56, y + 64, 206, 6); }
        g.font = '700 74px PX'; g.fillStyle = C.ink; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', s / 2 - 3, 230); }
      if (k === 'bet') { g.fillStyle = C.coral; g.fillRect(0, 0, s, s); g.fillStyle = C.ink; g.fillRect(52, 98, 236, 150); g.fillStyle = '#fff4ef'; g.fillRect(44, 90, 236, 150);
        g.strokeStyle = C.coral; g.lineWidth = 5; g.beginPath(); [[60, 150], [92, 168], [120, 158], [150, 196], [178, 186], [206, 226]].forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
        g.strokeStyle = C.mintD; g.beginPath(); [[60, 214], [92, 190], [120, 200], [150, 142], [178, 156], [206, 108]].forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
        g.fillStyle = C.ink; g.font = '700 22px PX'; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillText('NDX', 220, 130); g.font = '700 40px PX'; g.fillStyle = C.mintD; g.fillText('3×', 220, 186); g.fillStyle = C.ink; g.font = '700 20px PX'; g.fillText('short', 220, 220); }
    });
  }
  function stackScroll() { const sec = $('#inside'), st = $('#stack'); if (!sec || !st) return; const b = sec.getBoundingClientRect(); const p = Math.max(0, Math.min(1, (innerHeight * .75 - b.top) / (b.height * .7))); st.style.setProperty('--gap', (12 + p * 62).toFixed(1) + 'px');
    const lab = Math.max(0, Math.min(1, (p - .3) * 3)).toFixed(2); st.style.transform = `rotateX(${58 - p * 6}deg) rotateZ(${-38 + p * 8}deg)`;
    const wrap = st.parentElement, wb = wrap.getBoundingClientRect(), lg = $('.legend', wrap); if (!lg) return; lg.style.setProperty('--lab', lab);
    const map = { nft: '.l-nft', gold: '.l-gold', usd: '.l-usd', bet: '.l-bet' }; let lastY = -1e9;
    ['nft', 'gold', 'usd', 'bet'].forEach(k => { const L = $(map[k], st).getBoundingClientRect(), el = $(`[data-l="${k}"]`, lg), w = el.offsetWidth, h = el.offsetHeight;
      let x = L.right - wb.left + 20, y = L.top + L.height * .5 - wb.top - h / 2; if (x + w > wb.width) x = wb.width - w; y = Math.max(y, lastY + h + 6); lastY = y; el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`; el.style.setProperty('--lead', '14px'); }); }

  // ---------------------------------------------------------------- live status
  async function loadStatus() { try { const s = await api('status'); S.status = s; S.deployed = !!s.deployed; if (s.contract) S.contract = s.contract; if (s.minted != null && s.minted > S.mints) S.mints = s.minted; renderStatus(); } catch (e) { if (!S.status) $('#tape').innerHTML = '<span>prices are offline right now, retrying</span>'; } }
  async function loadGas() { try { S.gas = Number(BigInt(await rpc('eth_gasPrice', []))) / 1e9; renderGas(); } catch (e) { } }
  const feeUsd = () => S.gas && px('bnb') ? MINT_GAS * S.gas * 1e-9 * px('bnb') : null;
  function renderGas() { const f = feeUsd(); if (f == null) return; $('#fx-fee').textContent = `≈ ${usd(f, 2)} a mint`; $('#bsGas').textContent = `${S.gas.toFixed(S.gas < 1 ? 3 : 1)} gwei`; }
  function renderStatus() {
    const s = S.status, Pr = s.prices || {};
    const items = [];
    if (Pr.gold) items.push(`gold (XAUt) <em>${usd(Pr.gold.usd)}</em> <span class="${cls(Pr.gold.ch24)}">${pct(Pr.gold.ch24)}</span>`);
    if (Pr.short) items.push(`crash token (SQQQon) <em>${usd(Pr.short.usd)}</em> <span class="${cls(Pr.short.ch24)}">${pct(Pr.short.ch24)}</span>`);
    if (Pr.bnb) items.push(`BNB <em>${usd(Pr.bnb.usd)}</em> <span class="${cls(Pr.bnb.ch24)}">${pct(Pr.bnb.ch24)}</span>`);
    if (Pr.usd) items.push(`USDT <em>${usd(Pr.usd.usd, 4)}</em>`);
    items.push(`Mints <em>${S.mints}</em>`); if (feeUsd() != null) items.push(`network fee <em>≈ ${usd(feeUsd(), 2)}</em> a mint`);
    const one = items.map(x => `<span>${x}</span>`).join(''); $('#tape').innerHTML = one + one;
    ['gold', 'short', 'bnb', 'usd'].forEach(k => { const el = $(`.bt[data-k="${k}"]`), v = Pr[k]; if (!el || !v) return; MINTFX.tween($('.bt-px', el), v.usd, x => usd(x, k === 'usd' ? 4 : 2)); const c = $('.bt-ch', el); c.textContent = pct(v.ch24) + ' 24h'; c.className = 'bt-ch ' + cls(v.ch24);
      $('.bt-liq', el).textContent = k === 'usd' ? 'the dollar part of every vault' : v.liquidity ? `${big(v.liquidity)} of liquidity · ${big(v.vol24)} traded 24h` : ''; });
    const setF = (id, v, c) => { const el = $(id); if (!el) return; el.textContent = v; if (c !== undefined) el.className = c; };
    if (Pr.gold) { setF('#fx-gold', pct(Pr.gold.ch24), cls(Pr.gold.ch24)); setF('#fx-gliq', big(Pr.gold.liquidity)); }
    if (Pr.short) { setF('#fx-short', pct(Pr.short.ch24), cls(Pr.short.ch24)); setF('#fx-sq', `${usd(Pr.short.usd, 2)} ${pct(Pr.short.ch24)}`); setF('#fx-sqliq', big(Pr.short.liquidity)); }
    if (Pr.bnb) { setF('#fx-bnb', pct(Pr.bnb.ch24), cls(Pr.bnb.ch24)); setF('#fx-bnbp', usd(Pr.bnb.usd, 2)); }
    if (Pr.gold && Pr.short && Pr.gold.ch24 != null && Pr.short.ch24 != null) { const v = .4 * Pr.gold.ch24 + .3 * Pr.short.ch24;
      $('#verdictTxt').innerHTML = `Gold ${pct(Pr.gold.ch24)}, the crash token ${pct(Pr.short.ch24)}: a 40/30/30 Mint vault ${pct(v)} in the last 24 hours. ${Pr.short.ch24 > 0 ? 'The crash token rising means the Nasdaq-100 fell.' : 'The crash token falling means the Nasdaq-100 rose: a hedge costs something on green days.'}`; }
    const lc = $('#lnkContract'); if (lc) lc.href = `https://bscscan.com/address/${S.contract}`; $('#caddr').textContent = S.contract;
    $('#deploybar').hidden = S.deployed !== false;
    MINTFX.tween($('#bsMints'), S.mints, x => Math.round(x).toLocaleString('en-US')); ['#fx-mints', '#fx-mints2'].forEach(i => MINTFX.tween($(i), S.mints, x => Math.round(x).toLocaleString('en-US')));
    renderGas(); updateQuote(); renderLadder(); layerArt();
  }

  // ---------------------------------------------------------------- 15 days of history (GeckoTerminal, from the browser)
  async function loadHistory() {
    try { const out = {}, pools = {};
      for (const [k, m] of [['spy', TOK.short.address], ['gold', TOK.gold.address]]) {
        const p = await jget(`${GT}/tokens/${m}/pools?page=1`); const list = (p.data || []).map(d => ({ id: d.attributes.address, name: d.attributes.name, liq: +d.attributes.reserve_in_usd, vol: +(d.attributes.volume_usd || {}).h24, dex: (d.relationships && d.relationships.dex && d.relationships.dex.data.id) || '' })).sort((a, b) => b.liq - a.liq);
        pools[k] = list.filter(x => x.liq >= 5000).slice(0, 3); const pick = list.find(x => /USDT/.test(x.name)) || list[0]; if (!pick) continue;
        const o = await jget(`${GT}/pools/${pick.id}/ohlcv/hour?aggregate=4&limit=120&currency=usd&token=${m}`); out[k] = o.data.attributes.ohlcv_list.map(r => [r[0], +r[4]]).sort((a, b) => a[0] - b[0]); }
      S.pools = pools; if (out.spy && out.gold && out.spy.length > 1 && out.gold.length > 1) { S.hist = out; renderHistory(); } else $('#w15spy').textContent = 'offline'; renderPools();
    } catch (e) { $('#w15spy').textContent = 'offline'; $('#pools').innerHTML = `<div class="skel">history is offline right now</div>`; }
  }
  // the crash token's pool trades less often than gold's: put both on one clock and carry the last close forward
  function series() { const h = S.hist; if (!h) return null; const from = Math.max(h.spy[0][0], h.gold[0][0], Date.now() / 1000 - 15 * 86400);
    const ts = [...new Set([...h.spy, ...h.gold].map(p => p[0]).filter(t => t >= from))].sort((a, b) => a - b); if (ts.length < 2) return null;
    const ff = arr => { let j = 0, v = arr[0][1]; return ts.map(t => { while (j < arr.length && arr[j][0] <= t) { v = arr[j][1]; j++; } return v; }); };
    const spy = ff(h.spy), gold = ff(h.gold), s0 = spy[0], g0 = gold[0], sp = spy.map(v => (v / s0 - 1) * 100), gp = gold.map(v => (v / g0 - 1) * 100);
    return { t: ts, spy: sp, gold: gp, mint: sp.map((v, i) => .4 * gp[i] + .3 * v) }; }
  function renderHistory() { const s = series(); if (!s) return; const L = a => a[a.length - 1];
    [['#w15spy', L(s.spy)], ['#w15gold', L(s.gold)], ['#w15mint', L(s.mint)]].forEach(([id, v]) => { const el = $(id); el.textContent = spct(v); el.className = v < 0 ? 'dn' : 'up'; });
    $('#verdict15').innerHTML = `Over the last 15 days the crash token moved ${spct(L(s.spy))} and gold ${spct(L(s.gold))}, so a 40/30/30 Mint vault moved ${spct(L(s.mint))}. ${L(s.spy) < 0 ? 'The Nasdaq-100 mostly rose, so the crash part cost something: that is what insurance looks like on good weeks.' : 'The Nasdaq-100 mostly fell, and the crash part did its job.'}`;
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
      tip.hidden = false; const d = new Date(s.t[i] * 1000); tip.innerHTML = `<b>${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</b><span class="spy">crash token ${spct(s.spy[i])}</span><span class="gold">gold ${spct(s.gold[i])}</span><span class="mint">Mint vault ${spct(s.mint[i])}</span>`;
      tip.style.left = Math.min(w - 170, Math.max(0, X(i) + 12)) + 'px'; } else if (tip) tip.hidden = true; }
  function chartHover() { const c = $('#chart'); c.addEventListener('pointermove', e => { if (!CH.data) return; const b = c.getBoundingClientRect(), x = e.clientX - b.left; CH.hover = Math.max(0, Math.min(CH.data.t.length - 1, Math.round((x - 46) / (b.width - 60) * (CH.data.t.length - 1)))); }); c.addEventListener('pointerleave', () => CH.hover = -1); }
  function renderPools() { const p = S.pools; if (!p) return; const row = x => `<a class="prow" href="https://www.geckoterminal.com/bsc/pools/${x.id}" target="_blank" rel="noopener"><span class="pn">${esc(x.name)}</span><span>${big(x.liq)} <i>liquidity</i></span><span>${big(x.vol)} <i>24h volume</i></span></a>`;
    $('#pools').innerHTML = ['spy', 'gold'].map(k => (p[k] || []).slice(0, 2).map(row).join('')).join('') || '<div class="skel">no pools found</div>'; }

  // ---------------------------------------------------------------- 02: the machine
  let qT, qN = 0;
  function readMachine() { S.bnb = Math.max(0, +$('#sol').value || 0); S.crash = +$('#crashMix').value; S.gold = +$('#mix').value; }
  // three legs in wei: the crash part first, then the rest split between gold and dollars
  function legsWei() { let total; try { total = E.parseEther(String(S.bnb.toFixed(6))); } catch (e) { return null; } const crash = total * BigInt(S.crash) / 100n, rest = total - crash, gold = rest * BigInt(S.gold) / 100n;
    return { total, short: crash, gold, usd: rest - gold }; }
  const MIN_BNB = .005;
  function updateQuote() {
    readMachine(); const b = px('bnb'), w = legsWei();
    $('#solUsd').textContent = b ? '≈ ' + usd(S.bnb * b, 2) : '—';
    $('#crashVal').textContent = S.crash ? `${S.crash}% of the vault` : 'off';
    $('#crashNote').textContent = S.crash === 0 ? 'No crash part: gold and dollars only. The vault barely notices the Nasdaq.' : S.crash >= 45 ? 'A big crash part: strong on a bad day, and it loses value in calm, choppy weeks.' : 'This part rises when the Nasdaq-100 falls, about three times the daily drop.';
    const g = (100 - S.crash) * S.gold / 100, u = 100 - S.crash - g;
    $('#mixVal').textContent = S.gold === 100 ? 'all gold' : S.gold === 0 ? 'all dollars' : `${S.gold}% gold · ${100 - S.gold}% dollars`;
    $('#mixShort').style.width = S.crash + '%'; $('#mixGold').style.width = g + '%'; $('#mixUsd').style.width = u + '%'; $('#mixUsd').style.display = u ? '' : 'none'; $('#mixShort').style.display = S.crash ? '' : 'none';
    $('#mixPct').textContent = `${Math.round(S.crash)} · ${Math.round(g)} · ${Math.round(u)}`;
    const usdOf = wei => b ? Number(E.formatEther(wei)) * b : 0;
    if (!w || S.bnb < MIN_BNB) { ['#rGold', '#rUsd', '#rBet', '#rPay'].forEach(i => $(i).textContent = '—'); setMintBtn(`at least ${MIN_BNB} BNB`, true); VV.set(0, 0, 0); drawPreview(); renderLadder(); return; }
    const gU = usdOf(w.gold), uU = usdOf(w.usd), sU = usdOf(w.short);
    $('#rGold').textContent = w.gold ? `≈ ${usd(gU, 2)}` : 'none'; $('#rUsd').textContent = w.usd ? `≈ ${usd(uU, 2)}` : 'none'; $('#rBet').textContent = w.short ? `≈ ${usd(sU, 2)}` : 'none';
    $('#rPay').innerHTML = w.short && b ? `<b>+${usd(sU * .15, 2)}</b> on the crash part (vault ${spct(sU * .15 / (gU + uU + sU) * 100)})` : 'no crash part: about flat';
    VV.set(gU, uU, sU); setMintBtn(); drawPreview(); renderLadder();
    clearTimeout(qT); const n = ++qN; qT = setTimeout(async () => { try {
      const q = {}; for (const k of ['gold', 'usd', 'short']) if (w[k] > 0n) q[k] = await route(k, w[k]); if (n !== qN) return; S.quotes = q;
      const line = (k, d) => { const r = q[k]; if (!r) return 'none'; const out = Number(r.amountOut) / 10 ** TOK[k].decimals, imp = r.amountInUsd > 0 ? (1 - r.amountOutUsd / r.amountInUsd) * 100 : 0;
        return `${out.toFixed(d)} ${TOK[k].symbol} (${usd(+r.amountOutUsd, 2)})${imp > .6 ? ` · ${imp.toFixed(1)}% to the pool` : ''}`; };
      $('#rGold').textContent = line('gold', 5); $('#rUsd').textContent = line('usd', 2); $('#rBet').textContent = line('short', 4);
    } catch (err) { /* keep the estimate */ } }, 600);
  }
  async function route(k, wei) { const r = await jget(`${KY}/routes?tokenIn=${NATIVE}&tokenOut=${TOK[k].address}&amountIn=${wei}&gasInclude=true`, { headers: { 'x-client-id': 'mint' } }); if (!r.data || !r.data.routeSummary) throw new Error('no KyberSwap route for ' + TOK[k].symbol); return r.data.routeSummary; }
  async function build(summary, sender, recipient) { const r = await jget(`${KY}/route/build`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-client-id': 'mint' }, body: JSON.stringify({ routeSummary: summary, sender, recipient, slippageTolerance: 100 }) });
    if (!r.data || !r.data.data) throw new Error('KyberSwap could not build the swap'); if (r.data.routerAddress.toLowerCase() !== ROUTER.toLowerCase()) throw new Error('unexpected router from KyberSwap'); return r.data; }
  // the vault meter: gold bars and dollar notes stack up as the mix changes, the crash part sits on the end
  const VV = { items: [], set(g, u, b) { const cap = 26, tot = g + u + b || 1, per = Math.max(1, tot / cap); const want = [...Array(Math.round(g / per)).fill('g'), ...Array(Math.round(u / per)).fill('u'), ...(b ? Array(Math.max(1, Math.round(b / per))).fill('b') : [])].slice(0, cap + 2);
      const now = performance.now(); this.items = want.map((k, i) => { const old = this.items[i]; return old && old.k === k ? old : { k, t: now + i * 22 }; }); if (!this.run) { this.run = true; requestAnimationFrame(t => this.draw(t)); } },
    draw(now) { const c = $('#vaultViz'); if (!c) return; const w = c.clientWidth || 300, h = 96; if (c.width !== Math.round(w * DPR)) { c.width = Math.round(w * DPR); c.height = Math.round(h * DPR); } const g = c.getContext('2d'); g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, w, h); g.imageSmoothingEnabled = false;
      const n = this.items.length, cw = Math.min(26, (w - 8) / Math.max(1, n)); let busy = false;
      this.items.forEach((it, i) => { const k = Math.max(0, Math.min(1, (now - it.t) / 380)); if (k < 1) busy = true; const e = 1 - Math.pow(1 - k, 3), x = 4 + i * cw, y = h - 8 - (it.k === 'b' ? 52 : 40) + (1 - e) * -70; g.globalAlpha = Math.min(1, k * 2);
        if (it.k === 'g') A.goldBar(g, x, y + 22, Math.max(1.4, (cw - 2) / 14)); else if (it.k === 'u') { g.fillStyle = '#d4fbe9'; g.fillRect(x, y + 14, cw - 3, 26); g.fillStyle = C.mintD; g.fillRect(x, y + 14, cw - 3, 3); g.fillRect(x, y + 37, cw - 3, 3); } else { g.fillStyle = C.coral; g.fillRect(x, y + 4, cw - 3, 48); g.fillStyle = '#fff4ef'; g.fillRect(x + 3, y + 10, cw - 9, 6); } });
      g.globalAlpha = 1; g.fillStyle = 'rgba(233,255,246,.25)'; g.fillRect(0, h - 6, w, 2); if (busy) requestAnimationFrame(t => this.draw(t)); else this.run = false; } };
  function setMintBtn(txt, dis) { const b = $('#mintBtn'); if (S.busy) return;
    if (!txt && S.deployed === false) { b.disabled = false; b.textContent = 'deploy the contract first ↑'; return; }
    b.disabled = !!dis; b.textContent = txt || (S.wallet ? `mint #${(S.mints || 0) + 1} for ${S.bnb} BNB` : 'connect a wallet to mint'); }
  let palI = 0; function drawPreview() { const c = $('#preview'); const g = sizeCanvas(c, 280, 280); nftArt(g, 280, (S.mints || 0) + 1, PALS[palI % PALS.length]); }
  function machineInit() {
    $$('#solChips button').forEach(b => b.onclick = () => { $$('#solChips button').forEach(x => x.classList.toggle('on', x === b)); $('#sol').value = b.dataset.v; cue('tick'); updateQuote(); });
    $('#sol').oninput = () => { $$('#solChips button').forEach(x => x.classList.toggle('on', x.dataset.v === $('#sol').value)); updateQuote(); };
    $('#mix').oninput = updateQuote; $('#crashMix').oninput = updateQuote;
    $('#touch').oninput = () => { cue('tick'); renderLadder(); };
    $('#mintBtn').onclick = () => S.deployed === false ? $('#deploybar').scrollIntoView({ behavior: 'smooth', block: 'center' }) : S.wallet ? doMint() : openWallet();
    $('#deployBtn').onclick = doDeploy;
  }

  // ---------------------------------------------------------------- 03: the payoff, for the mix set in the machine
  function renderLadder() { const m = +$('#touch').value / 100; $('#touchVal').textContent = (m > 0 ? '+' : m < 0 ? '−' : '') + Math.abs(m * 100) + '%';
    const g = (100 - S.crash) * S.gold / 100, u = 100 - S.crash - g, sq = S.crash, sqAfter = Math.max(0, sq * (1 - 3 * m)), total = g + u + sqAfter, ndx = 100 * (1 + m);
    const rows = [['gold', g, g, 'held flat: gold doesn’t follow stocks'], ['dollars', u, u, 'stays a dollar'], ['crash token', sq, sqAfter, ''], ['your Mint', 100, total, ''], ['$100 of Nasdaq-100', 100, ndx, 'for comparison']];
    const mx = Math.max(...rows.map(r => r[2]), 100);
    $('#ladder').innerHTML = rows.map(([name, a, b, note], i) => { const d = b - a, up = d > .005;
      return `<div class="rung${up ? ' hit' : ''}${i === 3 ? ' total' : ''}" style="--d:${i}"><span class="lvl">${name}</span><span class="bar"><i style="width:${Math.max(1.5, b / mx * 100).toFixed(1)}%"></i></span><span class="pay">${usd(a, 2)} → <b>${usd(b, 2)}</b>${Math.abs(d) > .005 ? ` <em class="${d < 0 ? 'dn' : 'up'}">${d > 0 ? '+' : '−'}${usd(Math.abs(d), 2)}</em>` : note ? ` <em>${note}</em>` : ''}</span></div>`; }).join('');
    $('#crashFine').textContent = `A $100 Mint with the mix from the machine: ${Math.round(g)}% gold, ${Math.round(u)}% dollars, ${sq}% crash token. The crash token aims for −3× the Nasdaq-100's return for one day; over many days it compounds and drifts. Gold is held flat here because it doesn't follow stocks.`; }

  // ---------------------------------------------------------------- wallets (EIP-6963, then window.ethereum)
  const WALLETS = new Map();
  addEventListener('eip6963:announceProvider', e => { const d = e.detail; if (d && d.info && d.provider) WALLETS.set(d.info.uuid || d.info.name, d); });
  dispatchEvent(new Event('eip6963:requestProvider'));
  function providers() { const out = [...WALLETS.values()].map(d => ({ name: d.info.name, icon: d.info.icon, p: d.provider }));
    const eth = window.ethereum; if (eth && !out.some(o => o.p === eth)) out.push({ name: eth.isMetaMask ? 'MetaMask' : eth.isTrust || eth.isTrustWallet ? 'Trust Wallet' : eth.isBinance ? 'Binance Wallet' : eth.isOkxWallet ? 'OKX Wallet' : 'browser wallet', icon: '', p: eth }); return out; }
  function openWallet() { const list = providers(), m = $('#walletModal'), here = location.host + location.pathname;
    $('#walletList').innerHTML = list.length ? list.map((w, i) => `<button data-i="${i}">${w.icon && /^data:image\//.test(w.icon) ? `<img src="${esc(w.icon)}" alt="">` : ''}${esc(w.name)}<span>→</span></button>`).join('')
      : `<p class="fine" style="margin:0">No wallet in this browser. Open this page inside one:</p><a href="https://metamask.app.link/dapp/${here}">MetaMask<span>↗</span></a><a href="https://link.trustwallet.com/open_url?coin_id=20000714&url=${encodeURIComponent(location.href)}">Trust Wallet<span>↗</span></a>`;
    $$('#walletList button').forEach(b => b.onclick = () => connect(list[+b.dataset.i].p)); m.hidden = false; }
  function setWallet(a, p) { S.wallet = a ? E.getAddress(a) : null; S.provider = a ? p : null; $('#connect').textContent = S.wallet ? short(S.wallet) : 'connect'; setMintBtn(); showVault(); if (S.wallet) loadMine(); else $('#mineBox').innerHTML = '<div class="empty">Connect a wallet on BNB Chain to see your Mints and what their vaults hold. <button class="btn btn-ink btn-sm" data-connect>connect</button></div>', $$('[data-connect]').forEach(b => b.onclick = openWallet); }
  function listen(p) { if (!p.on || p.__mint) return; p.__mint = 1; p.on('accountsChanged', a => { if (S.provider === p) setWallet(a && a[0], p); }); }
  async function connect(p) { try { const a = await p.request({ method: 'eth_requestAccounts' }); $('#walletModal').hidden = true; listen(p); setWallet(a[0], p); toast('connected ' + short(S.wallet)); ensureChain().catch(() => {}); } catch (e) { toast('wallet: ' + friendly(e)); } }
  async function ensureChain() { const p = S.provider, id = await p.request({ method: 'eth_chainId' }); if (String(id).toLowerCase() === '0x38') return;
    try { await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x38' }] }); }
    catch (e) { if (e.code === 4902 || /unrecognized|not added|unknown chain/i.test(e.message || '')) await p.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0x38', chainName: 'BNB Smart Chain', nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 }, rpcUrls: ['https://bsc-dataseed.bnbchain.org'], blockExplorerUrls: ['https://bscscan.com'] }] }); else throw e; }
    if (String(await p.request({ method: 'eth_chainId' })).toLowerCase() !== '0x38') throw new Error('switch your wallet to BNB Chain'); }
  // simulate first (a revert never reaches the wallet), then send, then wait for the block
  async function send(tx) { await ensureChain(); const t = { from: S.wallet, to: tx.to, data: tx.data, value: hex(tx.value || 0) };
    const est = BigInt(await rpc('eth_estimateGas', [t])); const gas = est * 13n / 10n;
    return S.provider.request({ method: 'eth_sendTransaction', params: [{ ...t, gas: hex(gas) }] }); }
  async function wait(hash) { for (let i = 0; i < 100; i++) { await sleep(1500); const r = await rpc('eth_getTransactionReceipt', [hash]).catch(() => null); if (r) { if (r.status !== '0x1') throw Object.assign(new Error('the transaction reverted on-chain'), { hash }); return r; } } throw Object.assign(new Error('still pending; check BscScan'), { hash }); }

  // the next Mint's vault exists as an address before the Mint does: ask the ERC-6551 registry for it
  const REG = new E.Interface(['function account(address implementation, bytes32 salt, uint256 chainId, address tokenContract, uint256 tokenId) view returns (address)']);
  async function showVault() { const el = $('#mvault'); if (!el) return; if (!S.wallet) { el.textContent = "Connect a wallet to see the address your next Mint's vault will have."; return; }
    try { let id; if (S.deployed) id = NFT.decodeFunctionResult('nextId', await ethCall(S.contract, NFT.encodeFunctionData('nextId', [S.wallet])))[0];
      else id = BigInt(E.keccak256(E.AbiCoder.defaultAbiCoder().encode(['uint256', 'address', 'address', 'uint256'], [56, S.contract, S.wallet, 0])));
      const v = REG.decodeFunctionResult('account', await ethCall('0x000000006551c19487814612e58FE06813775758', REG.encodeFunctionData('account', ['0x55266d75D1a14E4572138116aF39863Ed6596E7F', E.ZeroHash, 56, S.contract, id])))[0];
      el.innerHTML = `your next Mint's vault: <a href="https://bscscan.com/address/${v}" target="_blank" rel="noopener">${short(v)} ↗</a> <span>nothing there yet; the mint fills it</span>`; } catch (e) { el.textContent = 'the vault address will show once BNB Chain answers'; } }

  // ---------------------------------------------------------------- the deploy (once, by anyone; the address is fixed by CREATE2)
  async function doDeploy() { const b = $('#deployBtn'); if (!S.wallet) return openWallet(); if (S.busy) return; S.busy = true; b.disabled = true;
    try { b.textContent = 'checking…'; const c = await api('contract'); const sim = await ethCall(c.factory, c.deployData, S.wallet);
      if (!sim || sim.length < 42 || E.getAddress('0x' + sim.slice(-40)) !== E.getAddress(c.address)) throw new Error('the deploy would not land at ' + short(c.address));
      b.textContent = 'approve in your wallet…'; const h = await send({ to: c.factory, data: c.deployData });
      b.textContent = 'deploying…'; await wait(h); cue('chime'); toast('Mint is live on BNB Chain.', 6000); S.busy = false; await loadStatus(); loadGallery();
    } catch (e) { toast('deploy: ' + friendly(e), 7000); }
    S.busy = false; b.disabled = false; b.textContent = 'deploy it'; setMintBtn(); }

  // ---------------------------------------------------------------- the mint: one transaction creates the NFT and its vault, and buys all three parts into it
  const LABEL = { route: 'get live routes from KyberSwap', check: 'check the whole mint on-chain', sign: 'approve in your wallet', confirm: 'confirm on BNB Chain' };
  function prog(steps) { const el = $('#progress'); el.hidden = false; el.innerHTML = steps.map(k => `<li data-k="${k}"><i></i><span>${LABEL[k] || k}</span></li>`).join(''); }
  function mark(k, st, hash) { const li = $(`#progress li[data-k="${k}"]`); if (!li) return; li.className = st; if (hash && !$('a', li)) li.insertAdjacentHTML('beforeend', `<a href="https://bscscan.com/tx/${hash}" target="_blank" rel="noopener">tx ↗</a>`); }
  async function doMint() {
    if (S.busy) return; readMachine(); const w = legsWei(); if (!w || S.bnb < MIN_BNB) return toast(`mint at least ${MIN_BNB} BNB`);
    S.busy = true; const btn = $('#mintBtn'); btn.disabled = true; prog(['route', 'check', 'sign', 'confirm']); let step = 'route';
    try {
      await ensureChain(); mark('route', 'run'); btn.textContent = 'getting live routes…';
      const id = NFT.decodeFunctionResult('nextId', await ethCall(S.contract, NFT.encodeFunctionData('nextId', [S.wallet])))[0];
      const vault = NFT.decodeFunctionResult('vaultOf', await ethCall(S.contract, NFT.encodeFunctionData('vaultOf', [id])))[0];
      const legs = []; for (const k of ['gold', 'usd', 'short']) { if (w[k] <= 0n) continue; const b = await build(await route(k, w[k]), S.contract, vault); legs.push([w[k], b.data, TOK[k].address, BigInt(b.amountOut) * 985n / 1000n]); }
      const value = legs.reduce((a, l) => a + l[0], 0n), data = NFT.encodeFunctionData('mint', [id, legs]);
      mark('route', 'ok'); step = 'check'; mark('check', 'run'); btn.textContent = 'checking the mint…';
      await ethCall(S.contract, data, S.wallet, hex(value)); mark('check', 'ok');
      step = 'sign'; mark('sign', 'run'); btn.textContent = 'approve in your wallet…'; const hash = await send({ to: S.contract, data, value }); mark('sign', 'ok', hash);
      step = 'confirm'; mark('confirm', 'run'); btn.textContent = 'confirming…'; const rc = await wait(hash);
      const ev = rc.logs.map(l => { try { return NFT.parseLog(l); } catch (e) { return null; } }).find(x => x && x.name === 'Minted'); const n = ev ? Number(ev.args.number) : (S.mints + 1);
      mark('confirm', 'ok', hash); S.mints = Math.max(S.mints, n); showVault(); cue('chime'); toast(`Mint #${n} is yours. Its vault: ${short(vault)}`, 7000); loadGallery(); loadMine(); renderStatus();
    } catch (e) { mark(step, 'err', e.hash); toast(friendly(e), 8000); }
    S.busy = false; btn.disabled = false; setMintBtn();
  }

  // ---------------------------------------------------------------- gallery, feed, my mints
  const val = x => x.gold * px('gold') + x.usd * px('usd') + x.short * px('short');
  const img = x => `/api/bnb?a=img&id=${x.id}&n=${x.number || 0}`;
  const nftUrl = x => `https://bscscan.com/nft/${S.contract}/${BigInt(x.id).toString()}`;
  const parts = x => `${x.gold.toFixed(5)} XAUt · ${x.usd.toFixed(2)} USDT · ${x.short.toFixed(3)} SQQQon`;
  function renderGallery() { const items = [...S.gallery]; if (S.sort === 'big') items.sort((a, b) => val(b) - val(a));
    $('#gcount').textContent = items.length ? `${items.length} Mint${items.length > 1 ? 's' : ''}` : '';
    $('#galleryGrid').innerHTML = items.length ? items.map((x, i) => `<a class="card" style="animation-delay:${Math.min(i, 12) * 50}ms" href="${nftUrl(x)}" target="_blank" rel="noopener"><img src="${img(x)}" alt="Mint #${x.number}" loading="lazy"><div class="c-b"><span class="c-n">Mint #${x.number}</span><span class="c-v">vault ${usd(val(x), 2)}</span><span class="c-s">${parts(x)}<br>owner ${short(x.owner)}</span></div></a>`).join('')
      : S.deployed === false ? `<div class="empty"><b style="font:700 26px/1 var(--disp)">not on-chain yet.</b>The contract isn't deployed yet. Once it is, every Mint shows up here, read straight from it.<button class="btn btn-ink btn-sm" data-deploy>deploy it</button></div>`
      : `<div class="empty"><b style="font:700 26px/1 var(--disp)">no Mints yet.</b>The first one lands here, live from the chain.<a class="btn btn-ink btn-sm" href="#mint">mint #1</a></div>`;
    $$('#galleryGrid [data-deploy]').forEach(b => b.onclick = () => $('#deploybar').scrollIntoView({ behavior: 'smooth', block: 'center' })); }
  async function loadGallery() {
    try { const d = await api('gallery'); if (d.deployed === false) S.deployed = false; S.gallery = d.items || []; S.mints = Math.max(S.mints, d.total || 0, S.gallery.length);
      renderGallery(); const sum = k => S.gallery.reduce((a, x) => a + x[k], 0), tvl = S.gallery.reduce((a, x) => a + val(x), 0);
      ['#fx-tvl', '#fx-tvl2', '#bsTvl'].forEach(i => MINTFX.tween($(i), tvl, x => usd(x, 2))); ['#fx-mints', '#fx-mints2', '#bsMints'].forEach(i => MINTFX.tween($(i), S.mints, x => Math.round(x).toLocaleString('en-US')));
      $('#bsGold').textContent = sum('gold').toFixed(4); $('#bsUsd').textContent = usd(sum('usd'), 2); $('#bsShort').textContent = sum('short').toFixed(3);
      $('#feed').innerHTML = S.gallery.length ? `<div class="flist">${S.gallery.slice(0, 6).map(x => `<a class="frow" href="${nftUrl(x)}" target="_blank" rel="noopener"><img src="${img(x)}" alt=""><span><b>Mint #${x.number}</b><i>${short(x.owner)}</i></span><em>${usd(val(x), 2)}</em></a>`).join('')}</div>`
        : `<div class="skel">${S.deployed === false ? 'The contract isn\'t deployed yet. Mints show up here the moment it is.' : 'No Mints yet. The first one shows up here within seconds.'}</div><div class="fslots">${[1, 2, 3, 4].map(n => `<div class="fslot"><i></i><span><b>Mint #${n}</b><em>open</em></span></div>`).join('')}</div>`;
      if (S.deployed === false) $('#deploybar').hidden = false;
    } catch (e) { $('#galleryGrid').innerHTML = `<div class="empty">couldn't read the chain right now (${esc(e.message)}). Try again in a minute.</div>`; $('#feed').innerHTML = '<div class="skel">the chain is busy, retrying soon</div>'; }
  }
  async function loadMine() {
    const box = $('#mineBox'); if (!S.wallet) return; box.innerHTML = '<div class="empty">reading your wallet…</div>';
    try { const d = await api('mine', { wallet: S.wallet }); const items = d.items || [];
      box.innerHTML = items.length ? items.map(x => `<div class="mrow" data-id="${x.id}" data-vault="${x.vault}"><img src="${img(x)}" alt=""><div><h4>Mint #${x.number}</h4><p>vault ${usd(val(x), 2)} · ${parts(x)}<br><a href="https://bscscan.com/address/${x.vault}" target="_blank" rel="noopener">the vault ${short(x.vault)} ↗</a></p></div><div class="acts"><button class="btn btn-line btn-sm" data-act="gold">+ gold</button><button class="btn btn-line btn-sm" data-act="usd">+ dollars</button><button class="btn btn-line btn-sm" data-act="short">+ crash</button><button class="btn btn-ink btn-sm" data-act="empty">empty the vault</button></div></div>`).join('')
        : d.deployed === false ? `<div class="empty">The contract isn't deployed yet, so there are no Mints in ${short(S.wallet)}.</div>` : `<div class="empty">No Mints in ${short(S.wallet)} yet. <a class="btn btn-ink btn-sm" href="#mint">mint one</a></div>`;
      $$('.mrow [data-act]', box).forEach(b => b.onclick = () => act(b.closest('.mrow').dataset.vault, b.dataset.act, b));
    } catch (e) { box.innerHTML = `<div class="empty">couldn't read your Mints (${esc(e.message)}).</div>`; }
  }
  async function act(vault, what, btn) {
    try { btn.disabled = true;
      if (what === 'empty') { const own = ACC.decodeFunctionResult('owner', await ethCall(vault, ACC.encodeFunctionData('owner', [])))[0]; if (E.getAddress(own) !== S.wallet) throw new Error('only the NFT\'s owner can open this vault');
        const ops = []; for (const k of ['gold', 'usd', 'short']) { const bal = ERC20.decodeFunctionResult('balanceOf', await ethCall(TOK[k].address, ERC20.encodeFunctionData('balanceOf', [vault])))[0]; if (bal > 0n) ops.push([TOK[k].address, 0n, ERC20.encodeFunctionData('transfer', [S.wallet, bal]), 0]); }
        if (!ops.length) throw new Error('this vault is already empty');
        if (!confirm('Send everything in this vault to your wallet? The NFT stays yours, with an empty vault.')) { btn.disabled = false; return; }
        const h = await send({ to: vault, data: ACC.encodeFunctionData('executeBatch', [ops]) }); toast('emptying the vault…'); await wait(h); cue('chime'); toast('done. The vault is in your wallet.'); }
      else { const amt = prompt(`How much BNB of ${what === 'usd' ? 'dollars' : what === 'short' ? 'crash token' : 'gold'} should go into the vault?`, '0.02'); if (!amt) { btn.disabled = false; return; }
        const wei = E.parseEther(String(+amt)); const b = await build(await route(what, wei), S.wallet, vault); const h = await send({ to: b.routerAddress, data: b.data, value: wei }); toast('adding to the vault…'); await wait(h); cue('pop'); toast('added to the vault.'); }
      loadMine(); loadGallery(); } catch (e) { toast(friendly(e), 7000); btn.disabled = false; }
  }

  // ---------------------------------------------------------------- board art, reveals, nav
  function boardArt() { $$('.bt-art').forEach(c => { const s = 76, g = sizeCanvas(c, s, s);
    if (c.dataset.bear) { g.fillStyle = C.rows[0]; g.fillRect(0, 0, s, s); A.bear(g, 6, 8, 4, A.bearSpec(A.rng(5))); A.down(g, s - 20, 8, 12); }
    else if (c.dataset.leaf) { g.fillStyle = BNBY; g.fillRect(0, 0, s, s); A.leaf(g, 13, 11, 50, { shadow: '#b8890a', off: 3 }); }
    else if (c.dataset.art === 'goldbar') { g.fillStyle = '#fff4cf'; g.fillRect(0, 0, s, s); A.goldBar(g, 10, 28, 4); }
    else { g.fillStyle = C.paper; g.fillRect(0, 0, s, s); g.fillStyle = C.ink; g.fillRect(17, 25, 46, 30); g.fillStyle = '#d4fbe9'; g.fillRect(13, 21, 46, 30); g.fillStyle = C.mintD; g.fillRect(13, 21, 46, 4); g.fillRect(13, 47, 46, 4); g.font = '700 22px PX'; g.fillStyle = C.ink; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', 36, 37); } }); }
  function reveals() { const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('shown'); if (e.target.classList.contains('ladder-wrap')) setTimeout(() => e.target.classList.add('settled'), 1600); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' }); $$('.reveal').forEach(el => io.observe(el)); }
  function navSpy() { const links = $$('.nav-links a[href^="#"]'), secs = links.map(a => $(a.getAttribute('href'))); const y = innerHeight * .35; let on = -1; secs.forEach((s, i) => { if (s && s.getBoundingClientRect().top < y) on = i; }); links.forEach((a, i) => a.classList.toggle('on', i === on)); }

  // ---------------------------------------------------------------- go
  function start() {
    MINTFX.splitHeads(); drawMarks(); wallInit(); wallHoverInit(); machineInit(); chartHover(); layerArt(); boardArt(); drawPreview(); reveals(); MINTFX.bgInit(); MINTFX.progress(); MINTFX.tilt(); updateQuote(); renderLadder();
    const snd = $('#snd'), sndUi = () => snd.classList.toggle('on', MINTSOUND.on); snd.onclick = e => { e.stopPropagation(); MINTSOUND.toggle(); }; document.addEventListener('mintsound', sndUi); sndUi();
    if (!RM && matchMedia('(hover: hover)').matches) addEventListener('pointermove', e => { if (scrollY > innerHeight) return; const x = e.clientX / innerWidth - .5, y = e.clientY / innerHeight - .5; $('.hero-wall').style.transform = `translate(${(-x * 14).toFixed(1)}px, ${(-y * 10).toFixed(1)}px) rotate(${(x * .8).toFixed(2)}deg)`; }, { passive: true });
    $('#connect').onclick = () => S.wallet ? toast('connected ' + short(S.wallet)) : openWallet();
    $$('[data-connect]').forEach(b => b.onclick = openWallet);
    $$('.gtools [data-sort]').forEach(b => b.onclick = () => { S.sort = b.dataset.sort; $$('.gtools [data-sort]').forEach(x => x.classList.toggle('on', x === b)); renderGallery(); });
    $('#walletModal').addEventListener('click', e => { if (e.target.id === 'walletModal' || e.target.hasAttribute('data-close')) $('#walletModal').hidden = true; });
    addEventListener('scroll', () => { stackScroll(); navSpy(); }, { passive: true }); stackScroll();
    addEventListener('resize', () => { drawMarks(); if (S.hist) renderHistory(); });
    requestAnimationFrame(wallFrame); requestAnimationFrame(chartFrame); if (!RM) setInterval(() => { palI++; drawPreview(); }, 2600);
    setInterval(loadStatus, 30000); setInterval(loadGas, 60000); loadGas(); loadGallery(); setInterval(loadGallery, 60000);
    // a wallet that already trusts this site reconnects without a prompt
    setTimeout(async () => { for (const w of providers()) { try { const a = await w.p.request({ method: 'eth_accounts' }); if (a && a[0]) { listen(w.p); setWallet(a[0], w.p); break; } } catch (e) { } } }, 300);
  }
  const fonts = Promise.all([document.fonts.load('700 100px ID'), document.fonts.load('700 30px PX'), document.fonts.load('600 14px JB')]).catch(() => {});
  const data = Promise.all([loadStatus(), loadHistory()]);
  Promise.race([Promise.all([fonts, data]), new Promise(r => setTimeout(r, 1200))]).then(() => { start(); intro(() => {}); });
})();
