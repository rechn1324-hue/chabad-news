// בונים את בית המקדש – משחק הנחת אבנים בתלת־ממד (three.js r128, מצלמה איזומטרית)
(function () {
  'use strict';
  var K = window.Kids, B = window.Board, GAME = 'tower';
  var $ = function (id) { return document.getElementById(id); };
  var stage = $('stage');

  function fail(title, text) {
    $('fail-title').textContent = title;
    $('fail-text').textContent = text;
    $('fail').hidden = false;
    $('ov-start').hidden = true;
  }
  if (!window.THREE) { fail('המשחק לא נטען', 'לא הצלחנו לטעון את המנוע התלת־ממדי. בדקו את החיבור לאינטרנט ורעננו את הדף.'); return; }
  var T = window.THREE;
  var renderer = null;
  try { renderer = new T.WebGLRenderer({ antialias: (window.devicePixelRatio || 1) < 1.5, alpha: true }); } catch (e) { renderer = null; }
  if (!renderer) { fail('המכשיר לא תומך בתלת־ממד', 'הדפדפן הזה לא מצליח להציג משחקי תלת־ממד. נסו משחק אחר מאיזור הילדים!'); return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  var canvas = renderer.domElement;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'בניין אבנים בתלת־ממד');
  stage.insertBefore(canvas, stage.firstChild);
  var REDUCED = K.reduced();

  // ------------------------------------------------------------ סצנה
  var BASE = 3.2, LH = 0.62, RANGE = 4.2, TOL = 0.13;
  var scene = new T.Scene();
  var camera = new T.OrthographicCamera(-5, 5, 5, -5, 0.1, 400);
  scene.add(new T.HemisphereLight(0xffffff, 0x9d917a, 0.6));
  var sun = new T.DirectionalLight(0xffffff, 0.58);
  sun.position.set(5, 12, 3);
  scene.add(sun);
  scene.add(sun.target);

  // אבן ירושלמית עם שוליים מסותתים (כמו האבנים של הכותל)
  function canvasTex(w, h, draw) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    return new T.CanvasTexture(c);
  }
  var stoneTex = canvasTex(128, 128, function (g, w, h) {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    for (var i = 0; i < 700; i++) {
      var v = 190 + Math.floor(Math.random() * 60);
      g.fillStyle = 'rgba(' + v + ',' + v + ',' + (v - 10) + ',0.35)';
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    g.strokeStyle = 'rgba(110,90,60,0.4)'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 2; g.strokeRect(13, 13, w - 26, h - 26);
  });

  var ground = new T.Mesh(new T.CylinderGeometry(11, 11, 0.4, 40), new T.MeshLambertMaterial({ color: 0x9fd07c }));
  ground.position.y = -2.6;
  scene.add(ground);
  var mount = new T.Mesh(new T.BoxGeometry(7.2, 2.2, 7.2), new T.MeshLambertMaterial({ color: 0xe2d3ae, map: stoneTex }));
  mount.position.y = -1.1;
  scene.add(mount);
  var step2 = new T.Mesh(new T.BoxGeometry(9, 0.6, 9), new T.MeshLambertMaterial({ color: 0xd6c69e, map: stoneTex }));
  step2.position.y = -2.1;
  scene.add(step2);

  function layerColor(i) {
    if (i > 0 && i % 10 === 0) return new T.Color('#f2c14e');
    var c = new T.Color();
    c.setHSL((36 + 8 * Math.sin(i * 0.55)) / 360, 0.5 + 0.12 * Math.sin(i * 0.31), 0.67 + 0.05 * Math.cos(i * 0.47));
    return c;
  }
  function makeBlock(w, d, x, y, z, i) {
    var m = new T.Mesh(new T.BoxGeometry(w, LH, d), new T.MeshLambertMaterial({ color: layerColor(i), map: stoneTex }));
    m.position.set(x, y, z);
    scene.add(m);
    return m;
  }
  function dispose(m) {
    scene.remove(m);
    if (m.geometry) m.geometry.dispose();
    if (m.material) m.material.dispose();
  }

  // ------------------------------------------------------------ מצב המשחק
  var FACTS = [
    'בית המקדש הראשון נבנה בימי שלמה המלך.',
    'בית המקדש עמד בירושלים, על הר המוריה.',
    'שלוש פעמים בשנה עלו לרגל לבית המקדש: בפסח, בשבועות ובסוכות.',
    'את המנורה בבית המקדש הדליקו בשמן זית זך.',
    'הכותל המערבי הוא חלק מהחומה של הר הבית.',
    'בכל יום מתפללים: ״שיבנה בית המקדש במהרה בימינו״.',
    'הרמב״ם כותב שהמלך המשיח יבנה את בית המקדש.',
  ];
  var stack = [], moving = null, chunks = [], rings = [];
  var st = null, mode = 'idle', lastResult = null;
  var cam = { y: 1.2, view: 13, focus: 1.2, target: 13, az: Math.PI / 4 };

  function baseView() {
    var a = (stage.clientWidth || 1) / (stage.clientHeight || 1);
    return Math.max(12, 8.6 / a);
  }
  function clearWorld() {
    stack.forEach(function (b) { dispose(b.m); });
    chunks.forEach(function (c) { dispose(c.m); });
    rings.forEach(function (r) { dispose(r.m); });
    if (moving) dispose(moving.m);
    stack = []; chunks = []; rings = []; moving = null;
  }
  function topY() { return stack.length * LH; }

  function newGame() {
    clearWorld();
    st = { n: 0, combo: 0, maxCombo: 0, perfects: 0, over: false, overT: 0, shownResult: false };
    stack.push({ m: makeBlock(BASE, BASE, 0, LH / 2, 0, 0), x: 0, z: 0, w: BASE, d: BASE });
    spawnMoving();
    cam.focus = topY() + 0.6;
    cam.target = baseView();
    paintSky(0);
    $('height').textContent = '0';
  }
  function speed() { return Math.min(8.5, 3.1 + st.n * 0.1); }
  function spawnMoving() {
    var top = stack[stack.length - 1], i = stack.length;
    var axis = i % 2 === 1 ? 'x' : 'z';
    var from = Math.random() < 0.5 ? -RANGE : RANGE;
    var x = axis === 'x' ? top.x + from : top.x, z = axis === 'z' ? top.z + from : top.z;
    moving = { m: makeBlock(top.w, top.d, x, i * LH + LH / 2, z, i), axis: axis, pos: from, dir: from < 0 ? 1 : -1, w: top.w, d: top.d, i: i };
  }

  function addChunk(w, d, x, y, z, i, axis, s) {
    var m = makeBlock(w, d, x, y, z, i);
    chunks.push({ m: m, vy: 0, vx: axis === 'x' ? s * 1.4 : 0, vz: axis === 'z' ? s * 1.4 : 0, rx: axis === 'z' ? s * 2.6 : 0, rz: axis === 'x' ? -s * 2.6 : 0 });
  }
  function addRing(b) {
    var m = new T.Mesh(new T.BoxGeometry(b.w + 0.25, 0.05, b.d + 0.25), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
    m.position.set(b.x, b.m.position.y - LH / 2 + 0.03, b.z);
    scene.add(m);
    rings.push({ m: m, t: 0 });
  }

  function place() {
    if (mode !== 'run' || !moving) return;
    var top = stack[stack.length - 1], mv = moving, ax = mv.axis;
    var delta = mv.pos, size = ax === 'x' ? mv.w : mv.d, over = size - Math.abs(delta);
    moving = null;
    if (over <= 0) {
      chunks.push({ m: mv.m, vy: 0, vx: ax === 'x' ? Math.sign(delta) * 1.6 : 0, vz: ax === 'z' ? Math.sign(delta) * 1.6 : 0, rx: ax === 'z' ? 2.4 : 0, rz: ax === 'x' ? -2.4 : 0 });
      lose();
      return;
    }
    var nx = top.x, nz = top.z, nw = mv.w, nd = mv.d, perfect = Math.abs(delta) <= TOL;
    if (perfect) {
      st.combo++; st.perfects++;
      st.maxCombo = Math.max(st.maxCombo, st.combo);
      if (st.combo >= 3) { nw = Math.min(BASE, nw + 0.14); nd = Math.min(BASE, nd + 0.14); }
      K.sfx.perfect(st.combo);
      showCombo(st.combo >= 3 ? '✨ מושלם ×' + st.combo + ' – האבן גדלה!' : '✨ מושלם!' + (st.combo > 1 ? ' ×' + st.combo : ''));
    } else {
      st.combo = 0;
      var cut = Math.abs(delta), s = delta > 0 ? 1 : -1;
      if (ax === 'x') {
        nw = over; nx = top.x + delta / 2;
        addChunk(cut, mv.d, nx + s * (over / 2 + cut / 2), mv.m.position.y, top.z, mv.i, ax, s);
      } else {
        nd = over; nz = top.z + delta / 2;
        addChunk(mv.w, cut, top.x, mv.m.position.y, nz + s * (over / 2 + cut / 2), mv.i, ax, s);
      }
      K.sfx.place();
    }
    mv.m.geometry.dispose();
    mv.m.geometry = new T.BoxGeometry(nw, LH, nd);
    mv.m.position.set(nx, mv.m.position.y, nz);
    var b = { m: mv.m, x: nx, z: nz, w: nw, d: nd };
    stack.push(b);
    if (perfect) addRing(b);
    st.n++;
    $('height').textContent = st.n;
    if (st.n % 10 === 0) { K.sfx.win(); toast('🎉 ' + st.n + ' אבנים! ' + FACTS[(st.n / 10 - 1) % FACTS.length], 3200); }
    paintSky(st.n);
    cam.focus = topY() + 0.6;
    spawnMoving();
  }

  function lose() {
    mode = 'over';
    st.over = true;
    K.sfx.over();
    K.vibrate(120);
    var h = topY();
    cam.focus = Math.max(0.6, h / 2);
    cam.target = Math.max(baseView(), h * 1.35 + 6);
    var n = st.n;
    var isNew = n > B.best(GAME);
    lastResult = {
      game: GAME, score: n, unit: 'אבנים',
      title: isNew ? 'שיא חדש!' : n >= 10 ? K.pick(['בנייה מרשימה!', 'יישר כוח!', 'כל הכבוד!']) : 'עוד ניסיון?',
      text: 'הנחתם ' + n + ' אבנים' + (st.perfects ? ', מתוכן ' + st.perfects + ' בדיוק מושלם' : '') + '. ״שיבנה בית המקדש במהרה בימינו״!',
      stars: n >= 40 ? 3 : n >= 20 ? 2 : 1,
      onAgain: start,
      extra: [{ label: '👀 להסתכל על הבניין', onClick: showView }],
    };
    setTimeout(function () {
      if (mode !== 'over') return;
      B.showResult(lastResult);
      B.startLine(GAME, $('best-start'));
    }, 1500);
  }
  function showView() {
    mode = 'view';
    $('viewbar').hidden = false;
    kick();
  }

  // ------------------------------------------------------------ תצוגה
  var toastEl = $('toast'), toastT = 0, comboEl = $('combo'), comboT = 0;
  function toast(text, ms) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove('show'); }, ms || 1400);
  }
  function showCombo(text) {
    comboEl.textContent = text;
    comboEl.classList.add('show');
    clearTimeout(comboT);
    comboT = setTimeout(function () { comboEl.classList.remove('show'); }, 900);
  }
  function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
  function mix(a, b, t) { var x = hex(a), y = hex(b); return 'rgb(' + x.map(function (v, i) { return Math.round(v + (y[i] - v) * t); }).join(',') + ')'; }
  // ככל שבונים גבוה יותר – השמיים עוברים מיום לשקיעה ולערב
  var SKY = [ // [אבנים, צבע למעלה, צבע למטה]
    [0, '#6fbcff', '#dff2ff'], [20, '#6fbcff', '#dff2ff'], [32, '#b8a3ff', '#ffd9ec'],
    [44, '#ff9a76', '#ffe2a8'], [58, '#3a3f9a', '#c58ad0'], [70, '#1d2266', '#5d4fa6'],
  ];
  function paintSky(n) {
    var a = SKY[0], b = SKY[SKY.length - 1];
    for (var i = 0; i < SKY.length - 1; i++) { if (n >= SKY[i][0] && n <= SKY[i + 1][0]) { a = SKY[i]; b = SKY[i + 1]; break; } }
    var t = n >= b[0] ? 1 : (n - a[0]) / Math.max(1, b[0] - a[0]);
    stage.style.background = 'linear-gradient(180deg,' + mix(a[1], b[1], t) + ',' + mix(a[2], b[2], t) + ')';
  }

  var sizeW = 0, sizeH = 0;
  function resize() {
    var w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    if (w !== sizeW || h !== sizeH) { renderer.setSize(w, h, false); sizeW = w; sizeH = h; } // שינוי גודל מנקה את התמונה
    if (mode !== 'over' && mode !== 'view') cam.target = baseView();
    render();
  }
  function render() {
    var w = stage.clientWidth || 1, h = stage.clientHeight || 1, a = w / h;
    camera.left = -cam.view * a / 2; camera.right = cam.view * a / 2;
    camera.top = cam.view / 2; camera.bottom = -cam.view / 2;
    camera.updateProjectionMatrix();
    camera.position.set(Math.sin(cam.az) * 14, cam.y + 10, Math.cos(cam.az) * 14);
    camera.lookAt(0, cam.y, 0);
    sun.position.set(5, cam.y + 12, 3);
    sun.target.position.set(0, cam.y, 0);
    renderer.render(scene, camera);
  }

  function update(dt) {
    if (moving && mode === 'run') {
      var top = stack[stack.length - 1];
      moving.pos += moving.dir * speed() * dt;
      if (moving.pos > RANGE) { moving.pos = RANGE; moving.dir = -1; }
      else if (moving.pos < -RANGE) { moving.pos = -RANGE; moving.dir = 1; }
      if (moving.axis === 'x') moving.m.position.x = top.x + moving.pos; else moving.m.position.z = top.z + moving.pos;
    }
    for (var i = chunks.length - 1; i >= 0; i--) {
      var c = chunks[i];
      c.vy -= 22 * dt;
      c.m.position.x += c.vx * dt; c.m.position.y += c.vy * dt; c.m.position.z += c.vz * dt;
      c.m.rotation.x += c.rx * dt; c.m.rotation.z += c.rz * dt;
      if (c.m.position.y < -12) { dispose(c.m); chunks.splice(i, 1); }
    }
    for (var j = rings.length - 1; j >= 0; j--) {
      var r = rings[j];
      r.t += dt;
      var s = 1 + r.t * 0.9;
      r.m.scale.set(s, 1, s);
      r.m.material.opacity = Math.max(0, 0.85 - r.t * 1.9);
      if (r.t > 0.45) { dispose(r.m); rings.splice(j, 1); }
    }
    var k = Math.min(1, dt * 4);
    cam.y += (cam.focus - cam.y) * k;
    cam.view += (cam.target - cam.view) * k;
    if (mode === 'idle' || mode === 'view') { if (!REDUCED) cam.az += dt * 0.35; }
    else cam.az += (Math.PI / 4 - cam.az) * k * 0.5;
    if (mode === 'over') st.overT += dt;
  }

  var raf = 0, last = 0;
  function frame(now) {
    raf = 0;
    var dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    if (mode !== 'pause') update(dt);
    render();
    var anim = chunks.length || rings.length;
    var more = mode === 'run' || ((mode === 'idle' || mode === 'view') && !document.hidden) || (mode === 'over' && (st.overT < 2 || anim));
    if (more) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }

  function start() {
    K.audio();
    B.close();
    K.unfocus();
    newGame();
    cam.az = Math.PI / 4;
    mode = 'run';
    $('ov-start').hidden = true; $('ov-pause').hidden = true; $('viewbar').hidden = true;
    kick();
  }
  function pause() {
    if (mode !== 'run') return;
    mode = 'pause';
    $('ov-pause').hidden = false;
  }
  function resume() {
    if (mode !== 'pause') return;
    mode = 'run';
    $('ov-pause').hidden = true;
    kick();
  }

  // ------------------------------------------------------------ שליטה
  canvas.addEventListener('pointerdown', function (e) {
    if (mode !== 'run') return;
    e.preventDefault();
    place();
  });
  document.addEventListener('keydown', function (e) {
    if (B.isOpen() || K.typing(e)) return;
    var k = e.key;
    if (k === ' ' || k === 'Enter' || k === 'ArrowDown') {
      if (e.target && e.target.tagName === 'BUTTON' && e.target.offsetParent !== null && k !== 'ArrowDown') return; // כפתור גלוי בפוקוס יטפל בעצמו
      e.preventDefault();
      if (mode === 'run') place();
      else if (!$('ov-start').hidden && $('fail').hidden) start();
      else if (mode === 'pause') resume();
    } else if (k === 'p' || k === 'P' || k === 'פ' || k === 'Escape') {
      if (mode === 'run') pause(); else resume();
    }
  });
  $('start').addEventListener('click', start);
  $('resume').addEventListener('click', resume);
  $('pause-btn').addEventListener('click', function () { if (mode === 'run') pause(); else resume(); });
  $('view-again').addEventListener('click', start);
  $('view-results').addEventListener('click', function () {
    if (!lastResult) return;
    var o = Object.assign({}, lastResult, { record: false, title: 'התוצאות שלכם' });
    $('viewbar').hidden = true;
    mode = 'over';
    B.showResult(o);
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) pause();
    else if (mode === 'idle' || mode === 'view') kick();
  });
  canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); pause(); });
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(function () { resize(); }).observe(stage);

  // מסך פתיחה: מגדל קטן שמסתובב לאט מאחורי ההוראות
  newGame();
  for (var demo = 1; demo <= 6; demo++) {
    var prev = stack[stack.length - 1];
    dispose(moving.m); moving = null;
    var off = (demo % 2 ? 0.25 : -0.2);
    stack.push({ m: makeBlock(prev.w, prev.d, prev.x + (demo % 2 ? off : 0), demo * LH + LH / 2, prev.z + (demo % 2 ? 0 : off), demo), x: prev.x, z: prev.z, w: prev.w, d: prev.d });
    spawnMoving();
  }
  dispose(moving.m); moving = null;
  cam.focus = cam.y = topY() / 2 + 0.5;
  mode = 'idle';
  B.startLine(GAME, $('best-start'));
  resize();
  kick();
})();
