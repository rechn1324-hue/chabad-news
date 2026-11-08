// טנק המבצעים 3D – ריצה אינסופית ברחובות העיר (three.js r128, גלובלי THREE)
// עיצוב "Low poly": צורות פשוטות, תאורה פשוטה ורזולוציה מוגבלת – כדי שירוץ טוב גם בטלפונים פשוטים.
(function () {
  'use strict';
  var K = window.Kids, B = window.Board;
  var GAME = 'tank3d';
  var $ = function (id) { return document.getElementById(id); };
  var stage = $('stage');

  function fail(title, text) {
    $('fail-title').textContent = title;
    $('fail-text').textContent = text;
    $('fail').hidden = false;
    $('ov-start').hidden = true;
    var pad = document.querySelector('.pad');
    if (pad) pad.hidden = true;
  }
  if (!window.THREE) {
    fail('המשחק לא נטען', 'לא הצלחנו לטעון את המנוע התלת־ממדי. בדקו את החיבור לאינטרנט ורעננו את הדף.');
    return;
  }
  var T = window.THREE;
  var renderer = null;
  try {
    renderer = new T.WebGLRenderer({ antialias: (window.devicePixelRatio || 1) < 1.5, alpha: true, powerPreference: 'high-performance' });
  } catch (e) { renderer = null; }
  if (!renderer) {
    fail('המכשיר לא תומך בתלת־ממד', 'הדפדפן הזה לא מצליח להציג משחקי תלת־ממד. אפשר לשחק בטנק המבצעים הרגיל!');
    return;
  }

  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0);
  var canvas = renderer.domElement;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'טנק המבצעים נוסע ברחוב בתלת־ממד');
  stage.insertBefore(canvas, stage.firstChild);
  var REDUCED = K.reduced();
  var ANISO = Math.min(4, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1);

  // ------------------------------------------------------------ העולם
  var LANE = 1.9, LANE_X = [-LANE, 0, LANE];
  var ROAD_HALF = LANE * 1.5 + 0.45;
  var FAR = 112, NEAR = 14, LEN = FAR + NEAR, MID = (NEAR - FAR) / 2;
  var FOG = 0xdff1ff;

  var scene = new T.Scene();
  scene.fog = new T.Fog(FOG, 42, FAR - 4);
  var camera = new T.PerspectiveCamera(60, 1, 0.5, FAR + 20);
  scene.add(new T.HemisphereLight(0xffffff, 0x95a3c4, 0.92));
  var sun = new T.DirectionalLight(0xffffff, 0.62);
  sun.position.set(-6, 12, 7);
  scene.add(sun);

  var mats = {};
  function lam(c) { return mats[c] || (mats[c] = new T.MeshLambertMaterial({ color: c })); }
  function flat(c) { var k = 'b' + c; return mats[k] || (mats[k] = new T.MeshBasicMaterial({ color: c })); }
  function mesh(geo, m, x, y, z, parent) {
    var o = new T.Mesh(geo, m);
    o.position.set(x || 0, y || 0, z || 0);
    if (parent) parent.add(o);
    return o;
  }

  // טקסטורות מציור (השלטים בעברית מצוירים מחדש כשהגופנים נטענים)
  var texts = [];
  function canvasTex(w, h, draw, isText) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d');
    draw(g, w, h);
    var t = new T.CanvasTexture(c);
    t.anisotropy = ANISO;
    if (isText) texts.push({ t: t, g: g, w: w, h: h, draw: draw });
    return t;
  }
  function label(text, bg, fg, w, h, size) {
    return canvasTex(w, h, function (g) {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      var sz = size;
      g.font = '700 ' + sz + 'px Fredoka, Rubik, Arial, sans-serif';
      while (g.measureText(text).width > w * 0.88 && sz > 10) { sz -= 4; g.font = '700 ' + sz + 'px Fredoka, Rubik, Arial, sans-serif'; }
      g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + sz * 0.05);
    }, true);
  }
  function redrawTexts() { texts.forEach(function (o) { o.g.clearRect(0, 0, o.w, o.h); o.draw(o.g, o.w, o.h); o.t.needsUpdate = true; }); }
  function radial(inner, outer) {
    return canvasTex(64, 64, function (g) {
      var gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, inner); gr.addColorStop(1, outer);
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    });
  }
  var glowTex = radial('rgba(255,236,140,0.9)', 'rgba(255,236,140,0)');
  var shadowTex = radial('rgba(20,30,60,0.5)', 'rgba(20,30,60,0)');

  // כביש עם קווי נתיבים שזזים
  var DASH = 5;
  var roadTex = canvasTex(256, 256, function (g, w, h) {
    g.fillStyle = '#5b6274'; g.fillRect(0, 0, w, h);
    for (var i = 0; i < 260; i++) { g.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.06).toFixed(3) + ')'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    g.fillStyle = '#ffffff';
    g.fillRect(w * 0.03, 0, w * 0.022, h); g.fillRect(w * 0.948, 0, w * 0.022, h);
    g.fillStyle = 'rgba(255,255,255,.88)';
    [(ROAD_HALF - LANE / 2) / (2 * ROAD_HALF), (ROAD_HALF + LANE / 2) / (2 * ROAD_HALF)].forEach(function (u) { g.fillRect(u * w - 3, 0, 6, h * 0.5); });
  });
  roadTex.wrapS = T.ClampToEdgeWrapping;
  roadTex.wrapT = T.RepeatWrapping;
  roadTex.repeat.set(1, LEN / DASH);
  var road = mesh(new T.PlaneGeometry(ROAD_HALF * 2, LEN), new T.MeshLambertMaterial({ map: roadTex }), 0, 0, MID, scene);
  road.rotation.x = -Math.PI / 2;
  var ground = mesh(new T.PlaneGeometry(240, LEN + 40), lam(0xa8d68b), 0, -0.06, MID, scene);
  ground.rotation.x = -Math.PI / 2;
  [-1, 1].forEach(function (sd) {
    mesh(new T.BoxGeometry(2.7, 0.22, LEN + 20), lam(0xdde2ec), sd * (ROAD_HALF + 1.35), 0.11, MID, scene);
    mesh(new T.BoxGeometry(0.2, 0.28, LEN + 20), lam(0xb3bccd), sd * (ROAD_HALF + 0.1), 0.14, MID, scene);
  });

  // בניינים עם חלונות (UV מותאם לגודל – חלון אחד לכל 1.7×2.1 יחידות)
  var winTex = canvasTex(64, 64, function (g) {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#6f8fbf'; g.fillRect(16, 12, 32, 38);
    g.fillStyle = '#a3c3ec'; g.fillRect(16, 12, 32, 13);
    g.fillStyle = 'rgba(0,0,0,.05)'; g.fillRect(0, 58, 64, 6);
  });
  winTex.wrapS = winTex.wrapT = T.RepeatWrapping;
  var bMats = [0xffd9a8, 0xf7b9a6, 0xbfe0ff, 0xc9efc0, 0xfff0a6, 0xe1d3ff, 0xfafafa, 0xf9cd92].map(function (c) {
    return new T.MeshLambertMaterial({ color: c, map: winTex });
  });
  function boxUV(w, h, d) {
    var geo = new T.BoxGeometry(w, h, d), uv = geo.attributes.uv;
    for (var f = 0; f < 6; f++) {
      var fw = f < 2 ? d : w;
      for (var i = 0; i < 4; i++) {
        var k = f * 4 + i;
        if (f === 2 || f === 3) uv.setXY(k, 0.04, 0.5);
        else uv.setXY(k, uv.getX(k) * Math.max(1, Math.round(fw / 1.7)), uv.getY(k) * Math.max(1, Math.round(h / 2.1)));
      }
    }
    uv.needsUpdate = true;
    return geo;
  }
  var bGeos = [];
  for (var bi = 0; bi < 12; bi++) {
    var bw = 3.4 + (bi % 3) * 0.8, bd = 4.2 + ((bi * 7) % 4) * 0.6, bh = 4.2 + ((bi * 5) % 12) * 1.05;
    bGeos.push({ geo: boxUV(bw, bh, bd), w: bw, h: bh });
  }
  var SLOT = 7, NSLOT = Math.ceil((LEN + 8) / SLOT), LOOP_B = NSLOT * SLOT;
  var buildings = [];
  function restyle(b) {
    var v = K.pick(bGeos);
    b.m.geometry = v.geo;
    b.m.material = K.pick(bMats);
    b.m.position.x = b.side * (ROAD_HALF + 3.0 + v.w / 2 + Math.random() * 0.7);
    b.m.position.y = v.h / 2;
  }
  [-1, 1].forEach(function (sd) {
    for (var i = 0; i < NSLOT; i++) {
      var b = { m: new T.Mesh(bGeos[0].geo, bMats[0]), side: sd, base: i * SLOT + (sd > 0 ? SLOT / 2 : 0), last: -1 };
      restyle(b);
      scene.add(b.m);
      buildings.push(b);
    }
  });

  // פנסי רחוב ועצים על המדרכה
  var poleGeo = new T.CylinderGeometry(0.07, 0.09, 3.4, 6), armGeo = new T.BoxGeometry(0.55, 0.07, 0.07), headGeo = new T.BoxGeometry(0.42, 0.14, 0.28);
  var trunkGeo = new T.CylinderGeometry(0.13, 0.17, 1.2, 6), crownGeo = new T.IcosahedronGeometry(0.95, 0);
  var PSLOT = 16, NP = Math.ceil((LEN + 8) / PSLOT), LOOP_P = NP * PSLOT;
  var props = [];
  [-1, 1].forEach(function (sd) {
    for (var i = 0; i < NP; i++) {
      var g = new T.Group();
      if (i % 2 === 0) {
        mesh(poleGeo, lam(0x7b86a6), 0, 1.7, 0, g);
        mesh(armGeo, lam(0x7b86a6), -sd * 0.25, 3.38, 0, g);
        mesh(headGeo, flat(0xfff3c4), -sd * 0.5, 3.3, 0, g);
      } else {
        mesh(trunkGeo, lam(0x9a6b3f), 0, 0.6, 0, g);
        mesh(crownGeo, lam([0x5fb84a, 0x4ea83d, 0x6cc45a][i % 3]), 0, 1.75, 0, g);
      }
      g.position.x = sd * (ROAD_HALF + 1.95);
      scene.add(g);
      props.push({ m: g, base: i * PSLOT + (sd > 0 ? PSLOT / 2 : 0), last: -1 });
    }
  });

  // ------------------------------------------------------------ 770 – בית חיינו (עובר ליד הדרך מדי פעם)
  var B770 = (function () {
    var g = new T.Group();
    var D = 6, H = 7.2, Wd = 12;
    var facade = canvasTex(512, 308, function (c, w, h) {
      c.fillStyle = '#b4553d'; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(0,0,0,.09)'; c.lineWidth = 1;
      for (var y = 4; y < h; y += 9) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
      for (var row = 0; row < 3; row++) {
        for (var col = 0; col < 6; col++) {
          if (row === 2 && (col === 2 || col === 3)) continue;
          var x = 26 + col * 80, yy = 24 + row * 92;
          c.fillStyle = '#f3ece0'; c.fillRect(x - 5, yy - 5, 54, 68);
          c.fillStyle = '#3d5a8a'; c.fillRect(x, yy, 44, 58);
          c.fillStyle = '#f3ece0'; c.fillRect(x + 20, yy, 4, 58); c.fillRect(x, yy + 27, 44, 4);
        }
      }
      c.fillStyle = '#f3ece0'; c.fillRect(186, 196, 140, 112);
      c.fillStyle = '#5a3a26'; c.fillRect(204, 238, 104, 70);
      c.fillStyle = '#1a2350'; c.fillRect(198, 200, 116, 34);
      c.fillStyle = '#ffd23f'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = '700 30px Fredoka, Rubik, Arial, sans-serif';
      c.fillText('770', 256, 218);
    }, true);
    var brick = lam(0xb4553d);
    var body = new T.Mesh(new T.BoxGeometry(D, H, Wd), [new T.MeshLambertMaterial({ map: facade }), brick, lam(0x8e3f2c), brick, brick, brick]);
    body.position.set(0, H / 2, 0);
    g.add(body);
    var tri = new T.Shape();
    tri.moveTo(-1.9, 0); tri.lineTo(1.9, 0); tri.lineTo(0, 2.1); tri.lineTo(-1.9, 0);
    var gableGeo = new T.ExtrudeGeometry(tri, { depth: 0.7, bevelEnabled: false });
    [-4, 0, 4].forEach(function (z) {
      var m = mesh(gableGeo, brick, D / 2 - 0.7, H, z, g);
      m.rotation.y = Math.PI / 2;
    });
    mesh(new T.BoxGeometry(D + 0.12, 0.24, Wd + 0.12), lam(0xf3ece0), 0, H, 0, g);
    g.position.x = -(ROAD_HALF + 3.1 + D / 2);
    g.visible = false;
    scene.add(g);
    return g;
  })();

  // ------------------------------------------------------------ הטנק
  var tank = new T.Group();
  (function () {
    var white = lam(0xffffff), blue = lam(0x2f80ff), navy = lam(0x1a2350), glass = lam(0x9fd3ff), tyre = lam(0x23293d), grey = lam(0xc0c7dd);
    mesh(new T.BoxGeometry(1.4, 1.05, 2.5), white, 0, 0.88, 0.2, tank);
    mesh(new T.BoxGeometry(1.43, 0.16, 2.53), blue, 0, 0.6, 0.2, tank);
    mesh(new T.BoxGeometry(1.36, 0.8, 0.95), white, 0, 0.74, -1.5, tank);
    mesh(new T.BoxGeometry(1.39, 0.16, 0.97), blue, 0, 0.6, -1.5, tank);
    mesh(new T.BoxGeometry(1.16, 0.34, 0.05), glass, 0, 0.98, -1.98, tank);
    mesh(new T.BoxGeometry(0.95, 0.42, 0.05), glass, 0, 1.08, 1.46, tank);
    var side = new T.MeshLambertMaterial({ map: label('מבצעים', '#1a2350', '#ffd23f', 512, 136, 96) });
    var back = new T.MeshLambertMaterial({ map: label('מבצע תפילין', '#1a2350', '#ffd23f', 512, 214, 100) });
    var sign = new T.Mesh(new T.BoxGeometry(1.24, 0.52, 1.95), [side, side, navy, navy, back, back]);
    sign.position.set(0, 1.68, 0.2);
    tank.add(sign);
    var spk = new T.CylinderGeometry(0.17, 0.08, 0.32, 8);
    [-0.42, 0.42].forEach(function (x) { var s = mesh(spk, grey, x, 1.56, -1.12, tank); s.rotation.x = Math.PI / 2; });
    var wheel = new T.CylinderGeometry(0.34, 0.34, 0.26, 12);
    [[-0.68, -1.3], [0.68, -1.3], [-0.68, 0.95], [0.68, 0.95]].forEach(function (p) { var w = mesh(wheel, tyre, p[0], 0.34, p[1], tank); w.rotation.z = Math.PI / 2; });
    [-0.5, 0.5].forEach(function (x) { mesh(new T.BoxGeometry(0.22, 0.14, 0.04), flat(0xff5a4d), x, 0.82, 1.47, tank); });
  })();
  scene.add(tank);
  var shadow = mesh(new T.PlaneGeometry(2.2, 3.9), new T.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }), 0, 0.03, -0.1, scene);
  shadow.rotation.x = -Math.PI / 2;

  // ------------------------------------------------------------ מצוות ומכשולים
  var KINDS = [{ k: 'candles', n: 'נרות שבת' }, { k: 'tefillin', n: 'תפילין' }, { k: 'tzedaka', n: 'צדקה' }, { k: 'mezuza', n: 'מזוזה' }, { k: 'siddur', n: 'סידור' }];
  var G = {
    tray: new T.BoxGeometry(0.86, 0.08, 0.4), candle: new T.CylinderGeometry(0.085, 0.085, 0.52, 8), flame: new T.ConeGeometry(0.075, 0.22, 6),
    tefBox: new T.BoxGeometry(0.5, 0.5, 0.5), strap: new T.TorusGeometry(0.32, 0.035, 6, 18),
    tzBox: new T.BoxGeometry(0.62, 0.62, 0.44), slot: new T.BoxGeometry(0.3, 0.03, 0.08), coin: new T.CylinderGeometry(0.17, 0.17, 0.05, 14),
    mezuza: new T.BoxGeometry(0.2, 0.82, 0.14), book: new T.BoxGeometry(0.62, 0.78, 0.18), pages: new T.BoxGeometry(0.56, 0.72, 0.2),
    cone: new T.ConeGeometry(0.34, 0.92, 12), coneBand: new T.CylinderGeometry(0.18, 0.23, 0.14, 12), coneBase: new T.BoxGeometry(0.72, 0.08, 0.72),
    board: new T.BoxGeometry(1.6, 0.36, 0.14), leg: new T.BoxGeometry(0.12, 0.62, 0.12), foot: new T.BoxGeometry(0.14, 0.06, 0.55),
    panel: new T.BoxGeometry(1.72, 1.5, 0.16), post: new T.BoxGeometry(0.12, 1.85, 0.12), blink: new T.SphereGeometry(0.13, 8, 6),
  };
  var TEX = {
    shin: label('ש', '#111111', '#ffffff', 64, 64, 46),
    mez: label('ש', '#c9d4ea', '#9a700c', 64, 128, 44),
    tz: label('צדקה', '#2f80ff', '#ffffff', 128, 128, 40),
    sid: label('סידור', '#1f3b8f', '#ffd23f', 128, 160, 38),
    stripes: canvasTex(128, 32, function (g) {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 32); g.fillStyle = '#e5484d';
      for (var x = -32; x < 160; x += 32) { g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 16, 32); g.lineTo(x + 32, 0); g.lineTo(x + 16, 0); g.closePath(); g.fill(); }
    }),
    fence: canvasTex(128, 112, function (g) {
      g.fillStyle = '#ff7a1a'; g.fillRect(0, 0, 128, 112);
      g.fillStyle = '#ffffff';
      for (var x = -112; x < 128; x += 28) { g.beginPath(); g.moveTo(x, 112); g.lineTo(x + 14, 112); g.lineTo(x + 126, 0); g.lineTo(x + 112, 0); g.closePath(); g.fill(); }
      g.fillStyle = '#ffffff'; g.fillRect(14, 34, 100, 44);
      g.fillStyle = '#1a2350'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '700 26px Fredoka, Rubik, Arial, sans-serif';
      g.fillText('עוקפים!', 64, 57);
    }, true),
  };
  function texMat(t) { return new T.MeshLambertMaterial({ map: t }); }
  var M = {
    shin: texMat(TEX.shin), mez: texMat(TEX.mez), tz: texMat(TEX.tz), sid: texMat(TEX.sid), stripes: texMat(TEX.stripes), fence: texMat(TEX.fence),
    halo: new T.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false }),
  };

  function buildItem(kind) {
    var g = new T.Group(), inner = new T.Group();
    g.add(inner);
    if (kind === 'candles') {
      mesh(G.tray, lam(0xc0c7dd), 0, -0.32, 0, inner);
      [-0.2, 0.2].forEach(function (x) { mesh(G.candle, lam(0xffffff), x, -0.02, 0, inner); mesh(G.flame, flat(0xffa41c), x, 0.35, 0, inner); });
    } else if (kind === 'tefillin') {
      var black = lam(0x161616);
      mesh(G.tefBox, [M.shin, M.shin, black, black, M.shin, M.shin], 0, 0.05, 0, inner);
      var st = mesh(G.strap, black, 0, -0.32, 0, inner); st.rotation.x = Math.PI / 2;
    } else if (kind === 'tzedaka') {
      var blue = lam(0x2f80ff);
      mesh(G.tzBox, [blue, blue, blue, blue, M.tz, M.tz], 0, -0.05, 0, inner);
      mesh(G.slot, flat(0x1a2350), 0, 0.27, 0, inner);
      var coin = mesh(G.coin, lam(0xffd23f), 0, 0.5, 0, inner); coin.rotation.x = Math.PI / 2;
    } else if (kind === 'mezuza') {
      var silver = lam(0xc9d4ea);
      var mz = mesh(G.mezuza, [silver, silver, silver, silver, M.mez, M.mez], 0, 0, 0, inner); mz.rotation.z = -0.35;
    } else {
      var navy = lam(0x1f3b8f);
      mesh(G.book, [navy, navy, navy, navy, M.sid, M.sid], 0, 0, 0, inner);
      mesh(G.pages, lam(0xfff6dc), 0.04, 0, 0, inner);
    }
    var halo = new T.Sprite(M.halo);
    halo.scale.set(1.9, 1.9, 1);
    halo.position.z = -0.45;
    g.add(halo);
    return g;
  }
  function buildObstacle(kind) {
    var g = new T.Group(), grey = lam(0x6b7280);
    if (kind === 'cone') {
      [-0.38, 0.38].forEach(function (x) {
        mesh(G.coneBase, lam(0xff7a1a), x, 0.04, 0, g);
        mesh(G.cone, lam(0xff7a1a), x, 0.54, 0, g);
        mesh(G.coneBand, lam(0xffffff), x, 0.5, 0, g);
      });
      g.userData = { h: 0.98, hw: 0.74, hd: 0.36 };
    } else if (kind === 'barrier') {
      mesh(G.board, M.stripes, 0, 0.64, 0, g);
      [-0.66, 0.66].forEach(function (x) { mesh(G.leg, grey, x, 0.31, 0, g); mesh(G.foot, grey, x, 0.03, 0, g); });
      g.userData = { h: 0.84, hw: 0.8, hd: 0.27 };
    } else {
      mesh(G.panel, [M.stripes, M.stripes, M.stripes, M.stripes, M.fence, M.fence], 0, 1.0, 0, g);
      [-0.8, 0.8].forEach(function (x) { mesh(G.post, grey, x, 0.92, 0, g); });
      var lamp = mesh(G.blink, flat(0xffc400), 0, 1.96, 0, g);
      g.userData = { h: 2.2, hw: 0.86, hd: 0.27, lamp: lamp };
    }
    return g;
  }

  var pool = { item: {}, obs: {} }, active = [];
  function take(type, kind) {
    var p = pool[type][kind] || (pool[type][kind] = []);
    var o = p.pop() || (type === 'item' ? buildItem(kind) : buildObstacle(kind));
    o.visible = true;
    o.rotation.set(0, 0, 0);
    o.scale.set(1, 1, 1);
    scene.add(o);
    return o;
  }
  function release(e) { scene.remove(e.o); pool[e.type][e.kind].push(e.o); }
  function clearAll() { active.forEach(function (e) { release(e); }); active = []; }

  function addItem(lane, z, air) {
    var kd = K.pick(KINDS);
    var e = { type: 'item', kind: kd.k, n: kd.n, o: take('item', kd.k), x: LANE_X[lane], z: z, baseY: air ? 2.75 : 1.0, phase: Math.random() * 6, spin: Math.random() * 6 };
    e.o.position.set(e.x, e.baseY, z);
    active.push(e);
  }
  function addObs(lane, z, kind) {
    var e = { type: 'obs', kind: kind, o: take('obs', kind), x: LANE_X[lane], z: z };
    e.o.position.set(e.x, 0, z);
    active.push(e);
  }
  function low() { return Math.random() < 0.5 ? 'cone' : 'barrier'; }

  // ------------------------------------------------------------ מצב המשחק
  var st = null, mode = 'idle', idleDist = 0;
  function newState() {
    return { dist: 0, t: 0, lane: 1, x: 0, y: 0, vy: 0, buffer: 0, inv: 0, shake: 0, lives: 3, mitz: 0, bonus: 0,
      untilRow: 34, lastForced: false, next770: 900, l770: null, nextMile: 1000, overT: 0, hud: '', gentle: 2 };
  }
  function difficulty() { return Math.min(1, st.dist / 4200); }
  function speed() { return 12 + 19 * difficulty() + Math.min(5, Math.max(0, st.dist - 4200) / 1500); }
  function rowGap(v) { return Math.max(v * 0.62, 24 - 11 * difficulty()); }
  function score() { return Math.floor(st.dist / 5) + st.mitz * 10 + st.bonus; }

  function spawnRow(z) {
    var d = difficulty(), forced = false, r = Math.random();
    if (z == null) z = -FAR + 4;
    var lanes = K.shuffle([0, 1, 2]);
    if (st.gentle > 0) {
      // התחלה רכה: קודם רק אוספים מצוות
      st.gentle--;
      addItem(lanes[0], z, false);
      addItem(lanes[1], z - 7, false);
    } else if (r < 0.2) {
      var n = 3 + Math.floor(Math.random() * 3), air = d > 0.2 && Math.random() < 0.3;
      for (var i = 0; i < n; i++) addItem(lanes[0], z - i * 2.4, air);
    } else if (r < 0.38 && d > 0.12) {
      // שורת קפיצה: מכשולים נמוכים בכל הנתיבים, ומצווה באוויר
      lanes.forEach(function (l) { addObs(l, z, low()); });
      addItem(lanes[0], z, true);
      st.untilRow += speed() * 0.3;
    } else if (r < 0.8) {
      var tall = d > 0.2 && !st.lastForced && Math.random() < 0.35 + d * 0.3;
      addObs(lanes[0], z, tall ? 'fence' : low());
      if (d > 0.3 && Math.random() < 0.3 + d * 0.4) {
        var tall2 = tall && Math.random() < 0.5;
        addObs(lanes[1], z, tall2 ? 'fence' : low());
        forced = tall && tall2;
      }
      addItem(lanes[2], z, Math.random() < 0.2);
    } else {
      addItem(lanes[0], z, false);
      addItem(lanes[1], z - 6, Math.random() < 0.4);
      if (d > 0.1) addObs(lanes[2], z - 3, low());
    }
    st.lastForced = forced;
  }
  // בתחילת משחק ממלאים את הכביש שלפנינו, כדי שלא נחכה לשורה הראשונה
  function prefill() {
    var gap = rowGap(speed()), z = -30, lastZ = z;
    while (z > -FAR + 4) { spawnRow(z); lastZ = z; z -= gap; }
    st.untilRow = gap - (lastZ - (-FAR + 4));
  }

  // ------------------------------------------------------------ תצוגה
  var toastEl = $('toast'), toastT = 0;
  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove('show'); }, 1100);
  }
  function updateHud(force) {
    var sc = score(), key = sc + '|' + st.mitz + '|' + st.lives;
    if (!force && key === st.hud) return;
    st.hud = key;
    $('score').textContent = K.fmt(sc);
    $('mitz').textContent = st.mitz;
    var l = Math.max(0, st.lives);
    $('lives').textContent = '❤️'.repeat(l) + '🤍'.repeat(3 - l);
    $('lives').setAttribute('aria-label', l + ' חיים');
  }

  function placeLoops(dist) {
    buildings.forEach(function (b) {
      var p = (b.base + dist) % LOOP_B;
      if (p < b.last) restyle(b);
      b.last = p;
      b.m.position.z = -FAR + p;
      b.m.visible = !(st && st.l770 && b.side < 0 && Math.abs(b.m.position.z - st.l770.z) < 9.5);
    });
    props.forEach(function (o) { o.m.position.z = -FAR + (o.base + dist) % LOOP_P; });
    roadTex.offset.y = (dist / DASH) % 1;
  }

  function draw() {
    var x = st ? st.x : 0, y = st ? st.y : 0, lane = st ? LANE_X[st.lane] : 0;
    tank.position.set(x, y, 0);
    tank.rotation.z = (x - lane) * 0.07;
    tank.rotation.y = (x - lane) * 0.06;
    tank.rotation.x = st && y > 0 ? Math.max(-0.12, Math.min(0.12, -st.vy * 0.012)) : 0;
    tank.visible = !st || st.inv <= 0 || mode !== 'run' || Math.floor(st.inv * 10) % 2 === 0;
    shadow.position.x = x;
    var sh = 1 - Math.min(0.5, y * 0.25);
    shadow.scale.set(sh, sh, 1);
    var shake = st && st.shake > 0 && !REDUCED ? (Math.random() - 0.5) * st.shake * 0.5 : 0;
    camera.position.set(x * 0.55 + shake, 3.75 + y * 0.35, 6.7);
    camera.lookAt(x * 0.35, 0.95 + y * 0.25, -7);
    renderer.render(scene, camera);
  }

  function update(dt) {
    var v = speed();
    st.dist += v * dt;
    st.t += dt;
    st.x += (LANE_X[st.lane] - st.x) * Math.min(1, dt * 11);
    if (st.y > 0 || st.vy > 0) {
      st.vy -= 26 * dt;
      st.y += st.vy * dt;
      if (st.y <= 0) { st.y = 0; st.vy = 0; if (st.buffer > 0) doJump(); }
    }
    if (st.buffer > 0) st.buffer -= dt;
    if (st.inv > 0) st.inv -= dt;
    if (st.shake > 0) st.shake = Math.max(0, st.shake - dt * 2.5);

    st.untilRow -= v * dt;
    if (st.untilRow <= 0) { spawnRow(); st.untilRow += rowGap(v); }

    // 770 ועוד ציוני דרך
    if (!st.l770 && st.dist >= st.next770) { st.l770 = { z: -FAR - 2, told: false }; B770.visible = true; st.next770 += 2400; }
    if (st.l770) {
      st.l770.z += v * dt;
      B770.position.z = st.l770.z;
      if (!st.l770.told && st.l770.z > -26) { st.l770.told = true; st.bonus += 50; K.sfx.win(); toast('עוברים ליד 770 – בית חיינו! ' + K.ltr('+50')); }
      if (st.l770.z > NEAR + 8) { st.l770 = null; B770.visible = false; }
    }
    if (st.dist >= st.nextMile) { toast(K.fmt(st.nextMile) + ' מטר! המהירות עולה 🚀'); st.nextMile += 1000; }

    var tankTop = st.y + 1.95;
    for (var i = active.length - 1; i >= 0; i--) {
      var e = active[i];
      e.z += v * dt;
      e.o.position.z = e.z;
      if (e.type === 'item') {
        e.spin += dt * 2.4;
        e.o.children[0].rotation.y = e.spin;
        e.o.position.y = e.baseY + Math.sin(st.t * 3 + e.phase) * 0.12;
        if (!e.dead && Math.abs(e.x - st.x) < 1.05 && e.z > -2.3 && e.z < 1.7 && e.baseY > st.y - 0.3 && e.baseY < tankTop + 0.25) collect(e);
      } else {
        var u = e.o.userData;
        if (u.lamp) u.lamp.visible = (st.t * 2.5) % 1 < 0.6;
        if (e.knock) {
          e.knock.vy -= 22 * dt;
          e.o.position.y += e.knock.vy * dt;
          e.o.rotation.x += e.knock.vr * dt;
          if (e.o.position.y < -3) e.dead = true;
        } else if (st.inv <= 0 && Math.abs(e.x - st.x) < 0.58 + u.hw && e.z + u.hd > -1.95 && e.z - u.hd < 1.45 && st.y < u.h - 0.05) {
          crash(e);
          if (mode !== 'run') return;
        }
      }
      if (e.dead || e.z > NEAR - 2) { release(e); active.splice(i, 1); }
    }
    placeLoops(st.dist);
    updateHud();
  }

  function collect(e) {
    e.dead = true;
    st.mitz++;
    K.sfx.good();
    if (st.mitz % 10 === 0) { st.bonus += 50; toast('🎉 ' + st.mitz + ' מצוות! בונוס ' + K.ltr('+50')); }
    else toast(K.ltr('+10') + ' ' + e.n);
  }
  function crash(e) {
    e.knock = { vy: 6, vr: (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 3) };
    st.lives--;
    st.inv = 1.6;
    st.shake = 1;
    K.sfx.bad();
    K.vibrate(90);
    updateHud(true);
    if (st.lives <= 0) { gameOver(); return; }
    toast(st.lives === 1 ? 'זהירות! נשאר לב אחד ❤️' : 'אוי! נזהרים בדרך 🚧');
  }

  function doJump() {
    st.vy = 8.6;
    st.y = 0.001;
    st.buffer = 0;
    K.sfx.jump();
  }
  function jump() {
    if (mode !== 'run') return;
    if (st.y <= 0.001 && st.vy <= 0) doJump();
    else st.buffer = 0.16;
  }
  function steer(dir) {
    if (mode !== 'run') return;
    var nl = Math.max(0, Math.min(2, st.lane + dir));
    if (nl !== st.lane) { st.lane = nl; K.sfx.tick(); }
  }

  // ------------------------------------------------------------ לולאה
  var raf = 0, last = 0;
  var perf = { n: 0, sum: 0, drops: 0 };
  function perfCheck(raw) {
    if (!(raw > 0) || raw > 0.25) return;
    perf.sum += raw; perf.n++;
    if (perf.n < 120) return;
    var avg = perf.sum / perf.n;
    perf.n = 0; perf.sum = 0;
    if (avg > 0.025 && dpr > 1 && perf.drops < 3) { dpr = Math.max(1, dpr - 0.5); perf.drops++; renderer.setPixelRatio(dpr); }
  }
  function frame(now) {
    raf = 0;
    var raw = (now - last) / 1000;
    last = now;
    var dt = Math.min(0.05, raw > 0 ? raw : 0);
    if (mode === 'run') { update(dt); perfCheck(raw); }
    else if (mode === 'idle') { idleDist += dt * 6; placeLoops(idleDist); }
    else if (mode === 'over') {
      st.overT += dt;
      if (st.shake > 0) st.shake = Math.max(0, st.shake - dt * 2.5);
      active.forEach(function (e) { if (e.knock) { e.knock.vy -= 22 * dt; e.o.position.y += e.knock.vy * dt; e.o.rotation.x += e.knock.vr * dt; } });
    }
    draw();
    var more = mode === 'run' || (mode === 'idle' && !document.hidden) || (mode === 'over' && st.overT < 1.3);
    if (more) raf = requestAnimationFrame(frame);
  }
  function kick() {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  var sizeW = 0, sizeH = 0;
  function resize() {
    var w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    if (w !== sizeW || h !== sizeH) { renderer.setSize(w, h, false); sizeW = w; sizeH = h; } // שינוי גודל מנקה את התמונה
    camera.aspect = w / h;
    camera.fov = Math.max(52, Math.min(78, 2 * Math.atan(0.46 / camera.aspect) * 180 / Math.PI));
    camera.updateProjectionMatrix();
    draw();
  }

  function start() {
    K.audio();
    B.close();
    K.unfocus();
    clearAll();
    st = newState();
    B770.visible = false;
    mode = 'run';
    $('ov-start').hidden = true;
    $('ov-pause').hidden = true;
    prefill();
    updateHud(true);
    placeLoops(0);
    kick();
  }
  function gameOver() {
    mode = 'over';
    K.sfx.over();
    var sc = score(), m = st.mitz, meters = Math.floor(st.dist);
    var isNew = sc > B.best(GAME);
    setTimeout(function () {
      B.showResult({
        game: GAME, score: sc,
        title: isNew ? 'שיא חדש!' : K.pick(['כל הכבוד!', 'יישר כוח!', 'נסיעה מצוינת!']),
        text: 'אספתם ' + m + ' מצוות ונסעתם ' + K.fmt(meters) + ' מטר.',
        stars: sc >= 1500 ? 3 : sc >= 600 ? 2 : 1,
        onAgain: start,
      });
      B.startLine(GAME, $('best-start'));
    }, 1000);
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

  // ------------------------------------------------------------ שליטה: החלקה, נגיעה, כפתורים ומקלדת
  var touch = null;
  canvas.addEventListener('pointerdown', function (e) {
    if (mode !== 'run') return;
    e.preventDefault();
    touch = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), done: false };
  });
  window.addEventListener('pointermove', function (e) {
    if (!touch || touch.done || e.pointerId !== touch.id) return;
    var dx = e.clientX - touch.x, dy = e.clientY - touch.y;
    if (Math.abs(dx) > 26 && Math.abs(dx) > Math.abs(dy)) { steer(dx < 0 ? -1 : 1); touch.done = true; }
    else if (dy < -26 && Math.abs(dy) > Math.abs(dx)) { jump(); touch.done = true; }
  });
  window.addEventListener('pointerup', function (e) {
    if (!touch || e.pointerId !== touch.id) return;
    if (!touch.done && performance.now() - touch.t < 400) {
      var r = canvas.getBoundingClientRect(), fx = (e.clientX - r.left) / r.width;
      if (fx < 0.34) steer(-1); else if (fx > 0.66) steer(1); else jump();
    }
    touch = null;
  });
  window.addEventListener('pointercancel', function () { touch = null; });
  function padButton(btn, fn) {
    btn.addEventListener('pointerdown', function (e) { e.preventDefault(); fn(); });
    btn.addEventListener('click', function (e) { if (e.detail === 0) fn(); });
  }
  padButton($('btn-left'), function () { steer(-1); });
  padButton($('btn-right'), function () { steer(1); });
  padButton($('btn-jump'), jump);
  document.addEventListener('keydown', function (e) {
    if (B.isOpen() || K.typing(e)) return;
    var k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A' || k === 'ש') { steer(-1); e.preventDefault(); }
    else if (k === 'ArrowRight' || k === 'd' || k === 'D' || k === 'ג') { steer(1); e.preventDefault(); }
    else if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === ' ') {
      e.preventDefault();
      if (mode === 'run') jump();
      else if (!$('ov-start').hidden && $('fail').hidden) start();
      else if (mode === 'pause') resume();
    } else if (k === 'Enter') {
      if (!$('ov-start').hidden && $('fail').hidden) { start(); e.preventDefault(); }
      else if (mode === 'pause') { resume(); e.preventDefault(); }
    } else if (k === 'p' || k === 'P' || k === 'פ' || k === 'Escape') {
      if (mode === 'run') pause(); else resume();
    }
  });
  $('start').addEventListener('click', start);
  $('resume').addEventListener('click', resume);
  $('pause-btn').addEventListener('click', function () { if (mode === 'run') pause(); else resume(); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) pause();
    else if (mode === 'idle') kick();
  });
  canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); pause(); });
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(function () { resize(); }).observe(stage);
  if (document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load('700 40px Fredoka', 'מבצע'), document.fonts.load('700 40px Rubik', 'מבצע')])
      .then(function () { redrawTexts(); if (!raf) draw(); }, function () {});
  }

  B.startLine(GAME, $('best-start'));
  resize();
  placeLoops(0);
  kick();
})();
