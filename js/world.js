/* =====================================================================
   3D OSMON — sahifani aylantirganda kamera bulutlar orasidan uchib o‘tadi.
   Yo‘l: Xitoy tog‘lari → bulutlar → parashyutli qutilar → quyosh botishi →
   sizning shahringiz. Sichqonchani qimirlatsangiz, kamera havoda burilib turadi.
   Three.js r128.
   ===================================================================== */
(function () {
  "use strict";

  var canvas = document.getElementById("world");
  var root = document.documentElement;
  var stopped = false;
  // 3D ishlamasa yoki juda sekin bo‘lsa — yengil ko‘rinishga o‘tamiz
  function fallback() {
    stopped = true;
    root.classList.remove("has-webgl");
    root.classList.add("no-webgl");
    window.dispatchEvent(new Event("resize"));
  }
  if (!canvas || !window.THREE || root.classList.contains("no-webgl")) { fallback(); return; }

  var T = window.THREE;
  var mm = function (q) { return window.matchMedia ? window.matchMedia(q).matches : false; };
  var coarse = mm("(pointer: coarse)");
  var weak = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 2;
  var small = window.innerWidth < 760 || coarse || weak;
  var reduce = mm("(prefers-reduced-motion: reduce)");

  var renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas: canvas, antialias: !small, powerPreference: "high-performance" });
  } catch (e) { fallback(); return; }
  var basePR = Math.min(window.devicePixelRatio || 1, small ? 1.25 : 1.75);
  renderer.setPixelRatio(basePR);
  canvas.addEventListener("webglcontextlost", function (e) { e.preventDefault(); fallback(); });
  root.classList.add("has-webgl");

  var scene = new T.Scene();
  var camera = new T.PerspectiveCamera(58, 1, 0.5, 2000);
  scene.fog = new T.Fog(0xf0e8e2, 60, 420);

  /* ---------- Yordamchilar ---------- */
  function rand(a, b) { return a + Math.random() * (b - a); }
  function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* ---------- Kamera yo‘li: [z, balandlik, pastga qarash] ---------- */
  var PATH = [
    [40, 17, -0.10], [0, 16, -0.10], [-60, 15, -0.04], [-125, 19, 0],
    [-185, 25, 0.02], [-265, 23, 0], [-345, 22, 0], [-425, 20, -0.02],
    [-490, 15, -0.06], [-540, 2, -0.12], [-590, -13, -0.22], [-700, -15, -0.26], [-760, -15, -0.26],
  ];
  function pathAt(z) {
    if (z >= PATH[0][0]) return PATH[0];
    for (var i = 0; i < PATH.length - 1; i++) {
      var a = PATH[i], b = PATH[i + 1];
      if (z >= b[0]) {
        var t = smooth((a[0] - z) / (a[0] - b[0]));
        return [z, lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
      }
    }
    return PATH[PATH.length - 1];
  }
  var Z_END = -700;

  /* ---------- Osmon ranglari (yo‘l bo‘yicha) ---------- */
  var SKY = [
    { p: 0.00, top: "#aebccb", hor: "#f2e9e3", bot: "#d9d6d9", cl: "#ffffff", cs: "#a9b3c4", sun: "#fff1df" },
    { p: 0.26, top: "#7fa6d2", hor: "#e9eef4", bot: "#d2dbe6", cl: "#ffffff", cs: "#9fb2c9", sun: "#fffaf0" },
    { p: 0.48, top: "#8fb2dc", hor: "#f3efe8", bot: "#dfe3e8", cl: "#ffffff", cs: "#aab7c9", sun: "#fff3dc" },
    { p: 0.66, top: "#a99fc8", hor: "#f8d6bf", bot: "#e7c9c0", cl: "#fff1e6", cs: "#a99bb4", sun: "#ffd2a1" },
    { p: 0.82, top: "#4f5a82", hor: "#f0a983", bot: "#6c6a82", cl: "#ffd8c2", cs: "#7b7393", sun: "#ffb27a" },
    { p: 1.00, top: "#2e3557", hor: "#e48f72", bot: "#3c3d55", cl: "#f4c3ae", cs: "#5c5878", sun: "#ff9a66" },
  ].map(function (k) {
    return { p: k.p, top: new T.Color(k.top), hor: new T.Color(k.hor), bot: new T.Color(k.bot), cl: new T.Color(k.cl), cs: new T.Color(k.cs), sun: new T.Color(k.sun) };
  });
  var cur = { top: new T.Color(), hor: new T.Color(), bot: new T.Color(), cl: new T.Color(), cs: new T.Color(), sun: new T.Color() };
  function skyAt(p) {
    var i = 0;
    while (i < SKY.length - 2 && p > SKY[i + 1].p) i++;
    var a = SKY[i], b = SKY[i + 1], t = smooth((p - a.p) / (b.p - a.p));
    ["top", "hor", "bot", "cl", "cs", "sun"].forEach(function (k) { cur[k].copy(a[k]).lerp(b[k], t); });
    return cur;
  }

  /* ---------- Osmon gumbazi ---------- */
  var skyMat = new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uTop: { value: new T.Color() }, uHor: { value: new T.Color() }, uBot: { value: new T.Color() },
      uSun: { value: new T.Color() }, uSunDir: { value: new T.Vector3(0, 0.12, -1).normalize() },
    },
    vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: [
      "uniform vec3 uTop, uHor, uBot, uSun, uSunDir; varying vec3 vDir;",
      "void main(){",
      "  vec3 d = normalize(vDir); float h = d.y;",
      "  vec3 c = h > 0.0 ? mix(uHor, uTop, pow(h, 0.55)) : mix(uHor, uBot, pow(-h, 0.45));",
      "  float s = max(dot(d, uSunDir), 0.0);",
      "  c += uSun * (pow(s, 6.0) * 0.35 + pow(s, 60.0) * 0.6);",
      "  gl_FragColor = vec4(c, 1.0);",
      "}",
    ].join("\n"),
  });
  var sky = new T.Mesh(new T.SphereGeometry(1500, 32, 16), skyMat);
  sky.renderOrder = -10;
  scene.add(sky);

  /* ---------- Yorug‘lik ---------- */
  var hemi = new T.HemisphereLight(0xffffff, 0x9aa3ad, 0.85);
  var sun = new T.DirectionalLight(0xfff1df, 0.75);
  sun.position.set(0.3, 0.6, -1);
  scene.add(hemi, sun);

  /* ---------- Bulut teksturasi ---------- */
  function cloudTexture() {
    var c = document.createElement("canvas"); c.width = c.height = 128;
    var g = c.getContext("2d");
    for (var i = 0; i < 30; i++) {
      var x = 64 + gauss() * 26, y = 70 + gauss() * 16, r = rand(12, 30);
      var grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, "rgba(255,255,255,0.55)");
      grd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    g.globalCompositeOperation = "destination-in";
    var m = g.createRadialGradient(64, 64, 20, 64, 64, 64);
    m.addColorStop(0, "rgba(0,0,0,1)"); m.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = m; g.fillRect(0, 0, 128, 128);
    var t = new T.CanvasTexture(c);
    t.minFilter = T.LinearFilter;
    return t;
  }

  /* ---------- Bulutlar (bitta chizishda minglab bulut) ---------- */
  var clouds = [];
  function addCloud(x, y, z, size, shade, alpha) { clouds.push([x, y, z, size, shade, alpha, Math.random() * 6.28]); }

  var K = small ? 0.55 : 1;
  // Bulutlar dengizi
  for (var i = 0; i < 620 * K; i++) addCloud(rand(-170, 170), rand(-3, 3), rand(60, -780), rand(30, 72), rand(0.45, 0.9), rand(0.5, 0.9));
  // O‘tib ketiladigan bulut devorlari (bo‘limlar orasida)
  [-92, -232, -395, -540].forEach(function (zc) {
    var cy = pathAt(zc)[1];
    for (var j = 0; j < 110 * K; j++) {
      addCloud(gauss() * 30, cy + gauss() * 12, zc + gauss() * 26, rand(16, 40), rand(0.6, 1), rand(0.65, 1));
    }
  });
  // Osmonda tarqoq bulutlar
  for (i = 0; i < 180 * K; i++) addCloud(rand(-150, 150), rand(10, 70), rand(40, -760), rand(14, 40), rand(0.65, 1), rand(0.25, 0.7));
  // Pastdagi siyrak bulutlar (shahar ustida)
  for (i = 0; i < 60 * K; i++) addCloud(rand(-140, 140), rand(-30, -18), rand(-560, -780), rand(18, 40), rand(0.4, 0.7), rand(0.2, 0.45));

  var cloudMat = new T.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {
      map: { value: cloudTexture() }, uTime: { value: 0 },
      uLight: { value: new T.Color() }, uShadow: { value: new T.Color() }, uFog: { value: new T.Color() },
      uNear: { value: 60 }, uFar: { value: 460 },
    },
    vertexShader: [
      "attribute vec2 corner; attribute float size; attribute float shade; attribute float alpha; attribute float rot;",
      "uniform float uTime; varying vec2 vUv; varying float vShade; varying float vAlpha; varying float vDepth;",
      "void main(){",
      "  vec3 p = position; p.x += sin(uTime * 0.04 + rot * 3.0) * 3.0;",
      "  vec4 mv = modelViewMatrix * vec4(p, 1.0);",
      "  float r = (rot - 3.14) * 0.15; float c = cos(r), s = sin(r);",
      "  vec2 q = vec2(c * corner.x - s * corner.y, s * corner.x + c * corner.y);",
      "  mv.xy += vec2(q.x * 1.6, q.y) * size;",
      "  vUv = corner + 0.5; vShade = shade; vAlpha = alpha; vDepth = -mv.z;",
      "  gl_Position = projectionMatrix * mv;",
      "}",
    ].join("\n"),
    fragmentShader: [
      "uniform sampler2D map; uniform vec3 uLight, uShadow, uFog; uniform float uNear, uFar;",
      "varying vec2 vUv; varying float vShade; varying float vAlpha; varying float vDepth;",
      "void main(){",
      "  float a = texture2D(map, vUv).a * vAlpha;",
      "  a *= smoothstep(1.0, 22.0, vDepth);",            // yaqinlashganda eriydi — ichidan uchib o‘tamiz
      "  float f = smoothstep(uNear, uFar, vDepth);",
      "  vec3 col = mix(uShadow, uLight, clamp(vShade + (vUv.y - 0.45) * 0.9, 0.0, 1.0));",
      "  col = mix(col, uFog, f * 0.9);",
      "  a *= 1.0 - f * f;",
      "  if (a < 0.004) discard;",
      "  gl_FragColor = vec4(col, a);",
      "}",
    ].join("\n"),
  });
  // Aralashtiramiz — sekin qurilmada bir qismini o‘chirsak, bulutlar bir tekis siyraklashadi
  for (var si = clouds.length - 1; si > 0; si--) { var sj = Math.floor(Math.random() * (si + 1)), tmpc = clouds[si]; clouds[si] = clouds[sj]; clouds[sj] = tmpc; }
  var cloudGeo;
  (function buildClouds() {
    var n = clouds.length;
    var pos = new Float32Array(n * 12), cor = new Float32Array(n * 8), sz = new Float32Array(n * 4),
        sh = new Float32Array(n * 4), al = new Float32Array(n * 4), ro = new Float32Array(n * 4), idx = [];
    var C = [-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5];
    clouds.forEach(function (c, i) {
      for (var v = 0; v < 4; v++) {
        pos.set([c[0], c[1], c[2]], (i * 4 + v) * 3);
        cor[(i * 4 + v) * 2] = C[v * 2]; cor[(i * 4 + v) * 2 + 1] = C[v * 2 + 1];
        sz[i * 4 + v] = c[3]; sh[i * 4 + v] = c[4]; al[i * 4 + v] = c[5]; ro[i * 4 + v] = c[6];
      }
      var b = i * 4; idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
    var g = cloudGeo = new T.BufferGeometry();
    g.setAttribute("position", new T.BufferAttribute(pos, 3));
    g.setAttribute("corner", new T.BufferAttribute(cor, 2));
    g.setAttribute("size", new T.BufferAttribute(sz, 1));
    g.setAttribute("shade", new T.BufferAttribute(sh, 1));
    g.setAttribute("alpha", new T.BufferAttribute(al, 1));
    g.setAttribute("rot", new T.BufferAttribute(ro, 1));
    g.setIndex(idx);
    var m = new T.Mesh(g, cloudMat);
    m.frustumCulled = false; m.renderOrder = 5;
    scene.add(m);
  })();

  /* ---------- Xitoy tog‘lari (karst cho‘qqilari) ---------- */
  var rockMat = new T.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
  function peak(h, r, seed) {
    var pts = [];
    for (var i = 0; i <= 12; i++) {
      var t = i / 12;
      pts.push(new T.Vector2(Math.max(0.01, r * (1 - Math.pow(t, 2.4) * 0.88)), t * h));
    }
    var g = new T.LatheGeometry(pts, 10);
    var p = g.attributes.position, cols = [];
    var base = new T.Color("#6f8783"), top = new T.Color("#bccbc6"), c = new T.Color();
    for (var k = 0; k < p.count; k++) {
      var x = p.getX(k), y = p.getY(k), z = p.getZ(k), ang = Math.atan2(z, x);
      var f = 1 + 0.14 * Math.sin(ang * 3 + y * 0.25 + seed) + 0.09 * Math.sin(y * 0.6 + seed * 2.3);
      p.setX(k, x * f); p.setZ(k, z * f);
      c.copy(base).lerp(top, Math.pow(y / h, 1.4));
      cols.push(c.r, c.g, c.b);
    }
    g.setAttribute("color", new T.Float32BufferAttribute(cols, 3));
    g.computeVertexNormals();
    return new T.Mesh(g, rockMat);
  }
  for (i = 0; i < (small ? 30 : 52); i++) {
    var side = Math.random() < 0.5 ? -1 : 1;
    // Tik ekranda ko‘rish burchagi tor — cho‘qqilarni yaqinroq qo‘yamiz
    var x = side * (window.innerWidth / window.innerHeight < 0.8 || small ? rand(10, 80) : rand(26, 130));
    var z = small ? rand(-50, -220) : rand(-10, -230);
    var near = Math.abs(x) < 50;
    var h = near ? rand(22, 34) : rand(28, 62);
    var m = peak(h, rand(7, 15), Math.random() * 10);
    m.position.set(x, -22, z);
    m.rotation.y = Math.random() * 6;
    scene.add(m);
  }

  /* ---------- Parashyutli qutilar ---------- */
  var mats = {};
  function mat(color, extra) {
    var key = color + (extra ? JSON.stringify(extra) : "");
    if (!mats[key]) mats[key] = new T.MeshStandardMaterial(Object.assign({ color: color, roughness: 0.75, flatShading: true }, extra || {}));
    return mats[key];
  }
  function parcel(s) {
    var g = new T.Group();
    g.add(new T.Mesh(new T.BoxGeometry(s, s, s), mat(0xdca56a)));
    g.add(new T.Mesh(new T.BoxGeometry(s * 0.24, s * 1.02, s * 1.02), mat(0xf6e3c6)));
    return g;
  }
  var chutes = [];
  for (i = 0; i < (small ? 9 : 16); i++) {
    var grp = new T.Group();
    var box = parcel(1.6); grp.add(box);
    var canopy = new T.Mesh(new T.SphereGeometry(2.8, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      mat(i % 3 ? 0xff4f2e : 0xfdf6ee, { side: T.DoubleSide }));
    canopy.scale.y = 0.65; canopy.position.y = 4.6; grp.add(canopy);
    var lp = [];
    [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(function (d) { lp.push(d[0] * 0.8, 0.8, d[1] * 0.8, d[0] * 2.4, 4.6, d[1] * 2.4); });
    var lg = new T.BufferGeometry(); lg.setAttribute("position", new T.Float32BufferAttribute(lp, 3));
    grp.add(new T.LineSegments(lg, new T.LineBasicMaterial({ color: 0x8a7a70 })));
    var cz = rand(-135, -480), cy = pathAt(cz)[1];
    var cx = (Math.random() < 0.5 ? -1 : 1) * rand(7, 34);
    grp.position.set(cx, cy + rand(-6, 12), cz);
    grp.userData = { base: grp.position.y, ph: Math.random() * 6, sp: rand(0.25, 0.5) };
    scene.add(grp);
    chutes.push(grp);
  }

  // Erkin suzayotgan qutilar
  var floaters = [];
  for (i = 0; i < (small ? 6 : 12); i++) {
    var fz = rand(-260, -380), f = parcel(rand(0.9, 1.6));
    f.position.set((Math.random() < 0.5 ? -1 : 1) * rand(6, 26), pathAt(fz)[1] + rand(-6, 8), fz);
    f.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    f.userData = { base: f.position.y, ph: Math.random() * 6 };
    scene.add(f); floaters.push(f);
  }

  /* ---------- Yuk samolyoti ---------- */
  var plane = new T.Group();
  (function () {
    var w = mat(0xfbf8f4), r = mat(0xff4f2e);
    var body = new T.Mesh(new T.CylinderGeometry(1.1, 0.8, 11, 14), w); body.rotation.z = Math.PI / 2; plane.add(body);
    var nose = new T.Mesh(new T.SphereGeometry(1.1, 14, 10), w); nose.position.x = 5.5; nose.scale.x = 1.4; plane.add(nose);
    var wing = new T.Mesh(new T.BoxGeometry(2.6, 0.22, 14), w); wing.position.set(0.6, -0.3, 0); plane.add(wing);
    var tail = new T.Mesh(new T.BoxGeometry(1.6, 0.18, 4.6), w); tail.position.set(-4.8, 0.2, 0); plane.add(tail);
    var fin = new T.Mesh(new T.BoxGeometry(1.8, 2.6, 0.2), r); fin.position.set(-4.8, 1.5, 0); plane.add(fin);
    var stripe = new T.Mesh(new T.CylinderGeometry(1.12, 1.0, 1.2, 14), r); stripe.rotation.z = Math.PI / 2; stripe.position.x = 2.4; plane.add(stripe);
    [-3.4, 3.4].forEach(function (zz) {
      var eng = new T.Mesh(new T.CylinderGeometry(0.45, 0.45, 1.6, 10), r); eng.rotation.z = Math.PI / 2; eng.position.set(1.2, -0.75, zz); plane.add(eng);
    });
  })();
  scene.add(plane);

  /* ---------- Manzil: kechki shahar ---------- */
  (function town() {
    var ground = new T.Mesh(new T.PlaneGeometry(1400, 700, 1, 1), mat(0x4d5866));
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, -50, -850);
    scene.add(ground);
    var N = small ? 160 : 320;
    var houseG = new T.BoxGeometry(1, 1, 1), roofG = new T.ConeGeometry(0.78, 0.6, 4), winG = new T.BoxGeometry(0.3, 0.3, 0.05);
    roofG.rotateY(Math.PI / 4);
    var houses = new T.InstancedMesh(houseG, mat(0xe9dfd4), N);
    var roofs = new T.InstancedMesh(roofG, mat(0x8a4a3c), N);
    var wins = new T.InstancedMesh(winG, new T.MeshBasicMaterial({ color: 0xffc27a }), N * 2);
    var o = new T.Object3D();
    for (var k = 0; k < N; k++) {
      var hx = gauss() * 90, hz = rand(-640, -900), s = rand(2.2, 4.2), hh = s * rand(0.7, 1.4);
      o.position.set(hx, -50 + hh / 2, hz); o.rotation.set(0, Math.random() * 3, 0); o.scale.set(s, hh, s); o.updateMatrix();
      houses.setMatrixAt(k, o.matrix);
      o.position.y = -50 + hh + s * 0.3; o.scale.set(s, s, s); o.updateMatrix();
      roofs.setMatrixAt(k, o.matrix);
      for (var wi = 0; wi < 2; wi++) {
        o.position.set(hx + (wi ? 0.25 : -0.25) * s, -50 + hh * 0.55, hz + s * 0.51);
        o.rotation.set(0, 0, 0); o.scale.set(s, s, s); o.updateMatrix();
        wins.setMatrixAt(k * 2 + wi, o.matrix);
      }
    }
    scene.add(houses, roofs, wins);
  })();

  // Manzil belgisi
  var pin = new T.Group();
  (function () {
    var r = new T.MeshStandardMaterial({ color: 0xff4f2e, emissive: 0xff4f2e, emissiveIntensity: 0.45, roughness: 0.5 });
    var head = new T.Mesh(new T.SphereGeometry(3.2, 24, 16), r); head.position.y = 5.2; pin.add(head);
    var tip = new T.Mesh(new T.ConeGeometry(2.7, 5, 24), r); tip.rotation.x = Math.PI; tip.position.y = 2.2; pin.add(tip);
    var dot = new T.Mesh(new T.SphereGeometry(1.2, 16, 12), new T.MeshBasicMaterial({ color: 0xffffff })); dot.position.set(0, 5.2, 2.6); pin.add(dot);
    var halo = new T.Mesh(new T.RingGeometry(3.5, 5.5, 40), new T.MeshBasicMaterial({ color: 0xffb08a, transparent: true, opacity: 0.5, side: T.DoubleSide }));
    halo.rotation.x = -Math.PI / 2; halo.position.y = -6.5; halo.name = "halo"; pin.add(halo);
  })();
  pin.position.set(0, -38, -790);
  scene.add(pin);

  /* ---------- Sahifa aylantirish → kamera z ---------- */
  var anchors = [];
  function measure() {
    anchors = [];
    var vh = window.innerHeight;
    document.querySelectorAll("[data-z]").forEach(function (el) {
      var z = el.getAttribute("data-z").split(",").map(Number);
      var top = el.getBoundingClientRect().top + window.scrollY;
      var a = top - vh * 0.5, b = Math.max(a + 1, top + el.offsetHeight - vh * 0.5);
      if (el.classList.contains("scene")) { a = top; b = Math.max(a + 1, top + el.offsetHeight - vh); }
      anchors.push([a, z[0]], [b, z[1]]);
    });
    anchors.sort(function (p, q) { return p[0] - q[0]; });
  }
  function zForScroll(s) {
    if (!anchors.length) return 0;
    if (s <= anchors[0][0]) return anchors[0][1];
    for (var i = 0; i < anchors.length - 1; i++) {
      var a = anchors[i], b = anchors[i + 1];
      if (s <= b[0]) return lerp(a[1], b[1], (s - a[0]) / Math.max(1, b[0] - a[0]));
    }
    return anchors[anchors.length - 1][1];
  }

  /* ---------- Sichqoncha: havoda burilish ---------- */
  var mouse = { x: 0, y: 0 }, look = { x: 0, y: 0 };
  window.addEventListener("pointermove", function (e) {
    if (e.pointerType !== "mouse") return;
    mouse.x = e.clientX / window.innerWidth * 2 - 1;
    mouse.y = e.clientY / window.innerHeight * 2 - 1;
  }, { passive: true });

  var lastW = 0, lastH = 0;
  function resize() {
    if (stopped) return;
    var w = window.innerWidth, h = window.innerHeight;
    // Telefonda manzil paneli yig‘ilib-ochilganda (faqat balandlik biroz o‘zgaradi) qayta chizmaymiz
    if (lastW === w && Math.abs(lastH - h) < 140 && lastH) { measure(); return; }
    lastW = w; lastH = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 72 : 58;
    camera.updateProjectionMatrix();
    measure();
  }
  window.addEventListener("resize", resize);
  if ("ResizeObserver" in window) new ResizeObserver(measure).observe(document.querySelector("main"));
  window.addEventListener("load", measure);

  /* ---------- HUD ---------- */
  var hudAlt = document.getElementById("hud-alt"), hudBar = document.getElementById("hud-bar"), hudPlane = document.getElementById("hud-plane");
  var lastAlt = -1;

  /* ---------- Animatsiya ---------- */
  var camZ = zForScroll(window.scrollY), speed = 0, last = performance.now(), time = 0;
  var fwd = new T.Vector3();

  // Tezlikni o‘lchab, sifatni avtomatik moslaymiz
  var perf = { frames: 0, t: 0, level: 0 };
  function adapt(rawDt) {
    if (perf.level >= 3 || rawDt > 0.25) return; // fon yorlig‘idan qaytish — hisobga olinmaydi
    perf.frames++; perf.t += rawDt;
    if (perf.t < 2.5) return;
    var fps = perf.frames / perf.t;
    perf.frames = 0; perf.t = 0;
    if (fps >= 40) { perf.level = 3; return; }        // yaxshi — o‘lchashni to‘xtatamiz
    perf.level++;
    if (perf.level === 1) { renderer.setPixelRatio(1); cloudGeo.setDrawRange(0, Math.floor(clouds.length * 0.6) * 6); }
    else if (perf.level === 2) { renderer.setPixelRatio(0.75); cloudGeo.setDrawRange(0, Math.floor(clouds.length * 0.35) * 6); }
    else if (fps < 20) { fallback(); }                  // juda sekin — 3D’siz rejim
    resize();
  }

  function frame(now) {
    if (stopped) return;
    requestAnimationFrame(frame);
    if (document.hidden) { last = now; return; }
    var rawDt = (now - last) / 1000;
    var dt = Math.min(0.05, rawDt); last = now; time += dt;
    adapt(rawDt);

    var target = zForScroll(window.scrollY);
    var prev = camZ;
    camZ = reduce ? target : camZ + (target - camZ) * (1 - Math.exp(-dt * 2.6));
    speed = lerp(speed, Math.abs(camZ - prev) / Math.max(dt, 0.001), 0.1);

    var p = clamp(camZ / Z_END, 0, 1);
    var path = pathAt(camZ);

    // Sichqonchaga qarab yumshoq og‘ish
    look.x += (mouse.x - look.x) * (1 - Math.exp(-dt * 2.2));
    look.y += (mouse.y - look.y) * (1 - Math.exp(-dt * 2.2));
    var bob = reduce ? 0 : Math.sin(time * 0.6) * 0.35;

    camera.position.set(look.x * 5 + Math.sin(camZ * 0.012) * 4, path[1] - look.y * 2.5 + bob, camZ);
    camera.rotation.order = "YXZ";
    camera.rotation.y = -look.x * 0.16 - Math.sin(camZ * 0.012) * 0.04;
    camera.rotation.x = path[2] - look.y * 0.07;
    camera.rotation.z = -look.x * 0.05 + Math.sin(time * 0.4) * 0.006;
    var fov = (camera.aspect < 0.8 ? 72 : 58) + Math.min(speed * 0.12, 14);
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = lerp(camera.fov, fov, 0.15); camera.updateProjectionMatrix(); }

    // Ranglar
    var s = skyAt(p);
    skyMat.uniforms.uTop.value.copy(s.top); skyMat.uniforms.uHor.value.copy(s.hor);
    skyMat.uniforms.uBot.value.copy(s.bot); skyMat.uniforms.uSun.value.copy(s.sun);
    skyMat.uniforms.uSunDir.value.set(lerp(-0.2, 0.25, p), lerp(0.16, 0.03, p), -1).normalize();
    scene.fog.color.copy(s.hor);
    scene.fog.near = lerp(50, 30, p); scene.fog.far = lerp(420, 300, p);
    cloudMat.uniforms.uLight.value.copy(s.cl); cloudMat.uniforms.uShadow.value.copy(s.cs);
    cloudMat.uniforms.uFog.value.copy(s.hor); cloudMat.uniforms.uTime.value = time;
    hemi.color.copy(s.cl); hemi.groundColor.copy(s.cs); hemi.intensity = lerp(0.9, 0.55, p);
    sun.color.copy(s.sun); sun.intensity = lerp(0.75, 0.55, p);
    sky.position.copy(camera.position);

    // Jonli obyektlar
    chutes.forEach(function (c) {
      var u = c.userData;
      c.position.y = u.base + Math.sin(time * u.sp + u.ph) * 1.6;
      c.rotation.z = Math.sin(time * 0.8 + u.ph) * 0.12;
      c.rotation.y += dt * 0.15;
    });
    floaters.forEach(function (f) {
      f.position.y = f.userData.base + Math.sin(time * 0.7 + f.userData.ph) * 1.2;
      f.rotation.x += dt * 0.25; f.rotation.y += dt * 0.35;
    });
    var px = ((time * 14) % 320) - 160;
    plane.position.set(px, 34 + Math.sin(time * 0.5) * 1.5, -215);
    plane.rotation.set(0.05, 0, Math.sin(time * 0.5) * 0.05);
    pin.position.y = -36 + Math.sin(time * 1.8) * 1.2;
    pin.rotation.y = time * 0.6;
    var halo = pin.getObjectByName("halo");
    halo.scale.setScalar(1 + (time % 1.6) / 1.6 * 0.8);
    halo.material.opacity = 0.5 * (1 - (time % 1.6) / 1.6);

    renderer.render(scene, camera);

    // HUD
    var alt = Math.max(120, Math.round((camera.position.y + 22) * 170 / 10) * 10);
    if (alt !== lastAlt && hudAlt) { hudAlt.textContent = alt.toLocaleString("ru-RU").replace(/,/g, " ") + " m"; lastAlt = alt; }
    if (hudBar) { hudBar.style.transform = "scaleX(" + p.toFixed(4) + ")"; hudPlane.style.left = (p * 100).toFixed(2) + "%"; }
    root.style.setProperty("--dusk", smooth((p - 0.62) / 0.3).toFixed(3));
  }

  resize();
  requestAnimationFrame(frame);
})();
