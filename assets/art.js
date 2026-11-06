// mint pixel art: the leaf (the mark), the Wall Street bears (the market), small icons. Plain canvas, no libraries.
(function () {
  const C = { mint: '#3fe6a6', mintD: '#16a874', mintS: '#1a8f63', mintL: '#9ff7d2', ink: '#0c1512', paper: '#f3f1ea', coral: '#ff5a5f', gold: '#f2c94c', goldD: '#c9962a',
    rows: ['#3d63dd', '#f4f1e8', '#f2b63f', '#8a6cf0', '#f06b7e', '#22b5a3'] };

  // the 16x16 leaf: symmetric about its rib (x + y = 15), single-pixel tip, a two-pixel stem
  const LEAF = (() => { const out = [];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const p = x - y, q = x + y - 15, t = (p + 9) / 22;
      if (p >= -9 && p <= 13) { const w = 5.3 * Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(t, .74))), .8); if (Math.abs(q) <= w) out.push([x, y, q === 0 && p < 11 ? 'r' : Math.abs(q) > w - 1 ? 'e' : q < 0 ? 'h' : 'b']); }
      else if (q === 0 && (p === -11 || p === -13)) out.push([x, y, 's']); }
    return out; })();
  // mono leaf (black body, light rib) with a hard offset shadow, the PFP look
  function leaf(g, x0, y0, size, o = {}) { const px = size / 16, body = o.body || C.ink, rib = o.rib || C.mintL, sh = o.shadow === undefined ? C.mintS : o.shadow, off = o.off === undefined ? size * .05 : o.off;
    if (sh) { g.fillStyle = sh; for (const [x, y] of LEAF) g.fillRect(x0 + x * px + off, y0 + y * px + off, px + .4, px + .4); }
    for (const [x, y, k] of LEAF) { g.fillStyle = k === 'r' ? rib : body; g.fillRect(x0 + x * px, y0 + y * px, px + .4, px + .4); } }

  // a bear head on a 16x16 grid with one or two accessories
  const HEAD = ['................', '................', '................',
    '...DD......DD...', '..DFFD....DFFD..', '..DFFDDDDDDFFD..', '...DFFFFFFFFD...', '..DFFFFFFFFFFD..',
    '..DFFEFFFFEFFD..', '..DFFFFFFFFFFD..', '..DFFFSSSSFFFD..', '..DFFSSNNSSFFD..', '...DFFSSSSFFD...', '....DDFFFFDD....', '......DDDD......', '................'];
  const FUR = [['#9b6a46', '#5a3a24', '#d9b48c'], ['#7d5236', '#47291a', '#c99c74'], ['#b8875c', '#6e4a2e', '#ecd0ac'], ['#8e8e8e', '#4f4f4f', '#d8d8d8'], ['#6a4a3a', '#3a261c', '#b89478']];
  const ACC = {
    tophat: [[4, 0, 8, 3, '#111'], [2, 3, 12, 1, '#111'], [4, 2, 8, 1, '#c33']],
    cap: [[4, 2, 8, 2, 'C'], [3, 3, 10, 1, 'C'], [11, 4, 4, 1, 'C']],
    glasses: [[3, 8, 4, 1, '#111'], [9, 8, 4, 1, '#111'], [7, 8, 2, 1, '#111'], [4, 8, 2, 1, '#9fe8ff'], [10, 8, 2, 1, '#9fe8ff']],
    shades: [[3, 7, 4, 3, '#111'], [9, 7, 4, 3, '#111'], [7, 8, 2, 1, '#111']],
    monocle: [[9, 7, 3, 1, '#e8c547'], [9, 9, 3, 1, '#e8c547'], [9, 7, 1, 3, '#e8c547'], [11, 7, 1, 3, '#e8c547'], [12, 10, 1, 4, '#e8c547']],
    headset: [[2, 4, 12, 1, '#222'], [1, 5, 2, 5, '#222'], [13, 5, 2, 5, '#222'], [12, 11, 3, 1, '#222']],
    sweat: [[13, 6, 1, 1, '#7fd3ff'], [13, 7, 2, 2, '#7fd3ff']],
    frown: [[6, 13, 4, 1, '#2a1a10'], [5, 14, 1, 1, '#2a1a10'], [10, 14, 1, 1, '#2a1a10']],
    tie: [[6, 15, 4, 1, '#fff'], [7, 15, 2, 1, '#d33']],
    crown: [[4, 1, 8, 2, '#f2c94c'], [4, 0, 1, 1, '#f2c94c'], [7, 0, 2, 1, '#f2c94c'], [11, 0, 1, 1, '#f2c94c'], [7, 1, 2, 1, '#e0533c']],
    bandage: [[4, 6, 3, 1, '#f5e6c8'], [5, 5, 1, 3, '#f5e6c8']],
  };
  const POOL = ['tophat', 'cap', 'glasses', 'shades', 'monocle', 'headset', 'crown', 'bandage'];
  function rng(seed) { let s = (seed >>> 0) % 2147483646 + 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
  function bearSpec(r) { const pick = a => a[Math.floor(r() * a.length)]; const accs = [pick(POOL)]; if (r() < .5) accs.push(pick(['sweat', 'frown', 'tie'])); if (r() < .3) accs.push('tie'); return { fur: pick(FUR), accs, cap: pick(['#e0533c', '#2b6be0', '#16a874', '#111']) }; }
  function bear(g, x0, y0, px, spec, blink) { const [F, D, Sn] = spec.fur;
    HEAD.forEach((row, y) => { for (let x = 0; x < 16; x++) { const ch = row[x]; if (ch === '.') continue; g.fillStyle = ch === 'F' ? F : ch === 'D' ? D : ch === 'S' ? Sn : ch === 'E' ? (blink ? F : '#111') : '#111'; g.fillRect(x0 + x * px, y0 + y * px, px + .3, px + .3); } });
    if (blink) { g.fillStyle = '#111'; g.fillRect(x0 + 5 * px, y0 + 8.5 * px, px, px * .4); g.fillRect(x0 + 10 * px, y0 + 8.5 * px, px, px * .4); }
    for (const a of spec.accs) for (const [x, y, w, h, col] of ACC[a]) { g.fillStyle = col === 'C' ? spec.cap : col; g.fillRect(x0 + x * px, y0 + y * px, w * px, h * px); } }
  function down(g, x, y, s, col) { const p = s / 5, A = ['XXXXX', '.XXX.', '..X..']; g.fillStyle = col || C.coral; A.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === 'X') g.fillRect(x + i * p, y + j * p, p + .3, p + .3); })); }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); }
  // a full tile: white rim, row colour, bear, the red ▼ badge
  function tile(g, x, y, ts, colour, spec, o = {}) {
    rr(g, x - ts * .05, y - ts * .05, ts * 1.1, ts * 1.1, ts * .21); g.fillStyle = o.rim || '#ffffff'; g.fill();
    rr(g, x, y, ts, ts, ts * .16); g.fillStyle = colour; g.fill();
    g.save(); rr(g, x, y, ts, ts, ts * .16); g.clip();
    if (o.leaf) leaf(g, x + ts * .16, y + ts * .16, ts * .68, { body: C.ink, rib: C.mintL, shadow: 'rgba(0,0,0,.18)' });
    else bear(g, x + ts * .05, y + ts * .08, ts * .0565, spec, o.blink);
    g.restore();
    if (!o.leaf && o.badge !== false) down(g, x + ts * .76, y + ts * .11, ts * .145);
  }
  function grain(g, W, H, a, seed) { const r = rng(seed || 7); const n = Math.min(W * H * .06, 260000); for (let i = 0; i < n; i++) { const v = r() < .5 ? 0 : 255; g.fillStyle = `rgba(${v},${v},${v},${a * r()})`; g.fillRect(r() * W, r() * H, 1, 1); } }
  // a small gold bar and a dollar note in pixels (for the vault layers)
  function goldBar(g, x, y, px) { const B = ['..GGGGGGGGGG..', '.GHHHHHHHHHHG.', 'GHHGGGGGGGGHHG', 'GGGGGGGGGGGGGG', 'DDDDDDDDDDDDDD']; const col = { G: C.gold, H: '#ffe08a', D: C.goldD };
    B.forEach((row, j) => [...row].forEach((ch, i) => { if (col[ch]) { g.fillStyle = col[ch]; g.fillRect(x + i * px, y + j * px, px + .3, px + .3); } })); }
  window.MINTART = { C, LEAF, leaf, bear, bearSpec, tile, down, rng, grain, rr, goldBar, FUR, POOL };
})();
