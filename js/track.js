/* Yengil statistika: kimdir sahifaga kirdi, nimani bosdi, qaysi bo‘limgacha yetdi.
   Cookie ishlatilmaydi. Shaxsiy ma’lumot (IP, ism, telefon) yuborilmaydi.
   Faqat data.js dagi api.endpoint to‘ldirilgan bo‘lsa ishlaydi. */
(function () {
  "use strict";

  var S = window.SITE || {};
  var store = function (kind) { try { return window[kind]; } catch (e) { return null; } };
  var ses = store("sessionStorage"), loc = store("localStorage");

  function rnd() {
    try {
      var a = new Uint8Array(9); crypto.getRandomValues(a);
      return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
    } catch (e) { return Math.random().toString(16).slice(2) + Date.now().toString(16); }
  }
  var today = new Date().toISOString().slice(0, 10);

  // Bir kunlik anonim belgi: ertasi kuni yangilanadi, shuning uchun odamni kunlar bo‘yicha kuzatib bo‘lmaydi
  var vid;
  try {
    var saved = JSON.parse((loc && loc.getItem("tb_v")) || "null");
    if (saved && saved.d === today) vid = saved.id;
  } catch (e) {}
  if (!vid) { vid = rnd(); try { loc && loc.setItem("tb_v", JSON.stringify({ d: today, id: vid })); } catch (e) {} }

  var sid = (ses && ses.getItem("tb_s")) || rnd();
  try { ses && ses.setItem("tb_s", sid); } catch (e) {}

  var optOut = false;
  try { optOut = (loc && loc.getItem("topibber-notrack") === "1") || navigator.doNotTrack === "1" || window.doNotTrack === "1"; } catch (e) {}
  // Admin panelga kirgan brauzer hisobga olinmaydi; qoralama ko‘rinishi ham
  if (/[?&]preview\b/.test(location.search)) optOut = true;

  var cut = function (s, n) { return String(s == null ? "" : s).slice(0, n || 80); };
  var device = function () { var w = window.innerWidth; return w < 640 ? "telefon" : w < 1024 ? "planshet" : "kompyuter"; };

  function ref() {
    var q = /[?&]utm_source=([^&#]+)/.exec(location.search);
    if (q) return "utm:" + decodeURIComponent(q[1]);
    if (!document.referrer) return "";
    try {
      var h = new URL(document.referrer).hostname.replace(/^www\./, "");
      return h === location.hostname.replace(/^www\./, "") ? "" : h;
    } catch (e) { return ""; }
  }

  function send(type, label) {
    var ep = ((window.SITE && window.SITE.api && window.SITE.api.endpoint) || "").replace(/\/+$/, "");
    if (!ep || optOut) return;
    var body = JSON.stringify({
      t: cut(type, 16), l: cut(label), v: vid, r: type === "view" ? cut(ref(), 60) : "",
      d: device(), lg: cut((navigator.language || "").slice(0, 2), 5),
    });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(ep + "/track", new Blob([body], { type: "text/plain" }))) return;
    } catch (e) {}
    try { fetch(ep + "/track", { method: "POST", body: body, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(function () {}); } catch (e) {}
  }

  window.TopibTrack = { send: send, sid: sid, vid: vid };

  /* Sahifaga kirish */
  send("view", "");

  /* Bosishlar: data-track="Nom" bor har qanday havola/tugma */
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-track]");
    if (t) send("click", t.getAttribute("data-track"));
  }, true);

  /* Qaysi bo‘limgacha yetib kelgani (har bir bo‘lim bir marta) */
  var names = { home: "Bosh sahifa", qanday: "Jarayon", katalog: "Katalog", shartlar: "Shartlar", taqiqlangan: "Taqiqlangan", buyurtma: "Buyurtma formasi", aloqa: "Aloqa" };
  if ("IntersectionObserver" in window) {
    var seen = {};
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        var id = e.target.id;
        if (e.isIntersecting && !seen[id]) { seen[id] = 1; send("section", names[id] || id); }
      });
    }, { threshold: 0, rootMargin: "-48% 0px -48% 0px" }); // ekran o‘rtasidagi ingichka chiziqdan o‘tganda
    Object.keys(names).forEach(function (id) { var n = document.getElementById(id); if (n) io.observe(n); });
  }
})();
