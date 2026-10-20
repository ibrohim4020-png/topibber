/* =====================================================================
   TopibBer — Google Sheets qismi (Apps Script).
   Nima qiladi:
     • setup() — Sheets'ni chiroyli qilib tayyorlaydi: Dashboard, Lidlar, Tashriflar;
     • doPost() — Cloudflare Worker yuborgan tashrif va lidlarni jadvalga yozadi/yangilaydi;
     • onSheetEdit() — Lidlar jadvalida Status yoki "Rad etish sababi" qo'lda o'zgartirilsa,
       Worker'ga yuboradi (Telegram va amoCRM ham yangilanadi).

   O'rnatish: sheets/README.md (3 qadam). Pastdagi ikkita qiymatni to'ldiring.
   ===================================================================== */

const SECRET = "BU_YERGA_UZUN_MAXFIY_SOZ_YOZING";                  // Worker'dagi SHEETS_SECRET bilan bir xil
const WORKER_URL = "https://SIZNING-WORKER.workers.dev";           // Worker manzili (oxirida / siz)

const STATUSES = ["🆕 Yangi", "📞 Bog'lanildi", "✅ Sotib oldi", "❌ Sotib olmadi"];

const COLORS = {
  ink: "#0F172A", head: "#1E293B", headText: "#FFFFFF", band1: "#FFFFFF", band2: "#F1F5F9", line: "#CBD5E1",
  blue: "#DBEAFE", amber: "#FEF3C7", green: "#D1FAE5", red: "#FEE2E2", accent: "#6366F1",
};

// Ustunlar tartibi shu yerda. Worker yuboradigan kalitlar bilan aynan bir xil bo'lishi shart.
const CFG = {
  "Lidlar": {
    key: "Lid ID", tab: "#6366F1",
    headers: ["Lid ID", "Sana", "Vaqt", "Ism", "Raqam", "Telegram", "Mahsulot", "Miqdor", "Reklama (manba)", "Kampaniya", "Kontent",
      "Sotuvchi", "Status", "Rad etish sababi", "Status vaqti", "Kim o'zgartirdi", "Shahar", "Davlat", "Qurilma", "Telefon modeli",
      "Havola", "Izoh", "amoCRM ID", "Tashrifchi ID", "Seans ID"],
    widths: { "Lid ID": 80, "Sana": 95, "Vaqt": 75, "Ism": 140, "Raqam": 140, "Telegram": 120, "Mahsulot": 200, "Miqdor": 65, "Reklama (manba)": 140,
      "Kampaniya": 140, "Kontent": 120, "Sotuvchi": 110, "Status": 140, "Rad etish sababi": 260, "Status vaqti": 120, "Kim o'zgartirdi": 150,
      "Shahar": 100, "Davlat": 65, "Qurilma": 90, "Telefon modeli": 130, "Havola": 220, "Izoh": 220, "amoCRM ID": 90, "Tashrifchi ID": 120, "Seans ID": 120 },
    numeric: ["Miqdor"],
    frozenCols: 5,
  },
  "Tashriflar": {
    key: "Seans ID", tab: "#10B981",
    headers: ["Sana", "Vaqt", "Yangi/Qaytgan", "Davlat", "Shahar", "Hudud", "Qurilma", "Telefon modeli", "Tizim", "Brauzer", "Ekran",
      "Manba", "Medium", "Kampaniya", "Kontent", "Saytda bo'lgan vaqt", "Scroll %", "Yetgan bo'limlar", "Bosganlari", "Bosishlar soni",
      "Lid qoldirdi", "Lid ID", "Kirgan sahifa", "Til", "Soat mintaqasi", "Internet", "Saytda (soniya)", "Provayder", "IP", "Tashrifchi ID", "Seans ID"],
    widths: { "Sana": 95, "Vaqt": 75, "Yangi/Qaytgan": 100, "Davlat": 65, "Shahar": 110, "Hudud": 110, "Qurilma": 90, "Telefon modeli": 140, "Tizim": 110,
      "Brauzer": 140, "Ekran": 100, "Manba": 130, "Medium": 90, "Kampaniya": 140, "Kontent": 120, "Saytda bo'lgan vaqt": 130, "Scroll %": 70,
      "Yetgan bo'limlar": 260, "Bosganlari": 260, "Bosishlar soni": 90, "Lid qoldirdi": 90, "Lid ID": 80, "Kirgan sahifa": 150, "Til": 55,
      "Soat mintaqasi": 130, "Internet": 70, "Saytda (soniya)": 100, "Provayder": 180, "IP": 120, "Tashrifchi ID": 120, "Seans ID": 120 },
    numeric: ["Saytda (soniya)", "Scroll %", "Bosishlar soni"],
    frozenCols: 2,
  },
};

