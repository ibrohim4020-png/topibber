/* =====================================================================
   TopibBer — server qismi (Cloudflare Worker + D1, bepul tarif yetadi).

   Vazifasi:
     1) Saytdagi har bir tashrifni yig'ish (joylashuv, telefon modeli, saytda turgan vaqt,
        bosganlari, reklama manbasi) va Google Sheets'ga yozish;
     2) Lidlarni qabul qilish, sotuvchilarga TENG taqsimlash (round-robin) va Telegram
        guruhidagi sotuvchining topic'iga tugmalar bilan yuborish;
     3) Tugmalar: Bog'lanildi -> Sotib oldi / Sotib olmadi (sababi so'raladi);
     4) Lidni amoCRM'ga yuborish va statuslarni Telegram <-> Sheets <-> amoCRM
        orasida ikki tomonlama sinxron ushlash.

   Sozlamalar: worker/README.md. Kerakli o'zgaruvchilar (Worker -> Settings):
     Secret:  BOT_TOKEN, CHAT_ID, ADMIN_KEY, SHEETS_SECRET, AMO_TOKEN
     Text:    SELLERS, SHEETS_URL, AMO_DOMAIN, ALLOWED_ORIGIN (va ixtiyoriy AMO_* statuslari)
     D1:      DB (binding nomi aynan DB; jadvallar o'zi yaratiladi)
     Cron:    har 1 daqiqada (Triggers -> Cron) — Sheets/amoCRM bilan sinxron va qayta urinish
   ===================================================================== */

const KEEP_DAYS = 120;
const STATUS = { new: "🆕 Yangi", contacted: "📞 Bog'lanildi", won: "✅ Sotib oldi", lost: "❌ Sotib olmadi" };
let schemaReady = null;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const p = url.pathname, m = request.method;

    try {
      if (p === "/health") return await health(env, cors);
      if (p === "/track" && m === "POST") return await track(request, env, cors);
      if (p === "/order" && m === "POST") return await order(request, env, cors, ctx);
      if (p === "/stats" && m === "GET") return await stats(request, env, cors, url);
      if (p === "/test" && m === "POST") return await testMessage(request, env, cors);
      if (p === "/tg" && m === "POST") return await telegramHook(request, env, ctx);   // Telegram webhook
      if (p === "/amo" && m === "POST") return await amoHook(request, env, ctx, url);   // amoCRM webhook
      if (p === "/sheet" && m === "POST") return await sheetHook(request, env, ctx, cors); // Sheets'dagi tahrir
      if (p === "/setup") return await setup(request, env, cors, url);                  // bir martalik sozlash
      return json({ ok: false, error: "Topilmadi" }, 404, cors);
    } catch (e) {
      return json({ ok: false, error: "Server xatosi" }, 500, cors);
    }
  },

  // Har daqiqada: yuborilmay qolganlarni qayta urinish + Sheets/amoCRM sinxroni
  async scheduled(event, env, ctx) {
    ctx.waitUntil(cron(env));
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
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...(cors || {}) } });
}
const cut = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function safeEq(a, b) {
  a = String(a || ""); b = String(b || "");
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function authorized(request, env) {
  const h = request.headers.get("Authorization") || "";
  return safeEq(h.startsWith("Bearer ") ? h.slice(7) : "", env.ADMIN_KEY);
}
// Toshkent vaqti (UTC+5)
function tz(ts) {
  const iso = new Date((ts || Date.now()) + 5 * 3600 * 1000).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 19), dt: iso.slice(8, 10) + "." + iso.slice(5, 7) + "." + iso.slice(0, 4) + " " + iso.slice(11, 16) };
}
function dayKey(offsetDays) {
  return new Date(Date.now() + 5 * 3600 * 1000 - (offsetDays || 0) * 86400000).toISOString().slice(0, 10);
}
async function sha(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).slice(0, 10).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const leadCode = (id) => "L-" + String(id).padStart(4, "0");
function fmtDur(s) { s = Math.max(0, Math.round(s || 0)); return s < 60 ? s + " s" : Math.floor(s / 60) + " daq " + (s % 60) + " s"; }
function statusFromText(t) {
  t = String(t || "").toLowerCase();
  if (/sotib oldi/.test(t)) return "won";
  if (/sotib olmadi/.test(t)) return "lost";
  if (/bog.lanildi/.test(t)) return "contacted";
  if (/yangi/.test(t)) return "new";
  return null;
}

