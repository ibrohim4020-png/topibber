/* TopibBer — Railway'da ishlaydigan server: sayt (statik fayllar) + API (lidlar, Telegram, Sheets, amoCRM).
   Mantiq worker/worker.js da; bu fayl uni Node'da ishga tushiradi:
     • D1 o'rniga SQLite (node:sqlite) — fayl /data/topibber.db (Railway Volume);
     • Cloudflare'ning joylashuv ma'lumoti o'rniga IP bo'yicha qidiruv;
     • Cron o'rniga har daqiqada ishlaydigan taymer;
     • admin panel login/parol bilan yopiladi (ADMIN_USER, ADMIN_PASSWORD). */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import worker from "../worker/worker.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT) || 8080;

/* ---------- Baza: D1 bilan bir xil interfeys (prepare/bind/run/first/all/batch) ---------- */
function openDb() {
  const dir = process.env.DATA_DIR || (fs.existsSync("/data") ? "/data" : path.join(ROOT, "data"));
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, "topibber.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  console.log("Baza:", path.join(dir, "topibber.db"));
  return db;
}
const rawDb = openDb();
class Stmt {
  constructor(sql) { this.sql = sql; this.p = []; }
  get s() { return rawDb.prepare(this.sql); } // jadval hali yo'q bo'lsa ham, bajarilgan paytda tayyorlanadi
  bind(...a) { this.p = a.map((x) => (x === undefined ? null : x)); return this; }
  async run() { return this._run(); }
  _run() { const r = this.s.run(...this.p); return { success: true, meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } }; }
  async first() { return this.s.get(...this.p) || null; }
  async all() { return { results: this.s.all(...this.p) }; }
  _any() { return /^\s*(select|with)/i.test(this.sql) ? { results: this.s.all(...this.p) } : this._run(); }
}
const DB = {
  prepare: (sql) => new Stmt(sql),
  async batch(stmts) {
    rawDb.exec("BEGIN");
    try { const out = stmts.map((s) => s._any()); rawDb.exec("COMMIT"); return out; }
    catch (e) { rawDb.exec("ROLLBACK"); throw e; }
  },
};
const env = new Proxy({ DB }, { get: (t, k) => (k in t ? t[k] : process.env[k]) });

/* ---------- Joylashuv (IP bo'yicha) ---------- */
const geoCache = new Map();
async function geoLookup(ip) {
  if (!ip || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|fc|fd)/i.test(ip)) return {};
  const hit = geoCache.get(ip);
  if (hit && Date.now() - hit.ts < 6 * 3600 * 1000) return hit.p;
  const p = (async () => {
    try {
      const r = await fetch("https://ipwho.is/" + encodeURIComponent(ip) + "?fields=success,country_code,city,region,timezone,connection", { signal: AbortSignal.timeout(2500) });
      const j = await r.json();
      if (j && j.success) return { country: j.country_code || "", city: j.city || "", region: j.region || "", timezone: (j.timezone && j.timezone.id) || "", asOrganization: (j.connection && (j.connection.org || j.connection.isp)) || "" };
    } catch (e) {}
    try {
      const r = await fetch("https://ipapi.co/" + encodeURIComponent(ip) + "/json/", { signal: AbortSignal.timeout(2500) });
      const j = await r.json();
      if (j && j.country_code) return { country: j.country_code, city: j.city || "", region: j.region || "", timezone: j.timezone || "", asOrganization: j.org || "" };
    } catch (e) {}
    return {};
  })();
  geoCache.set(ip, { ts: Date.now(), p });
  if (geoCache.size > 5000) geoCache.delete(geoCache.keys().next().value);
  return p;
}

/* ---------- Statik fayllar ---------- */
const MIME = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8", ".woff2": "font/woff2", ".mp4": "video/mp4" };
const PRIVATE = /^\/(worker|sheets|server|data|\.claude|node_modules)(\/|$)|^\/(Dockerfile|package(-lock)?\.json|README\.md|\.dockerignore|Caddyfile|start\.sh)$|\/\./;
const ADMIN_PATHS = new Set(["/boshqaruv-k7x2.html", "/js/admin.js", "/css/admin.css"]);

function safeEq(a, b) {
  const x = crypto.createHash("sha256").update(String(a)).digest(), y = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}
const adminUser = () => process.env.ADMIN_USER || "admin";
const adminToken = () => crypto.createHash("sha256").update(adminUser() + ":" + process.env.ADMIN_PASSWORD + ":tb-admin").digest("hex");
function cookieOf(req, name) {
  const m = (req.headers.cookie || "").split(/;\s*/).find((c) => c.startsWith(name + "="));
  return m ? m.slice(name.length + 1) : "";
}
function adminOk(req) {
  const pass = process.env.ADMIN_PASSWORD;
  if (!pass) return false; // parol berilmagan — admin panel yopiq
  if (safeEq(cookieOf(req, "tb_admin"), adminToken())) return true;
  const h = req.headers.authorization || "";
  if (!h.startsWith("Basic ")) return false;
  const [u, ...rest] = Buffer.from(h.slice(6), "base64").toString().split(":");
  return safeEq(u, adminUser()) && safeEq(rest.join(":"), pass);
}

