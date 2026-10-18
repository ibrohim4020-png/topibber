/* Admin panel — sayt ma’lumotlarini (js/data.js) tahrirlash va statistikani ko‘rish.
   O‘zgarishlar avval shu brauzerda qoralama sifatida saqlanadi.
   “Nashr qilish” → yangilanish.zip ni yuklab olib, sayt papkasiga yoyasiz. */
(function () {
  "use strict";

  var KEY = "topibber-draft", KEYSTORE = "topibber-adminkey";
  var BASE = window.SITE || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var clone = function (o) { return JSON.parse(JSON.stringify(o)); };

  // Admin kirgan brauzer saytning statistikasiga qo‘shilmasin
  try { localStorage.setItem("topibber-notrack", "1"); } catch (e) {}

  var D;
  try { D = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { D = null; }
  D = D || clone(BASE);
  var defaults = { brand: {}, images: {}, contacts: {}, categories: [], products: [], gallery: [], steps: [], pricing: [], terms: [], api: { endpoint: "" }, prohibited: { list: [], keywords: [] }, text: {} };
  Object.keys(defaults).forEach(function (k) { if (D[k] == null) D[k] = clone(defaults[k]); });
  delete D.orders; // eski versiyadagi token maydoni: endi saytda saqlanmaydi
  while (D.steps.length < 3) D.steps.push({ title: "", text: "" });
  while (D.pricing.length < 3) D.pricing.push({ title: "", text: "" });

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") n.textContent = attrs[k];
      else if (k === "class") n.className = attrs[k];
      else if (k.indexOf("on") === 0) n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function getPath(p) { return p.split(".").reduce(function (o, k) { return o == null ? o : o[k]; }, D); }
  function setPath(p, v) {
    var ks = p.split("."), o = D;
    ks.slice(0, -1).forEach(function (k) { if (o[k] == null) o[k] = {}; o = o[k]; });
    o[ks[ks.length - 1]] = v;
  }
  function toast(msg) {
    var t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 2400);
  }
  function show(box, msg, kind, extra) {
    box.innerHTML = ""; box.className = "result " + (kind || "");
    box.appendChild(document.createTextNode(msg));
    if (extra) box.appendChild(extra);
    box.hidden = false;
  }

  /* ---------- Saqlash ---------- */
  var saveTimer;
  function save() {
    clearTimeout(saveTimer);
    $("#save-state").textContent = "Saqlanmoqda…";
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(KEY, JSON.stringify(D)); updateState(); }
      catch (e) {
        $("#save-state").textContent = "Saqlab bo‘lmadi!";
        alert("Brauzer xotirasi to‘ldi — rasmlar juda ko‘p yoki katta. Ba’zi rasmlarni olib tashlang yoki “Nashr qilish” orqali saqlab, qoralamani tozalang.");
      }
    }, 250);
  }
  function updateState() {
    var dirty = JSON.stringify(D) !== JSON.stringify(BASE);
    $("#draft-banner").hidden = !dirty;
    var s = $("#save-state");
    s.textContent = dirty ? "Qoralama saqlandi · nashr qilinmagan" : "Saytdagi bilan bir xil";
    s.classList.toggle("dirty", dirty);
    $("#brand-name").textContent = (D.brand && D.brand.name) || "Sayt";
  }

  /* ---------- Bo‘limlar ---------- */
  function showTab(name) {
    $$("#tabs button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-tab") === name); });
    $$(".panel").forEach(function (p) { p.hidden = p.getAttribute("data-panel") !== name; });
    window.scrollTo(0, 0);
    if (name === "stats") loadStats();
    if (name === "publish") renderChecks();
  }
  $$("#tabs button").forEach(function (b) { b.addEventListener("click", function () { showTab(b.getAttribute("data-tab")); }); });
  document.addEventListener("click", function (e) {
    var g = e.target.closest("[data-goto]");
    if (g) { e.preventDefault(); showTab(g.getAttribute("data-goto")); }
  });

  function bindInputs(root) {
    $$("[data-bind]", root).forEach(function (inp) {
      var p = inp.getAttribute("data-bind");
      inp.value = getPath(p) || "";
      inp.addEventListener("input", function () { setPath(p, inp.value); save(); });
    });
  }

  /* ---------- Rasm yordamchilari ---------- */
  function resizeImage(file, max, type, quality) {
    return new Promise(function (resolve, reject) {
      if (!/^image\//.test(file.type)) return reject(new Error("Faqat rasm faylini tanlang."));
      var r = new FileReader();
      r.onerror = function () { reject(new Error("Faylni o‘qib bo‘lmadi.")); };
      r.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error("Bu rasmni o‘qib bo‘lmadi.")); };
        img.onload = function () {
          var s = Math.min(1, max / Math.max(img.width, img.height));
          var c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
          var g = c.getContext("2d");
          if (type === "image/jpeg") { g.fillStyle = "#ffffff"; g.fillRect(0, 0, c.width, c.height); }
          g.drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL(type, quality));
        };
        img.src = r.result;
      };
      r.readAsDataURL(file);
    });
  }

  /* ---------- Taqiqlangan so‘zlarni tekshirish (saytdagi bilan bir xil) ---------- */
  function findBanned(text) {
    var words = ((D.prohibited && D.prohibited.keywords) || []).map(function (w) { return String(w).toLowerCase().trim(); }).filter(Boolean);
    var t = String(text || "").toLowerCase().replace(/[‘’ʻʼ`´]/g, "'");
    var tokens = t.split(/[^a-zа-яёўқғҳ0-9']+/i).filter(Boolean);
    for (var i = 0; i < words.length; i++) {
      var w = words[i].replace(/[‘’ʻʼ`´]/g, "'");
      if (w.length >= 6 ? t.indexOf(w) !== -1 : tokens.indexOf(w) !== -1) return words[i];
    }
    return null;
  }

  /* ---------- Mahsulotlar ---------- */
  function catName(id) { var c = D.categories.filter(function (x) { return x.id === id; })[0]; return c ? c.name : "Kategoriyasiz"; }
  function fillCatSelect(sel, withAll) {
    sel.innerHTML = "";
    if (withAll) sel.appendChild(el("option", { value: "", text: "Barcha kategoriyalar" }));
    D.categories.forEach(function (c) { sel.appendChild(el("option", { value: c.id, text: c.name })); });
    if (!withAll) sel.appendChild(el("option", { value: "", text: "Kategoriyasiz" }));
  }
  function thumb(p) {
    var t = el("span", { class: "thumb" });
    if (p.image) {
      var img = el("img", { src: p.image, alt: "" });
      img.onerror = function () { img.replaceWith(document.createTextNode(p.emoji || "📦")); };
      t.appendChild(img);
    } else t.textContent = p.emoji || "📦";
    return t;
  }
  function renderProducts() {
    var list = $("#product-list"), q = $("#product-search").value.trim().toLowerCase(), cat = $("#product-filter").value;
    list.innerHTML = "";
    var items = D.products.filter(function (p) {
      return (!cat || p.category === cat) && (!q || (p.name + " " + (p.description || "")).toLowerCase().indexOf(q) !== -1);
    });
    if (!items.length) { list.appendChild(el("div", { class: "empty", text: D.products.length ? "Hech narsa topilmadi." : "Hali mahsulot yo‘q. “+ Yangi mahsulot” ni bosing." })); return; }
    items.forEach(function (p) {
      var i = D.products.indexOf(p);
      var warn = findBanned(p.name + " " + (p.description || ""));
      list.appendChild(el("div", { class: "prow" }, [
        thumb(p),
        el("div", { class: "pinfo" }, [
          el("b", { text: p.name }),
          el("small", null, [el("span", { class: "tag", text: catName(p.category) }), p.price || "Narxini so‘rash", warn ? el("span", { class: "tag bad", text: "taqiqlangan so‘z: " + warn }) : null]),
        ]),
        el("div", { class: "pbtns" }, [
          el("button", { class: "ibtn", title: "Yuqoriga", "aria-label": "Yuqoriga", text: "↑", onclick: function () { move(i, -1); } }),
          el("button", { class: "ibtn", title: "Pastga", "aria-label": "Pastga", text: "↓", onclick: function () { move(i, 1); } }),
          el("button", { class: "ibtn", title: "Tahrirlash", "aria-label": "Tahrirlash", text: "✎", onclick: function () { openProduct(p); } }),
          el("button", { class: "ibtn del", title: "O‘chirish", "aria-label": "O‘chirish", text: "🗑", onclick: function () {
            if (confirm("“" + p.name + "” o‘chirilsinmi?")) { D.products.splice(i, 1); save(); renderProducts(); }
          } }),
        ]),
      ]));
    });
  }
  function move(i, d) {
    var j = i + d;
    if (j < 0 || j >= D.products.length) return;
    var t = D.products[i]; D.products[i] = D.products[j]; D.products[j] = t;
    save(); renderProducts();
  }
  $("#product-search").addEventListener("input", renderProducts);
  $("#product-filter").addEventListener("change", renderProducts);

  var editing = null, pImage = "";
  function setPreview(src, emoji) {
    $("#p-img-emoji").textContent = emoji || "📦";
    $("#p-img-emoji").hidden = !!src;
    $("#p-img").hidden = !src;
    if (src) $("#p-img").src = src; else $("#p-img").removeAttribute("src");
  }
  function checkProductBan() {
    var hit = findBanned($("#p-name").value + " " + $("#p-desc").value);
    var b = $("#p-ban");
    if (hit) show(b, "Diqqat: “" + hit + "” taqiqlangan ro‘yxatdagi so‘zga to‘g‘ri keladi. Bunday mahsulotni katalogga qo‘shish tavsiya etilmaydi.", "err"); else b.hidden = true;
  }
  $("#p-name").addEventListener("input", checkProductBan);
  $("#p-desc").addEventListener("input", checkProductBan);
  function openProduct(p) {
    editing = p || null;
    $("#pmodal-title").textContent = p ? "Mahsulotni tahrirlash" : "Yangi mahsulot";
    fillCatSelect($("#p-cat"), false);
    $("#p-name").value = p ? p.name : "";
    $("#p-cat").value = p ? (p.category || "") : ($("#product-filter").value || (D.categories[0] && D.categories[0].id) || "");
    $("#p-desc").value = p ? p.description || "" : "";
    $("#p-price").value = p && p.price ? p.price : "";
    $("#p-emoji").value = p ? p.emoji || "" : "📦";
    pImage = p ? p.image || "" : "";
    setPreview(pImage, $("#p-emoji").value);
    checkProductBan();
    $("#pmodal").hidden = false;
    setTimeout(function () { $("#p-name").focus(); }, 50);
  }
  function closeModal() { $("#pmodal").hidden = true; $("#p-file").value = ""; }
  $$("#pmodal [data-close]").forEach(function (b) { b.addEventListener("click", closeModal); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("#pmodal").hidden) closeModal(); });
  $("#add-product").addEventListener("click", function () { openProduct(null); });
  $("#p-emoji").addEventListener("input", function () { if (!pImage) setPreview("", $("#p-emoji").value); });
  $("#p-img-clear").addEventListener("click", function () { pImage = ""; setPreview("", $("#p-emoji").value); });
  $("#p-img").addEventListener("error", function () { if (pImage) setPreview("", $("#p-emoji").value); });
  $("#p-file").addEventListener("change", function () {
    var f = this.files && this.files[0];
    if (!f) return;
    resizeImage(f, 800, "image/jpeg", 0.82).then(function (d) { pImage = d; setPreview(pImage, $("#p-emoji").value); }, function (e) { alert(e.message); });
  });
  $("#pform").addEventListener("submit", function (e) {
    e.preventDefault();
    var name = $("#p-name").value.trim();
    if (!name) { $("#p-name").focus(); return; }
    if (findBanned(name + " " + $("#p-desc").value) && !confirm("Bu mahsulot taqiqlangan ro‘yxatdagi so‘zga to‘g‘ri keladi. Baribir saqlansinmi?")) return;
    var p = editing || { id: "p" + Date.now().toString(36) };
    p.name = name;
    p.category = $("#p-cat").value;
    p.description = $("#p-desc").value.trim();
    p.price = $("#p-price").value.trim() || null;
    p.emoji = $("#p-emoji").value.trim() || "📦";
    p.image = pImage;
    if (!editing) D.products.unshift(p);
    save(); renderProducts(); closeModal();
    toast(editing ? "Mahsulot yangilandi" : "Mahsulot qo‘shildi");
  });

  /* ---------- Kategoriyalar ---------- */
  function slug(s) {
    var base = String(s).toLowerCase().replace(/[‘’ʻʼ'`]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "kat";
    var id = base, n = 2;
    while (D.categories.some(function (c) { return c.id === id; })) id = base + "-" + n++;
    return id;
  }
  function renderCategories() {
    var list = $("#category-list");
    list.innerHTML = "";
    D.categories.forEach(function (c, i) {
      var count = D.products.filter(function (p) { return p.category === c.id; }).length;
      var inp = el("input", { value: c.name, "aria-label": "Kategoriya nomi" });
      inp.addEventListener("input", function () { c.name = inp.value; save(); });
      list.appendChild(el("div", { class: "row" }, [
        el("div", null, [inp, el("small", { text: count + " ta mahsulot" })]),
        el("div", { class: "pbtns" }, [
          el("button", { class: "ibtn", text: "↑", title: "Yuqoriga", "aria-label": "Yuqoriga", onclick: function () { if (i > 0) { D.categories.splice(i - 1, 0, D.categories.splice(i, 1)[0]); save(); renderCategories(); } } }),
          el("button", { class: "ibtn del", text: "🗑", title: "O‘chirish", "aria-label": "O‘chirish", onclick: function () {
            if (!confirm("“" + c.name + "” o‘chirilsinmi?" + (count ? "\n" + count + " ta mahsulot kategoriyasiz qoladi." : ""))) return;
            D.products.forEach(function (p) { if (p.category === c.id) p.category = ""; });
            D.categories.splice(i, 1); save(); renderCategories();
          } }),
        ]),
      ]));
    });
    if (!D.categories.length) list.appendChild(el("div", { class: "empty", text: "Kategoriya yo‘q." }));
    fillCatSelect($("#product-filter"), true);
  }
  $("#add-category").addEventListener("click", function () {
    var name = prompt("Kategoriya nomi:");
    if (!name || !name.trim()) return;
    D.categories.push({ id: slug(name), name: name.trim() });
    save(); renderCategories();
  });

  /* ---------- Matnlar ---------- */
  function renderTexts() {
    var box = $("#texts-edit"), group = null, card = null;
    box.innerHTML = "";
    D.text = D.text || {};
    (window.TEXTS || []).forEach(function (t) {
      if (t.g !== group) {
        group = t.g;
        card = el("div", { class: "card" }, [el("h2", { text: group })]);
        box.appendChild(card);
      }
      var inp = t.long ? el("textarea", { rows: "2" }) : el("input", {});
      inp.value = D.text[t.k] || "";
      inp.placeholder = t.def;
      inp.addEventListener("input", function () {
        if (inp.value.trim()) D.text[t.k] = inp.value; else delete D.text[t.k];
        save();
      });
      card.appendChild(el("label", { class: "f" }, [el("span", { text: t.label }), inp]));
    });
  }
  function pairEditor(box, arr, label) {
    box.innerHTML = "";
    arr.forEach(function (it, i) {
      var t = el("input", { value: it.title || "" }), x = el("textarea", { rows: "2" });
      x.value = it.text || "";
      t.addEventListener("input", function () { it.title = t.value; save(); });
      x.addEventListener("input", function () { it.text = x.value; save(); });
      box.appendChild(el("div", { class: "sub" }, [
        el("div", { class: "sub-head", text: label + " " + (i + 1) }),
        el("label", { class: "f" }, [el("span", { text: "Sarlavha" }), t]),
        el("label", { class: "f" }, [el("span", { text: "Matn" }), x]),
      ]));
    });
  }

  /* ---------- Rasmlar: logotip va galereya ---------- */
  function renderLogo() {
    var has = !!D.images.logo;
    $("#logo-prev").hidden = !has;
    $("#logo-box").firstElementChild.hidden = has;
    if (has) $("#logo-prev").src = D.images.logo; else $("#logo-prev").removeAttribute("src");
  }
  $("#logo-file").addEventListener("change", function () {
    var f = this.files && this.files[0];
    if (!f) return;
    resizeImage(f, 256, "image/png").then(function (d) { D.images.logo = d; save(); renderLogo(); toast("Logotip yangilandi"); }, function (e) { alert(e.message); });
    this.value = "";
  });
  $("#logo-clear").addEventListener("click", function () { D.images.logo = ""; save(); renderLogo(); });

  function renderGallery() {
    var box = $("#gallery-edit");
    box.innerHTML = "";
    D.gallery.forEach(function (g, i) {
      var cap = el("input", { value: g.caption || "", placeholder: "Izoh (ixtiyoriy)", "aria-label": "Rasm izohi" });
      cap.addEventListener("input", function () { g.caption = cap.value; save(); });
      box.appendChild(el("div", { class: "gitem" }, [
        el("img", { src: g.image, alt: "" }),
        cap,
        el("div", { class: "pbtns" }, [
          el("button", { class: "ibtn", text: "←", title: "Oldinga", "aria-label": "Oldinga", onclick: function () { if (i > 0) { D.gallery.splice(i - 1, 0, D.gallery.splice(i, 1)[0]); save(); renderGallery(); } } }),
          el("button", { class: "ibtn del", text: "🗑", title: "O‘chirish", "aria-label": "O‘chirish", onclick: function () { D.gallery.splice(i, 1); save(); renderGallery(); } }),
        ]),
      ]));
    });
    if (!D.gallery.length) box.appendChild(el("div", { class: "empty", text: "Hali rasm yo‘q — bo‘lim saytda ko‘rinmaydi." }));
  }
  $("#gallery-file").addEventListener("change", function () {
    var files = Array.prototype.slice.call(this.files || []);
    this.value = "";
    files.reduce(function (p, f) {
      return p.then(function () {
        return resizeImage(f, 1000, "image/jpeg", 0.8).then(function (d) { D.gallery.push({ image: d, caption: "" }); }, function (e) { alert(f.name + ": " + e.message); });
      });
    }, Promise.resolve()).then(function () { save(); renderGallery(); });
  });

  /* ---------- Shartlar ---------- */
  function renderTerms() {
    var box = $("#terms-edit");
    box.innerHTML = "";
    D.terms.forEach(function (t, i) {
      var title = el("input", { value: t.title || "" }), body = el("textarea", { rows: "5" });
      body.value = (t.paragraphs || []).join("\n\n");
      title.addEventListener("input", function () { t.title = title.value; save(); });
      body.addEventListener("input", function () {
        t.paragraphs = body.value.split(/\n\s*\n/).map(function (s) { return s.trim(); }).filter(Boolean); save();
      });
      box.appendChild(el("div", { class: "card" }, [
        el("label", { class: "f" }, [el("span", { text: "Bo‘lim nomi" }), title]),
        el("label", { class: "f" }, [el("span", { text: "Matn" }), body]),
        el("button", { class: "btn btn-danger btn-sm", text: "Bo‘limni o‘chirish", onclick: function () {
          if (confirm("“" + t.title + "” o‘chirilsinmi?")) { D.terms.splice(i, 1); save(); renderTerms(); }
        } }),
      ]));
    });
  }
  $("#add-term").addEventListener("click", function () {
    D.terms.push({ id: "shart" + Date.now().toString(36), title: "Yangi bo‘lim", paragraphs: [] });
    save(); renderTerms();
  });

  /* ---------- Taqiqlangan ---------- */
  function linesEditor(ta, path, lower) {
    ta.value = (getPath(path) || []).join("\n");
    ta.addEventListener("input", function () {
      var arr = ta.value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
      if (lower) arr = arr.map(function (s) { return s.toLowerCase(); });
      setPath(path, arr); save(); tryBan();
    });
  }
  function tryBan() {
    var v = $("#ban-try").value.trim(), box = $("#ban-try-result");
    if (!v) { box.hidden = true; return; }
    var hit = findBanned(v);
    show(box, hit ? "Rad etiladi: “" + hit + "” so‘ziga to‘g‘ri keldi." : "Ruxsat etiladi: bunday so‘z topilmadi.", hit ? "err" : "ok");
  }
  $("#ban-try").addEventListener("input", tryBan);

  /* ---------- Aloqa ---------- */
  function handle(v, host) {
    v = v.trim();
    var m = v.match(new RegExp(host.replace(".", "\\.") + "/([A-Za-z0-9_.]+)"));
    var name = m ? m[1] : v.replace(/^@/, "");
    return name ? { name: "@" + name, link: "https://" + host + "/" + name } : { name: "", link: "" };
  }
  function contactsEditor() {
    var c = D.contacts;
    var ph = $("#c-phone"), tg = $("#c-telegram"), ig = $("#c-instagram");
    ph.value = c.phone || ""; tg.value = c.telegram || ""; ig.value = c.instagram || "";
    ph.addEventListener("input", function () {
      c.phone = ph.value.trim();
      c.phoneLink = "tel:" + (c.phone.charAt(0) === "+" ? "+" : "") + c.phone.replace(/\D/g, "");
      save();
    });
    tg.addEventListener("input", function () { var h = handle(tg.value, "t.me"); c.telegram = h.name; c.telegramLink = h.link; save(); });
    ig.addEventListener("input", function () { var h = handle(ig.value, "instagram.com"); c.instagram = h.name; c.instagramLink = h.link; save(); });
  }

  /* ---------- Ulanish (Cloudflare Worker) ---------- */
  var epInput = $("#api-endpoint"), keyInput = $("#admin-key");
  epInput.value = D.api.endpoint || "";
  try { keyInput.value = localStorage.getItem(KEYSTORE) || ""; } catch (e) {}
  function endpoint() { return (D.api.endpoint || "").replace(/\/+$/, ""); }
  epInput.addEventListener("input", function () {
    var v = epInput.value.trim().replace(/\/+$/, "");
    D.api.endpoint = v; save();
  });
  keyInput.addEventListener("input", function () { try { localStorage.setItem(KEYSTORE, keyInput.value.trim()); } catch (e) {} });
  function adminKey() { return keyInput.value.trim(); }
  function call(path, opts) {
    var ep = endpoint();
    if (!/^https:\/\//i.test(ep)) return Promise.reject(new Error("Avval Worker manzilini kiriting (https:// bilan boshlanadi)."));
    opts = opts || {};
    opts.headers = Object.assign({ Authorization: "Bearer " + adminKey() }, opts.headers || {});
    return fetch(ep + path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok || j.ok === false) throw new Error(j.error || ("Server javobi: " + r.status));
        return j;
      });
    });
  }
  $("#check-conn").addEventListener("click", function () {
    var box = $("#conn-result");
    show(box, "Tekshirilmoqda…");
    call("/health").then(function (h) {
      var lines = [
        (h.db ? "✓" : "✗") + " D1 ma’lumotlar bazasi (DB) ulangan",
        (h.telegram ? "✓" : "✗") + " BOT_TOKEN va CHAT_ID kiritilgan",
        (h.admin ? "✓" : "✗") + " ADMIN_KEY kiritilgan",
      ];
      var okAll = h.db && h.telegram && h.admin;
      if (!adminKey()) { show(box, lines.join("\n") + "\n— ADMIN_KEY ni yuqoriga yozing, shunda kalit ham tekshiriladi.", okAll ? "" : "err"); return; }
      return call("/stats?days=1").then(function () {
        show(box, lines.join("\n") + "\n✓ Kalit to‘g‘ri. Hammasi tayyor — “Nashr qilish” orqali manzilni saytga chiqaring.", okAll ? "ok" : "err");
      }, function (e) { show(box, lines.join("\n") + "\n✗ " + e.message, "err"); });
    }).catch(function (e) { show(box, "Ulanib bo‘lmadi: " + e.message, "err"); });
  });
  $("#test-order").addEventListener("click", function () {
    var box = $("#conn-result");
    show(box, "Yuborilmoqda…");
    call("/test", { method: "POST" }).then(function () { show(box, "Yuborildi! Telegram’ni tekshiring.", "ok"); }, function (e) { show(box, e.message, "err"); });
  });
  $("#find-chat").addEventListener("click", function () {
    var box = $("#chat-result"), token = $("#tmp-token").value.trim();
    if (!/^\d+:[\w-]{20,}$/.test(token)) { show(box, "Bot tokenni to‘liq kiriting.", "err"); return; }
    show(box, "Qidirilmoqda…");
    var fd = new FormData();
    fetch("https://api.telegram.org/bot" + token + "/getUpdates", { method: "POST", body: fd })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.ok) throw new Error(j.description || "Telegram xatosi");
        var chats = {};
        j.result.forEach(function (u) {
          var m = u.message || u.channel_post || u.my_chat_member || u.edited_message;
          if (m && m.chat) chats[m.chat.id] = m.chat;
        });
        var ids = Object.keys(chats);
        if (!ids.length) { show(box, "Chat topilmadi. Botingizga Telegram’da /start yozing va qayta bosing.", "err"); return; }
        var list = el("div", { class: "chat-pick" });
        ids.forEach(function (id) {
          var c = chats[id], label = c.title || [c.first_name, c.last_name].filter(Boolean).join(" ") || c.username || id;
          list.appendChild(el("div", null, [label + " — CHAT_ID: ", el("b", { text: String(id) })]));
        });
        show(box, "Cloudflare’da CHAT_ID ga quyidagi raqamni kiriting:", "ok", list);
        $("#tmp-token").value = "";
      })
      .catch(function (e) { show(box, e.message, "err"); });
  });

  /* ---------- Statistika ---------- */
  // Brauzer o‘zbekcha davlat nomlarini bilmasligi mumkin — keng tarqalganlarini o‘zimiz yozdik, qolganini inglizcha
  var UZ_COUNTRIES = { UZ: "O‘zbekiston", KZ: "Qozog‘iston", KG: "Qirg‘iziston", TJ: "Tojikiston", TM: "Turkmaniston", AF: "Afg‘oniston",
    RU: "Rossiya", UA: "Ukraina", BY: "Belarus", TR: "Turkiya", AZ: "Ozarbayjon", GE: "Gruziya", AM: "Armaniston",
    US: "AQSh", GB: "Buyuk Britaniya", DE: "Germaniya", FR: "Fransiya", IT: "Italiya", ES: "Ispaniya", PL: "Polsha", NL: "Niderlandiya",
    CN: "Xitoy", KR: "Janubiy Koreya", JP: "Yaponiya", IN: "Hindiston", PK: "Pokiston", AE: "BAA", SA: "Saudiya Arabistoni", QA: "Qatar",
    CA: "Kanada", AU: "Avstraliya", IR: "Eron", IL: "Isroil", EG: "Misr", LT: "Litva", LV: "Latviya", EE: "Estoniya", CZ: "Chexiya", SE: "Shvetsiya" };
  var regionNames = null;
  try { regionNames = new Intl.DisplayNames(["en"], { type: "region" }); } catch (e) {}
  function countryName(code) {
    if (!code || code === "??") return "Noma’lum";
    if (UZ_COUNTRIES[code]) return UZ_COUNTRIES[code];
    try { return (regionNames && regionNames.of(code)) || code; } catch (e) { return code; }
  }
  function sumMaps(days, field) {
    var out = {};
    days.forEach(function (d) { Object.keys(d[field] || {}).forEach(function (k) { out[k] = (out[k] || 0) + d[field][k]; }); });
    return out;
  }
  function total(m) { return Object.keys(m).reduce(function (a, k) { return a + m[k]; }, 0); }
  function bars(box, map, opts) {
    opts = opts || {};
    box.innerHTML = "";
    var rows = Object.keys(map).map(function (k) { return [k, map[k]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, opts.limit || 8);
    if (!rows.length) { box.appendChild(el("p", { class: "muted", text: "Hozircha ma’lumot yo‘q." })); return; }
    var max = rows[0][1], sum = total(map);
    rows.forEach(function (r) {
      var label = opts.label ? opts.label(r[0]) : r[0];
      box.appendChild(el("div", { class: "bar" }, [
        el("div", { class: "bar-top" }, [el("span", { text: label }), el("b", { text: r[1] + (opts.pct ? " · " + Math.round(r[1] / sum * 100) + "%" : "") })]),
        el("div", { class: "bar-track" }, [el("i", { style: "width:" + Math.max(3, Math.round(r[1] / max * 100)) + "%" })]),
      ]));
    });
  }
  function chart(box, days) {
    box.innerHTML = "";
    var W = 720, H = 190, padL = 28, padB = 26, n = days.length;
    var max = Math.max(1, Math.max.apply(null, days.map(function (d) { return Math.max(d.visitors, d.views); })));
    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Kunlar bo‘yicha tashriflar grafigi");
    var mk = function (tag, attrs) { var e = document.createElementNS(NS, tag); Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); }); return e; };
    [0, 0.5, 1].forEach(function (f) {
      var y = H - padB - f * (H - padB - 10);
      svg.appendChild(mk("line", { x1: padL, x2: W, y1: y, y2: y, class: "grid" }));
      var t = mk("text", { x: padL - 6, y: y + 4, class: "ax", "text-anchor": "end" }); t.textContent = Math.round(max * f); svg.appendChild(t);
    });
    var slot = (W - padL) / n, bw = Math.max(3, Math.min(26, slot * 0.6));
    days.forEach(function (d, i) {
      var x = padL + slot * i + (slot - bw) / 2;
      var h = d.visitors / max * (H - padB - 10);
      var r = mk("rect", { x: x, y: H - padB - h, width: bw, height: Math.max(h, d.visitors ? 2 : 0), rx: 3, class: "bar-v" });
      var tt = mk("title", {}); tt.textContent = d.date + ": " + d.visitors + " kishi, " + d.views + " ko‘rish"; r.appendChild(tt);
      svg.appendChild(r);
      var step = Math.ceil(n / 7);
      if (n <= 10 || (i % step === 0 && i < n - step / 2) || i === n - 1) {
        var lt = mk("text", { x: x + bw / 2, y: H - 8, class: "ax", "text-anchor": "middle" }); lt.textContent = d.date.slice(5); svg.appendChild(lt);
      }
    });
    box.appendChild(svg);
    box.appendChild(el("p", { class: "legend", text: "Ustunlar — shu kuni kirgan odamlar soni." }));
  }
  function loadStats() {
    var setup = $("#stats-setup"), body = $("#stats-body"), err = $("#stats-error");
    err.hidden = true;
    if (!/^https:\/\//i.test(endpoint()) || !adminKey()) { setup.hidden = false; body.hidden = true; return; }
    setup.hidden = true;
    var days = parseInt($("#stats-range").value, 10) || 30;
    call("/stats?days=" + days).then(function (j) {
      body.hidden = false;
      var d = j.days || [];
      var visitors = d.reduce(function (a, x) { return a + x.visitors; }, 0);
      var views = d.reduce(function (a, x) { return a + x.views; }, 0);
      var clicks = sumMaps(d, "clicks"), orders = sumMaps(d, "orders"), blocked = sumMaps(d, "blocked");
      var nOrders = total(orders);
      var kp = $("#kpis"); kp.innerHTML = "";
      [["Kirganlar", visitors, "odam"], ["Ko‘rishlar", views, "marta"], ["Bosishlar", total(clicks), "marta"],
       ["Yuborilgan so‘rovlar", nOrders, visitors ? (nOrders / visitors * 100).toFixed(1) + "% kirganlardan" : ""]].forEach(function (k) {
        kp.appendChild(el("div", { class: "kpi" }, [el("small", { text: k[0] }), el("b", { text: String(k[1]) }), el("span", { text: k[2] })]));
      });
      chart($("#chart-days"), d);
      bars($("#list-countries"), sumMaps(d, "uc"), { label: countryName, pct: true });
      bars($("#list-cities"), sumMaps(d, "ucity"), { limit: 10 });
      bars($("#list-clicks"), clicks, { limit: 12 });
      bars($("#list-sections"), sumMaps(d, "sections"), {});
      bars($("#list-refs"), sumMaps(d, "refs"), { pct: true });
      bars($("#list-devices"), sumMaps(d, "dev"), { pct: true });
      bars($("#list-orders"), orders, { limit: 10 });
      bars($("#list-blocked"), blocked, { limit: 10 });
    }).catch(function (e) { body.hidden = true; show(err, "Statistikani olib bo‘lmadi: " + e.message, "err"); });
  }
  $("#stats-refresh").addEventListener("click", loadStats);
  $("#stats-range").addEventListener("change", loadStats);

  /* ---------- Nashr: tekshiruv ---------- */
  function renderChecks() {
    var ul = $("#checks"); ul.innerHTML = "";
    var add = function (kind, text) { ul.appendChild(el("li", { class: kind }, [el("span", { text: text })])); };
    var c = D.contacts || {};
    if (/0000|00 00 00|000 00/.test(c.phone || "") || !c.phone) add("warn", "Telefon raqam hali to‘ldirilmagan (Aloqa bo‘limi).");
    if (/@username/.test(c.telegram || "") || !c.telegram) add("warn", "Telegram manzili hali to‘ldirilmagan (Aloqa bo‘limi).");
    if (/@username/.test(c.instagram || "") || !c.instagram) add("warn", "Instagram manzili hali to‘ldirilmagan (Aloqa bo‘limi).");
    var holes = 0; D.terms.forEach(function (t) { (t.paragraphs || []).forEach(function (p) { if (String(p).trim().charAt(0) === "[") holes++; }); });
    if (holes) add("warn", holes + " ta shart matni to‘ldirilmagan (“[…]” bilan boshlangan qatorlar). Mijozga ko‘rinmaydi, lekin to‘lov/yetkazish/qaytarish shartlarini yozishingiz kerak.");
    var bad = D.products.filter(function (p) { return findBanned(p.name + " " + (p.description || "")); });
    if (bad.length) add("bad", "Katalogda taqiqlangan so‘zga to‘g‘ri keladigan mahsulotlar bor: " + bad.map(function (p) { return p.name; }).join(", "));
    var noimg = D.products.filter(function (p) { return !p.image; }).length;
    if (noimg) add("warn", noimg + " ta mahsulotda haqiqiy rasm yo‘q — vaqtincha belgi (emoji) ko‘rinadi. Haqiqiy rasmlar sotuvni sezilarli oshiradi.");
    if (!/^https:\/\//i.test(endpoint())) add("warn", "Server ulanmagan: forma so‘rovlari hech qayerga yuborilmaydi va statistika yig‘ilmaydi (Ulanish bo‘limi).");
    if (!D.gallery.length) add("info", "Galereya bo‘sh — bu bo‘lim saytda ko‘rinmaydi. Yetkazilgan buyurtmalar suratlari ishonchni oshiradi.");
    if (!D.prohibited.list.length) add("bad", "Taqiqlangan mahsulotlar ro‘yxati bo‘sh.");
    if (!ul.children.length) add("ok", "Hammasi joyida.");
    else if (!ul.querySelector(".bad, .warn")) add("ok", "Jiddiy kamchilik topilmadi.");
  }

  /* ---------- Nashr: ZIP ---------- */
  var crcTable = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(buf) { var c = 0xFFFFFFFF; for (var i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function makeZip(files) { // files: [{name, data:Uint8Array}] — siqmasdan (store)
    var enc = new TextEncoder(), parts = [], central = [], offset = 0, now = new Date();
    var dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    var dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    files.forEach(function (f) {
      var name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, f.data);
      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, size, true); ch.setUint32(24, size, true); ch.setUint16(28, name.length, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + size;
    });
    var cdSize = central.reduce(function (a, p) { return a + p.length; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: "application/zip" });
  }
  function dataUrlToBytes(u) {
    var m = /^data:image\/(\w+);base64,(.*)$/.exec(u);
    if (!m) return null;
    var bin = atob(m[2]), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return { ext: m[1] === "jpeg" ? "jpg" : m[1], bytes: out };
  }
  function fileText(data) {
    return "/* =====================================================================\n" +
      "   SAYT MA’LUMOTLARI — admin panel (admin.html) orqali yaratildi.\n" +
      "   " + new Date().toLocaleString("ru-RU") + "\n" +
      "   ===================================================================== */\n\n" +
      "window.SITE = " + JSON.stringify(data, null, 2) + ";\n";
  }
  function download(blob, name) {
    var a = el("a", { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
  }
  // Rasmlar data-URL ko‘rinishida qoralamada turadi; nashrda alohida fayllarga ajratiladi
  function buildPackage() {
    var out = clone(D), files = [], used = {};
    var put = function (name, u) {
      var r = dataUrlToBytes(u);
      if (!r) return u;
      var path = "images/uploads/" + name + "." + r.ext, n = 2;
      while (used[path]) path = "images/uploads/" + name + "-" + (n++) + "." + r.ext;
      used[path] = 1; files.push({ name: path, data: r.bytes });
      return path;
    };
    out.products.forEach(function (p) { if (p.image) p.image = put("urun-" + p.id, p.image); });
    out.gallery.forEach(function (g, i) { if (g.image) g.image = put("galereya-" + (i + 1), g.image); });
    if (out.images.logo) out.images.logo = put("logo", out.images.logo);
    var js = new TextEncoder().encode(fileText(out));
    files.unshift({ name: "js/data.js", data: js });
    return { files: files, js: js, count: files.length - 1 };
  }
  $("#download-zip").addEventListener("click", function () {
    var pkg = buildPackage();
    download(makeZip(pkg.files), "yangilanish.zip");
    toast("yangilanish.zip yuklab olindi (" + pkg.count + " ta rasm)");
  });
  $("#download-js").addEventListener("click", function () {
    var pkg = buildPackage();
    if (pkg.count) { if (!confirm("Qoralamada " + pkg.count + " ta yangi rasm bor. Faqat data.js yuklansa, rasmlar yetishmaydi. ZIP yuklab olish tavsiya etiladi. Baribir davom etilsinmi?")) return; }
    download(new Blob([pkg.js], { type: "text/javascript;charset=utf-8" }), "data.js");
  });
  $("#import").addEventListener("change", function () {
    var f = this.files && this.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var w = {};
        new Function("window", String(r.result))(w);
        if (!w.SITE || !Array.isArray(w.SITE.products)) throw new Error();
        if (!confirm("Joriy qoralama shu fayldagi ma’lumotlar bilan almashtirilsinmi?")) return;
        localStorage.setItem(KEY, JSON.stringify(w.SITE));
        location.reload();
      } catch (e) { alert("Bu fayl data.js emas yoki buzilgan."); }
    };
    r.readAsText(f);
    this.value = "";
  });
  $("#discard").addEventListener("click", function () {
    if (!confirm("Barcha nashr qilinmagan o‘zgarishlar o‘chiriladi. Davom etilsinmi?")) return;
    localStorage.removeItem(KEY);
    location.reload();
  });

  /* ---------- Ishga tushirish ---------- */
  bindInputs(document);
  renderCategories();
  renderProducts();
  renderTexts();
  renderLogo();
  renderGallery();
  pairEditor($("#steps-edit"), D.steps, "Bosqich");
  pairEditor($("#pricing-edit"), D.pricing, "Blok");
  renderTerms();
  linesEditor($("#prohibited-list"), "prohibited.list");
  linesEditor($("#prohibited-keywords"), "prohibited.keywords", true);
  contactsEditor();
  updateState();
  loadStats();
})();