/* ---------- Ma'lumotlar bazasi (jadvallar birinchi so'rovda o'zi yaratiladi) ---------- */
function ensureSchema(env) {
  if (!schemaReady) {
    const S = (q) => env.DB.prepare(q);
    schemaReady = env.DB.batch([
      S("CREATE TABLE IF NOT EXISTS events (ts INTEGER NOT NULL, day TEXT NOT NULL, type TEXT NOT NULL, label TEXT, vid TEXT, country TEXT, city TEXT, ref TEXT, dev TEXT)"),
      S("CREATE INDEX IF NOT EXISTS events_day ON events (day, type)"),
      S("CREATE TABLE IF NOT EXISTS rl (k TEXT NOT NULL, ts INTEGER NOT NULL)"),
      S("CREATE INDEX IF NOT EXISTS rl_k ON rl (k, ts)"),
      S("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v)"),
      S(`CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY, vid TEXT, first_ts INTEGER, last_ts INTEGER, day TEXT,
        country TEXT DEFAULT '', region TEXT DEFAULT '', city TEXT DEFAULT '', tz TEXT DEFAULT '', org TEXT DEFAULT '', ip TEXT DEFAULT '',
        dev TEXT DEFAULT '', model TEXT DEFAULT '', os TEXT DEFAULT '', br TEXT DEFAULT '', scr TEXT DEFAULT '', lang TEXT DEFAULT '', conn TEXT DEFAULT '',
        ref TEXT DEFAULT '', src TEXT DEFAULT '', med TEXT DEFAULT '', cmp TEXT DEFAULT '', cnt TEXT DEFAULT '', trm TEXT DEFAULT '', land TEXT DEFAULT '',
        is_new INTEGER DEFAULT 0, pv INTEGER DEFAULT 0, dur INTEGER DEFAULT 0, scroll INTEGER DEFAULT 0,
        clicks TEXT DEFAULT '', click_n INTEGER DEFAULT 0, sections TEXT DEFAULT '', lead_id INTEGER DEFAULT 0, dirty INTEGER DEFAULT 1)`),
      S("CREATE INDEX IF NOT EXISTS sessions_dirty ON sessions (dirty)"),
      S(`CREATE TABLE IF NOT EXISTS leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, name TEXT, phone TEXT, telegram TEXT DEFAULT '', product TEXT, qty INTEGER DEFAULT 1,
        link TEXT DEFAULT '', note TEXT DEFAULT '', src TEXT DEFAULT '', med TEXT DEFAULT '', cmp TEXT DEFAULT '', cnt TEXT DEFAULT '', ref TEXT DEFAULT '',
        vid TEXT DEFAULT '', sid TEXT DEFAULT '', country TEXT DEFAULT '', city TEXT DEFAULT '', dev TEXT DEFAULT '', model TEXT DEFAULT '',
        seller TEXT DEFAULT '', thread INTEGER DEFAULT 0, chat_id TEXT DEFAULT '', msg_id INTEGER DEFAULT 0, tg_ok INTEGER DEFAULT 0,
        status TEXT DEFAULT 'new', reason TEXT DEFAULT '', status_ts INTEGER DEFAULT 0, status_by TEXT DEFAULT '',
        amo_id INTEGER DEFAULT 0, amo_ok INTEGER DEFAULT 0, amo_st TEXT DEFAULT 'new', dirty INTEGER DEFAULT 1)`),
      S("CREATE INDEX IF NOT EXISTS leads_amo ON leads (amo_id)"),
      S("CREATE TABLE IF NOT EXISTS pending (prompt_id INTEGER PRIMARY KEY, lead_id INTEGER, user_id TEXT, ts INTEGER)"),
    ]).catch((e) => { schemaReady = null; throw e; });
  }
  return schemaReady;
}

async function health(env, cors) {
  let db = false;
  if (env.DB) { try { await ensureSchema(env); db = true; } catch (e) {} }
  const sellers = db ? await getSellers(env).catch(() => []) : [];
  return json({
    ok: true, db,
    telegram: !!(env.BOT_TOKEN && env.CHAT_ID), admin: !!env.ADMIN_KEY,
    sheets: !!(env.SHEETS_URL && env.SHEETS_SECRET),
    amocrm: !!(env.AMO_DOMAIN && env.AMO_TOKEN),
    sellers: sellers.map((s) => ({ name: s.name, topic: !!s.thread })),
  }, 200, cors);
}

/* ---------- Tashrifni yig'ish ---------- */
async function track(request, env, cors) {
  const empty = () => new Response(null, { status: 204, headers: cors });
  if (!env.DB) return empty();
  let p;
  try { p = JSON.parse(await request.text()); } catch (e) { return empty(); }

  const type = cut(p.t, 16);
  if (!["view", "ping", "click", "section", "order", "blocked"].includes(type)) return empty();
  const cf = request.cf || {};
  const now = Date.now();
  const sid = cut(p.s, 40), vid = cut(p.v, 40), label = cut(p.l, 80);
  await ensureSchema(env);

  if (sid) {
    await env.DB.prepare("INSERT OR IGNORE INTO sessions (sid, vid, first_ts, last_ts, day, country, region, city, tz, org, ip, dev) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(sid, vid, now, now, dayKey(0), cut(cf.country || "??", 3), cut(cf.region || "", 60), cut(cf.city || "", 60), cut(cf.timezone || "", 40),
        cut(cf.asOrganization || "", 80), cut(request.headers.get("CF-Connecting-IP") || "", 45), cut(p.d, 12)).run();

    if (type === "view") {
      const m = p.m && typeof p.m === "object" ? p.m : {}, mt = m.meta || {}, a = m.a || {};
      // manba va kirgan sahifa faqat seansning birinchi ko'rishida yoziladi (sahifani yangilash ularni o'chirmasin)
      await env.DB.prepare(`UPDATE sessions SET last_ts=?, pv=pv+1, model=?, os=?, br=?, scr=?, lang=?, conn=?,
          land=CASE WHEN pv=0 THEN ? ELSE land END, is_new=MAX(is_new,?), ref=CASE WHEN pv=0 THEN ? ELSE ref END,
          src=CASE WHEN pv=0 THEN ? ELSE src END, med=CASE WHEN pv=0 THEN ? ELSE med END, cmp=CASE WHEN pv=0 THEN ? ELSE cmp END,
          cnt=CASE WHEN pv=0 THEN ? ELSE cnt END, trm=CASE WHEN pv=0 THEN ? ELSE trm END,
          tz=CASE WHEN ?<>'' THEN ? ELSE tz END, dirty=dirty+1 WHERE sid=?`)
        .bind(now, cut(mt.model, 60), cut(mt.os, 40), cut(mt.br, 40), cut(mt.scr, 24), cut(mt.lg, 12), cut(mt.con, 12), cut(mt.land, 200), mt.nw ? 1 : 0,
          cut(a.ref, 60), cut(a.src, 40), cut(a.med, 40), cut(a.cmp, 80), cut(a.cnt, 80), cut(a.trm, 80), cut(mt.tz, 40), cut(mt.tz, 40), sid).run();
    } else if (type === "ping") {
      await env.DB.prepare("UPDATE sessions SET last_ts=?, dur=MAX(dur,?), scroll=MAX(scroll,?), dirty=dirty+1 WHERE sid=?")
        .bind(now, Math.min(86400, parseInt(p.dur, 10) || 0), Math.min(100, parseInt(p.sc, 10) || 0), sid).run();
    } else if (type === "click") {
      await env.DB.prepare("UPDATE sessions SET last_ts=?, click_n=click_n+1, clicks=substr(CASE WHEN clicks='' THEN ? ELSE clicks||' | '||? END,1,900), dirty=dirty+1 WHERE sid=?")
        .bind(now, label, label, sid).run();
    } else if (type === "section") {
      await env.DB.prepare("UPDATE sessions SET last_ts=?, sections=substr(CASE WHEN sections='' THEN ? ELSE sections||' > '||? END,1,400), dirty=dirty+1 WHERE sid=?")
        .bind(now, label, label, sid).run();
    }
  }

  if (type !== "ping") {
    await env.DB.prepare("INSERT INTO events (ts, day, type, label, vid, country, city, ref, dev) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(now, dayKey(0), type, label, vid, cut(cf.country || "??", 3), cut(cf.city || "", 60),
        type === "view" ? (cut(p.r, 60) || "(to'g'ridan-to'g'ri)") : "", cut(p.d, 12))
      .run();
  }

  if (Math.random() < 0.01) { // eski qatorlarni tozalab turamiz
    await env.DB.batch([
      env.DB.prepare("DELETE FROM events WHERE day < ?").bind(dayKey(KEEP_DAYS)),
      env.DB.prepare("DELETE FROM rl WHERE ts < ?").bind(now - 3600000),
      env.DB.prepare("DELETE FROM sessions WHERE dirty = 0 AND last_ts < ?").bind(now - 400 * 86400000),
      env.DB.prepare("DELETE FROM pending WHERE ts < ?").bind(now - 30 * 86400000),
    ]);
  }
  return empty();
}

