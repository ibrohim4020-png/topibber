/* =====================================================================
   TopibBer — server qismi (Cloudflare Worker + D1, bepul tarif yetadi).
   Vazifasi:
     1) saytdagi buyurtmalarni Telegram’ga yuborish (bot tokeni faqat shu yerda turadi);
     2) tashriflar, mamlakat/shahar va bosishlar statistikasini yig‘ish.
   O‘rnatish tartibi: admin panel → Ulanish (yoki worker/README.md).
   Kerakli sozlamalar (Worker → Settings):
     BOT_TOKEN, CHAT_ID, ADMIN_KEY — “Secret” sifatida
     DB — D1 database (binding nomi aynan DB; jadvallar o‘zi yaratiladi)
     ALLOWED_ORIGIN — ixtiyoriy, masalan https://topibber.uz (faqat shu sayt yozsin)
   ===================================================================== */

const KEEP_DAYS = 120;
let schemaReady = null;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    try {
      if (url.pathname === "/health") return await health(env, cors);
      if (url.pathname === "/track" && request.method === "POST") return await track(request, env, cors);
      if (url.pathname === "/order" && request.method === "POST") return await order(request, env, cors);
      if (url.pathname === "/stats" && request.method === "GET") return await stats(request, env, cors, url);
      if (url.pathname === "/test" && request.method === "POST") return await testMessage(request, env, cors);
      return json({ ok: false, error: "Topilmadi" }, 404, cors);
    } catch (e) {
      return json({ ok: false, error: "Server xatosi" }, 500, cors);
    }
  },
};

/* ---------- Yordamchilar ---------- */
function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allow = env.ALLOWED_ORIGIN ? env.ALLOWED_ORIGIN.replace(/\/+$/, "") : "*";
  return {
    "Access-Control-Allow-Origin": allow === "*" ? "*" : (origin === allow ? origin : allow),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...cors } });
}
const cut = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);

function authorized(request, env) {
  const h = request.headers.get("Authorization") || "";
  const given = h.startsWith("Bearer ") ? h.slice(7) : "";
  const key = env.ADMIN_KEY || "";
  if (!key || given.length !== key.length) return false;
  let diff = 0;
  for (let i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}
// Kun chegarasi — Toshkent vaqti (UTC+5)
function dayKey(offsetDays) {
  return new Date(Date.now() + 5 * 3600 * 1000 - (offsetDays || 0) * 86400000).toISOString().slice(0, 10);
}
async function sha(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).slice(0, 10).map(b => b.toString(16).padStart(2, "0")).join("");
}

/* ---------- Ma’lumotlar bazasi (jadvallar birinchi so‘rovda o‘zi yaratiladi) ---------- */
function ensureSchema(env) {
  if (!schemaReady) {
    schemaReady = env.DB.batch([
      env.DB.prepare("CREATE TABLE IF NOT EXISTS events (ts INTEGER NOT NULL, day TEXT NOT NULL, type TEXT NOT NULL, label TEXT, vid TEXT, country TEXT, city TEXT, ref TEXT, dev TEXT)"),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS events_day ON events (day, type)"),
      env.DB.prepare("CREATE TABLE IF NOT EXISTS rl (k TEXT NOT NULL, ts INTEGER NOT NULL)"),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS rl_k ON rl (k, ts)"),
    ]).catch((e) => { schemaReady = null; throw e; });
  }
  return schemaReady;
}

async function health(env, cors) {
  let db = false;
  if (env.DB) { try { await ensureSchema(env); db = true; } catch (e) {} }
  return json({ ok: true, db, telegram: !!(env.BOT_TOKEN && env.CHAT_ID), admin: !!env.ADMIN_KEY }, 200, cors);
}

