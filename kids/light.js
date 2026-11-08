// האור מנצח – משחק אקשן: נר קטן שולח קרני אור, וכל ענן חשוך שנפגע הופך לענן לבן ושמח
(function () {
  'use strict';
  var K = window.Kids, B = window.Board, GAME = 'light';
  var $ = function (id) { return document.getElementById(id); };
  var stage = $('stage'), cv = $('cv'), g = cv.getContext('2d');
  var bigBtn = $('big-light');
  var W = 0, H = 0, dpr = 1, GROUND = 0, PY = 0, SC = 1, U = 360;
  var REDUCED = K.reduced();
  var METER = 12, WAVE_LEN = 22;
  var st = null, mode = 'idle', raf = 0, last = 0;
  var keys = { left: false, right: false };
  var town = null, stars = [];

  var TYPES = {
    small: { r: 0.068, hp: 1, vy: [46, 70], pts: 10 },
    zig: { r: 0.072, hp: 1, vy: [56, 76], pts: 15, zig: true },
    storm: { r: 0.1, hp: 2, vy: [32, 44], pts: 25, storm: true },
    big: { r: 0.112, hp: 3, vy: [30, 42], pts: 30 },
  };
  var ITEMS = {
    oil: { msg: 'כד שמן! אור משולש 🏺' },
    heart: { msg: 'עוד לב! ❤️' },
    coin: { msg: 'מטבע לצדקה! ⁦+50⁩' },
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function mix(c1, c2, t) {
    var a = parseInt(c1.slice(1), 16), b = parseInt(c2.slice(1), 16);
    var r = Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
    var gg = Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
    var bl = Math.round((a & 255) * (1 - t) + (b & 255) * t);
    return 'rgb(' + r + ',' + gg + ',' + bl + ')';
  }
  function rr(x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function font(px) { g.font = '700 ' + Math.round(px) + 'px Fredoka, Rubik, Arial, sans-serif'; }

  // ------------------------------------------------------------ גודל ורקע
  function resize() {
    var r = stage.getBoundingClientRect();
    if (!r.width || !r.height) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var changed = W !== r.width || H !== r.height;
    W = r.width; H = r.height;
    var nw = Math.round(W * dpr), nh = Math.round(H * dpr);
    if (cv.width !== nw || cv.height !== nh) { cv.width = nw; cv.height = nh; } // שינוי גודל מנקה את הקנבס
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    GROUND = H - 46; PY = H - 70; SC = Math.max(0.8, H / 600); U = Math.min(W, 440);
    if (changed || !town) buildTown();
    if (!stars.length) for (var i = 0; i < 60; i++) stars.push({ x: Math.random(), y: Math.random() * 0.8, r: rnd(0.6, 1.8), ph: Math.random() * 6 });
    if (st) st.px = clamp(st.px, 18, W - 18);
    draw(); // מציירים מיד – שלא יהבהב פריים ריק
  }
  function buildTown() {
    var th = H - GROUND + 34;
    town = document.createElement('canvas');
    town.width = Math.round(W * dpr); town.height = Math.round(th * dpr);
    var t = town.getContext('2d');
    t.setTransform(dpr, 0, 0, dpr, 0, 0);
    var seed = 11;
    function rand() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
    var x = -8;
    while (x < W + 8) {
      var w = 38 + rand() * 34, h = 24 + rand() * 24, top = th - h;
      t.fillStyle = '#171b44';
      t.fillRect(x, top, w, h);
      if (rand() < 0.6) { t.beginPath(); t.moveTo(x - 3, top); t.lineTo(x + w / 2, top - 12 - rand() * 8); t.lineTo(x + w + 3, top); t.closePath(); t.fill(); }
      for (var wx = x + 7; wx < x + w - 9; wx += 13) {
        for (var wy = top + 6; wy < th - 8; wy += 12) {
          if (rand() < 0.55) { t.fillStyle = rand() < 0.5 ? '#ffd76a' : '#ffe9a8'; t.fillRect(wx, wy, 6, 7); }
        }
      }
      x += w + 2 + rand() * 6;
    }
  }

  // ------------------------------------------------------------ מצב
  function newGame() {
    st = { t: 0, score: 0, lives: 3, wave: 1, waveT: 0, spawnT: 0.6, fireT: 0, power: 0, meter: 0, combo: 0, comboT: 0, lit: 0,
      px: W / 2, inv: 0, shake: 0, flash: 0, clouds: [], beams: [], drops: [], items: [], parts: [], floats: [], hud: '' };
  }
  function speedMult() { return Math.min(2.1, 1 + (st.wave - 1) * 0.09) * SC; }

  function spawnCloud() {
    var w = st.wave, r = Math.random(), type;
    if (w === 1) type = r < 0.85 ? 'small' : 'big';
    else if (w === 2) type = r < 0.62 ? 'small' : r < 0.82 ? 'zig' : 'big';
    else if (w < 5) type = r < 0.45 ? 'small' : r < 0.65 ? 'zig' : r < 0.82 ? 'storm' : 'big';
    else type = r < 0.34 ? 'small' : r < 0.56 ? 'zig' : r < 0.78 ? 'storm' : 'big';
    var T = TYPES[type], rad = T.r * U;
    var x = rnd(rad + 6, W - rad - 6);
    st.clouds.push({ type: type, x: x, x0: x, y: -rad - 6, r: rad, hp: T.hp, max: T.hp, pts: T.pts, vy: rnd(T.vy[0], T.vy[1]) * speedMult(),
      zig: !!T.zig, storm: !!T.storm, amp: Math.min(rad * 1.6, (W - 2 * rad) / 3), ph: Math.random() * 6, age: 0, flash: 0, dropT: rnd(0.8, 1.6), bright: false });
    var c = st.clouds[st.clouds.length - 1];
    if (c.zig) c.x0 = clamp(x, c.amp + rad + 6, W - c.amp - rad - 6);
  }

  function fire() {
    var sp = -820 * SC, y = PY - 36;
    st.beams.push({ x: st.px, y: y, vx: 0, vy: sp });
    if (st.power > 0) {
      st.beams.push({ x: st.px - 4, y: y + 4, vx: sp * 0.22, vy: sp * 0.97 });
      st.beams.push({ x: st.px + 4, y: y + 4, vx: -sp * 0.22, vy: sp * 0.97 });
    }
  }

  function float(text, x, y, color, big) { st.floats.push({ text: text, x: x, y: y, c: color, t: 0, big: !!big }); }
  function burst(x, y, n, color) {
    if (REDUCED) n = Math.min(n, 4);
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, s = rnd(40, 170);
      st.parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: rnd(0.4, 0.8), c: color, r: rnd(1.5, 3.5) });
    }
    if (st.parts.length > 220) st.parts.splice(0, st.parts.length - 220);
  }

  function hitCloud(c) {
    c.hp--;
    c.flash = 0.1;
    K.sfx.hit();
    if (c.hp <= 0) transform(c, false);
  }
  // ענן חשוך הופך לענן של אור
  function transform(c, viaBig) {
    c.bright = true; c.bt = 0; c.drift = rnd(-30, 30);
    st.combo++; st.comboT = 1.5;
    var mult = Math.min(5, 1 + Math.floor(st.combo / 5));
    var pts = c.pts * mult;
    st.score += pts;
    st.lit++;
    if (!viaBig) st.meter = Math.min(METER, st.meter + 1);
    float(K.ltr('+' + pts + (mult > 1 ? ' ×' + mult : '')), c.x, c.y, mult > 1 ? '#ffd23f' : '#ffffff');
    burst(c.x, c.y, 12, '#ffe066');
    K.sfx.sparkle();
    if (!viaBig && Math.random() < 0.13) dropItem(c.x, c.y);
  }
  function dropItem(x, y) {
    var k = st.lives < 5 && Math.random() < 0.3 ? 'heart' : Math.random() < 0.55 ? 'oil' : 'coin';
    st.items.push({ k: k, x: x, y: y, vy: 105 * SC, t: 0 });
  }
  function hurt(msg) {
    if (st.inv > 0) return;
    st.lives--;
    st.inv = 1.4;
    st.combo = 0; st.comboT = 0;
    st.shake = REDUCED ? 0 : 0.35;
    K.sfx.bad(); K.vibrate(100);
    float(msg, W / 2, H * 0.45, '#ffb4a6', false);
    if (st.lives <= 0) gameOver();
  }
  function bigLight() {
    if (mode !== 'run' || st.meter < METER) return;
    st.meter = 0;
    st.flash = REDUCED ? 0 : 0.5;
    st.clouds.forEach(function (c) { if (!c.bright) { c.hp = 0; transform(c, true); } });
    st.drops.forEach(function (d) { burst(d.x, d.y, 3, '#ffe9a8'); });
    st.drops.length = 0;
    K.sfx.win();
    float('אור גדול! ✨', W / 2, H * 0.38, '#ffd23f', true);
    paintMeter();
  }

  // ------------------------------------------------------------ עדכון
  function update(dt) {
    var i, j;
    st.t += dt;
    var dir = (keys.left ? -1 : 0) + (keys.right ? 1 : 0);
    if (dir) st.px += dir * W * 1.05 * dt;
    st.px = clamp(st.px, 18, W - 18);
    if (st.inv > 0) st.inv -= dt;
    if (st.shake > 0) st.shake -= dt;
    if (st.flash > 0) st.flash -= dt;
    if (st.power > 0) st.power -= dt;
    if (st.comboT > 0) { st.comboT -= dt; if (st.comboT <= 0) st.combo = 0; }

    st.waveT += dt;
    if (st.waveT > WAVE_LEN) {
      st.wave++; st.waveT = 0; st.spawnT = 1.5;
      st.score += st.wave * 10;
      K.sfx.power();
      float('גל ' + st.wave + '! ' + K.ltr('+' + st.wave * 10), W / 2, H * 0.32, '#ffd23f', true);
    }
    st.spawnT -= dt;
    if (st.spawnT <= 0) { spawnCloud(); st.spawnT = Math.max(0.36, 1.25 - (st.wave - 1) * 0.1) * rnd(0.7, 1.3); }
    st.fireT -= dt;
    if (st.fireT <= 0) { fire(); st.fireT = st.power > 0 ? 0.15 : 0.21; }

    for (i = st.beams.length - 1; i >= 0; i--) {
      var b = st.beams[i];
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.y < -30 || b.x < -20 || b.x > W + 20) st.beams.splice(i, 1);
    }

    for (i = st.clouds.length - 1; i >= 0; i--) {
      var c = st.clouds[i];
      if (c.bright) {
        c.bt += dt; c.y -= 70 * dt; c.x += c.drift * dt;
        if (c.bt > 0.9) st.clouds.splice(i, 1);
        continue;
      }
      c.age += dt;
      c.y += c.vy * dt;
      if (c.zig) c.x = c.x0 + Math.sin(c.age * 2.2 + c.ph) * c.amp;
      if (c.flash > 0) c.flash -= dt;
      if (c.storm) {
        c.dropT -= dt;
        if (c.dropT <= 0 && c.y > 0 && c.y < GROUND - 110) { st.drops.push({ x: c.x, y: c.y + c.r * 0.5, vy: 190 * speedMult() }); c.dropT = rnd(1.5, 2.4); }
      }
      for (j = st.beams.length - 1; j >= 0; j--) {
        var bb = st.beams[j], dx = bb.x - c.x, dy = bb.y - c.y;
        if (dx * dx + dy * dy < c.r * c.r * 0.9) { st.beams.splice(j, 1); hitCloud(c); if (c.bright) break; }
      }
      if (!c.bright && c.y + c.r * 0.45 > GROUND) {
        st.clouds.splice(i, 1);
        burst(c.x, GROUND, 10, '#5b5f8f');
        hurt('החושך הגיע לבתים!');
        if (mode !== 'run') return;
      }
    }

    for (i = st.drops.length - 1; i >= 0; i--) {
      var d = st.drops[i], hit = false;
      d.y += d.vy * dt;
      for (j = st.beams.length - 1; j >= 0; j--) {
        var b3 = st.beams[j];
        if (Math.abs(b3.x - d.x) < 10 && Math.abs(b3.y - d.y) < 16) { st.beams.splice(j, 1); hit = true; break; }
      }
      if (hit) { st.drops.splice(i, 1); burst(d.x, d.y, 5, '#ffe9a8'); st.score += 2; continue; }
      if (Math.abs(d.x - st.px) < 15 && Math.abs(d.y - (PY - 10)) < 24) {
        st.drops.splice(i, 1);
        hurt('טיפת חושך! נזהרים');
        if (mode !== 'run') return;
        continue;
      }
      if (d.y > GROUND + 8) st.drops.splice(i, 1);
    }

    for (i = st.items.length - 1; i >= 0; i--) {
      var it = st.items[i];
      it.y += it.vy * dt; it.t += dt;
      if (Math.abs(it.x - st.px) < 32 && Math.abs(it.y - (PY - 14)) < 34) {
        st.items.splice(i, 1);
        if (it.k === 'oil') st.power = 8;
        else if (it.k === 'heart') st.lives = Math.min(5, st.lives + 1);
        else st.score += 50;
        K.sfx.power();
        float(ITEMS[it.k].msg, st.px, PY - 70, '#ffd23f');
        continue;
      }
      if (it.y > GROUND + 16) st.items.splice(i, 1);
    }

    for (i = st.parts.length - 1; i >= 0; i--) {
      var p = st.parts[i];
      p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 60 * dt;
      if (p.t > p.life) st.parts.splice(i, 1);
    }
    for (i = st.floats.length - 1; i >= 0; i--) {
      var f = st.floats[i];
      f.t += dt; f.y -= dt * 40;
      if (f.t > 1.2) st.floats.splice(i, 1);
    }
    updateHud();
  }

  // ------------------------------------------------------------ ציור
  function cloudShape(x, y, r) {
    g.beginPath();
    g.arc(x - r * 0.55, y + r * 0.12, r * 0.52, 0, Math.PI * 2);
    g.arc(x + r * 0.55, y + r * 0.14, r * 0.48, 0, Math.PI * 2);
    g.arc(x - r * 0.12, y - r * 0.22, r * 0.62, 0, Math.PI * 2);
    g.arc(x + r * 0.32, y - r * 0.08, r * 0.5, 0, Math.PI * 2);
    g.ellipse(x, y + r * 0.3, r * 0.98, r * 0.32, 0, 0, Math.PI * 2);
    g.fill();
  }
  function drawCloud(c) {
    var x = c.x, y = c.y, r = c.r;
    if (c.bright) {
      g.globalAlpha = Math.max(0, 1 - c.bt / 0.9);
      g.fillStyle = 'rgba(255,230,120,0.35)'; cloudShape(x, y, r * 1.12);
      g.fillStyle = '#ffffff'; cloudShape(x, y, r);
      g.strokeStyle = '#f0a500'; g.lineWidth = 2.2; g.lineCap = 'round';
      g.beginPath(); g.arc(x - r * 0.28, y - r * 0.05, r * 0.1, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
      g.beginPath(); g.arc(x + r * 0.28, y - r * 0.05, r * 0.1, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
      g.beginPath(); g.arc(x, y + r * 0.12, r * 0.2, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      g.globalAlpha = 1;
      return;
    }
    var lv = 1 - c.hp / c.max; // כמה הענן כבר התבהר
    var col = c.flash > 0 ? '#a9aee0' : mix(c.storm ? '#262a4c' : '#30345c', '#7a7fb4', lv * 0.8);
    g.fillStyle = col;
    cloudShape(x, y, r);
    g.fillStyle = 'rgba(0,0,0,.18)';
    g.beginPath(); g.ellipse(x, y + r * 0.36, r * 0.9, r * 0.2, 0, 0, Math.PI * 2); g.fill();
    // פרצוף מנומנם (כשנפגע הוא הופך לשמח)
    g.strokeStyle = '#c9cdf2'; g.lineWidth = 2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x - r * 0.38, y - r * 0.1); g.lineTo(x - r * 0.16, y - r * 0.04); g.stroke();
    g.beginPath(); g.moveTo(x + r * 0.38, y - r * 0.1); g.lineTo(x + r * 0.16, y - r * 0.04); g.stroke();
    g.beginPath(); g.moveTo(x - r * 0.12, y + r * 0.2); g.lineTo(x + r * 0.12, y + r * 0.2); g.stroke();
    if (c.storm) {
      g.fillStyle = '#ffd23f';
      g.beginPath(); g.moveTo(x + r * 0.05, y + r * 0.42); g.lineTo(x - r * 0.12, y + r * 0.68); g.lineTo(x + r * 0.02, y + r * 0.66); g.lineTo(x - r * 0.08, y + r * 0.9); g.lineTo(x + r * 0.16, y + r * 0.58); g.lineTo(x + r * 0.02, y + r * 0.6); g.closePath(); g.fill();
    }
    if (c.max > 1) {
      for (var k = 0; k < c.max; k++) {
        g.fillStyle = k < c.hp ? '#c9cdf2' : 'rgba(255,255,255,.18)';
        g.beginPath(); g.arc(x + (k - (c.max - 1) / 2) * 9, y - r * 0.82, 3, 0, Math.PI * 2); g.fill();
      }
    }
  }
  function drawCandle(x, y) {
    var pulse = Math.sin((st ? st.t : performance.now() / 1000) * 6) * 5;
    var power = st && st.power > 0;
    var gr = g.createRadialGradient(x, y - 32, 4, x, y - 32, (power ? 92 : 70) + pulse);
    gr.addColorStop(0, power ? 'rgba(255,210,80,0.6)' : 'rgba(255,230,150,0.42)');
    gr.addColorStop(1, 'rgba(255,230,150,0)');
    g.fillStyle = gr;
    g.fillRect(x - 110, y - 140, 220, 200);
    g.fillStyle = '#d9ad2b'; rr(x - 19, y + 8, 38, 9, 4); g.fill();
    g.fillStyle = '#ffffff'; rr(x - 9, y - 22, 18, 32, 4); g.fill();
    g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(x + 3, y - 20, 5, 28);
    g.strokeStyle = '#333'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y - 22); g.lineTo(x, y - 27); g.stroke();
    var fl = 1 + Math.sin((st ? st.t : 0) * 22) * 0.07;
    drop(x, y - 27, 9 * fl, 21 * fl, '#ff9f1c');
    drop(x, y - 27, 5 * fl, 12 * fl, '#ffe066');
  }
  function drop(x, baseY, w, h, color, rim) {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(x, baseY - h);
    g.bezierCurveTo(x + w, baseY - h * 0.45, x + w, baseY, x, baseY);
    g.bezierCurveTo(x - w, baseY, x - w, baseY - h * 0.45, x, baseY - h);
    g.fill();
    if (rim) { g.strokeStyle = rim; g.lineWidth = 2; g.stroke(); }
  }
  function drawItem(it) {
    var x = it.x, y = it.y + Math.sin(it.t * 5) * 3;
    g.fillStyle = 'rgba(255,230,140,.25)'; g.beginPath(); g.arc(x, y, 20, 0, Math.PI * 2); g.fill();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (it.k === 'coin') {
      g.fillStyle = '#f2b705'; g.beginPath(); g.arc(x, y, 14, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(x, y, 11, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#9a700c'; font(14); g.fillText('צ', x, y + 1);
    } else {
      g.font = '26px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
      g.fillText(it.k === 'oil' ? '🏺' : '❤️', x, y + 1);
    }
  }
  function draw() {
    if (!W) return;
    var t = st ? st.t : performance.now() / 1000;
    var dawn = st ? Math.min(1, st.lit / 160) : 0; // ככל שהופכים יותר עננים – השמיים מאירים
    var sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, mix('#0d1140', '#3c4fae', dawn));
    sky.addColorStop(1, mix('#2a2f78', '#b8a6e8', dawn));
    g.save();
    if (st && st.shake > 0) g.translate((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 4);
    g.fillStyle = sky; g.fillRect(-10, -10, W + 20, H + 20);
    stars.forEach(function (s) {
      g.globalAlpha = (0.45 + 0.4 * Math.sin(t * 2 + s.ph)) * (1 - dawn * 0.8);
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2); g.fill();
    });
    g.globalAlpha = 1;
    if (st) {
      st.clouds.forEach(drawCloud);
      st.drops.forEach(function (d) { drop(d.x, d.y + 8, 7, 18, '#0c0e2a', '#a7adf0'); });
      st.items.forEach(drawItem);
      // קרני האור
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(255,214,90,0.35)'; g.lineWidth = 9; g.beginPath();
      st.beams.forEach(function (b) { g.moveTo(b.x, b.y); g.lineTo(b.x - b.vx * 0.026, b.y - b.vy * 0.026); });
      g.stroke();
      g.strokeStyle = '#fff6c8'; g.lineWidth = 3.5; g.beginPath();
      st.beams.forEach(function (b) { g.moveTo(b.x, b.y); g.lineTo(b.x - b.vx * 0.026, b.y - b.vy * 0.026); });
      g.stroke();
      st.parts.forEach(function (p) {
        g.globalAlpha = Math.max(0, 1 - p.t / p.life);
        g.fillStyle = p.c; g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill();
      });
      g.globalAlpha = 1;
    }
    if (town) g.drawImage(town, 0, GROUND - 34, W, H - GROUND + 34);
    var visible = !st || st.inv <= 0 || Math.floor(st.inv * 10) % 2 === 0;
    if (visible) drawCandle(st ? st.px : W / 2, PY);
    if (st) {
      st.floats.forEach(function (f) {
        g.globalAlpha = Math.max(0, 1 - f.t / 1.2);
        font(f.big ? 34 : 19); g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = 5; g.strokeStyle = 'rgba(10,12,40,.85)'; g.strokeText(f.text, f.x, f.y);
        g.fillStyle = f.c; g.fillText(f.text, f.x, f.y);
      });
      g.globalAlpha = 1;
      if (st.combo >= 5) {
        font(17); g.textAlign = 'center'; g.fillStyle = '#ffd23f';
        g.fillText('רצף ' + st.combo + ' · ניקוד ×' + Math.min(5, 1 + Math.floor(st.combo / 5)), W / 2, 22);
      }
      if (st.power > 0) {
        font(15); g.textAlign = 'center'; g.fillStyle = '#ffe9a8';
        g.fillText('🏺 אור משולש: ' + Math.ceil(st.power), W / 2, st.combo >= 5 ? 44 : 22);
      }
      if (st.flash > 0) { g.globalAlpha = Math.min(0.75, st.flash * 1.5); g.fillStyle = '#fffbe6'; g.fillRect(-10, -10, W + 20, H + 20); g.globalAlpha = 1; }
    }
    g.restore();
  }

  // ------------------------------------------------------------ HUD
  function paintMeter() {
    var full = st && st.meter >= METER && mode === 'run';
    bigBtn.style.setProperty('--fill', (st ? Math.round(st.meter / METER * 100) : 0) + '%');
    bigBtn.disabled = !full;
    bigBtn.classList.toggle('ready', !!full);
    bigBtn.textContent = full ? '✨ אור גדול! לחצו עכשיו' : '✨ אור גדול – אוספים אור…';
  }
  function updateHud() {
    var key = st.score + '|' + st.wave + '|' + st.lives + '|' + st.meter;
    if (key === st.hud) return;
    st.hud = key;
    $('score').textContent = K.fmt(st.score);
    $('wave').textContent = st.wave;
    var l = Math.max(0, st.lives);
    $('lives').textContent = '❤️'.repeat(l) + (l < 3 ? '🤍'.repeat(3 - l) : '');
    $('lives').setAttribute('aria-label', l + ' חיים');
    paintMeter();
  }

  // ------------------------------------------------------------ לולאה ומצבים
  function loop(now) {
    raf = 0;
    var dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    if (mode === 'run') update(dt);
    draw();
    if (mode === 'run') raf = requestAnimationFrame(loop);
  }
  function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); } }
  function start() {
    K.audio();
    B.close();
    K.unfocus();
    newGame();
    mode = 'run';
    $('ov-start').hidden = true; $('ov-pause').hidden = true;
    updateHud();
    kick();
  }
  function gameOver() {
    mode = 'over';
    K.sfx.over();
    paintMeter();
    var sc = st.score, lit = st.lit, wave = st.wave;
    var isNew = sc > B.best(GAME);
    setTimeout(function () {
      B.showResult({
        game: GAME, score: sc,
        title: isNew ? 'שיא חדש!' : K.pick(['כל הכבוד!', 'יישר כוח!', 'איזה אור!']),
        text: 'הפכתם ' + lit + ' עננים חשוכים לאור והגעתם לגל ' + wave + '. מעט אור דוחה הרבה חושך!',
        stars: sc >= 2000 ? 3 : sc >= 700 ? 2 : 1,
        onAgain: start,
      });
      B.startLine(GAME, $('best-start'));
    }, 700);
  }
  function pause() {
    if (mode !== 'run') return;
    mode = 'pause';
    keys.left = keys.right = false;
    $('ov-pause').hidden = false;
    paintMeter();
  }
  function resume() {
    if (mode !== 'pause') return;
    mode = 'run';
    $('ov-pause').hidden = true;
    paintMeter();
    kick();
  }

  // ------------------------------------------------------------ שליטה
  var drag = null;
  cv.addEventListener('pointerdown', function (e) {
    if (mode !== 'run') return;
    e.preventDefault();
    drag = { id: e.pointerId, x: e.clientX };
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* */ }
  });
  cv.addEventListener('pointermove', function (e) {
    if (mode !== 'run') return;
    if (!drag && e.pointerType === 'mouse') {
      var r = cv.getBoundingClientRect();
      st.px = clamp(e.clientX - r.left, 18, W - 18);
      return;
    }
    if (!drag || e.pointerId !== drag.id) return;
    st.px = clamp(st.px + (e.clientX - drag.x) * 1.3, 18, W - 18);
    drag.x = e.clientX;
  });
  function endDrag(e) { if (drag && e.pointerId === drag.id) drag = null; }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  function keySide(k) {
    if (k === 'ArrowLeft' || k === 'a' || k === 'A' || k === 'ש') return 'left';
    if (k === 'ArrowRight' || k === 'd' || k === 'D' || k === 'ג') return 'right';
    return '';
  }
  document.addEventListener('keydown', function (e) {
    if (B.isOpen() || K.typing(e)) return;
    var side = keySide(e.key);
    if (side) { keys[side] = true; e.preventDefault(); return; }
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'Enter') {
      if (mode === 'run') { if (e.key !== 'Enter') { bigLight(); e.preventDefault(); } }
      else if (!$('ov-start').hidden) { start(); e.preventDefault(); }
      else if (mode === 'pause') { resume(); e.preventDefault(); }
    } else if (e.key === 'p' || e.key === 'P' || e.key === 'פ' || e.key === 'Escape') {
      if (mode === 'run') pause(); else resume();
    }
  });
  document.addEventListener('keyup', function (e) { var side = keySide(e.key); if (side) keys[side] = false; });
  window.addEventListener('blur', function () { keys.left = keys.right = false; });

  bigBtn.addEventListener('click', bigLight);
  $('start').addEventListener('click', start);
  $('resume').addEventListener('click', resume);
  $('pause-btn').addEventListener('click', function () { if (mode === 'run') pause(); else resume(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) pause(); });
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(function () { resize(); }).observe(stage);

  B.startLine(GAME, $('best-start'));
  resize();
  paintMeter();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (mode !== 'run') draw(); });
})();