/* ---------- Yordamchilar ---------- */
function colLetter(n) { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
function L(sheet, header) { return colLetter(CFG[sheet].headers.indexOf(header) + 1); }
function rng(sheet, header) { const c = L(sheet, header); return sheet + "!" + c + "2:" + c; }
function ss() { return SpreadsheetApp.getActiveSpreadsheet(); }
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* ---------- Worker -> Sheets ---------- */
function doGet() { return ContentService.createTextOutput("TopibBer Sheets: ishlayapti"); }

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(28000);
    const req = JSON.parse(e.postData.contents);
    if (req.secret !== SECRET) return out({ ok: false, error: "secret" });
    if (!CFG[req.sheet]) return out({ ok: false, error: "noma'lum jadval" });
    upsert(req.sheet, req.rows || []);
    return out({ ok: true, n: (req.rows || []).length });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

function upsert(name, rows) {
  const cfg = CFG[name], H = cfg.headers;
  const sh = ss().getSheetByName(name) || setupSheet(name);
  const keyCol = H.indexOf(cfg.key) + 1;
  const last = sh.getLastRow();
  const keys = last > 1 ? sh.getRange(2, keyCol, last - 1, 1).getValues() : [];
  const at = {};
  for (let i = 0; i < keys.length; i++) at[String(keys[i][0])] = i + 2;

  const fresh = [];
  rows.forEach(function (r) {
    const vals = H.map(function (h) { const v = r[h]; return v === undefined || v === null ? "" : v; });
    const row = at[String(r[cfg.key])];
    if (row) sh.getRange(row, 1, 1, H.length).setValues([vals]);
    else fresh.push(vals);
  });

  if (fresh.length) { // yangilari tepada ko'rinadi
    fresh.reverse();
    sh.insertRowsBefore(2, fresh.length);
    styleRows(sh, name, 2, fresh.length);
    sh.getRange(2, 1, fresh.length, H.length).setValues(fresh);
  }
}

/* ---------- Sheets -> Worker (qo'lda tahrir) ---------- */
function onSheetEdit(e) {
  try {
    const sh = e.range.getSheet();
    if (sh.getName() !== "Lidlar" || e.range.getRow() < 2) return;
    const H = CFG["Lidlar"].headers;
    const sc = H.indexOf("Status") + 1, rc = H.indexOf("Rad etish sababi") + 1, c = e.range.getColumn();
    if (c !== sc && c !== rc) return;
    const row = sh.getRange(e.range.getRow(), 1, 1, H.length).getValues()[0];
    UrlFetchApp.fetch(WORKER_URL.replace(/\/+$/, "") + "/sheet", {
      method: "post", contentType: "text/plain", muteHttpExceptions: true,
      payload: JSON.stringify({ secret: SECRET, lead: row[0], status: row[sc - 1], reason: row[rc - 1], editor: (e.user && e.user.getEmail()) || "Sheets" }),
    });
  } catch (err) { console.error(err); }
}

/* ---------- Bir martalik tayyorlash ---------- */
function setup() {
  const book = ss();
  let dash = book.getSheetByName("Dashboard") || book.insertSheet("Dashboard", 0);
  setupSheet("Lidlar");
  setupSheet("Tashriflar");
  buildDashboard(dash);
  const first = book.getSheetByName("Sheet1") || book.getSheetByName("Лист1") || book.getSheetByName("Varaq1");
  if (first && first.getLastRow() === 0 && book.getSheets().length > 1) book.deleteSheet(first);

  // qo'lda tahrir uchun trigger (bir marta)
  const has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === "onSheetEdit"; });
  if (!has) ScriptApp.newTrigger("onSheetEdit").forSpreadsheet(book).onEdit().create();
  book.setActiveSheet(dash);
  SpreadsheetApp.flush();
}