/* ---------- Statistika yig‘ish: har bir hodisa — bitta qator ---------- */
async function track(request, env, cors) {
  const empty = () => new Response(null, { status: 204, headers: cors });
  if (!env.DB) return empty();
  let p;
  try { p = JSON.parse(await request.text()); } catch (e) { return empty(); }

  const type = cut(p.t, 16);
  if (!["view", "click", "section", "order", "blocked"].includes(type)) return empty();
  const cf = request.cf || {};
  await ensureSchema(env);
  await env.DB.prepare("INSERT INTO events (ts, day, type, label, vid, country, city, ref, dev) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(Date.now(), dayKey(0), type, cut(p.l, 80), cut(p.v, 40), cut(cf.country || "??", 3), cut(cf.city || "", 60),
      type === "view" ? (cut(p.r, 60) || "(to‘g‘ridan-to‘g‘ri)") : "", cut(p.d, 12))
    .run();

  // Ba’zan eski qatorlarni tozalab turamiz
  if (Math.random() < 0.01) {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM events WHERE day < ?").bind(dayKey(KEEP_DAYS)),
      env.DB.prepare("DELETE FROM rl WHERE ts < ?").bind(Date.now() - 3600000),
    ]);
  }
  return empty();
}

/* ---------- Statistikani o‘qish (faqat admin) ---------- */
async function stats(request, env, cors, url) {
  if (!authorized(request, env)) return json({ ok: false, error: "Kalit noto‘g‘ri" }, 401, cors);
  if (!env.DB) return json({ ok: false, error: "D1 (DB) ulanmagan" }, 500, cors);
  await ensureSchema(env);
  const n = Math.max(1, Math.min(90, parseInt(url.searchParams.get("days") || "30", 10) || 30));
  const since = dayKey(n - 1);
  const q = (sql) => env.DB.prepare(sql).bind(since);

  const [totals, countries, cities, refs, devs, others] = await env.DB.batch([
    q("SELECT day, COUNT(*) AS v, COUNT(DISTINCT vid) AS u FROM events WHERE type = 'view' AND day >= ? GROUP BY day"),
    q("SELECT day, country AS k, COUNT(DISTINCT vid) AS n FROM events WHERE type = 'view' AND day >= ? GROUP BY day, country"),
    q("SELECT day, city || ', ' || country AS k, COUNT(DISTINCT vid) AS n FROM events WHERE type = 'view' AND city <> '' AND day >= ? GROUP BY day, k"),
    q("SELECT day, ref AS k, COUNT(DISTINCT vid) AS n FROM events WHERE type = 'view' AND day >= ? GROUP BY day, ref"),
    q("SELECT day, dev AS k, COUNT(DISTINCT vid) AS n FROM events WHERE type = 'view' AND day >= ? GROUP BY day, dev"),
    q("SELECT day, type, label AS k, COUNT(*) AS n FROM events WHERE type IN ('click','section','order','blocked') AND day >= ? GROUP BY day, type, label"),
  ]);

  const days = [];
  const byDay = {};
  for (let i = n - 1; i >= 0; i--) {
    const date = dayKey(i);
    byDay[date] = { date, views: 0, visitors: 0, uc: {}, ucity: {}, refs: {}, dev: {}, clicks: {}, sections: {}, orders: {}, blocked: {} };
    days.push(byDay[date]);
  }
  const put = (rows, field) => (rows.results || []).forEach((r) => { if (byDay[r.day] && r.k) byDay[r.day][field][r.k] = r.n; });
  (totals.results || []).forEach((r) => { if (byDay[r.day]) { byDay[r.day].views = r.v; byDay[r.day].visitors = r.u; } });
  put(countries, "uc"); put(cities, "ucity"); put(refs, "refs"); put(devs, "dev");
  const field = { click: "clicks", section: "sections", order: "orders", blocked: "blocked" };
  (others.results || []).forEach((r) => { if (byDay[r.day] && r.k) byDay[r.day][field[r.type]][r.k] = r.n; });

  return json({ ok: true, days }, 200, cors);
}

/* ---------- Telegram ---------- */
async function tg(env, method, body) {
  const r = await fetch("https://api.telegram.org/bot" + env.BOT_TOKEN + "/" + method, { method: "POST", body });
  let j = {};
  try { j = await r.json(); } catch (e) {}
  if (!j.ok) throw new Error("Telegram: " + (j.description || r.status));
  return j;
}
function form(obj) { const f = new FormData(); for (const k in obj) f.append(k, obj[k]); return f; }

