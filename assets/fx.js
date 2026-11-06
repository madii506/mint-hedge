// mint motion: living section backgrounds, kinetic headlines, number tweens, a scroll bar, pixel leaves on click.
(function () {
  const A = window.MINTART, C = A.C, RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DARK = document.body.classList.contains('dark'), INK = DARK ? '#f2f2ee' : '#0c1512', INKR = DARK ? '242,242,238' : '12,21,18'; // pages on the dark theme draw light marks
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // ---------------------------------------------------------------- backgrounds: one small canvas per section, animated only while on screen
  const LEAF_SPR = {}; // pre-rendered pixel leaves by colour and size
  function leafSprite(col, s) { const k = col + s; if (LEAF_SPR[k]) return LEAF_SPR[k]; const c = document.createElement('canvas'); c.width = c.height = s; A.leaf(c.getContext('2d'), 0, 0, s, { body: col, rib: 'rgba(255,255,255,.35)', shadow: null }); return LEAF_SPR[k] = c; }
  const BEAR_SPR = []; function bearSprite(i) { if (BEAR_SPR[i]) return BEAR_SPR[i]; const c = document.createElement('canvas'); c.width = c.height = 40; A.tile(c.getContext('2d'), 2, 2, 36, C.rows[i % 6], A.bearSpec(A.rng(i * 7 + 3)), { rim: 'rgba(255,255,255,.9)' }); return BEAR_SPR[i] = c; }
  const KINDS = {
    // drifting pixel leaves, rising slowly, swaying
    leaves(W, H, r) { const n = Math.round(W * H / 52000) + 6, P = []; for (let i = 0; i < n; i++) P.push({ x: r() * W, y: r() * H, s: [12, 16, 20, 28][Math.floor(r() * 4)], v: .12 + r() * .3, ph: r() * 6.3, a: .04 + r() * .07, rot: r() * 6.3, vr: (r() - .5) * .003 });
      return (g, t) => { for (const p of P) { p.y -= p.v; p.rot += p.vr; if (p.y < -40) { p.y = H + 30; p.x = Math.random() * W; } const x = p.x + Math.sin(t / 2400 + p.ph) * 22; g.save(); g.globalAlpha = p.a; g.translate(x, p.y); g.rotate(p.rot); g.drawImage(leafSprite(INK, p.s), -p.s / 2, -p.s / 2); g.restore(); } }; },
    // gold and dollar pixels rising into an invisible vault
    gold(W, H, r) { const n = Math.round(W * H / 26000) + 10, P = []; for (let i = 0; i < n; i++) P.push({ x: r() * W, y: r() * H, s: 4 + Math.floor(r() * 3) * 3, v: .15 + r() * .35, c: r() < .55 ? C.gold : '#ffffff', a: .18 + r() * .25, tw: r() * 6.3 });
      return (g, t) => { for (const p of P) { p.y -= p.v; if (p.y < -10) { p.y = H + 10; p.x = Math.random() * W; } g.globalAlpha = p.a * (.6 + .4 * Math.sin(t / 500 + p.tw)); g.fillStyle = p.c; g.fillRect(p.x, p.y, p.s, p.s); if (p.s > 8) { g.fillStyle = 'rgba(12,21,18,.25)'; g.fillRect(p.x + 2, p.y + p.s, p.s, 2); } } g.globalAlpha = 1; }; },
    // a faint candlestick chart scrolling sideways, mostly red: the market the vault hedges
    candles(W, H, r) { const cw = 22, cols = Math.ceil(W / cw) + 4, base = H * .5; let px = 0, last = base; const S = [];
      const add = () => { const up = Math.random() < .42, body = 8 + Math.random() * 46, o = last, c = Math.max(H * .15, Math.min(H * .85, o + (up ? -body : body) + (Math.random() - .5) * 8)); S.push({ o, c, hi: Math.min(o, c) - Math.random() * 22, lo: Math.max(o, c) + Math.random() * 22, up: c < o }); last = c * .9 + base * .1; };
      for (let i = 0; i < cols; i++) add();
      return (g) => { px += .35; if (px >= cw) { px -= cw; S.shift(); add(); } S.forEach((k, i) => { const x = i * cw - px; g.globalAlpha = .13; g.fillStyle = k.up ? C.mintD : C.coral; g.fillRect(x + cw / 2 - 1, k.hi, 2, k.lo - k.hi); g.fillRect(x + 4, Math.min(k.o, k.c), cw - 8, Math.max(3, Math.abs(k.c - k.o))); }); g.globalAlpha = 1; }; },
    // the payoff section: a few coral ▼ arrows drifting down, slowly
    rain(W, H, r) { const n = Math.round(W * H / 70000) + 8, P = []; for (let i = 0; i < n; i++) P.push({ x: r() * W, y: r() * H, s: 5 + Math.floor(r() * 3) * 2, v: .25 + r() * .45, a: .07 + r() * .1, ph: r() * 6.3 });
      return (g, t) => { for (const p of P) { p.y += p.v; if (p.y > H + 10) { p.y = -10; p.x = Math.random() * W; } g.globalAlpha = p.a; A.down(g, p.x + Math.sin(t / 2600 + p.ph) * 10, p.y, p.s); } g.globalAlpha = 1; }; },
    // a dot grid with a slow mint sweep, like a terminal waking up
    grid(W, H) { const s = 26; return (g, t) => { const sweep = (t / 14) % (W + 400) - 200; for (let y = s / 2; y < H; y += s) for (let x = s / 2; x < W; x += s) { const d = Math.abs(x - sweep), k = Math.max(0, 1 - d / 180); g.fillStyle = k > 0 ? `rgba(${INKR},${.08 + k * .3})` : `rgba(${INKR},.08)`; const q = 2 + k * 3; g.fillRect(x - q / 2, y - q / 2, q, q); } }; },
    // small bear tiles drifting past behind the gallery, slowly turning into leaves
    parade(W, H, r) { const n = Math.round(W / 150) + 3, P = []; for (let i = 0; i < n; i++) P.push({ x: r() * W, y: 40 + r() * (H - 80), v: .15 + r() * .25, i, a: .1 + r() * .1, leaf: r() < .3 });
      return (g) => { for (const p of P) { p.x += p.v; if (p.x > W + 50) { p.x = -50; p.y = 40 + Math.random() * (H - 80); p.leaf = Math.random() < .35; } g.globalAlpha = p.a; if (p.leaf) g.drawImage(leafSprite(INK, 28), p.x - 14, p.y - 14); else g.drawImage(bearSprite(p.i), p.x - 20, p.y - 20); } g.globalAlpha = 1; }; },
  };
  const live = [];
  function bgInit() {
    $$('[data-fx]').forEach((sec, i) => { const c = document.createElement('canvas'); c.className = 'fx'; c.setAttribute('aria-hidden', 'true'); sec.prepend(c);
      const item = { sec, c, kind: sec.dataset.fx, on: false, draw: null, w: 0, h: 0 }; live.push(item); });
    const io = new IntersectionObserver(es => es.forEach(e => { const it = live.find(x => x.sec === e.target); if (it) it.on = e.isIntersecting; }), { rootMargin: '120px 0px' });
    live.forEach(it => io.observe(it.sec));
    const sizeAll = () => live.forEach(it => { const w = it.sec.clientWidth, h = it.sec.clientHeight; if (w === it.w && h === it.h) return; it.w = w; it.h = h; it.c.width = w; it.c.height = h; it.draw = KINDS[it.kind](w, h, A.rng(w + h + it.kind.length)); });
    sizeAll(); addEventListener('resize', sizeAll); setInterval(sizeAll, 2000);
    if (RM) { live.forEach(it => { const g = it.c.getContext('2d'); it.draw && it.draw(g, 0); }); return; }
    const loop = t => { for (const it of live) if (it.on && it.draw) { const g = it.c.getContext('2d'); g.clearRect(0, 0, it.w, it.h); it.draw(g, t); } requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------- kinetic headlines: every letter rises into place
  function splitHeads() { $$('.sec-head h2, .kinetic').forEach(h => { if (h.dataset.split) return; h.dataset.split = 1; const words = h.textContent.trim().split(/\s+/); h.setAttribute('aria-label', h.textContent.trim());
    let n = 0; h.innerHTML = words.map(w => `<span class="kw" aria-hidden="true">${[...w].map(ch => `<span class="kl" style="--i:${n++}">${ch === '&' ? '&amp;' : ch}</span>`).join('')}</span>`).join(' '); }); }

  // ---------------------------------------------------------------- number tweens: a value rolls to its new number and flashes
  function tween(el, to, fmt, ms = 900) { if (!el) return; const from = +el.dataset.v; el.dataset.v = to; if (!isFinite(from) || RM || from === to) { el.textContent = fmt(to); return; }
    const t0 = performance.now(), ease = k => 1 - Math.pow(1 - k, 3); el.classList.remove('flash-up', 'flash-dn'); void el.offsetWidth; el.classList.add(to >= from ? 'flash-up' : 'flash-dn');
    const step = now => { const k = Math.min(1, (now - t0) / ms); el.textContent = fmt(from + (to - from) * ease(k)); if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); }

  // ---------------------------------------------------------------- scroll bar + pixel leaves on click
  function progress() { const bar = document.querySelector('.scrollbar i'); if (!bar) return; const f = () => { const h = document.documentElement.scrollHeight - innerHeight; bar.style.transform = `scaleX(${h > 0 ? scrollY / h : 0})`; }; addEventListener('scroll', f, { passive: true }); f(); }
  function burst() { if (RM) return; const c = document.createElement('canvas'); c.className = 'burst'; c.setAttribute('aria-hidden', 'true'); document.body.appendChild(c); const g = c.getContext('2d'), P = []; let run = false;
    const size = () => { c.width = innerWidth; c.height = innerHeight; }; size(); addEventListener('resize', size);
    addEventListener('pointerdown', e => { if (e.target.closest('input, textarea, select, .machine, canvas#wall, .modal')) return; for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (Math.random() - .5) * 2.2, v = 3 + Math.random() * 4; P.push({ x: e.clientX, y: e.clientY, vx: Math.cos(a) * v, vy: Math.sin(a) * v, s: [10, 12, 16][i % 3], rot: Math.random() * 6, vr: (Math.random() - .5) * .3, life: 1 }); }
      window.MINTSOUND && MINTSOUND.cue('pop'); if (!run) { run = true; requestAnimationFrame(loop); } });
    function loop() { g.clearRect(0, 0, c.width, c.height); for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; p.vy += .22; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= .018; if (p.life <= 0) { P.splice(i, 1); continue; } g.save(); g.globalAlpha = Math.min(1, p.life * 1.6); g.translate(p.x, p.y); g.rotate(p.rot); g.drawImage(leafSprite('#0c1512', p.s), -p.s / 2, -p.s / 2); g.restore(); }
      if (P.length) requestAnimationFrame(loop); else run = false; }
  }
  // ---------------------------------------------------------------- tilt: cards lean toward the pointer
  function tilt() { if (RM || matchMedia('(hover: none)').matches) return; $$('[data-tilt]').forEach(el => { el.addEventListener('pointermove', e => { const b = el.getBoundingClientRect(), x = (e.clientX - b.left) / b.width - .5, y = (e.clientY - b.top) / b.height - .5; el.style.transform = `perspective(900px) rotateX(${(-y * 4).toFixed(2)}deg) rotateY(${(x * 5).toFixed(2)}deg) translateY(-2px)`; }); el.addEventListener('pointerleave', () => { el.style.transform = ''; }); }); }

  window.MINTFX = { bgInit, splitHeads, tween, progress, burst, tilt, leafSprite };
})();