function setupSheet(name) {
  const cfg = CFG[name], H = cfg.headers, book = ss();
  const sh = book.getSheetByName(name) || book.insertSheet(name);
  if (sh.getMaxColumns() < H.length) sh.insertColumnsAfter(sh.getMaxColumns(), H.length - sh.getMaxColumns());
  if (sh.getMaxRows() < 1000) sh.insertRowsAfter(sh.getMaxRows(), 1000 - sh.getMaxRows());
  sh.setTabColor(cfg.tab);
  sh.setHiddenGridlines(true);

  const head = sh.getRange(1, 1, 1, H.length);
  head.setValues([H]).setBackground(COLORS.head).setFontColor(COLORS.headText).setFontWeight("bold").setFontSize(10)
    .setVerticalAlignment("middle").setHorizontalAlignment("center").setWrap(true);
  sh.setRowHeight(1, 42);
  sh.setFrozenRows(1);
  sh.setFrozenColumns(cfg.frozenCols);
  H.forEach(function (h, i) { sh.setColumnWidth(i + 1, cfg.widths[h] || 120); });

  styleRows(sh, name, 2, sh.getMaxRows() - 1);

  // qatorlar navbati bilan rangli, filtr
  sh.getBandings().forEach(function (b) { b.remove(); });
  sh.getRange(1, 1, sh.getMaxRows(), H.length).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false)
    .setHeaderRowColor(COLORS.head).setFirstRowColor(COLORS.band1).setSecondRowColor(COLORS.band2);
  if (!sh.getFilter()) sh.getRange(1, 1, sh.getMaxRows(), H.length).createFilter();

  if (name === "Lidlar") statusFormatting(sh);
  return sh;
}

function styleRows(sh, name, startRow, n) {
  if (n <= 0) return;
  const cfg = CFG[name], H = cfg.headers;
  const body = sh.getRange(startRow, 1, n, H.length);
  body.setFontColor(COLORS.ink).setFontWeight("normal").setFontSize(10).setVerticalAlignment("middle").setWrap(false);
  const fmts = [];
  const rowFmt = H.map(function (h) { return cfg.numeric.indexOf(h) >= 0 ? "0" : "@"; }); // "@" — matn: +998... formula bo'lib ketmasin
  for (let i = 0; i < n; i++) fmts.push(rowFmt);
  body.setNumberFormats(fmts);
  H.forEach(function (h, i) {
    if (["Ism", "Raqam", "Mahsulot", "Yetgan bo'limlar", "Bosganlari", "Rad etish sababi", "Izoh", "Havola"].indexOf(h) >= 0) return;
    if (cfg.numeric.indexOf(h) >= 0 || ["Sana", "Vaqt", "Lid ID", "Status", "Davlat", "Qurilma", "Til"].indexOf(h) >= 0)
      sh.getRange(startRow, i + 1, n, 1).setHorizontalAlignment("center");
  });
  if (name === "Lidlar") {
    const sc = H.indexOf("Status") + 1;
    const rule = SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).setAllowInvalid(false).build();
    sh.getRange(startRow, sc, n, 1).setDataValidation(rule).setFontWeight("bold");
    sh.getRange(startRow, H.indexOf("Rad etish sababi") + 1, n, 1).setWrap(true);
  }
}

function statusFormatting(sh) {
  const H = CFG["Lidlar"].headers, sc = colLetter(H.indexOf("Status") + 1);
  const area = sh.getRange(2, 1, sh.getMaxRows() - 1, H.length);
  const mk = function (text, bg, fg) {
    return SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$' + sc + '2="' + text + '"').setBackground(bg).setFontColor(fg).setRanges([area]).build();
  };
  sh.setConditionalFormatRules([
    mk(STATUSES[0], COLORS.blue, "#1E3A8A"), mk(STATUSES[1], COLORS.amber, "#78350F"),
    mk(STATUSES[2], COLORS.green, "#064E3B"), mk(STATUSES[3], COLORS.red, "#7F1D1D"),
  ]);
}