async function testMessage(request, env, cors) {
  if (!authorized(request, env)) return json({ ok: false, error: "Kalit noto‘g‘ri" }, 401, cors);
  if (!env.BOT_TOKEN || !env.CHAT_ID) return json({ ok: false, error: "BOT_TOKEN yoki CHAT_ID kiritilmagan" }, 500, cors);
  try {
    await tg(env, "sendMessage", form({ chat_id: env.CHAT_ID, text: "✅ Sinov: saytdagi so‘rovlar shu yerga keladi." }));
    return json({ ok: true }, 200, cors);
  } catch (e) { return json({ ok: false, error: e.message }, 502, cors); }
}

/* ---------- Buyurtmani qabul qilish ---------- */
async function order(request, env, cors) {
  if (!env.BOT_TOKEN || !env.CHAT_ID) return json({ ok: false, error: "Server sozlanmagan" }, 500, cors);
  let fd;
  try { fd = await request.formData(); } catch (e) { return json({ ok: false, error: "Noto‘g‘ri so‘rov" }, 400, cors); }

  // Spam tuzog‘i: odam bu maydonni ko‘rmaydi. Bot to‘ldirsa — jimgina “qabul qildik” deymiz.
  if (cut(fd.get("website"), 50)) return json({ ok: true }, 200, cors);

  const name = cut(fd.get("name"), 80), phone = cut(fd.get("phone"), 30), product = cut(fd.get("product"), 120);
  const link = cut(fd.get("link"), 500), note = cut(fd.get("note"), 600);
  const qty = Math.max(1, Math.min(999, parseInt(fd.get("qty"), 10) || 1));
  if (name.length < 2 || phone.replace(/\D/g, "").length < 9 || !product) return json({ ok: false, error: "Ma’lumotlar to‘liq emas" }, 400, cors);
  if (link && !/^https?:\/\/\S+$/i.test(link)) return json({ ok: false, error: "Havola noto‘g‘ri" }, 400, cors);

  // Cheklov: bitta qurilmadan 10 daqiqada 5 tadan ko‘p emas (IP faqat shu hisob uchun, xeshlangan holda 1 soat turadi)
  if (env.DB) {
    await ensureSchema(env);
    const ip = request.headers.get("CF-Connecting-IP") || "";
    const k = await sha(ip + (env.ADMIN_KEY || ""));
    const row = await env.DB.prepare("SELECT COUNT(*) AS c FROM rl WHERE k = ? AND ts > ?").bind(k, Date.now() - 600000).first();
    if (row && row.c >= 5) return json({ ok: false, error: "Juda ko‘p so‘rov. Birozdan keyin urinib ko‘ring." }, 429, cors);
    await env.DB.prepare("INSERT INTO rl (k, ts) VALUES (?, ?)").bind(k, Date.now()).run();
  }

  const cf = request.cf || {};
  const text = [
    "🛍 Yangi so‘rov", "",
    "👤 " + name, "📞 " + phone,
    "📦 " + product + " — " + qty + " dona",
    link ? "🔗 " + link : "",
    note ? "💬 " + note : "",
    cf.country ? "📍 " + (cf.city ? cf.city + ", " : "") + cf.country : "",
  ].filter((x, i) => x || i === 1).join("\n");

  try {
    await tg(env, "sendMessage", form({ chat_id: env.CHAT_ID, text, disable_web_page_preview: "true" }));
    const img = fd.get("image");
    if (img && typeof img === "object" && img.size > 0 && img.size <= 8 * 1024 * 1024 && /^image\//.test(img.type)) {
      const asPhoto = /^image\/(jpeg|png|webp)$/.test(img.type);
      try {
        await tg(env, asPhoto ? "sendPhoto" : "sendDocument", form({ chat_id: env.CHAT_ID, caption: "📎 " + name + " yuborgan rasm", [asPhoto ? "photo" : "document"]: img }));
      } catch (e) { /* rasm o‘tmasa ham asosiy so‘rov yetib bordi */ }
    }
    return json({ ok: true }, 200, cors);
  } catch (e) {
    return json({ ok: false, error: "Yuborib bo‘lmadi" }, 502, cors);
  }
}
