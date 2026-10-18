# TopibBer — Xitoydan buyurtma xizmati

Pinduoduo’dan buyurtma berish xizmati uchun mustaqil sayt. Butun sayt — 3D osmon bo‘ylab parvoz: sahifani aylantirganda kamera bulutlar orasidan uchadi, bo‘limlar bulutdan chiqib kelgandek paydo bo‘ladi.

## Ishga tushirish va internetga joylash

- Kompyuterda ko‘rish: `index.html` ni ikki marta bosing.
- Internetga joylash (bepul): papkani [Netlify Drop](https://app.netlify.com/drop) ga sudrab tashlang (bepul hisob oching, aks holda sayt 1 soat turadi). `worker/` papkasi kerak emas — uni oldin olib tashlasangiz bo‘ladi.
- Manzil chiroyli bo‘lsin desangiz: Netlify → Site configuration → Change site name.

## Admin panel (`admin.html`)

Kod yozmasdan saytni boshqarasiz. Xavfsizlik uchun fayl nomini o‘zgartirib qo‘ying (masalan `boshqaruv-7x2k.html`).

| Bo‘lim | Nima qilasiz |
|---|---|
| **Statistika** | Nechta odam kirdi, qaysi davlat/shahardan, qaysi qurilmadan, qayerdan keldi, nimani bosdi, qaysi bo‘limgacha yetdi, nechta so‘rov yuborildi, nechta taqiqlangan urinish bo‘ldi |
| **Mahsulotlar** | Qo‘shish, tahrirlash, o‘chirish, tartibi, rasm yuklash, narx |
| **Matnlar** | Saytdagi deyarli har bir yozuvni o‘zgartirish (39 ta maydon) |
| **Rasmlar** | Logotip, galereya (yetkazilgan buyurtmalar suratlari) |
| **Shartlar / Taqiqlangan / Aloqa** | Tegishli matnlar, ro‘yxat va kalit so‘zlar |
| **Ulanish** | Buyurtmalar Telegram’ga kelishi va statistika uchun server (Cloudflare) ulash |
| **Nashr qilish** | Tekshiruv ro‘yxati + `yangilanish.zip` yuklab olish |

### O‘zgarishlarni saytga chiqarish
1. Admin panelda o‘zgartiring (qoralama shu brauzerda saqlanadi, “Saytda ko‘rish” bilan ko‘ring).
2. **Nashr qilish → yangilanish.zip** ni yuklab oling.
3. ZIP ichidagilarni sayt papkasiga yoying (mavjud fayllarni almashtiring) va papkani Netlify’ga qayta tashlang.

Rasmlar ZIP ichida alohida fayl bo‘lib chiqadi (`images/uploads/`), shuning uchun sayt tez ochiladi.

## Statistika va buyurtmalar uchun server

Bepul Cloudflare Worker kerak — to‘liq qadam-baqadam yo‘riqnoma `worker/README.md` da (admin panelning **Ulanish** bo‘limida ham). Taxminan 15 daqiqa.

Ulanmaguncha: kompyuterda va “Saytda ko‘rish”da forma demo rejimda (so‘rov hech qayerga ketmaydi). **Internetdagi saytda** esa forma mijozga “yuborib bo‘lmadi, Telegram’da yozing” deb chiqadi — shuning uchun saytni ommaga ochishdan oldin serverni ulang. Statistika ham faqat ulangandan keyin yig‘iladi.

Bot tokeni saytda saqlanmaydi — faqat serverda.

## Taqiqlangan mahsulotlar

Ro‘yxat `data.js` da (admin → Taqiqlangan). Mijoz formada shu turdagi so‘z yozsa, so‘rov qabul qilinmaydi va muloyim xabar chiqadi; formada “ro‘yxatda yo‘qligini tasdiqlayman” katagi ham bor. Admin panelda mahsulot nomini yozib sinab ko‘rish mumkin.

## Qurilmalar bilan moslik

- Telefon, planshet, kompyuter; Chrome, Safari, Firefox, Edge (so‘nggi ~5 yil).
- 3D ishlamaydigan yoki sekin qurilmada sayt o‘zi yengil rejimga o‘tadi (gradient osmon + oddiy sahifa), hamma funksiya saqlanadi. Majburan ko‘rish: manzil oxiriga `?lite`.
- JavaScript o‘chiq bo‘lsa, asosiy matn va forma ko‘rinadi, katalog va shartlar chiqmaydi (ogohlantirish ko‘rsatiladi).

## Fayllar

```
index.html          — sayt
admin.html          — admin panel (js/admin.js, css/admin.css)
css/style.css       — dizayn
js/data.js          — BARCHA ma’lumotlar (admin shuni yaratadi)
js/texts.js         — tahrirlanadigan matnlarning standart qiymatlari
js/app.js           — katalog, forma, taqiqlangan so‘zlar, effektlar
js/track.js         — statistika yig‘ish (cookie’siz)
js/world.js         — 3D osmon va parvoz
js/vendor/          — Three.js
worker/worker.js    — server (Cloudflare Worker) — saytga yuklanmaydi
images/uploads/     — admin yuklagan rasmlar (ZIP bilan keladi)
```