/* ---------- Statistikani o'qish (faqat admin) ---------- */
async function stats(request, env, cors, url) {
  if (!authorized(request, env)) return json({ ok: false, error: "Kalit noto'g'ri" }, 401, cors);
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

/* =====================================================================
   TELEGRAM
   ===================================================================== */
async function tg(env, method, body) {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const r = await fetch((env.TELEGRAM_API || "https://api.telegram.org") + "/bot" + env.BOT_TOKEN + "/" + method, {
    method: "POST", body: isForm ? body : JSON.stringify(body), headers: isForm ? undefined : { "Content-Type": "application/json" },
  });
  let j = {};
  try { j = await r.json(); } catch (e) {}
  if (!j.ok) throw new Error("Telegram: " + (j.description || r.status));
  return j.result;
}
function form(obj) { const f = new FormData(); for (const k in obj) f.append(k, obj[k]); return f; }

async function testMessage(request, env, cors) {
  if (!authorized(request, env)) return json({ ok: false, error: "Kalit noto'g'ri" }, 401, cors);
  if (!env.BOT_TOKEN || !env.CHAT_ID) return json({ ok: false, error: "BOT_TOKEN yoki CHAT_ID kiritilmagan" }, 500, cors);
  try {
    await tg(env, "sendMessage", { chat_id: env.CHAT_ID, text: "✅ Sinov: saytdagi lidlar shu yerga keladi." });
    return json({ ok: true }, 200, cors);
  } catch (e) { return json({ ok: false, error: e.message }, 502, cors); }
}

/* Sotuvchilar: SELLERS = [{"name":"Ali","thread":0,"amo_user_id":0}, ...]
   thread (topic raqami) bo'sh bo'lsa, /setup topic'ni o'zi ochadi va shu yerda eslab qoladi. */
async function getSellers(env) {
  let arr = [];
  try { arr = JSON.parse(env.SELLERS || "[]"); } catch (e) {}
  let th = {};
  try { const row = await env.DB.prepare("SELECT v FROM kv WHERE k='threads'").first(); th = JSON.parse((row && row.v) || "{}"); } catch (e) {}
  return arr.filter((s) => s && s.name).map((s) => ({ name: String(s.name), thread: Number(s.thread) || Number(th[s.name]) || 0, amo_user_id: Number(s.amo_user_id) || 0 }));
}
// Teng taqsimlash: 1-lid -> 1-sotuvchi, 2-lid -> 2-sotuvchi, 3-lid -> 3-sotuvchi, 4-lid -> yana 1-sotuvchi ...
async function pickSeller(env) {
  const sellers = await getSellers(env);
  if (!sellers.length) return { name: "", thread: 0, amo_user_id: 0 };
  await env.DB.prepare("INSERT OR IGNORE INTO kv (k, v) VALUES ('rr', 0)").run();
  const row = await env.DB.prepare("UPDATE kv SET v = v + 1 WHERE k = 'rr' RETURNING v").first();
  return sellers[(Number(row.v) - 1) % sellers.length];
}

function normTg(s) {
  s = cut(s, 60).replace(/^(https?:\/\/)?(t\.me|telegram\.me)\//i, "").replace(/^@/, "").replace(/[/?#].*$/, "");
  return /^[A-Za-z0-9_]{3,32}$/.test(s) ? "@" + s : "";
}
function adLabel(l) {
  const parts = [];
  if (l.src) parts.push(cap(l.src));
  if (l.cmp) parts.push(l.cmp);
  if (l.cnt) parts.push(l.cnt);
  if (parts.length) return parts.join(" · ");
  if (l.ref) return "Sayt: " + l.ref;
  return "To'g'ridan-to'g'ri / noma'lum";
}
function srcOf(r) { return r.src ? cap(r.src) : (r.ref ? r.ref : "To'g'ridan-to'g'ri"); }

function leadText(l) {
  const head = { new: "🆕 <b>Yangi lid</b>", contacted: "📞 <b>Bog'lanildi</b>", won: "✅ <b>Sotib oldi</b>", lost: "❌ <b>Sotib olmadi</b>" }[l.status] || "🆕 <b>Yangi lid</b>";
  const lines = [
    head + " · " + leadCode(l.id), "",
    "👤 <b>Ism:</b> " + esc(l.name),
    "📞 <b>Raqami:</b> " + esc(l.phone),
    "✈️ <b>Telegrami:</b> " + (l.telegram ? esc(l.telegram) : "—"),
    "🕒 <b>Lid tushgan vaqti:</b> " + tz(l.ts).dt,
    "📣 <b>Lid kelgan reklamasi:</b> " + esc(adLabel(l)),
    "",
    "📦 " + esc(l.product) + " — " + l.qty + " dona",
  ];
  if (l.link) lines.push("🔗 " + esc(l.link));
  if (l.note) lines.push("💬 " + esc(l.note));
  if (l.status !== "new") {
    lines.push("", "<b>Holat:</b> " + STATUS[l.status] + (l.status_by ? " (" + esc(l.status_by) + ", " + tz(l.status_ts).dt + ")" : ""));
    if (l.status === "lost") lines.push("<b>Sababi:</b> " + (l.reason ? esc(l.reason) : "<i>hali kiritilmagan</i>"));
  }
  return lines.join("\n");
}
function leadButtons(l) {
  const id = l.id;
  if (l.status === "new") return { inline_keyboard: [[{ text: "📞 Bog'lanildi", callback_data: "c:" + id }]] };
  if (l.status === "contacted") return { inline_keyboard: [[{ text: "✅ Sotib oldi", callback_data: "w:" + id }, { text: "❌ Sotib olmadi", callback_data: "l:" + id }]] };
  if (l.status === "lost" && !l.reason) return { inline_keyboard: [[{ text: "✍️ Sababni yozish", callback_data: "r:" + id }]] };
  return { inline_keyboard: [] };
}
const getLead = (env, id) => env.DB.prepare("SELECT * FROM leads WHERE id = ?").bind(id).first();

async function sendLead(env, lead) {
  const msg = await tg(env, "sendMessage", {
    chat_id: env.CHAT_ID, ...(lead.thread ? { message_thread_id: lead.thread } : {}),
    text: leadText(lead), parse_mode: "HTML", disable_web_page_preview: true, reply_markup: leadButtons(lead),
  });
  await env.DB.prepare("UPDATE leads SET tg_ok = 1, msg_id = ?, chat_id = ? WHERE id = ?").bind(msg.message_id, String(env.CHAT_ID), lead.id).run();
  return msg;
}
async function editLead(env, lead) {
  if (!lead.msg_id) return;
  try {
    await tg(env, "editMessageText", {
      chat_id: lead.chat_id || env.CHAT_ID, message_id: lead.msg_id, text: leadText(lead), parse_mode: "HTML",
      disable_web_page_preview: true, reply_markup: leadButtons(lead),
    });
  } catch (e) { if (!/not modified/i.test(e.message)) throw e; }
}

/* ---------- Lidni qabul qilish ---------- */
async function order(request, env, cors, ctx) {
  if (!env.DB) return json({ ok: false, error: "Server sozlanmagan (D1)" }, 500, cors);
  if (!env.BOT_TOKEN || !env.CHAT_ID) return json({ ok: false, error: "Server sozlanmagan" }, 500, cors);
  let fd;
  try { fd = await request.formData(); } catch (e) { return json({ ok: false, error: "Noto'g'ri so'rov" }, 400, cors); }

  // Spam tuzog'i: odam bu maydonni ko'rmaydi
  if (cut(fd.get("website"), 50)) return json({ ok: true }, 200, cors);

  const name = cut(fd.get("name"), 80), phone = cut(fd.get("phone"), 30), product = cut(fd.get("product"), 120);
  const link = cut(fd.get("link"), 500), note = cut(fd.get("note"), 600), telegram = normTg(fd.get("telegram"));
  const qty = Math.max(1, Math.min(999, parseInt(fd.get("qty"), 10) || 1));
  if (name.length < 2 || phone.replace(/\D/g, "").length < 9 || !product) return json({ ok: false, error: "Ma'lumotlar to'liq emas" }, 400, cors);
  if (link && !/^https?:\/\/\S+$/i.test(link)) return json({ ok: false, error: "Havola noto'g'ri" }, 400, cors);

  await ensureSchema(env);
  // Cheklov: bitta qurilmadan 10 daqiqada 5 tadan ko'p emas
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const k = await sha(ip + (env.ADMIN_KEY || ""));
  const row = await env.DB.prepare("SELECT COUNT(*) AS c FROM rl WHERE k = ? AND ts > ?").bind(k, Date.now() - 600000).first();
  if (row && row.c >= 5) return json({ ok: false, error: "Juda ko'p so'rov. Birozdan keyin urinib ko'ring." }, 429, cors);
  await env.DB.prepare("INSERT INTO rl (k, ts) VALUES (?, ?)").bind(k, Date.now()).run();

  let ad = {};
  try { ad = JSON.parse(String(fd.get("ad") || "{}")) || {}; } catch (e) {}
  const sid = cut(fd.get("sid"), 40), vid = cut(fd.get("vid"), 40);
  const sess = sid ? await env.DB.prepare("SELECT country, city, dev, model, src, med, cmp, cnt, ref FROM sessions WHERE sid = ?").bind(sid).first() : null;
  const cf = request.cf || {};
  const seller = await pickSeller(env);

  const ins = await env.DB.prepare(`INSERT INTO leads (ts, name, phone, telegram, product, qty, link, note, src, med, cmp, cnt, ref, vid, sid, country, city, dev, model, seller, thread)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(Date.now(), name, phone, telegram, product, qty, link, note,
      cut(ad.src || (sess && sess.src), 40), cut(ad.med || (sess && sess.med), 40), cut(ad.cmp || (sess && sess.cmp), 80), cut(ad.cnt || (sess && sess.cnt), 80), cut(ad.ref || (sess && sess.ref), 60),
      vid, sid, cut((sess && sess.country) || cf.country || "", 3), cut((sess && sess.city) || cf.city || "", 60), cut((sess && sess.dev) || "", 12), cut((sess && sess.model) || "", 60),
      seller.name, seller.thread).run();
  const id = ins.meta.last_row_id;
  if (sid) await env.DB.prepare("UPDATE sessions SET lead_id = ?, dirty = dirty + 1 WHERE sid = ?").bind(id, sid).run();

  // Rasm (bo'lsa) — javobdan keyin Telegram'ga yuboriladi
  let img = null;
  const f = fd.get("image");
  if (f && typeof f === "object" && f.size > 0 && f.size <= 8 * 1024 * 1024 && /^image\//.test(f.type)) img = f;

  // Lid bazaga yozildi — endi yo'qolmaydi. Qolganini (Telegram, amoCRM, Sheets) fonda bajaramiz;
  // o'xshamasa, cron har daqiqada qayta urinadi.
  ctx.waitUntil(processLead(env, id, img));
  return json({ ok: true }, 200, cors);
}

async function processLead(env, id, img) {
  let lead = await getLead(env, id);
  if (!lead) return;
  try {
    const msg = await sendLead(env, lead);
    if (img) {
      const asPhoto = /^image\/(jpeg|png|webp)$/.test(img.type);
      try {
        await tg(env, asPhoto ? "sendPhoto" : "sendDocument", form({
          chat_id: env.CHAT_ID, ...(lead.thread ? { message_thread_id: lead.thread } : {}), reply_to_message_id: msg.message_id,
          caption: "📎 " + lead.name + " yuborgan rasm", [asPhoto ? "photo" : "document"]: img,
        }));
      } catch (e) { /* rasm o'tmasa ham lid yetib bordi */ }
    }
  } catch (e) { /* cron qayta urinadi */ }
  try { await amoCreate(env, await getLead(env, id)); } catch (e) { /* cron qayta urinadi */ }
  try { await flushSheets(env, 20); } catch (e) {}
}

/* ---------- Tugmalar va sabab so'rash ---------- */
async function telegramHook(request, env, ctx) {
  const want = await sha((env.BOT_TOKEN || "") + "wh");
  if (!safeEq(request.headers.get("X-Telegram-Bot-Api-Secret-Token"), want)) return new Response("no", { status: 403 });
  let u;
  try { u = await request.json(); } catch (e) { return new Response("ok"); }
  if (u.callback_query) ctx.waitUntil(onCallback(env, u.callback_query).catch(() => {}));
  else if (u.message) ctx.waitUntil(onMessage(env, u.message).catch(() => {}));
  return new Response("ok");
}
const who = (u) => (u ? [u.first_name, u.last_name].filter(Boolean).join(" ") + (u.username ? " (@" + u.username + ")" : "") : "");

async function onCallback(env, cb) {
  await ensureSchema(env);
  const [act, sidRaw] = String(cb.data || "").split(":");
  const lead = await getLead(env, parseInt(sidRaw, 10) || 0);
  const answer = (text) => tg(env, "answerCallbackQuery", { callback_query_id: cb.id, text: text || "", show_alert: false }).catch(() => {});
  if (!lead) return answer("Lid topilmadi");
  const by = who(cb.from);

  if (act === "c") {
    if (lead.status !== "new") return answer("Allaqachon belgilangan: " + STATUS[lead.status]);
    await answer("Bog'lanildi deb belgilandi");
    return applyStatus(env, lead, "contacted", { by, origin: "telegram" });
  }
  if (act === "w") {
    if (lead.status === "won" || lead.status === "lost") return answer("Allaqachon belgilangan: " + STATUS[lead.status]);
    await answer("Sotib oldi — tabriklaymiz! 🎉");
    return applyStatus(env, lead, "won", { by, origin: "telegram" });
  }
  if (act === "l" || act === "r") {
    if (lead.status === "won" || (lead.status === "lost" && lead.reason)) return answer("Allaqachon belgilangan: " + STATUS[lead.status]);
    await answer("Sababini yozing");
    const mention = '<a href="tg://user?id=' + cb.from.id + '">' + esc(cb.from.first_name || "Sotuvchi") + "</a>";
    const prompt = await tg(env, "sendMessage", {
      chat_id: lead.chat_id || env.CHAT_ID, ...(cb.message && cb.message.message_thread_id ? { message_thread_id: cb.message.message_thread_id } : {}),
      reply_to_message_id: lead.msg_id, parse_mode: "HTML",
      text: mention + ", <b>" + leadCode(lead.id) + "</b> nimaga sotib olmadi?\nSababini shu xabarga <b>reply</b> qilib yozing 👇",
      reply_markup: { force_reply: true, selective: true, input_field_placeholder: "Masalan: narx qimmat ekan" },
    });
    await env.DB.prepare("INSERT OR REPLACE INTO pending (prompt_id, lead_id, user_id, ts) VALUES (?,?,?,?)").bind(prompt.message_id, lead.id, String(cb.from.id), Date.now()).run();
    if (lead.status !== "lost") await applyStatus(env, lead, "lost", { by, origin: "telegram", reason: "" });
    return;
  }
  return answer();
}

async function onMessage(env, msg) {
  await ensureSchema(env);
  const text = cut(msg.text, 500);
  if (/^\/id\b/i.test(text)) { // topic raqamini bilish uchun
    return tg(env, "sendMessage", { chat_id: msg.chat.id, ...(msg.message_thread_id ? { message_thread_id: msg.message_thread_id } : {}),
      text: "chat_id: " + msg.chat.id + "\nthread (topic): " + (msg.message_thread_id || "yo'q") });
  }
  const rep = msg.reply_to_message;
  if (!rep || !text) return;
  const pend = await env.DB.prepare("SELECT lead_id FROM pending WHERE prompt_id = ?").bind(rep.message_id).first();
  if (!pend) return;
  const lead = await getLead(env, pend.lead_id);
  if (!lead || lead.status === "won") return;
  await env.DB.prepare("DELETE FROM pending WHERE lead_id = ?").bind(lead.id).run();
  await applyStatus(env, lead, "lost", { by: who(msg.from), origin: "telegram", reason: text });
  await tg(env, "sendMessage", {
    chat_id: msg.chat.id, ...(msg.message_thread_id ? { message_thread_id: msg.message_thread_id } : {}), reply_to_message_id: msg.message_id,
    text: "✅ Sabab saqlandi (" + leadCode(lead.id) + "): Sheets va CRM'ga yozildi.",
  }).catch(() => {});
}

/* =====================================================================
   STATUS — Telegram, Sheets va amoCRM uchun yagona joy
   origin: qaysi tomondan o'zgargan (o'sha tomonga qayta yozilmaydi)
   ===================================================================== */
async function applyStatus(env, lead, status, o) {
  o = o || {};
  const reason = o.reason == null ? lead.reason : o.reason;
  if (lead.status === status && reason === lead.reason) return;
  await env.DB.prepare("UPDATE leads SET status = ?, reason = ?, status_ts = ?, status_by = ?, dirty = dirty + 1 WHERE id = ?")
    .bind(status, reason, Date.now(), cut(o.by || "", 80), lead.id).run();
  const fresh = await getLead(env, lead.id);
  try { await editLead(env, fresh); } catch (e) {}
  if (o.origin !== "amo") { try { await amoSync(env, fresh); } catch (e) { /* cron qayta urinadi */ } }
  try { await flushSheets(env, 20); } catch (e) {}
}

// Sheets'dagi qo'lda tahrir (Apps Script onEdit chaqiradi)
async function sheetHook(request, env, ctx, cors) {
  let b;
  try { b = JSON.parse(await request.text()); } catch (e) { return json({ ok: false }, 400, cors); }
  if (!safeEq(b.secret, env.SHEETS_SECRET)) return json({ ok: false, error: "secret" }, 401, cors);
  await ensureSchema(env);
  const id = parseInt(String(b.lead || "").replace(/\D/g, ""), 10) || 0;
  const lead = await getLead(env, id);
  if (!lead) return json({ ok: false, error: "Lid topilmadi" }, 404, cors);
  const status = statusFromText(b.status) || lead.status;
  const by = cut(b.editor || "Sheets", 80);
  const reason = b.reason == null ? undefined : cut(b.reason, 500);
  ctx.waitUntil(applyStatus(env, lead, status, { by: "Sheets: " + by, origin: "sheet", reason }).catch(() => {}));
  return json({ ok: true }, 200, cors);
}

/* =====================================================================
   GOOGLE SHEETS (Apps Script veb-ilova orqali)
   ===================================================================== */
const sheetsOn = (env) => !!(env.SHEETS_URL && env.SHEETS_SECRET);

async function sheetsPost(env, sheet, key, rows) {
  const r = await fetch(env.SHEETS_URL, {
    method: "POST", redirect: "follow", headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ secret: env.SHEETS_SECRET, sheet, key, rows }),
  });
  let j = {};
  try { j = await r.json(); } catch (e) {}
  if (!j.ok) throw new Error("Sheets: " + (j.error || r.status));
}

function leadRow(l) {
  const t = tz(l.ts);
  return {
    "Lid ID": leadCode(l.id), "Sana": t.date, "Vaqt": t.time, "Ism": l.name, "Raqam": l.phone, "Telegram": l.telegram || "",
    "Mahsulot": l.product, "Miqdor": l.qty, "Havola": l.link, "Izoh": l.note,
    "Reklama (manba)": l.src ? cap(l.src) : (l.ref || "To'g'ridan-to'g'ri"), "Kampaniya": l.cmp, "Kontent": l.cnt,
    "Davlat": l.country, "Shahar": l.city, "Qurilma": l.dev, "Telefon modeli": l.model,
    "Sotuvchi": l.seller, "Status": STATUS[l.status] || STATUS.new, "Rad etish sababi": l.reason,
    "Status vaqti": l.status_ts ? tz(l.status_ts).dt : "", "Kim o'zgartirdi": l.status_by,
    "amoCRM ID": l.amo_id || "", "Tashrifchi ID": l.vid, "Seans ID": l.sid,
  };
}
function visitRow(s) {
  const t = tz(s.first_ts);
  return {
    "Seans ID": s.sid, "Sana": t.date, "Vaqt": t.time, "Tashrifchi ID": s.vid, "Yangi/Qaytgan": s.is_new ? "Yangi" : "Qaytgan",
    "Davlat": s.country, "Shahar": s.city, "Hudud": s.region, "Soat mintaqasi": s.tz,
    "Qurilma": s.dev, "Telefon modeli": s.model, "Tizim": s.os, "Brauzer": s.br, "Ekran": s.scr, "Til": s.lang, "Internet": s.conn,
    "Manba": srcOf(s), "Medium": s.med, "Kampaniya": s.cmp, "Kontent": s.cnt, "Kirgan sahifa": s.land,
    "Saytda (soniya)": s.dur, "Saytda bo'lgan vaqt": fmtDur(s.dur), "Scroll %": s.scroll,
    "Yetgan bo'limlar": s.sections, "Bosganlari": s.clicks, "Bosishlar soni": s.click_n,
    "Lid qoldirdi": s.lead_id ? "Ha" : "Yo'q", "Lid ID": s.lead_id ? leadCode(s.lead_id) : "", "IP": s.ip, "Provayder": s.org,
  };
}

// o'zgargan qatorlarni Sheets'ga yuboradi (qator = bitta kalit bo'yicha yangilanadi yoki qo'shiladi)
async function flushSheets(env, limit) {
  if (!sheetsOn(env) || !env.DB) return;
  await ensureSchema(env);
  const L = await env.DB.prepare("SELECT * FROM leads WHERE dirty > 0 ORDER BY id LIMIT ?").bind(limit || 100).all();
  const leads = L.results || [];
  if (leads.length) {
    await sheetsPost(env, "Lidlar", "Lid ID", leads.map(leadRow));
    await env.DB.batch(leads.map((l) => env.DB.prepare("UPDATE leads SET dirty = 0 WHERE id = ? AND dirty = ?").bind(l.id, l.dirty)));
  }
  const V = await env.DB.prepare("SELECT * FROM sessions WHERE dirty > 0 ORDER BY first_ts LIMIT ?").bind(limit || 100).all();
  const vis = V.results || [];
  if (vis.length) {
    await sheetsPost(env, "Tashriflar", "Seans ID", vis.map(visitRow));
    await env.DB.batch(vis.map((s) => env.DB.prepare("UPDATE sessions SET dirty = 0 WHERE sid = ? AND dirty = ?").bind(s.sid, s.dirty)));
  }
}

/* =====================================================================
   amoCRM (uzoq muddatli token bilan; "Shaxsiy integratsiya" -> Tokenlar)
   AMO_DOMAIN = kompaniya.amocrm.ru   AMO_TOKEN = uzoq muddatli token
   Ixtiyoriy: AMO_PIPELINE_ID, AMO_STATUS_NEW, AMO_STATUS_CONTACTED (voronka bosqich raqamlari)
   "Muvaffaqiyatli" = 142, "Yopildi" = 143 (amoCRM'da hamma uchun bir xil)
   ===================================================================== */
const amoOn = (env) => !!(env.AMO_DOMAIN && env.AMO_TOKEN);
async function amo(env, method, path, body) {
  const host = String(env.AMO_DOMAIN).replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const r = await fetch("https://" + host + "/api/v4" + path, {
    method, headers: { Authorization: "Bearer " + env.AMO_TOKEN, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let j = null;
  try { j = text ? JSON.parse(text) : null; } catch (e) {}
  if (!r.ok) throw new Error("amoCRM " + r.status + ": " + text.slice(0, 200));
  return j;
}
const amoStatusId = (env, status) => ({ won: 142, lost: 143, contacted: Number(env.AMO_STATUS_CONTACTED) || 0, new: Number(env.AMO_STATUS_NEW) || 0 }[status] || 0);

function amoNoteText(l) {
  return [
    "Saytdan yangi lid " + leadCode(l.id), "Ism: " + l.name, "Raqam: " + l.phone, "Telegram: " + (l.telegram || "—"),
    "Mahsulot: " + l.product + " — " + l.qty + " dona", l.link ? "Havola: " + l.link : "", l.note ? "Izoh: " + l.note : "",
    "Reklama: " + adLabel(l), "Joylashuv: " + [l.city, l.country].filter(Boolean).join(", "), l.model ? "Telefon: " + l.model : "",
    "Sotuvchi: " + (l.seller || "—"), "Tushgan vaqt: " + tz(l.ts).dt,
  ].filter(Boolean).join("\n");
}

async function amoCreate(env, l) {
  if (!l || !amoOn(env) || l.amo_ok) return;
  const sellers = await getSellers(env);
  const sel = sellers.find((s) => s.name === l.seller);
  const tags = [{ name: "sayt" }];
  if (l.src) tags.push({ name: cut(l.src, 30) });
  const lead = {
    name: "Sayt: " + l.product + " — " + l.name, price: 0,
    ...(env.AMO_PIPELINE_ID ? { pipeline_id: Number(env.AMO_PIPELINE_ID) } : {}),
    ...(Number(env.AMO_STATUS_NEW) ? { status_id: Number(env.AMO_STATUS_NEW) } : {}),
    ...(sel && sel.amo_user_id ? { responsible_user_id: sel.amo_user_id } : {}),
    _embedded: {
      tags,
      contacts: [{
        first_name: l.name,
        ...(sel && sel.amo_user_id ? { responsible_user_id: sel.amo_user_id } : {}),
        custom_fields_values: [{ field_code: "PHONE", values: [{ value: l.phone, enum_code: "WORK" }] }],
      }],
    },
  };
  const res = await amo(env, "POST", "/leads/complex", [lead]);
  const amoId = res && res[0] && res[0].id;
  if (!amoId) throw new Error("amoCRM: lid ID qaytmadi");
  await env.DB.prepare("UPDATE leads SET amo_id = ?, amo_ok = 1, amo_st = 'new', dirty = dirty + 1 WHERE id = ?").bind(amoId, l.id).run();
  await amo(env, "POST", "/leads/" + amoId + "/notes", [{ note_type: "common", params: { text: amoNoteText(l) } }]).catch(() => {});
}

// Telegram/Sheets'da o'zgargan statusni amoCRM'ga yozish
async function amoSync(env, l) {
  if (!l || !amoOn(env)) return;
  if (!l.amo_id) return amoCreate(env, l).then(async () => { const f = await getLead(env, l.id); if (f && f.amo_id && f.status !== "new") return amoSync(env, f); });
  const want = l.status + (l.status === "lost" && l.reason ? ":r" : ""); // sabab yozilganda ham amoCRM'ga yangilanish ketadi
  if (l.amo_st === want) return;
  const sid = amoStatusId(env, l.status);
  if (sid) await amo(env, "PATCH", "/leads/" + l.amo_id, { status_id: sid, ...(env.AMO_PIPELINE_ID ? { pipeline_id: Number(env.AMO_PIPELINE_ID) } : {}) });
  const text = "Status: " + STATUS[l.status] + (l.status_by ? " — " + l.status_by : "") + (l.status === "lost" ? "\nSotib olmagan sababi: " + (l.reason || "kiritilmagan") : "");
  await amo(env, "POST", "/leads/" + l.amo_id + "/notes", [{ note_type: "common", params: { text } }]).catch(() => {});
  await env.DB.prepare("UPDATE leads SET amo_st = ? WHERE id = ?").bind(want, l.id).run();
}

// amoCRM'dan webhook: lid bosqichi o'zgardi (amoCRM -> Sozlamalar -> Integratsiyalar -> Webhook)
async function amoHook(request, env, ctx, url) {
  const want = await sha((env.BOT_TOKEN || "") + "amo");
  if (!safeEq(url.searchParams.get("key"), want)) return new Response("no", { status: 403 });
  await ensureSchema(env);
  const body = new URLSearchParams(await request.text());
  const events = {};
  for (const [k, v] of body) {
    const m = /^leads\[(status|add)\]\[(\d+)\]\[(id|status_id)\]$/.exec(k);
    if (m && m[1] === "status") { (events[m[2]] = events[m[2]] || {})[m[3]] = parseInt(v, 10); }
  }
  for (const e of Object.values(events)) {
    ctx.waitUntil((async () => {
      const lead = await env.DB.prepare("SELECT * FROM leads WHERE amo_id = ?").bind(e.id).first();
      if (!lead) return;
      let st = null;
      if (e.status_id === 142) st = "won";
      else if (e.status_id === 143) st = "lost";
      else if (Number(env.AMO_STATUS_CONTACTED) && e.status_id === Number(env.AMO_STATUS_CONTACTED)) st = "contacted";
      else if (Number(env.AMO_STATUS_NEW) && e.status_id === Number(env.AMO_STATUS_NEW)) st = "new";
      if (!st || st === lead.status) return;
      await env.DB.prepare("UPDATE leads SET amo_st = ? WHERE id = ?").bind(st + (st === "lost" && lead.reason ? ":r" : ""), lead.id).run();
      await applyStatus(env, lead, st, { by: "amoCRM", origin: "amo" });
    })().catch(() => {}));
  }
  return new Response("ok");
}

/* ---------- Cron: kechikkan ishlarni yakunlash ---------- */
async function cron(env) {
  if (!env.DB) return;
  await ensureSchema(env);
  const since = Date.now() - 3 * 86400000;
  // 1) Telegram'ga yetib bormagan lidlar
  if (env.BOT_TOKEN && env.CHAT_ID) {
    const q = await env.DB.prepare("SELECT * FROM leads WHERE tg_ok = 0 AND ts > ? ORDER BY id LIMIT 10").bind(since).all();
    for (const l of q.results || []) {
      // topic keyinroq ochilgan bo'lishi mumkin
      const s = (await getSellers(env)).find((x) => x.name === l.seller);
      if (s && s.thread && s.thread !== l.thread) { await env.DB.prepare("UPDATE leads SET thread = ? WHERE id = ?").bind(s.thread, l.id).run(); l.thread = s.thread; }
      try { await sendLead(env, l); } catch (e) {}
    }
  }
  // 2) amoCRM'ga yetib bormagan lidlar va statuslar
  if (amoOn(env)) {
    const q = await env.DB.prepare("SELECT * FROM leads WHERE ts > ? AND (amo_ok = 0 OR (amo_id > 0 AND amo_st <> status || CASE WHEN status = 'lost' AND reason <> '' THEN ':r' ELSE '' END)) ORDER BY id LIMIT 10").bind(since).all();
    for (const l of q.results || []) { try { await (l.amo_ok ? amoSync(env, l) : amoCreate(env, l)); } catch (e) {} }
  }
  // 3) Sheets
  try { await flushSheets(env, 100); } catch (e) {}
}

/* ---------- Bir martalik sozlash: topic'lar ochish + Telegram webhook ulash ----------
   Brauzerda oching:  https://<worker>/setup?key=ADMIN_KEY   (POST yoki GET) */
async function setup(request, env, cors, url) {
  const given = url.searchParams.get("key") || "";
  if (!(authorized(request, env) || safeEq(given, env.ADMIN_KEY))) return json({ ok: false, error: "Kalit noto'g'ri" }, 401, cors);
  if (!env.DB) return json({ ok: false, error: "D1 (DB) ulanmagan" }, 500, cors);
  if (!env.BOT_TOKEN || !env.CHAT_ID) return json({ ok: false, error: "BOT_TOKEN yoki CHAT_ID kiritilmagan" }, 500, cors);
  await ensureSchema(env);
  const out = { ok: true, topics: [], notes: [] };

  // 1) Har bir sotuvchiga topic
  let arr = [];
  try { arr = JSON.parse(env.SELLERS || "[]"); } catch (e) { return json({ ok: false, error: "SELLERS JSON noto'g'ri" }, 400, cors); }
  const row = await env.DB.prepare("SELECT v FROM kv WHERE k='threads'").first();
  let th = {};
  try { th = JSON.parse((row && row.v) || "{}"); } catch (e) {}
  for (const s of arr) {
    if (!s.name) continue;
    if (Number(s.thread) || th[s.name]) { out.topics.push({ name: s.name, thread: Number(s.thread) || th[s.name], created: false }); continue; }
    try {
      const t = await tg(env, "createForumTopic", { chat_id: env.CHAT_ID, name: "👤 " + s.name });
      th[s.name] = t.message_thread_id;
      out.topics.push({ name: s.name, thread: t.message_thread_id, created: true });
    } catch (e) {
      out.topics.push({ name: s.name, error: e.message });
      out.notes.push("Topic ochilmadi (" + s.name + "): guruh 'Topics' rejimida bo'lsin va bot adminlikda 'Manage topics' huquqiga ega bo'lsin.");
    }
  }
  await env.DB.prepare("INSERT OR REPLACE INTO kv (k, v) VALUES ('threads', ?)").bind(JSON.stringify(th)).run();

  // 2) Telegram webhook (tugmalar va reply ishlashi uchun)
  const secret = await sha(env.BOT_TOKEN + "wh");
  try {
    await tg(env, "setWebhook", { url: url.origin + "/tg", secret_token: secret, allowed_updates: ["message", "callback_query"], drop_pending_updates: false });
    out.webhook = url.origin + "/tg";
  } catch (e) { out.ok = false; out.webhook_error = e.message; }

  // 3) amoCRM webhook manzili (amoCRM'ga o'zingiz qo'yasiz)
  out.amo_webhook_url = url.origin + "/amo?key=" + (await sha((env.BOT_TOKEN || "") + "amo"));
  out.sheets = sheetsOn(env); out.amocrm = amoOn(env);
  return json(out, 200, cors);
}
