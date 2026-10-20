# Google Sheets ulash (3 daqiqa)

1. [sheets.new](https://sheets.new) — yangi jadval oching (nom: `TopibBer CRM`).
2. **Kengaytmalar → Apps Script** → ichidagi kodni o'chirib, `sheets/Code.gs` ni joylang.
   Tepadagi ikki qiymatni to'ldiring:
   - `SECRET` — uzun maxfiy so'z (Worker'dagi `SHEETS_SECRET` bilan bir xil);
   - `WORKER_URL` — Worker manzili.
3. Funksiyalar ro'yxatidan **`setup`** ni tanlab **Run** bosing (Google ruxsat so'raydi: *Advanced → Allow*).
   Dashboard, Lidlar, Tashriflar varaqlari rangli, filtrli, grafikli tayyor bo'ladi.
4. **Deploy → New deployment → Web app**: *Execute as: Me*, *Who has access: Anyone* → **Deploy** → berilgan `.../exec` manzilini Worker'dagi **`SHEETS_URL`** ga yozing.

Tayyor. Endi:
- **Tashriflar** — har bir tashrif: joylashuv, telefon modeli, tizim/brauzer, manba/UTM, saytda necha soniya, scroll %, qaysi bo'limlargacha yetdi, nimani bosdi, lid qoldirdimi. Yangilari tepada.
- **Lidlar** — har bir lid va uning holati. **Status** ustunini qo'lda o'zgartirsangiz (ro'yxatdan), Telegram va amoCRM ham yangilanadi.
- **Dashboard** — tashrif/lid/sotuv, konversiya, sotuvchilar va reklama manbalari bo'yicha natija, grafiklar.

Ustun tartibini `Code.gs` dagi `CFG` da o'zgartirish mumkin; ustun nomlarini Worker (`leadRow`, `visitRow`) bilan bir xil saqlang.
