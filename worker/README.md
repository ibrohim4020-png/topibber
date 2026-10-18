# Serverni keyinroq o‘zingiz ulash (qadam-baqadam)

Bu papka saytga **yuklanmaydi** — u Cloudflare’da alohida ishlaydi (Netlify’ga sayt papkasini tashlaganda `worker/` ni olib tashlasangiz bo‘ladi).

**Server ulanmaguncha nima bo‘ladi?**
- Kompyuteringizda va “Saytda ko‘rish”da forma demo rejimda ishlaydi (so‘rov hech qayerga ketmaydi).
- **Internetdagi saytda** forma mijozga “So‘rovni yuborib bo‘lmadi, Telegram’da yozing” deb chiqadi (yolg‘on “qabul qilindi” demaydi). Shuning uchun saytni ommaga ochishdan oldin serverni ulang.
- Statistika yig‘ilmaydi.

Server nima qiladi: buyurtmalarni (rasmi bilan) Telegram’ga yuboradi, statistikani yig‘adi, spamdan himoya qiladi. Bot tokeni faqat shu yerda turadi, saytda emas.

---

## 1. Telegram bot (3 daqiqa)

1. Telegram’da [@BotFather](https://t.me/BotFather) → `/newbot` → nom va `bot` bilan tugaydigan username bering.
2. U bergan **tokenni** (`123456789:AA…`) “Saved Messages”ga saqlab qo‘ying. Hech kimga bermang.
3. O‘z botingizga kirib **/start** bosing (shart!).

## 2. Worker yaratish (5 daqiqa)

1. [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) — bepul hisob.
2. **Workers & Pages → Create → Create Worker → Deploy → Edit code**.
3. Ichidagi hamma kodni o‘chirib, `worker/worker.js` ichidagini joylang → **Deploy**.
4. Tepadagi manzilni (`https://….workers.dev`) nusxalang.

## 3. Ma’lumotlar bazasi (2 daqiqa)

1. **Storage & Databases → D1 SQL Database → Create** (nom: `topibber`).
2. Worker → **Settings → Bindings → Add → D1 database**: o‘zgaruvchi nomi aynan **`DB`**, database — yaratganingiz → Save.
3. Jadvallarni yaratish shart emas — server o‘zi yaratadi.

## 4. Maxfiy kalitlar (3 daqiqa)

Worker → **Settings → Variables and Secrets → Add** (turi **Secret**):

| Nomi | Qiymati |
|---|---|
| `BOT_TOKEN` | BotFather bergan token |
| `CHAT_ID` | Buyurtmalar keladigan chat raqami (pastga qarang) |
| `ADMIN_KEY` | O‘zingiz o‘ylab topgan uzun parol, kamida 20 belgi. Statistikani faqat shu ochadi |
| `ALLOWED_ORIGIN` | (ixtiyoriy, tavsiya) saytingiz manzili, masalan `https://topibber.uz` |

**CHAT_ID ni topish:** admin panel → **Ulanish** → “Chat ID ni topish” (tokenni vaqtincha kiritasiz, u saqlanmaydi). Chiqqan raqamni `CHAT_ID` ga yozing.

Kalit qo‘shgandan keyin Worker o‘zi qayta ishga tushadi (yoki **Deploy** bosing).

## 5. Admin panelda ulash (2 daqiqa)

1. `admin.html` → **Ulanish** → “Worker manzili” va “ADMIN_KEY” ni kiriting.
2. **Ulanishni tekshirish** — uchta ✓ chiqishi kerak.
3. **Sinov xabarini yuborish** — Telegram’ga xabar kelishi kerak.
4. **Nashr qilish** → `yangilanish.zip` ni yuklab, sayt papkasiga yoying, saytni qayta joylang. (Worker manzili saytga shu bilan yetib boradi.)
5. Saytdan o‘zingiz sinov so‘rovi yuboring — Telegram’ga kelsa, tayyor. Statistika bir necha daqiqadan keyin Statistika bo‘limida ko‘rinadi.

## Muammo bo‘lsa

| Belgi | Sabab |
|---|---|
| Tekshiruvda “D1 ✗” | `DB` binding nomi noto‘g‘ri yoki saqlanmagan |
| “BOT_TOKEN ✗” | Secret nomi xato yozilgan yoki Deploy qilinmagan |
| Telegram’ga xabar kelmayapti | Botga `/start` bosmagansiz yoki `CHAT_ID` xato |
| “Kalit noto‘g‘ri” | Admin paneldagi ADMIN_KEY Cloudflare’dagi bilan bir xil emas |
| Statistika bo‘sh | Yangi manzil hali saytga nashr qilinmagan |

## Maxfiylik

- Cookie ishlatilmaydi; IP, ism, telefon statistikaga yozilmaydi.
- Mamlakat va shaharni Cloudflare so‘rovdan o‘zi aniqlaydi.
- Odam bir kunda bitta anonim belgi bilan hisoblanadi; ertasi kuni belgi yangilanadi.
- Buyurtma cheklovi uchun IP faqat xeshlangan holda, 1 soatgacha saqlanadi.
- Statistika 120 kundan keyin avtomatik o‘chadi.
- Do Not Track yoqilgan brauzerlar hisobga olinmaydi.
