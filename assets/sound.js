// mint sound: a calm, quiet ambient loop plus a few soft cues, all synthesized in the browser (no audio files).
// Browsers only allow sound after a click or key press, so it starts on the visitor's first input. ♪ in the nav mutes it.
(function () {
  const KEY = 'mint.sound'; let on = true; try { on = localStorage.getItem(KEY) !== 'off'; } catch (e) {}
  let ctx = null, master, music, sfx, verb, timer = 0, nextT = 0, step = 0, started = false;
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  function impulse(sec) { const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate); for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.8); } return b; }
  function init() { if (ctx) return true; const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false; ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0; const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -20; comp.ratio.value = 3; master.connect(comp).connect(ctx.destination);
    verb = ctx.createConvolver(); verb.buffer = impulse(3.6); const wet = ctx.createGain(); wet.gain.value = .6; verb.connect(wet).connect(master);
    music = ctx.createGain(); music.gain.value = .5; music.connect(master); music.connect(verb);
    sfx = ctx.createGain(); sfx.gain.value = .7; sfx.connect(master); sfx.connect(verb); return true; }
  function pluck(m, t, v, dur, type) { const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter(); o.type = type || 'triangle'; o.frequency.value = hz(m); f.type = 'lowpass'; f.frequency.value = 1900; f.Q.value = .4;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .015); g.gain.exponentialRampToValueAtTime(.0001, t + dur); o.connect(f).connect(g).connect(music); o.start(t); o.stop(t + dur + .05); }
  function pad(ms, t, dur, v) { ms.forEach((m, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = hz(m); o.detune.value = (i - 1) * 6;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + dur * .4); g.gain.linearRampToValueAtTime(0, t + dur); o.connect(g).connect(music); o.start(t); o.stop(t + dur + .1); }); }
  // C major pentatonic over a slow I-vi-IV-V; quiet, sparse, a little random so it never loops obviously
  const CH = [[48, 55, 64, 71], [45, 52, 60, 67], [41, 48, 57, 64], [43, 50, 59, 62]], SC = [72, 74, 76, 79, 81, 84, 86, 88], BEAT = .78;
  function tick() { while (nextT < ctx.currentTime + .4) { const bar = Math.floor(step / 8) % 4, s = step % 8;
      if (s === 0) { pad(CH[bar], nextT, BEAT * 8.4, .028); pluck(CH[bar][0] - 12, nextT, .06, 3.2, 'sine'); }
      if (Math.random() < (s % 2 ? .28 : .5)) pluck(SC[Math.floor(Math.random() * SC.length)] - (Math.random() < .3 ? 12 : 0), nextT + (Math.random() - .5) * .04, .035 + Math.random() * .02, 2.4);
      nextT += BEAT / 2; step++; } }
  function startMusic() { if (started || !on || !init()) return; started = true; if (ctx.state === 'suspended') ctx.resume(); nextT = ctx.currentTime + .1; master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setValueAtTime(master.gain.value, ctx.currentTime); master.gain.linearRampToValueAtTime(.55, ctx.currentTime + 4); timer = setInterval(tick, 120); tick(); }
  function stopMusic() { if (!ctx) return; clearInterval(timer); started = false; master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setValueAtTime(master.gain.value, ctx.currentTime); master.gain.linearRampToValueAtTime(0, ctx.currentTime + .6); }
  const CUES = {
    chime() { const t = ctx.currentTime; [76, 79, 84, 88].forEach((m, i) => pluck(m, t + i * .09, .09, 2.8)); },
    thud() { const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + .5); g.gain.setValueAtTime(.22, t); g.gain.exponentialRampToValueAtTime(.0001, t + .7); o.connect(g).connect(sfx); o.start(t); o.stop(t + .8); },
    tick() { const t = ctx.currentTime; pluck(91 + Math.floor(Math.random() * 3) * 2, t, .025, .25, 'square'); },
    pop() { const t = ctx.currentTime; pluck(84, t, .05, .5); pluck(91, t + .05, .04, .6); },
  };
  function cue(n) { if (!on || !ctx || ctx.state !== 'running') return; try { CUES[n](); } catch (e) {} }
  function setOn(v) { on = v; try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch (e) {} if (v) startMusic(); else stopMusic(); document.dispatchEvent(new CustomEvent('mintsound', { detail: on })); }
  const first = () => { removeEventListener('pointerdown', first, true); removeEventListener('keydown', first, true); if (on) startMusic(); };
  addEventListener('pointerdown', first, true); addEventListener('keydown', first, true);
  window.MINTSOUND = { cue, toggle: () => setOn(!on), get on() { return on; } };
})();