/* Login sahifasi (brauzerning oddiy parol oynasi o'rniga) */
const loginPage = (msg) => `<!doctype html><html lang="uz"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>TopibBer — kirish</title><style>
:root{color-scheme:light dark}body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px system-ui,sans-serif;background:#0f172a;color:#e2e8f0}
form{width:min(340px,90vw);background:#1e293b;padding:28px;border-radius:16px;box-shadow:0 10px 40px #0006}
h1{margin:0 0 18px;font-size:20px}label{display:block;margin:12px 0 4px;font-size:13px;color:#94a3b8}
input{width:100%;box-sizing:border-box;padding:11px 12px;border-radius:10px;border:1px solid #334155;background:#0f172a;color:#fff;font-size:16px}
button{margin-top:18px;width:100%;padding:12px;border:0;border-radius:10px;background:#6366f1;color:#fff;font-size:16px;font-weight:600;cursor:pointer}
.err{margin-top:12px;color:#fca5a5;font-size:14px}</style></head><body>
<form method="post" action="/admin-login"><h1>TopibBer · Admin</h1>
<label for="u">Login</label><input id="u" name="user" autocomplete="username" required autofocus>
<label for="p">Parol</label><input id="p" name="password" type="password" autocomplete="current-password" required>
<button>Kirish</button>${msg ? '<div class="err">' + msg + "</div>" : ""}</form></body></html>`;

const attempts = new Map();
async function handleLogin(req, res) {
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "";
  const a = attempts.get(ip) || { n: 0, ts: Date.now() };
  if (Date.now() - a.ts > 15 * 60 * 1000) { a.n = 0; a.ts = Date.now(); }
  if (a.n >= 10) { res.writeHead(429, { "Content-Type": "text/html; charset=utf-8" }); return res.end(loginPage("Juda ko'p urinish. 15 daqiqadan keyin qayta urining.")); }
  let body = "";
  try { body = (await readBody(req, 4096)).toString(); } catch (e) {}
  const f = new URLSearchParams(body);
  const pass = process.env.ADMIN_PASSWORD;
  if (pass && safeEq(f.get("user") || "", adminUser()) && safeEq(f.get("password") || "", pass)) {
    attempts.delete(ip);
    res.writeHead(303, {
      Location: "/boshqaruv-k7x2.html",
      "Set-Cookie": "tb_admin=" + adminToken() + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000",
    });
    return res.end();
  }
  a.n++; attempts.set(ip, a);
  res.writeHead(401, { "Content-Type": "text/html; charset=utf-8" });
  res.end(loginPage("Login yoki parol noto'g'ri."));
}

function serveStatic(req, res, pathname) {
  if (PRIVATE.test(pathname)) { res.writeHead(404); return res.end("Not found"); }
  if (ADMIN_PATHS.has(pathname) && !adminOk(req)) {
    res.writeHead(401, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    return res.end(pathname.endsWith(".html") ? loginPage("") : "Login kerak");
  }
  let rel = decodeURIComponent(pathname);
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.resolve(ROOT, "." + rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(404); return res.end("Not found"); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("Topilmadi"); }
    const ext = path.extname(file).toLowerCase();
    const longCache = /^\/(images|js\/vendor)\//.test(pathname);
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream", "Content-Length": st.size,
      "Cache-Control": longCache ? "public, max-age=2592000" : "no-cache",
      "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "X-Frame-Options": "SAMEORIGIN",
    });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

/* ---------- API: worker.js ga yo'naltirish ---------- */
const API = new Set(["/health", "/track", "/order", "/stats", "/test", "/tg", "/amo", "/sheet", "/setup"]);
const pending = new Set();
const ctx = { waitUntil: (p) => { const q = Promise.resolve(p).catch((e) => console.error("fon vazifasi:", e && e.message)).finally(() => pending.delete(q)); pending.add(q); } };

async function readBody(req, limit) {
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > limit) throw new Error("juda katta"); chunks.push(c); }
  return Buffer.concat(chunks);
}

async function handleApi(req, res, url) {
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.headers["x-real-ip"] || req.socket.remoteAddress || "";
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (v != null) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
  headers.delete("content-length"); headers.delete("transfer-encoding"); headers.delete("connection"); headers.delete("host");
  headers.set("CF-Connecting-IP", ip);
  const hasBody = !["GET", "HEAD", "OPTIONS"].includes(req.method);
  let body;
  try { body = hasBody ? await readBody(req, 12 * 1024 * 1024) : undefined; } catch (e) { res.writeHead(413); return res.end("Katta"); }
  const request = new Request(url.href, { method: req.method, headers, body: body && body.length ? body : undefined });
  if (url.pathname === "/track" || url.pathname === "/order") Object.defineProperty(request, "cf", { value: await geoLookup(ip) });

  const response = await worker.fetch(request, env, ctx);
  const out = Buffer.from(await response.arrayBuffer());
  const h = {};
  response.headers.forEach((v, k) => { h[k] = v; });
  res.writeHead(response.status, h);
  res.end(out);
}

const server = http.createServer(async (req, res) => {
  try {
    const proto = (req.headers["x-forwarded-proto"] || "http").split(",")[0];
    const url = new URL(req.url, proto + "://" + (req.headers.host || "localhost"));
    if (API.has(url.pathname)) return await handleApi(req, res, url);
    if (url.pathname === "/admin-login" && req.method === "POST") return await handleLogin(req, res);
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
    serveStatic(req, res, url.pathname);
  } catch (e) {
    console.error("xato:", e);
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Server xatosi");
  }
});
server.listen(PORT, () => console.log("TopibBer server: port " + PORT));

/* ---------- Cron o'rniga: har daqiqada kechikkan ishlarni yakunlash ---------- */
setInterval(() => { worker.scheduled({}, env, ctx); }, 60 * 1000);
setTimeout(() => { worker.scheduled({}, env, ctx); }, 5000);

process.on("SIGTERM", async () => { await Promise.allSettled([...pending]); process.exit(0); });
process.on("unhandledRejection", (e) => console.error("unhandledRejection:", e && e.message));
