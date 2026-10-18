/* =====================================================================
   SAYT MA’LUMOTLARI — admin panel (admin.html) shu faylni yaratadi.
   Qo‘lda ham tahrirlash mumkin. O‘zgartirgandan keyin sahifani yangilang (F5).
   ===================================================================== */

window.SITE = {

  brand: {
    name: "TopibBer",
    tagline: "Xitoydan topib beramiz",
  },

  /* Rasmlar (admin panel → Rasmlar). Bo‘sh qoldirilsa, standart belgi ishlatiladi. */
  images: {
    logo: "",
  },

  /* Aloqa — vaqtinchalik qiymatlar. Admin paneldan o‘zingiznikiga almashtiring. */
  contacts: {
    phone: "+998 90 3239770",
    phoneLink: "tel:+998903239770",
    telegram: "@maftuna_mannobova",
    telegramLink: "https://t.me/maftuna_mannobova",
    instagram: "@byafmantun",
    instagramLink: "https://instagram.com/byafmantun",
    workHours: "Har kuni 9:00 – 21:00",
  },

  categories: [
    { id: "kiyim",     name: "Kiyim va poyabzal" },
    { id: "uy",        name: "Uy-ro‘zg‘or" },
    { id: "bolalar",   name: "Bolalar uchun" },
    { id: "aksessuar", name: "Aksessuarlar" },
    { id: "sport",     name: "Sport va dam olish" },
  ],

  /* Namunaviy mahsulotlar. Ichida batareya, suyuqlik, magnit bo‘lgan
     mahsulotlar taqiqlangan ro‘yxatga ko‘ra ataylab qo‘shilmagan. */
  products: [
    { id: "p1", category: "kiyim",     name: "Krossovka",              description: "Yengil, kundalik kiyish uchun.",     price: null, image: "", emoji: "👟" },
    { id: "p2", category: "kiyim",     name: "Oversize xudi",          description: "Bir nechta rang va o‘lchamda.",      price: null, image: "", emoji: "🧥" },
    { id: "p3", category: "uy",        name: "Saqlash idishlari",      description: "Bo‘sh idishlar to‘plami, turli o‘lchamda.", price: null, image: "", emoji: "🧺" },
    { id: "p4", category: "uy",        name: "Paxtali ko‘rpa",         description: "Yumshoq, yil bo‘yi ishlatiladi.",    price: null, image: "", emoji: "🛏️" },
    { id: "p5", category: "bolalar",   name: "Konstruktor to‘plami",   description: "Rivojlantiruvchi plastik o‘yinchoq.", price: null, image: "", emoji: "🧩" },
    { id: "p6", category: "bolalar",   name: "Bolalar kiyimi to‘plami", description: "Bir nechta buyum, yoshiga qarab.",  price: null, image: "", emoji: "🧸" },
    { id: "p7", category: "aksessuar", name: "Ryukzak",                description: "Noutbuk uchun bo‘limi bor.",         price: null, image: "", emoji: "🎒" },
    { id: "p8", category: "aksessuar", name: "Sumka",                  description: "Kundalik foydalanish uchun.",        price: null, image: "", emoji: "👜" },
    { id: "p9", category: "sport",     name: "Yoga gilamchasi",        description: "Sirpanmaydigan, yengil.",            price: null, image: "", emoji: "🧘" },
  ],

  /* Galereya — yetkazilgan buyurtmalar suratlari. Faqat o‘zingizning
     haqiqiy suratlaringizni qo‘ying. Bo‘sh bo‘lsa, bo‘lim saytda ko‘rinmaydi. */
  gallery: [],

  steps: [
    { title: "Mahsulotni tanlang",          text: "Katalogdan tanlang yoki o‘zingiz topgan mahsulot havolasini yuboring." },
    { title: "So‘rov yuboring",             text: "Ismingiz, telefoningiz va miqdorni yozib, so‘rov qoldiring." },
    { title: "Narx va muddatni kelishamiz", text: "Yakuniy summa va muddatni sizga aytamiz. Rozi bo‘lsangiz, buyurtma beramiz." },
  ],

  pricing: [
    { title: "Narx mahsulotga qarab", text: "Buyurtma narxi mahsulot, uning hajmi va og‘irligiga qarab aniqlanadi." },
    { title: "Muddat ham alohida",    text: "Yetkazib berish muddati har bir mahsulot uchun alohida aniqlanadi." },
    { title: "Avval — yakuniy summa", text: "Buyurtmani tasdiqlashdan oldin yakuniy summani sizga ma’lum qilamiz." },
  ],

  /* Shartlar. “[” bilan boshlanadigan qatorlar — to‘ldirilmagan joy:
     ular mijozga ko‘rsatilmaydi, admin panel esa eslatib turadi. */
  terms: [
    {
      id: "tolov", title: "To‘lov shartlari",
      paragraphs: [
        "To‘lov tartibi narx kelishilgandan so‘ng aniqlashtiriladi.",
        "[Bu yerga to‘lov usullari va bosqichlarini yozing.]",
      ],
    },
    {
      id: "yetkazish", title: "Yetkazib berish shartlari",
      paragraphs: [
        "Yetkazib berish muddati va narxi mahsulotga qarab alohida aytiladi.",
        "[Bu yerga yetkazib berish usullari va hududlarni yozing.]",
      ],
    },
    {
      id: "qaytarish", title: "Qaytarish shartlari",
      paragraphs: [
        "[Bu yerga qaytarish va almashtirish shartlarini yozing.]",
      ],
    },
  ],

  /* Server (Cloudflare Worker) manzili. Bo‘sh bo‘lsa:
     — forma demo rejimda (so‘rovlar hech qayerga yuborilmaydi),
     — statistika yig‘ilmaydi.
     Ulash tartibi: admin panel → Ulanish. */
  api: {
    endpoint: "",
  },

  /* Taqiqlangan mahsulotlar.
     list     — saytda ko‘rinadigan ro‘yxat (har bir qator — bitta band).
     keywords — mijoz formada shu so‘zlardan birini yozsa, so‘rov qabul
                qilinmaydi (kichik harflarda; o‘zbek, rus, ingliz yozilishlari). */
  prohibited: {
    list: [
      "Ichida suyuqligi bor narsalar",
      "Batareyka va elektron mahsulot",
      "Ichida magniti bor barcha narsalar",
      "Kukunli buyumlar",
      "Barcha parfyumeriya va kosmetika mahsulotlari",
      "Oziq-ovqatlar",
      "Dori-darmon",
      "Tilla va kumush",
      "Pichoq",
      "Miltiq",
      "Diniy buyumlar",
    ],
    keywords: [
      "suyuqlik", "suyuq", "жидкост", "liquid",
      "batareya", "batareyka", "батарейк", "батаре", "battery", "akkumulyator", "аккумулятор",
      "magnit", "магнит", "magnet",
      "kukun", "порошок", "powder",
      "parfyum", "parfum", "atir", "духи", "парфюм", "perfume",
      "kosmetika", "kosmetik", "косметик", "cosmetic", "makeup",
      "oziq", "ovqat", "еда", "продукт", "food",
      "dori", "лекарств", "таблетк", "medicine",
      "tilla", "oltin", "золот", "gold", "kumush", "серебр", "silver",
      "pichoq", "нож", "knife",
      "miltiq", "ружь", "оружи", "gun", "weapon",
      "diniy", "религиоз", "religious",
    ],
  },

  /* Sayt matnlari — admin panel → Matnlar. Bo‘sh bo‘lsa, standart matn. */
  text: {},
};
