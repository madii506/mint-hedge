// mint docs: live numbers, the self-test, the table of contents
(function () {
  const A = window.MINTART, C = A.C, $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)], DPR = Math.min(2, devicePixelRatio || 1);
  const usd = (x, d = 2) => x == null || !isFinite(x) ? '—' : '$' + (+x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const lvl = n => '$' + (+n).toLocaleString('en-US');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const api = async (a, p) => { const r = await fetch('/api/mint?' + new URLSearchParams({ a, ...(p || {}) })); const j = await r.json().catch(() => ({ error: 'bad response' })); if (!r.ok || j.error) throw new Error(j.error || 'failed'); return j; };
  $$('canvas.leafmark').forEach(c => { const s = +c.dataset.size; c.width = c.height = Math.round(s * 1.06 * DPR); c.style.width = c.style.height = s * 1.06 + 'px'; const g = c.getContext('2d'); g.scale(DPR, DPR); A.leaf(g, 0, 0, s, { shadow: null }); });
  MINTFX.splitHeads(); MINTFX.bgInit(); MINTFX.progress(); MINTFX.burst();
  const snd = $('#snd'), ui = () => snd.classList.toggle('on', MINTSOUND.on); snd.onclick = e => { e.stopPropagation(); MINTSOUND.toggle(); }; document.addEventListener('mintsound', ui); ui();
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('shown'); } }), { rootMargin: '0px 0px -10% 0px' });
  $$('.ds, .dhero-in').forEach(el => { el.classList.add('reveal'); io.observe(el); });
  // table of contents follows the scroll
  const links = $$('.toc a'); addEventListener('scroll', () => { let on = 0; links.forEach((a, i) => { const s = $(a.getAttribute('href')); if (s && s.getBoundingClientRect().top < innerHeight * .3) on = i; }); links.forEach((a, i) => a.classList.toggle('on', i === on)); }, { passive: true });
  let closes = null;
  setInterval(() => { if (!closes) return; const ms = new Date(closes) - Date.now(); if (ms <= 0) { $('#bClose').textContent = 'closed'; return; } const d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4), s = Math.floor(ms % 6e4 / 1e3), p = n => String(n).padStart(2, '0'); $('#bClose').textContent = `${d}d ${p(h)}h ${p(m)}m ${p(s)}s`; }, 1000);
  api('status').then(s => { const cm = s.crash; if (s.mints != null) MINTFX.tween($('#dMints'), s.mints, x => Math.round(x));
    if (cm) { closes = cm.closes; $('#bTitle').textContent = `“${cm.title}”`; if (cm.volume) $('#bVol').textContent = usd(cm.volume, 0); if (cm.rules) $('#bRules').textContent = cm.rules;
      $('#bTable').innerHTML = cm.markets.map(m => `<tr><td><b>↓ ${lvl(m.level)}</b></td><td>${usd(m.yes, 3)}</td><td>${m.bid ? usd(m.bid, 3) : '—'}</td><td>${(1 / m.yes).toFixed(2)}×</td><td><b>${usd(5.4 / m.yes)}</b></td></tr>`).join('') || '<tr><td colspan="5">no open levels right now</td></tr>'; }
    const gold = s.prices && s.prices.gold ? s.prices.gold.usd : 0;
    api('gallery').then(({ items }) => { const live = items.filter(x => x.alive), g = live.reduce((a, x) => a + x.gold, 0), u = live.reduce((a, x) => a + x.usd, 0);
      MINTFX.tween($('#dVault'), g * gold + u, x => usd(x)); $('#dGold').textContent = g.toFixed(5); $('#dUsd').textContent = usd(u); if (items.length > (s.mints || 0)) $('#dMints').textContent = items.length; }).catch(() => {});
  }).catch(e => { $('#bRules').textContent = 'live data is offline right now: ' + e.message; });
  // the self-test
  const out = $('#testOut');
  $('#runTest').onclick = async () => { const b = $('#runTest'); b.disabled = true; out.className = 'term run'; out.textContent = '> simulating create → open vault → execute(transfer, close) → burn on mainnet…';
    try { const r = await api('selftest'); out.className = 'term ' + (r.err ? 'bad' : 'ok');
      out.textContent = `> result: ${r.err ? 'FAILED ' + JSON.stringify(r.err) : 'ok, the vault opens only through execute'}\n> compute units: ${r.units}\n> transaction size: ${r.size} bytes\n\n` + (r.logs || []).map(l => '  ' + l).join('\n'); }
    catch (e) { out.className = 'term bad'; out.textContent = '> could not run: ' + e.message; }
    b.disabled = false; };
})();