/* ---------- Dashboard ---------- */
function buildDashboard(d) {
  d.clear();
  d.getCharts().forEach(function (c) { d.removeChart(c); });
  d.setHiddenGridlines(true);
  d.setTabColor(COLORS.accent);
  if (d.getMaxColumns() < 20) d.insertColumnsAfter(d.getMaxColumns(), 20 - d.getMaxColumns());
  d.setColumnWidths(1, 8, 150);
  d.setColumnWidth(9, 30);
  d.setColumnWidths(10, 6, 110);

  const S = rng("Tashriflar", "Sana"), V = rng("Tashriflar", "Tashrifchi ID"), SEC = rng("Tashriflar", "Saytda (soniya)");
  const LID = rng("Lidlar", "Lid ID"), ST = rng("Lidlar", "Status"), SEL = rng("Lidlar", "Sotuvchi"), LS = rng("Lidlar", "Reklama (manba)"), LD = rng("Lidlar", "Sana");
  const TM = rng("Tashriflar", "Manba"), TSD = rng("Tashriflar", "Sana");

  // sarlavha
  d.getRange("A1:H1").merge().setValue("TopibBer · Boshqaruv paneli").setBackground(COLORS.ink).setFontColor("#FFFFFF").setFontSize(20).setFontWeight("bold").setVerticalAlignment("middle");
  d.setRowHeight(1, 56);
  d.getRange("A2:H2").merge().setFormula('="Yangilangan: "&TEXT(NOW(),"dd.MM.yyyy HH:mm")&"  ·  Ma\'lumotlar Telegram, amoCRM va sayt bilan avtomatik sinxron"')
    .setFontColor("#64748B").setFontSize(10).setFontStyle("italic");

  // KPI kartalar
  const k1 = [
    ["Tashriflar", '=COUNTA(' + S + ')', "#,##0"],
    ["Noyob tashrifchi", '=IFERROR(COUNTA(UNIQUE(FILTER(' + V + ',' + V + '<>""))),0)', "#,##0"],
    ["Lidlar", '=COUNTA(' + LID + ')', "#,##0"],
    ["Lid konversiyasi", '=IFERROR(C5/B5,0)', "0.0%"],
    ["Sotib oldi", '=COUNTIF(' + ST + ',"' + STATUSES[2] + '")', "#,##0"],
    ["Sotib olmadi", '=COUNTIF(' + ST + ',"' + STATUSES[3] + '")', "#,##0"],
    ["Sotuv konversiyasi", '=IFERROR(E5/C5,0)', "0.0%"],
    ["O'rtacha vaqt saytda", '=IFERROR(INT(AVERAGE(' + SEC + ')/60)&" daq "&MOD(ROUND(AVERAGE(' + SEC + ')),60)&" s","—")', "@"],
  ];
  const k2 = [
    ["Yangi (tegilmagan)", '=COUNTIF(' + ST + ',"' + STATUSES[0] + '")', "#,##0", COLORS.blue],
    ["Bog'lanildi", '=COUNTIF(' + ST + ',"' + STATUSES[1] + '")', "#,##0", COLORS.amber],
    ["Bugungi tashrif", '=COUNTIF(' + S + ',TEXT(TODAY(),"yyyy-MM-dd"))', "#,##0", COLORS.band2],
    ["Bugungi lid", '=COUNTIF(' + LD + ',TEXT(TODAY(),"yyyy-MM-dd"))', "#,##0", COLORS.band2],
  ];
  card(d, 4, k1.map(function (k) { return { label: k[0], formula: k[1], fmt: k[2], bg: "#EEF2FF" }; }));
  card(d, 7, k2.map(function (k) { return { label: k[0], formula: k[1], fmt: k[2], bg: k[3] }; }));

  // Sotuvchilar
  section(d, 11, "👤 Sotuvchilar", "H");
  d.getRange("A12").setFormula('=IFERROR(QUERY(Lidlar!A2:' + colLetter(CFG["Lidlar"].headers.length) + ',"select ' + L("Lidlar", "Sotuvchi") + ', count(A) where ' + L("Lidlar", "Sotuvchi") + ' <> \'\' group by ' + L("Lidlar", "Sotuvchi") + ' label ' + L("Lidlar", "Sotuvchi") + ' \'Sotuvchi\', count(A) \'Lidlar\'",0),"")');
  d.getRange("C12:G12").setValues([["Yangi", "Bog'lanildi", "Sotib oldi", "Sotib olmadi", "Sotuv %"]]);
  d.getRange("C13").setFormula('=ARRAYFORMULA(IF(A13:A20="",,COUNTIFS(' + SEL + ',A13:A20,' + ST + ',"' + STATUSES[0] + '")))');
  d.getRange("D13").setFormula('=ARRAYFORMULA(IF(A13:A20="",,COUNTIFS(' + SEL + ',A13:A20,' + ST + ',"' + STATUSES[1] + '")))');
  d.getRange("E13").setFormula('=ARRAYFORMULA(IF(A13:A20="",,COUNTIFS(' + SEL + ',A13:A20,' + ST + ',"' + STATUSES[2] + '")))');
  d.getRange("F13").setFormula('=ARRAYFORMULA(IF(A13:A20="",,COUNTIFS(' + SEL + ',A13:A20,' + ST + ',"' + STATUSES[3] + '")))');
  d.getRange("G13").setFormula('=ARRAYFORMULA(IF(A13:A20="",,IFERROR(E13:E20/B13:B20,0)))');
  d.getRange("G13:G20").setNumberFormat("0.0%");
  table(d, 12, 20, 7);

  // Reklama manbalari
  section(d, 22, "📣 Reklama manbalari (qaysi reklama nima beryapti)", "H");
  d.getRange("A23").setFormula('=IFERROR(QUERY(Tashriflar!A2:' + colLetter(CFG["Tashriflar"].headers.length) + ',"select ' + L("Tashriflar", "Manba") + ', count(A) where ' + L("Tashriflar", "Manba") + ' <> \'\' group by ' + L("Tashriflar", "Manba") + ' order by count(A) desc limit 12 label ' + L("Tashriflar", "Manba") + ' \'Manba\', count(A) \'Tashrif\'",0),"")');
  d.getRange("C23:F23").setValues([["Lid", "Sotib oldi", "Tashrif→Lid", "Lid→Sotuv"]]);
  d.getRange("C24").setFormula('=ARRAYFORMULA(IF(A24:A35="",,COUNTIFS(' + LS + ',A24:A35)))');
  d.getRange("D24").setFormula('=ARRAYFORMULA(IF(A24:A35="",,COUNTIFS(' + LS + ',A24:A35,' + ST + ',"' + STATUSES[2] + '")))');
  d.getRange("E24").setFormula('=ARRAYFORMULA(IF(A24:A35="",,IFERROR(C24:C35/B24:B35,0)))');
  d.getRange("F24").setFormula('=ARRAYFORMULA(IF(A24:A35="",,IFERROR(D24:D35/C24:C35,0)))');
  d.getRange("E24:F35").setNumberFormat("0.0%");
  table(d, 23, 35, 6);

  // Top shaharlar va telefonlar
  section(d, 37, "📍 Top shaharlar", "C");
  section2(d, 37, 5, "📱 Top telefon modellari", 8);
  d.getRange("A38").setFormula('=IFERROR(QUERY(Tashriflar!A2:' + colLetter(CFG["Tashriflar"].headers.length) + ',"select ' + L("Tashriflar", "Shahar") + ', count(A) where ' + L("Tashriflar", "Shahar") + ' <> \'\' group by ' + L("Tashriflar", "Shahar") + ' order by count(A) desc limit 10 label ' + L("Tashriflar", "Shahar") + ' \'Shahar\', count(A) \'Tashrif\'",0),"")');
  d.getRange("E38").setFormula('=IFERROR(QUERY(Tashriflar!A2:' + colLetter(CFG["Tashriflar"].headers.length) + ',"select ' + L("Tashriflar", "Telefon modeli") + ', count(A) where ' + L("Tashriflar", "Telefon modeli") + ' <> \'\' group by ' + L("Tashriflar", "Telefon modeli") + ' order by count(A) desc limit 10 label ' + L("Tashriflar", "Telefon modeli") + ' \'Telefon modeli\', count(A) \'Tashrif\'",0),"")');
  headerRow(d.getRange("A38:B38")); headerRow(d.getRange("E38:F38"));
  d.getRange("A39:B48").setBorder(null, null, true, null, null, true, COLORS.line, SpreadsheetApp.BorderStyle.SOLID);
  d.getRange("E39:F48").setBorder(null, null, true, null, null, true, COLORS.line, SpreadsheetApp.BorderStyle.SOLID);

  // Oxirgi 14 kun
  section(d, 50, "📅 Oxirgi 14 kun", "H");
  d.getRange("A51:C51").setValues([["Sana", "Tashrif", "Lid"]]);
  d.getRange("A52").setFormula('=IFERROR(SORT(ARRAY_CONSTRAIN(SORT(UNIQUE(FILTER(' + TSD + ',' + TSD + '<>"")),1,FALSE),14,1),1,TRUE),"")');
  d.getRange("B52").setFormula('=ARRAYFORMULA(IF(A52:A65="",,COUNTIF(' + TSD + ',A52:A65)))');
  d.getRange("C52").setFormula('=ARRAYFORMULA(IF(A52:A65="",,COUNTIF(' + LD + ',A52:A65)))');
  table(d, 51, 65, 3);

  // grafiklar (o'ng tomonda)
  d.insertChart(d.newChart().setChartType(Charts.ChartType.COLUMN).addRange(d.getRange("A51:C65")).setNumHeaders(1)
    .setOption("title", "Tashrif va lidlar (kunlar bo'yicha)").setOption("colors", ["#6366F1", "#10B981"]).setOption("legend", { position: "bottom" })
    .setPosition(11, 10, 0, 0).setOption("width", 560).setOption("height", 300).build());
  d.insertChart(d.newChart().setChartType(Charts.ChartType.BAR).addRange(d.getRange("A23:B35")).setNumHeaders(1)
    .setOption("title", "Reklama manbalari (tashrif)").setOption("colors", ["#6366F1"]).setOption("legend", { position: "none" })
    .setPosition(27, 10, 0, 0).setOption("width", 560).setOption("height", 300).build());
}

