// כלים משותפים למשחקים: צלילים, קונפטי, שמירת שיא
window.Kids = (function () {
  'use strict';
  var ctx = null;
  var muted = false;
  try { muted = localStorage.getItem('kids-muted') === '1'; } catch (e) { /* */ }

  function audio() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; }
    }
    if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { /* */ } }
    return ctx;
  }
  function tone(freq, dur, type, vol, delay, slideTo) {
    if (muted) return;
    var a = audio();
    if (!a) return;
    try {
      var t = a.currentTime + (delay || 0);
      var o = a.createOscillator(), g = a.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.15, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(a.destination);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { /* */ }
  }
  var lastHit = 0;
  var sfx = {
    good: function () { tone(660, 0.1, 'triangle', 0.16); tone(990, 0.14, 'triangle', 0.14, 0.08); },
    bad: function () { tone(200, 0.22, 'sawtooth', 0.07); tone(150, 0.25, 'sawtooth', 0.06, 0.1); },
    pop: function () { tone(880, 0.05, 'square', 0.08); tone(1320, 0.07, 'triangle', 0.1, 0.03); },
    flip: function () { tone(520, 0.05, 'triangle', 0.08); },
    win: function () { [523, 659, 784, 1046, 1318].forEach(function (f, i) { tone(f, 0.18, 'triangle', 0.14, i * 0.11); }); },
    tick: function () { tone(1200, 0.02, 'square', 0.03); },
    // צלילים נוספים למשחקי האקשן
    jump: function () { tone(300, 0.16, 'square', 0.05, 0, 760); },
    hit: function () { var n = Date.now(); if (n - lastHit < 60) return; lastHit = n; tone(1400, 0.04, 'triangle', 0.035); },
    sparkle: function () { tone(1046, 0.08, 'triangle', 0.09); tone(1568, 0.12, 'triangle', 0.07, 0.05); },
    place: function () { tone(196, 0.09, 'triangle', 0.16); tone(294, 0.07, 'sine', 0.08, 0.02); },
    perfect: function (n) { var f = 523 * Math.pow(2, Math.min(n || 0, 12) / 12); tone(f, 0.12, 'triangle', 0.13); tone(f * 1.5, 0.16, 'triangle', 0.1, 0.07); },
    power: function () { [392, 523, 659, 784].forEach(function (f, i) { tone(f, 0.1, 'square', 0.05, i * 0.06); }); },
    over: function () { [523, 392, 330, 262].forEach(function (f, i) { tone(f, 0.22, 'triangle', 0.12, i * 0.16); }); },
  };

  function bindSound(btn) {
    if (!btn) return;
    function paint() { btn.textContent = muted ? '🔇' : '🔊'; btn.setAttribute('aria-label', muted ? 'הפעלת צלילים' : 'השתקת צלילים'); }
    paint();
    btn.addEventListener('click', function () {
      muted = !muted;
      try { localStorage.setItem('kids-muted', muted ? '1' : '0'); } catch (e) { /* */ }
      paint();
      if (!muted) sfx.good();
    });
  }

  function reduced() { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }

  function confetti() {
    if (reduced()) return;
    var cv = document.getElementById('confetti');
    if (!cv) { cv = document.createElement('canvas'); cv.id = 'confetti'; document.body.appendChild(cv); }
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    var g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    var colors = ['#ffd23f', '#ff6b4a', '#2fb36d', '#2f80ff', '#7a5cff', '#ff5fa2'];
    var parts = [];
    for (var i = 0; i < 150; i++) {
      parts.push({ x: innerWidth / 2 + (Math.random() - 0.5) * 120, y: innerHeight * 0.35, vx: (Math.random() - 0.5) * 13, vy: -Math.random() * 13 - 4,
        s: 6 + Math.random() * 7, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: colors[i % colors.length] });
    }
    var start = performance.now();
    (function frame(now) {
      var t = (now - start) / 1000;
      g.clearRect(0, 0, innerWidth, innerHeight);
      parts.forEach(function (p) {
        p.vy += 0.38; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); g.restore();
      });
      if (t < 3.2) requestAnimationFrame(frame); else g.clearRect(0, 0, innerWidth, innerHeight);
    })(start);
  }

  function load(key, def) { try { var v = localStorage.getItem(key); return v == null ? def : JSON.parse(v); } catch (e) { return def; } }
  function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* */ } }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  // האם המשתמש מקליד עכשיו בשדה (כדי שמקשי המשחק לא יפריעו)
  function typing(e) {
    var t = e && e.target;
    if (!t || !t.tagName) return false;
    return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || !!t.isContentEditable;
  }
  // כשמשחק מתחיל – מורידים את הפוקוס מכפתור "מתחילים" (שלא יופעל שוב ברווח באמצע המשחק)
  function unfocus() { var a = document.activeElement; if (a && a !== document.body && a.blur) a.blur(); }
  function vibrate(ms) { if (!muted && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* */ } } }
  function fmt(n) { n = Math.round(Number(n) || 0); return n.toLocaleString('en-US'); }
  // מספר עם סימן (+10, −2) בתוך טקסט עברי – שיוצג נכון ולא "10+"
  function ltr(s) { return '⁦' + s + '⁩'; }

  document.addEventListener('DOMContentLoaded', function () { bindSound(document.getElementById('sound')); });

  return { sfx: sfx, confetti: confetti, load: load, save: save, shuffle: shuffle, pick: pick, audio: audio,
    reduced: reduced, typing: typing, vibrate: vibrate, fmt: fmt, ltr: ltr, unfocus: unfocus, isMuted: function () { return muted; } };
})();
