/* Sayt mantiqi. Ma’lumotlar js/data.js da (admin panel orqali tahrirlanadi). */
(function () {
  "use strict";

  // Admin paneldan "Saytda ko‘rish" bosilganda — saqlanmagan qoralamani ko‘rsatamiz
  if (/[?&]preview\b/.test(location.search)) {
    try {
      var draft = JSON.parse(localStorage.getItem("topibber-draft") || "null");
      if (draft) window.SITE = draft;
    } catch (e) {}
  }
  var S = window.SITE || {};
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var CUSTOM = "__custom";
  var TINTS = ["#f6dccf", "#dcefe6", "#e7e2f6", "#f7e9c9", "#d9eaf6", "#f4d9e4"];
  var track = function (type, label) { if (window.TopibTrack) window.TopibTrack.send(type, label); };

  function get(path) {
    return path.split(".").reduce(function (o, k) { return o == null ? o : o[k]; }, S);
  }
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "text") n.textContent = attrs[k];
      else if (k === "class") n.className = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  // Havolalar faqat xavfsiz turdagi bo‘lsin (javascript: va shunga o‘xshash narsalar o‘tmaydi)
  var safeHref = function (u) { return /^(https?:\/\/|tel:|mailto:|#)/i.test(String(u || "").trim()) ? String(u).trim() : ""; };
  var safeImg = function (u) { return /^(data:image\/(png|jpe?g|webp|gif);|https?:\/\/|images\/|\.\/|\/)/i.test(String(u || "").trim()) ? String(u).trim() : ""; };
  var categoryName = function (id) {
    var c = (S.categories || []).filter(function (x) { return x.id === id; })[0];
    return c ? c.name : "";
  };

  /* ---------- Matn, havola va rasmlarni joylash ---------- */
  $$("[data-bind]").forEach(function (n) {
    var v = get(n.getAttribute("data-bind"));
    if (v != null) n.textContent = v;
  });
  $$("[data-href]").forEach(function (n) {
    var v = safeHref(get(n.getAttribute("data-href")));
    if (v) n.setAttribute("href", v);
  });

  // *so‘z* → rangli kursiv
  function setRich(node, str) {
    node.textContent = "";
    String(str).split("*").forEach(function (part, i) {
      if (!part) return;
      if (i % 2) node.appendChild(el("em", { text: part }));
      else node.appendChild(document.createTextNode(part));
    });
  }
  var texts = S.text || {};
  $$("[data-t]").forEach(function (n) {
    var v = texts[n.getAttribute("data-t")];
    if (typeof v === "string" && v.trim()) setRich(n, v.trim());
  });

  if (S.brand && S.brand.name) document.title = S.brand.name + " — Xitoydan buyurtma xizmati";
  $("#year").textContent = new Date().getFullYear() + " " + ((S.brand && S.brand.name) || "");

  var logo = safeImg(S.images && S.images.logo);
  if (logo) {
    var li = $("#logo-img");
    li.src = logo; li.hidden = false; $("#logo-svg").style.display = "none";
    $("#favicon").href = logo;
  }

  /* ---------- Bosqichlar ---------- */
  (S.steps || []).forEach(function (s, i) {
    $("#steps").appendChild(el("li", { class: "step" }, [
      el("span", { class: "step-num", "aria-hidden": "true", text: String(i + 1) }),
      el("h3", { text: s.title }),
      el("p", { text: s.text }),
    ]));
  });

  /* ---------- Katalog ---------- */
  var grid = $("#grid"), chips = $("#chips"), activeCat = "all";

  function renderChips() {
    var cats = [{ id: "all", name: "Barchasi" }].concat(S.categories || []);
    cats.forEach(function (c) {
      var b = el("button", { class: "chip", type: "button", role: "tab", "aria-selected": String(c.id === activeCat), text: c.name });
      b.addEventListener("click", function () {
        activeCat = c.id;
        $$(".chip", chips).forEach(function (x) { x.setAttribute("aria-selected", String(x === b)); });
        track("click", "Kategoriya: " + c.name);
        renderGrid();
      });
      chips.appendChild(b);
    });
  }

  function productMedia(p, i) {
    var media = el("div", { class: "card-media" });
    media.style.setProperty("--tint", TINTS[i % TINTS.length]);
    var emoji = el("span", { class: "card-emoji", "aria-hidden": "true", text: p.emoji || "📦" });
    var src = safeImg(p.image);
    if (src) {
      var img = el("img", { src: src, alt: p.name, loading: "lazy", decoding: "async" });
      img.addEventListener("error", function () { img.replaceWith(emoji); });
      media.appendChild(img);
    } else {
      media.appendChild(emoji);
    }
    var cat = categoryName(p.category);
    if (cat) media.appendChild(el("span", { class: "card-tag", text: cat }));
    return media;
  }

  function renderGrid() {
    grid.innerHTML = "";
    var list = (S.products || []).filter(function (p) { return activeCat === "all" || p.category === activeCat; });
    if (!list.length) {
      grid.appendChild(el("p", { class: "empty", text: "Bu kategoriyada hozircha mahsulot yo‘q. O‘zingiz topgan mahsulot havolasini yuborishingiz mumkin." }));
      return;
    }
    list.forEach(function (p, i) {
      var price = p.price
        ? el("span", { class: "price", text: p.price })
        : el("span", { class: "price ask", text: "Narxini so‘rash" });
      var btn = el("a", { class: "btn btn-accent", href: "#buyurtma", "data-order": "", "data-product": p.id, "data-track": "Mahsulot: " + p.name, "aria-label": "Buyurtma berish: " + p.name, text: "Buyurtma berish" });
      var card = el("article", { class: "card" }, [
        productMedia(p, i),
        el("div", { class: "card-body" }, [
          el("h3", { text: p.name }),
          el("p", { text: p.description }),
          el("div", { class: "card-foot" }, [price, btn]),
        ]),
      ]);
      card.style.animationDelay = (i * 40) + "ms";
      grid.appendChild(card);
    });
  }
  renderChips();
  renderGrid();

  /* ---------- Galereya (faqat rasmlar bo‘lsa ko‘rinadi) ---------- */
  var gal = (S.gallery || []).filter(function (g) { return safeImg(g.image); });
  if (gal.length) {
    gal.forEach(function (g) {
      $("#gallery-grid").appendChild(el("figure", { class: "shot" }, [
        el("img", { src: safeImg(g.image), alt: g.caption || "Yetkazilgan buyurtma", loading: "lazy", decoding: "async" }),
        g.caption ? el("figcaption", { text: g.caption }) : null,
      ]));
    });
    $("#gallery").hidden = false;
  }

  /* ---------- Narx va shartlar ---------- */
  var ICONS = [
    '<path d="M4 12.5V5a1 1 0 0 1 1-1h7.5L20 11.5 12.5 19z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><circle cx="8.5" cy="8.5" r="1.4" fill="currentColor"/>',
    '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
    '<path d="M12 3.5 19 6v5.5c0 4.2-3 7.4-7 9-4-1.6-7-4.8-7-9V6z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M8.8 12l2.3 2.3 4.2-4.6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  ];
  (S.pricing || []).forEach(function (p, i) {
    var ico = el("span", { class: "ico", "aria-hidden": "true" });
    ico.innerHTML = '<svg viewBox="0 0 24 24">' + ICONS[i % ICONS.length] + "</svg>";
    $("#pricing").appendChild(el("div", { class: "pricing-item" }, [ico, el("h3", { text: p.title }), el("p", { text: p.text })]));
  });
  // “[…]” bilan boshlanadigan qatorlar — to‘ldirilmagan joy; mijozga ko‘rsatilmaydi
  (S.terms || []).forEach(function (t) {
    var paras = (t.paragraphs || []).filter(function (p) { return p && String(p).trim().charAt(0) !== "["; });
    if (!paras.length) return;
    $("#terms").appendChild(el("details", { class: "term", id: "shart-" + t.id }, [
      el("summary", { text: t.title }),
      el("div", { class: "term-body" }, paras.map(function (p) { return el("p", { text: p }); })),
    ]));
  });
  if (!$("#terms").children.length) $("#terms").hidden = true;

  /* ---------- Taqiqlangan mahsulotlar ---------- */
  var BAN_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5.6 5.6l12.8 12.8" stroke="currentColor" stroke-width="2"/></svg>';
  var banned = (S.prohibited && S.prohibited.list) || [];
  banned.forEach(function (b) {
    var li = el("li", null, [el("span", { text: b })]);
    li.insertAdjacentHTML("afterbegin", BAN_ICON);
    $("#prohibited-list").appendChild(li);
  });
  if (!banned.length) $("#prohibited-list").hidden = true;

  // Qisqa so‘zlar (≤5 harf) — butun so‘z sifatida, uzunlari — so‘z ichidan ham qidiriladi
  var bannedWords = ((S.prohibited && S.prohibited.keywords) || []).map(function (w) { return String(w).toLowerCase().trim(); }).filter(Boolean);
  function findBanned(text) {
    var t = String(text || "").toLowerCase().replace(/[‘’ʻʼ`´]/g, "'");
    var tokens = t.split(/[^a-zа-яёўқғҳ0-9']+/i).filter(Boolean);
    for (var i = 0; i < bannedWords.length; i++) {
      var w = bannedWords[i].replace(/[‘’ʻʼ`´]/g, "'");
      if (w.length >= 6 ? t.indexOf(w) !== -1 : tokens.indexOf(w) !== -1) return bannedWords[i];
    }
    return null;
  }

  /* ---------- Buyurtma formasi ---------- */
  var form = $("#order-form");
  var sel = $("#f-product");
  sel.appendChild(el("option", { value: "", text: "Mahsulotni tanlang…" }));
  sel.appendChild(el("option", { value: CUSTOM, text: "O‘zim topgan mahsulot (havola orqali)" }));
  (S.categories || []).forEach(function (c) {
    var items = (S.products || []).filter(function (p) { return p.category === c.id; });
    if (!items.length) return;
    var g = el("optgroup", { label: c.name });
    items.forEach(function (p) { g.appendChild(el("option", { value: p.id, text: p.name })); });
    sel.appendChild(g);
  });
  (S.products || []).filter(function (p) { return !categoryName(p.category); }).forEach(function (p) {
    sel.appendChild(el("option", { value: p.id, text: p.name }));
  });

  function goToForm(productId, link) {
    if (productId) sel.value = productId;
    if (link) { $("#f-link").value = link; sel.value = CUSTOM; }
    clearError("product");
    $("#buyurtma").scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(function () { (sel.value ? $("#f-name") : sel).focus({ preventScroll: true }); }, 700);
  }

  document.addEventListener("click", function (e) {
    var a = e.target.closest("[data-order]");
    if (!a) return;
    e.preventDefault();
    goToForm(a.getAttribute("data-product"));
  });

  $("#linkbar").addEventListener("submit", function (e) {
    e.preventDefault();
    goToForm(CUSTOM, $("#linkbar-input").value.trim());
  });

  // Telefon: +998 XX XXX XX XX ko‘rinishiga keltirish
  var phone = $("#f-phone");
  phone.addEventListener("focus", function () { if (!phone.value) phone.value = "+998 "; });
  phone.addEventListener("input", function () {
    var d = phone.value.replace(/\D/g, "");
    if (d.indexOf("998") !== 0) d = "998" + d;
    d = d.slice(0, 12);
    var parts = [d.slice(0, 3), d.slice(3, 5), d.slice(5, 8), d.slice(8, 10), d.slice(10, 12)].filter(Boolean);
    phone.value = "+" + parts.join(" ");
  });

  // Miqdor
  var qty = $("#f-qty");
  $$(".qty button").forEach(function (b) {
    b.addEventListener("click", function () {
      var v = (parseInt(qty.value, 10) || 1) + parseInt(b.getAttribute("data-step"), 10);
      qty.value = Math.max(1, Math.min(999, v));
    });
  });

  // Rasm yuklash
  var fileInput = $("#f-image"), upload = $(".upload"), preview = $(".upload-preview");
  fileInput.addEventListener("change", function () {
    var f = fileInput.files && fileInput.files[0];
    clearError("image");
    if (!f) return resetFile();
    if (!/^image\//.test(f.type)) { showError("image", "Faqat rasm faylini tanlang."); return resetFile(); }
    if (f.size > 8 * 1024 * 1024) { showError("image", "Rasm hajmi 8 MB dan oshmasin."); return resetFile(); }
    var r = new FileReader();
    r.onload = function () { $("img", preview).src = r.result; preview.hidden = false; upload.classList.add("has-file"); };
    r.readAsDataURL(f);
  });
  $(".upload-clear").addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); resetFile(); });
  function resetFile() { fileInput.value = ""; preview.hidden = true; $("img", preview).removeAttribute("src"); upload.classList.remove("has-file"); }

  function showError(name, msg) {
    var p = $('.error[data-for="' + name + '"]');
    if (p) { p.textContent = msg; p.closest(".field").classList.add("invalid"); }
  }
  function clearError(name) {
    var p = $('.error[data-for="' + name + '"]');
    if (p) { p.textContent = ""; p.closest(".field").classList.remove("invalid"); }
  }
  ["name", "phone", "product", "link", "confirm"].forEach(function (n) {
    form.elements[n].addEventListener("input", function () { clearError(n); hideNotice(); });
    form.elements[n].addEventListener("change", function () { clearError(n); hideNotice(); });
  });
  form.elements.note.addEventListener("input", hideNotice);

  var notice = $("#form-notice");
  function hideNotice() { notice.hidden = true; }
  function showNotice(title, text, link) {
    notice.innerHTML = "";
    var kids = [el("b", { text: title }), el("span", { text: text })];
    if (link) kids.push(link);
    notice.appendChild(el("div", null, kids));
    notice.hidden = false;
    notice.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var f = form.elements, ok = true, first = null;
    var fail = function (n, msg) { showError(n, msg); ok = false; first = first || f[n]; };

    var name = f.name.value.trim();
    var digits = f.phone.value.replace(/\D/g, "");
    var productId = sel.value;
    var link = f.link.value.trim();

    if (name.length < 2) fail("name", "Ismingizni kiriting.");
    if (digits.length !== 12) fail("phone", "Telefon raqamini to‘liq kiriting: +998 XX XXX XX XX");
    if (!productId) fail("product", "Mahsulotni tanlang yoki «O‘zim topgan mahsulot»ni belgilang.");
    if (link && !/^https?:\/\/\S+\.\S+/i.test(link)) fail("link", "Havola https:// bilan boshlanishi kerak.");
    if (productId === CUSTOM && !link && !(fileInput.files && fileInput.files[0])) {
      fail("link", "Mahsulot havolasini kiriting yoki rasmini yuklang.");
    }
    if (!f.confirm.checked) fail("confirm", "Davom etish uchun mahsulot taqiqlangan ro‘yxatda yo‘qligini tasdiqlang.");
    if (!ok) { first.focus(); return; }

    var product = (S.products || []).filter(function (p) { return p.id === productId; })[0];
    var productName = product ? product.name : "O‘zim topgan mahsulot";

    var hit = findBanned([productName, link, f.note.value].join(" "));
    if (hit) {
      track("blocked", hit);
      showNotice("Kechirasiz, bu mahsulotga buyurtma qabul qila olmaymiz",
        "Bu turdagi mahsulotlar taqiqlangan ro‘yxatda. Boshqa mahsulot tanlashingiz yoki savol bo‘lsa, biz bilan bog‘lanishingiz mumkin.");
      return;
    }

    var file = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
    var order = {
      name: name, phone: f.phone.value, telegram: f.telegram.value.trim(), product: productName, link: link,
      qty: Math.max(1, parseInt(f.qty.value, 10) || 1), note: f.note.value.trim(),
      website: f.website.value, // spam tuzog‘i
    };

    var submit = $('button[type="submit"]', form);
    var label = submit.textContent;
    submit.disabled = true; submit.textContent = "Yuborilmoqda…";
    sendOrder(order, file).then(function () {
      track("order", productName);
      openModal(order);
      form.reset();
      resetFile();
    }, function (err) {
      if (window.console) console.warn("So‘rov yuborilmadi:", err);
      var c = S.contacts || {};
      var tg = el("a", { href: safeHref(c.telegramLink) || "#", target: "_blank", rel: "noopener", text: c.telegram || "Telegram" });
      showNotice("So‘rovni yuborib bo‘lmadi",
        "Internet aloqasini tekshirib, qayta urinib ko‘ring yoki bizga to‘g‘ridan-to‘g‘ri yozing: ", tg);
    }).then(function () { submit.disabled = false; submit.textContent = label; });
  });

  /* ---------- So‘rovni serverga yuborish ----------
     api.endpoint bo‘sh bo‘lsa — demo rejim (hech qayerga yuborilmaydi).
     Bot tokeni saytda saqlanmaydi — u faqat serverda (Cloudflare Worker) turadi. */
  function sendOrder(o, file) {
    var ep = ((S.api && S.api.endpoint) || "").replace(/\/+$/, "");
    if (!ep || !window.fetch) {
      // Demo faqat kompyuterda, fayldan ochilganda yoki "Saytda ko‘rish" rejimida.
      // Internetdagi sayt mijozga yolg‘on "qabul qilindi" demasligi uchun u yerda xato ko‘rsatiladi.
      var h = location.hostname, local = !h || h === "localhost" || h === "127.0.0.1" || /[?&]preview\b/.test(location.search);
      if (!local) return Promise.reject(new Error("Server ulanmagan"));
      if (window.console) console.log("Yangi so‘rov (demo rejim, yuborilmadi):", o);
      return new Promise(function (r) { setTimeout(r, 400); });
    }
    var fd = new FormData();
    Object.keys(o).forEach(function (k) { fd.append(k, o[k]); });
    fd.append("sid", window.TopibTrack ? window.TopibTrack.sid : "");
    fd.append("vid", window.TopibTrack ? window.TopibTrack.vid : "");
    fd.append("ad", window.TopibTrack ? JSON.stringify(window.TopibTrack.attrib()) : "{}");
    if (file) fd.append("image", file);
    return fetch(ep + "/order", { method: "POST", body: fd }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok || !j.ok) throw new Error(j.error || ("HTTP " + r.status));
      });
    });
  }

  /* ---------- Modal ---------- */
  var modal = $("#modal"), lastFocus = null;
  function openModal(o) {
    var dl = $("#modal-summary");
    dl.innerHTML = "";
    [["Ism", o.name], ["Telefon", o.phone], ["Mahsulot", o.product], ["Miqdor", o.qty + " dona"]].forEach(function (r) {
      dl.appendChild(el("dt", { text: r[0] }));
      dl.appendChild(el("dd", { text: r[1] }));
    });
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    $(".modal-card .btn", modal).focus();
  }
  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = "";
    if (lastFocus) lastFocus.focus({ preventScroll: true });
  }
  $$("[data-close]", modal).forEach(function (n) { n.addEventListener("click", closeModal); });
  document.addEventListener("keydown", function (e) {
    if (modal.hidden) return;
    if (e.key === "Escape") closeModal();
    if (e.key === "Tab") { // fokus oyna ichida qolsin
      var items = $$("button, a[href]", $(".modal-card", modal));
      if (!items.length) return;
      var firstEl = items[0], lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
    }
  });

  /* ---------- Havoda uchish effekti: sahnalar bulutdan chiqib keladi ---------- */
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var scenes = $$(".scene").map(function (s) { return { el: s, inner: $(".scene-inner", s), hint: $(".scroll-hint", s), first: s.classList.contains("first") }; });
  var sm = function (t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

  function animateScenes() {
    var vh = window.innerHeight;
    scenes.forEach(function (s) {
      var r = s.el.getBoundingClientRect();
      var p = Math.max(0, Math.min(1, -r.top / Math.max(1, r.height - vh)));
      var inT = s.first ? 1 : sm(p / 0.28);
      var outT = sm((p - 0.7) / 0.3);
      var a = Math.min(inT, 1 - outT);
      var scale = (0.82 + 0.18 * inT) * (1 + 0.35 * outT);
      var blur = (1 - inT) * 16 + outT * 14;
      var y = (1 - inT) * 40 - outT * 30;
      if (reduceMotion) { a = Math.min(1, a * 2); scale = 1; blur = 0; y = 0; }
      s.inner.style.opacity = a.toFixed(3);
      s.inner.style.transform = "translate3d(0," + y.toFixed(1) + "px,0) scale(" + scale.toFixed(4) + ")";
      s.inner.style.filter = blur > 0.2 ? "blur(" + blur.toFixed(1) + "px)" : "none";
      s.inner.style.pointerEvents = a < 0.2 ? "none" : "";
      s.inner.style.visibility = a < 0.01 ? "hidden" : "visible";
      if (s.hint) s.hint.style.opacity = (1 - sm(p / 0.15)).toFixed(3);
    });
  }

  // Oddiy bloklar ko‘rinishga kirganda paydo bo‘ladi
  if ("IntersectionObserver" in window) {
    var ro = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); ro.unobserve(e.target); } });
    }, { threshold: 0.08, rootMargin: "0px 0px -6% 0px" });
    $$(".reveal").forEach(function (n) { ro.observe(n); });
  } else {
    $$(".reveal").forEach(function (n) { n.classList.add("in"); });
  }

  // Yon ko‘rsatkich: hozirgi bo‘lim
  var railLinks = $$("#rail a");
  var railTargets = railLinks.map(function (a) { return $(a.getAttribute("href")); });
  function updateRail() {
    var mid = window.innerHeight * 0.5, active = 0;
    railTargets.forEach(function (t, i) { if (t && t.getBoundingClientRect().top <= mid) active = i; });
    railLinks.forEach(function (a, i) {
      a.classList.toggle("active", i === active);
      if (i === active) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
    });
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { ticking = false; animateScenes(); updateRail(); });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  animateScenes(); updateRail();

  /* ---------- Pastki panel: forma ko‘rinayotganda yashirish ---------- */
  var dock = $("#dock");
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      dock.classList.toggle("hide", entries[0].isIntersecting);
    }, { threshold: 0.15 }).observe($("#buyurtma"));
  }
})();