function card(d, row, items) {
  items.forEach(function (it, i) {
    const lab = d.getRange(row, i + 1), val = d.getRange(row + 1, i + 1);
    lab.setValue(it.label).setFontSize(9).setFontColor("#475569").setBackground(it.bg).setHorizontalAlignment("center").setVerticalAlignment("bottom");
    val.setFormula(it.formula).setNumberFormat(it.fmt).setFontSize(22).setFontWeight("bold").setFontColor(COLORS.ink).setBackground(it.bg)
      .setHorizontalAlignment("center").setVerticalAlignment("middle");
  });
  d.setRowHeight(row, 24); d.setRowHeight(row + 1, 46);
  d.getRange(row, 1, 2, items.length).setBorder(true, true, true, true, true, false, "#FFFFFF", SpreadsheetApp.BorderStyle.SOLID_THICK);
}
function section(d, row, text, lastCol) {
  d.getRange("A" + row + ":" + lastCol + row).merge().setValue(text).setFontWeight("bold").setFontSize(12).setFontColor(COLORS.ink)
    .setBackground("#E2E8F0").setVerticalAlignment("middle");
  d.setRowHeight(row, 30);
}
function section2(d, row, c1, text, c2) {
  d.getRange(row, c1, 1, c2 - c1 + 1).merge().setValue(text).setFontWeight("bold").setFontSize(12).setFontColor(COLORS.ink).setBackground("#E2E8F0").setVerticalAlignment("middle");
}
function headerRow(r) { r.setBackground(COLORS.head).setFontColor("#FFFFFF").setFontWeight("bold").setHorizontalAlignment("center"); }
function table(d, headRow, lastRow, cols) {
  headerRow(d.getRange(headRow, 1, 1, cols));
  d.getRange(headRow + 1, 1, lastRow - headRow, cols).setBorder(null, null, true, null, null, true, COLORS.line, SpreadsheetApp.BorderStyle.SOLID);
  d.getRange(headRow + 1, 2, lastRow - headRow, cols - 1).setHorizontalAlignment("center");
}
