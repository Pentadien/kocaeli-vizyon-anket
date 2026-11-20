/*
 * İlk çalıştırmada oluşturulan etkinlikler ve sorular.
 * data/veri.json dosyası oluştuktan sonra bu dosya bir daha okunmaz;
 * değişiklikler yönetim panelinden yapılır.
 */
'use strict';

const KVKK = `KİŞİSEL VERİLERİN İŞLENMESİNE İLİŞKİN AYDINLATMA METNİ (TASLAK)

Veri Sorumlusu: Kocaeli Büyükşehir Belediyesi

Bu katılım platformu aracılığıyla paylaştığınız ad-soyad, kurum, birim ve unvan bilgileriniz ile sorulara verdiğiniz yanıtlar; 6698 sayılı Kişisel Verilerin Korunması Kanunu'nun 10. maddesi kapsamında bilgilendirilmeniz amacıyla hazırlanan bu metin çerçevesinde, yalnızca etkinliğin yürütülmesi, katılımcı görüşlerinin derlenmesi ve Kocaeli 2053 Vizyon Projesi kapsamındaki planlama çalışmalarına girdi oluşturulması amacıyla işlenecektir.

Yanıtlarınız toplantı salonunda yansıtılan ekranda toplu (istatistiksel) olarak gösterilir. Açık uçlu yanıtlar, etkinlik ayarına bağlı olarak isim belirtilmeden ya da ad-soyad ve kurum bilgisiyle birlikte ekrana yansıtılabilir.

Verileriniz Belediye sunucularında saklanır; kanunen yetkili kamu kurumları dışında üçüncü kişilerle paylaşılmaz, yurt dışına aktarılmaz. Kanun kapsamındaki haklarınıza ilişkin başvurularınızı Kocaeli Büyükşehir Belediyesi'ne iletebilirsiniz.

[Bu metin taslaktır; kullanılmadan önce KBB KVKK birimi / Hukuk Müşavirliği tarafından gözden geçirilmelidir.]`;

const KURUMLAR = [
  'Kocaeli Büyükşehir Belediyesi',
  'İSU Genel Müdürlüğü',
  'Kent Konut',
  'İlçe Belediyesi',
  'Kocaeli Valiliği / İl Müdürlüğü',
  'Kocaeli Üniversitesi',
  'Gebze Teknik Üniversitesi',
  'Pamukkale Üniversitesi',
  'Meslek Odası',
  'Sivil Toplum Kuruluşu',
  'Özel Sektör',
  'Diğer',
];

function seed(uid) {
  const base = (o) => ({
    id: uid(10), status: 'taslak', subtitle: '', date: '',
    fields: { ad: 'zorunlu', kurum: 'zorunlu', birim: 'istege', unvan: 'istege' },
    kvkk: { metin: KVKK }, kurumOnerileri: KURUMLAR, showNamesOnScreen: false,
    currentQuestionId: null, screen: 'lobi', participants: {}, answers: {}, created: Date.now(),
    ...o,
  });
  const q = (o) => ({ id: uid(8), state: 'beklemede', showResults: true, note: '', display: '', ...o });

  return [
    base({
      code: 'LANSMAN',
      title: 'Kocaeli 2053 Vizyon Projesi',
      subtitle: 'Kurum İçi Lansman Toplantısı',
      date: '2026-11-24',
      status: 'aktif',
      // Kayıt ekranı yok: QR okutan kişi doğrudan sorulara bağlanır; kişisel veri alınmaz
      fields: { ad: 'kapali', kurum: 'kapali', birim: 'kapali', unvan: 'kapali' },
      kvkk: { metin: '' },
      tema: 'mavi',
      questions: [
        q({
          type: 'acik', display: 'bulut', kelimeSayisi: 3, maxLength: 40, ton: 'olumlu',
          text: "2053 yılında yaşamak istediğiniz Kocaeli'yi tanımlayan 3 anahtar kelime yazınız.",
          note: 'Her kutuya bir kelime ya da kısa bir ifade yazınız.',
        }),
        q({
          type: 'acik', display: 'bulut', kelimeSayisi: 3, maxLength: 40, ton: 'olumsuz',
          text: "Kocaeli'de eksikliğini hissettiğiniz ilk 3 şey nedir?",
          note: 'Her kutuya bir kelime ya da kısa bir ifade yazınız.',
        }),
      ],
    }),
    base({
      code: 'MAKROFORM',
      title: 'Makroform Çalıştayı',
      subtitle: 'Kocaeli 2053 Vizyon Projesi',
      date: '2026-11',
      questions: [
        q({
          type: 'tek', text: 'Kocaeli için tercih ettiğiniz gelişme (makroform) modeli hangisidir?',
          note: 'Taslak soru — danışman ekibin sorularıyla güncellenecektir.',
          options: ['Doğrusal / koridor boyunca gelişme', 'Çok merkezli (polisentrik) yapı', 'Kompakt merkezlerde yoğunlaşma', 'Mevcut eğilimlerin sürdürülmesi'],
        }),
        q({
          type: 'acik', display: 'kartlar',
          text: 'Kentsel gelişmenin hangi yönde kesinlikle durdurulması gerektiğini düşünüyorsunuz? Gerekçesiyle yazınız.',
        }),
      ],
    }),
    base({
      code: 'EKOLOJI',
      title: 'Ekoloji Çalıştayı',
      subtitle: 'Kocaeli 2053 Vizyon Projesi',
      questions: [
        q({
          type: 'coklu', maxSelect: 3, text: "Kocaeli'de öncelikle korunması gereken üç ekolojik değer hangisidir?",
          note: 'Taslak soru — danışman ekibin sorularıyla güncellenecektir.',
          options: ['Samanlı Dağları orman alanları', 'İzmit Körfezi ve kıyı ekosistemi', 'Sapanca Gölü havzası', 'Karadeniz kıyıları ve kumullar', 'Dere yatakları ve sulak alanlar', 'Tarım toprakları', 'Kentsel yeşil alanlar'],
        }),
        q({
          type: 'olcek', scaleMin: 1, scaleMax: 5, minLabel: 'Hiç hazır değil', maxLabel: 'Tamamen hazır',
          text: "Kocaeli'nin iklim değişikliği etkilerine hazırlık düzeyini nasıl değerlendiriyorsunuz?",
        }),
      ],
    }),
  ];
}

module.exports = seed;
module.exports.KVKK = KVKK;
module.exports.KURUMLAR = KURUMLAR;
