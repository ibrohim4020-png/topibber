/* Tahrirlanadigan sayt matnlari (admin panel → Matnlar).
   k — kalit (index.html dagi data-t bilan bir xil), def — standart matn.
   em: true bo‘lsa, matndagi *so‘z* rangli kursiv qilib ko‘rsatiladi. */
window.TEXTS = [
  { g: "Bosh sahifa", k: "hero.eyebrow", label: "Kichik yozuv", def: "Pinduoduo’dan buyurtma xizmati" },
  { g: "Bosh sahifa", k: "hero.title", label: "Asosiy sarlavha", def: "Xitoydan yoqqan buyumingizni *buyurtma qiling*", em: true },
  { g: "Bosh sahifa", k: "hero.lead", label: "Qisqa tushuntirish", def: "Kerakli mahsulotni topib beramiz va siz uchun buyurtma qilamiz.", long: true },
  { g: "Bosh sahifa", k: "hero.cta", label: "Asosiy tugma", def: "Buyurtma berish" },
  { g: "Bosh sahifa", k: "hero.cta2", label: "Ikkinchi tugma", def: "Katalog" },
  { g: "Bosh sahifa", k: "hero.hint", label: "Pastdagi ko‘rsatma", def: "Aylantiring — uchib ketamiz" },

  { g: "Jarayon", k: "steps.kicker", label: "Kichik yozuv", def: "Qanday ishlaydi" },
  { g: "Jarayon", k: "steps.title", label: "Sarlavha", def: "Uch qadam — va buyurtma *yo‘lda*", em: true },

  { g: "Katalog", k: "catalog.kicker", label: "Kichik yozuv", def: "Katalog" },
  { g: "Katalog", k: "catalog.title", label: "Sarlavha", def: "Buyurtma qilsa *bo‘ladigan* mahsulotlar", em: true },
  { g: "Katalog", k: "catalog.sub", label: "Sarlavha ostidagi gap", def: "Kerakli narsa yo‘qmi?" },
  { g: "Katalog", k: "catalog.sublink", label: "Gap oxiridagi havola", def: "Havolasini yuboring →" },
  { g: "Katalog", k: "own.kicker", label: "“Havola yuboring” bloki: kichik yozuv", def: "O‘zingiz topdingizmi?" },
  { g: "Katalog", k: "own.title", label: "“Havola yuboring” bloki: sarlavha", def: "Havolani yuboring — *narxini aytamiz*", em: true },
  { g: "Katalog", k: "own.text", label: "“Havola yuboring” bloki: matn", def: "Pinduoduo’da yoqqan mahsulot havolasini yoki skrinshotini yuboring. Narx va muddatni hisoblab, sizga xabar beramiz.", long: true },
  { g: "Katalog", k: "own.cta", label: "“Havola yuboring” bloki: tugma", def: "Havola yuborish" },

  { g: "Galereya", k: "gallery.kicker", label: "Kichik yozuv", def: "Yetkazilgan buyurtmalar" },
  { g: "Galereya", k: "gallery.title", label: "Sarlavha", def: "Haqiqiy *natijalar*", em: true },

  { g: "Narx va shartlar", k: "terms.kicker", label: "Kichik yozuv", def: "Narx va shartlar" },
  { g: "Narx va shartlar", k: "terms.title", label: "Sarlavha", def: "Hammasi *oldindan* aniq", em: true },

  { g: "Taqiqlangan mahsulotlar", k: "prohibited.kicker", label: "Kichik yozuv", def: "Taqiqlangan mahsulotlar" },
  { g: "Taqiqlangan mahsulotlar", k: "prohibited.title", label: "Sarlavha", def: "Bularni *olib bera olmaymiz*", em: true },
  { g: "Taqiqlangan mahsulotlar", k: "prohibited.text", label: "Tushuntirish", def: "Quyidagi mahsulotlarni buyurtma qilib bo‘lmaydi. Bunday so‘rovlarni qabul qila olmaymiz.", long: true },
  { g: "Taqiqlangan mahsulotlar", k: "prohibited.note", label: "Ro‘yxat ostidagi eslatma", def: "Ro‘yxat to‘liq bo‘lmasligi mumkin. Mahsulot ruxsat etilganiga ishonchingiz komil bo‘lmasa, buyurtmadan oldin bizdan so‘rang.", long: true },

  { g: "Buyurtma formasi", k: "order.kicker", label: "Kichik yozuv", def: "Buyurtma" },
  { g: "Buyurtma formasi", k: "order.title", label: "Sarlavha", def: "So‘rov *qoldiring*", em: true },
  { g: "Buyurtma formasi", k: "order.text", label: "Tushuntirish", def: "Bu majburiyat emas. Narx va muddatni aytamiz — keyin o‘zingiz qaror qilasiz.", long: true },
  { g: "Buyurtma formasi", k: "order.p1", label: "1-ustun", def: "Yakuniy summa oldindan aytiladi" },
  { g: "Buyurtma formasi", k: "order.p2", label: "2-ustun", def: "Muddat mahsulotga qarab aniqlanadi" },
  { g: "Buyurtma formasi", k: "order.p3", label: "3-ustun", def: "Savollar bo‘lsa — Telegram’da yozing" },
  { g: "Buyurtma formasi", k: "order.confirm", label: "Tasdiqlash katagi", def: "Mahsulot taqiqlangan ro‘yxatda yo‘qligini tasdiqlayman", long: true },
  { g: "Buyurtma formasi", k: "order.submit", label: "Yuborish tugmasi", def: "So‘rov yuborish" },
  { g: "Buyurtma formasi", k: "order.fine", label: "Tugma ostidagi yozuv", def: "Yuborish orqali siz bilan telefon yoki Telegram orqali bog‘lanishimizga rozilik bildirasiz.", long: true },
  { g: "Buyurtma formasi", k: "modal.title", label: "Tasdiq oynasi: sarlavha", def: "So‘rovingiz qabul qilindi" },
  { g: "Buyurtma formasi", k: "modal.text", label: "Tasdiq oynasi: matn", def: "So‘rovingiz qabul qilindi. Narx va muddatni aniqlashtirish uchun siz bilan bog‘lanamiz.", long: true },

  { g: "Aloqa va pastki qism", k: "contacts.kicker", label: "Kichik yozuv", def: "Aloqa" },
  { g: "Aloqa va pastki qism", k: "contacts.title", label: "Sarlavha", def: "Savolingiz bormi? *Yozing.*", em: true },
  { g: "Aloqa va pastki qism", k: "footer.line1", label: "Pastki qism: 1-qator", def: "mustaqil buyurtma xizmati.", long: true },
  { g: "Aloqa va pastki qism", k: "footer.line2", label: "Pastki qism: ogohlantirish", def: "Ushbu sayt Pinduoduo’ning rasmiy sayti emas va u bilan bog‘liq emas. Biz mijozlar nomidan buyurtma beramiz.", long: true },
];
