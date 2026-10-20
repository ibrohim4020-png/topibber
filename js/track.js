/* Tashrif statistikasi: kim kirdi, qayerdan, qaysi telefondan, qancha turdi, nimani bosdi.
   Ma'lumot Cloudflare Worker'ga ketadi, u yerdan Google Sheets'ga yoziladi.
   Faqat data.js dagi api.endpoint to'ldirilgan bo'lsa ishlaydi.
   Ism/telefon bu yerda yuborilmaydi — ular faqat buyurtma formasi orqali ketadi. */
(function () {
  "use strict";

  var store = function (kind) { try { return window[kind]; } catch (e) { return null; } };
  var ses = store("sessionStorage"), loc = store("localStorage");
  var get = function (s, k) { try { return s && s.getItem(k); } catch (e) { return null; } };
  var set = function (s, k, v) { try { s && s.setItem(k, v); } catch (e) {} };

  function rnd() {
    try {
      var a = new Uint8Array(9); crypto.getRandomValues(a);
      return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
    } catch (e) { return Math.random().toString(16).slice(2) + Date.now().toString(16); }
  }
  var cut = function (s, n) { return String(s == null ? "" : s).slice(0, n || 80); };

  var vid = get(loc, "tb_vid"), isNew = false;
  if (!vid) { vid = rnd(); isNew = true; set(loc, "tb_vid", vid); }
  var sid = get(ses, "tb_s"), fresh = false;
  if (!sid) { sid = rnd(); fresh = true; set(ses, "tb_s", sid); }

  var optOut = false;
  try { optOut = get(loc, "topibber-notrack") === "1" || navigator.doNotTrack === "1" || window.doNotTrack === "1"; } catch (e) {}
  if (/[?&]preview\b/.test(location.search)) optOut = true;

  var device = function () { var w = window.innerWidth; return w < 640 ? "telefon" : w < 1024 ? "planshet" : "kompyuter"; };

  function param(name) {
    var m = new RegExp("[?&]" + name + "=([^&#]*)").exec(location.search);
    try { return m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : ""; } catch (e) { return m ? m[1] : ""; }
  }
  function refHost() {
    if (!document.referrer) return "";
    try {
      var h = new URL(document.referrer).hostname.replace(/^www\./, "");
      return h === location.hostname.replace(/^www\./, "") ? "" : h;
    } catch (e) { return ""; }
  }
  function readAttrib() {
    var a = { src: param("utm_source"), med: param("utm_medium"), cmp: param("utm_campaign"), cnt: param("utm_content"), trm: param("utm_term"), ref: refHost() };
    if (!a.src) {
      if (param("fbclid")) a.src = "facebook";
      else if (param("ttclid")) a.src = "tiktok";
      else if (param("gclid")) a.src = "google";
      else if (param("yclid")) a.src = "yandex";
    }
    return a;
  }
  var fromUrl = readAttrib();
  var hasNew = !!(fromUrl.src || fromUrl.cmp || fromUrl.cnt);
  var attrib = fromUrl;
  if (hasNew) set(ses, "tb_a", JSON.stringify(fromUrl));
  else { try { attrib = JSON.parse(get(ses, "tb_a") || "null") || fromUrl; } catch (e) {} }

  function parseUA() {
    var ua = navigator.userAgent || "", os = "", model = "", br = "";
    var m;
    if ((m = /Android ([\d.]+)/.exec(ua))) {
      os = "Android " + m[1];
      var mm = /Android [\d.]+; ([^;)]+?)(?: Build|\)|;)/.exec(ua);
      if (mm && !/^(K|Linux|U)$/.test(mm[1])) model = mm[1].trim();
    } else if ((m = /iPhone OS ([\d_]+)/.exec(ua))) { os = "iOS " + m[1].replace(/_/g, "."); model = "iPhone"; }
    else if ((m = /iPad.*OS ([\d_]+)/.exec(ua))) { os = "iPadOS " + m[1].replace(/_/g, "."); model = "iPad"; }
    else if (/Windows NT 10/.test(ua)) os = "Windows 10/11";
    else if (/Windows/.test(ua)) os = "Windows";
    else if (/Mac OS X/.test(ua)) { os = "macOS"; model = "Mac"; }
    else if (/CrOS/.test(ua)) os = "ChromeOS";
    else if (/Linux/.test(ua)) os = "Linux";
    if (/Instagram/.test(ua)) br = "Instagram ichki brauzeri";
    else if (/FBAN|FBAV/.test(ua)) br = "Facebook ichki brauzeri";
    else if (/Telegram/i.test(ua)) br = "Telegram ichki brauzeri";
    else if (/TikTok|musical_ly|BytedanceWebview/.test(ua)) br = "TikTok ichki brauzeri";
    else if (/YaBrowser/.test(ua)) br = "Yandex";
    else if (/SamsungBrowser/.test(ua)) br = "Samsung Internet";
    else if (/OPR\/|Opera/.test(ua)) br = "Opera";
    else if (/Edg\//.test(ua)) br = "Edge";
    else if (/Firefox\//.test(ua)) br = "Firefox";
    else if (/Chrome\/|CriOS/.test(ua)) br = "Chrome";
    else if (/Safari\//.test(ua)) br = "Safari";
    return { os: os, model: model, br: br };
  }
  function iphoneGuess() {
    var w = Math.min(screen.width, screen.height), h = Math.max(screen.width, screen.height);
    var map = { "320x568": "iPhone SE/5s", "375x667": "iPhone 6/7/8/SE2/SE3", "414x736": "iPhone 6/7/8 Plus", "375x812": "iPhone X/XS/11 Pro/12-13 mini",
      "414x896": "iPhone XR/XS Max/11/11 Pro Max", "390x844": "iPhone 12/13/14", "428x926": "iPhone 12-14 Plus/Pro Max", "393x852": "iPhone 14 Pro/15/15 Pro/16",
      "430x932": "iPhone 14 Pro Max/15 Plus/15 Pro Max", "402x874": "iPhone 16 Pro/17", "440x956": "iPhone 16 Pro Max/17 Pro Max" };
    return map[w + "x" + h] || ("iPhone (" + w + "x" + h + ")");
  }
  function collectMeta(done) {
    var u = parseUA();
    var meta = {
      os: u.os, model: u.model, br: u.br,
      scr: screen.width + "x" + screen.height + "@" + (window.devicePixelRatio || 1),
      lg: cut(navigator.language, 12), tz: "", land: cut(location.pathname + (hasNew ? location.search : ""), 200), nw: isNew ? 1 : 0,
      con: (navigator.connection && navigator.connection.effectiveType) || "",
    };
    try { meta.tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
    if (u.model === "iPhone") meta.model = iphoneGuess();
    var fin = false, finish = function () { if (!fin) { fin = true; done(meta); } };
    try {
      if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
        navigator.userAgentData.getHighEntropyValues(["model", "platformVersion"]).then(function (v) {
          if (v.model) meta.model = v.model;
          if (v.platformVersion && /Android/.test(meta.os)) meta.os = "Android " + v.platformVersion.split(".")[0];
          finish();
        }, finish);
        setTimeout(finish, 700);
        return;
      }
    } catch (e) {}
    finish();
  }

  function endpoint() { return ((window.SITE && window.SITE.api && window.SITE.api.endpoint) || "").replace(/\/+$/, ""); }
  function send(type, label, extra) {
    var ep = endpoint();
    if (!ep || optOut) return;
    var p = { t: cut(type, 16), l: cut(label), v: vid, s: sid, d: device() };
    if (extra) for (var k in extra) p[k] = extra[k];
    var body = JSON.stringify(p);
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(ep + "/track", new Blob([body], { type: "text/plain" }))) return;
    } catch (e) {}
    try { fetch(ep + "/track", { method: "POST", body: body, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(function () {}); } catch (e) {}
  }

  window.TopibTrack = { send: send, sid: sid, vid: vid, attrib: function () { return attrib; } };

  var active = 0, last = Date.now(), maxScroll = 0, sections = {};
  function tick() {
    var now = Date.now();
    if (!document.hidden) active += Math.min(now - last, 5000);
    last = now;
  }
  function scrolled() {
    var h = document.documentElement, total = (h.scrollHeight - window.innerHeight) || 1;
    var p = Math.round(Math.min(1, Math.max(0, (window.pageYOffset || h.scrollTop) / total)) * 100);
    if (p > maxScroll) maxScroll = p;
  }
  window.addEventListener("scroll", scrolled, { passive: true });
  function ping(kind) {
    tick(); scrolled();
    send(kind, "", { dur: Math.round(active / 1000), sc: maxScroll });
  }

  collectMeta(function (meta) {
    var m = { meta: meta, a: attrib };
    send("view", "", { m: m, fresh: fresh ? 1 : 0, r: attrib.ref ? cut(attrib.ref, 60) : (attrib.src ? "utm:" + cut(attrib.src, 40) : "") });
  });
  setInterval(function () { if (!document.hidden) ping("ping"); }, 15000);
  document.addEventListener("visibilitychange", function () { if (document.hidden) ping("ping"); else last = Date.now(); });
  window.addEventListener("pagehide", function () { ping("ping"); });

  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("[data-track]");
    if (t) send("click", t.getAttribute("data-track"));
  }, true);

  var names = { home: "Bosh sahifa", qanday: "Jarayon", katalog: "Katalog", shartlar: "Shartlar", taqiqlangan: "Taqiqlangan", buyurtma: "Buyurtma formasi", aloqa: "Aloqa" };
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        var id = e.target.id;
        if (e.isIntersecting && !sections[id]) { sections[id] = 1; send("section", names[id] || id); }
      });
    }, { threshold: 0, rootMargin: "-48% 0px -48% 0px" });
    Object.keys(names).forEach(function (id) { var n = document.getElementById(id); if (n) io.observe(n); });
  }
})();
