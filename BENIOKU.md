# KATILIM — Canlı Görüş ve Oylama Platformu
**Kocaeli 2053 Vizyon Projesi · Lansman, Makroform ve Ekoloji Çalıştayları için**

Katılımcılar ekrandaki QR kodu telefonla okutur, ad-soyad ve kurum bilgisini girer, sunucu soruları açtıkça yanıtlar. Yanıtlar salondaki yansıtma ekranında **canlı** grafiklere dönüşür.

| Ekran | Adres | Kim kullanır |
|---|---|---|
| Yönetim paneli | `/yonetim` | Organizasyon ekibi (şifreli) |
| Yansıtma ekranı | `/ekran/LANSMAN` | Projeksiyona bağlı bilgisayar |
| Katılımcı sayfası | `/k/LANSMAN` (QR'ın açtığı adres) | Salondaki herkes |
| Kodla giriş | `/` | QR okutamayanlar kodu elle yazar |

**Soru tipleri:** tek seçim (çubuk veya halka grafik) · çoklu seçim (en fazla N seçenek) · açık uçlu (kelime bulutu, görüş kartları ya da **canlı sıralama yarışı**) · ölçek (1–5, 1–10; ortalama ile). Açık uçlu sorularda "yanıt kutusu sayısı" verilirse telefonda o kadar ayrı kutu çıkar (ör. 5 anahtar kelime).

**Canlı sıralama yarışı:** Kutu sırası öncelik puanıdır (5 kutuda 1. = 5 puan … 5. = 1 puan). Aynı ifade büyük/küçük harf ve noktalama farkı gözetmeden birleştirilir; maddeler puana göre yer değiştirerek yarışır, ilk üç altın-gümüş-bronz rozet alır.

---

## 1. Kurulum (5 dakika)

Kurulum gerekmez; Node.js paketin içinde (`node/node.exe`) gelir, yönetici yetkisi istemez.

1. Zip dosyasına sağ tıklayın → **Tümünü ayıkla** (zip'in içinden doğrudan çalıştırmayın).
2. Çıkan klasörde `Baslat.bat` dosyasına çift tıklayın. Siyah pencere açık kaldığı sürece uygulama çalışır.
3. Tarayıcıda `http://localhost:3000/yonetim` kendiliğinden açılır. Varsayılan şifre: `kocaeli2053`

Windows "Güvenlik Duvarı" izni sorarsa, internet tüneliyle çalışıyorsanız **İptal** diyebilirsiniz (yalnızca B yolunda "İzin ver" gerekir). Bilgisayarda Node.js zaten kuruluysa `node server.js` komutu da çalışır.

> ⚠ Şifreyi `Baslat.bat` içindeki `ADMIN_PASSWORD` satırından mutlaka değiştirin.

İlk açılışta üç etkinlik hazır gelir: **LANSMAN** (5 soru, Aktif), **MAKROFORM** ve **EKOLOJI** (taslak örnek sorular). Veriler `data/veri.json` dosyasında tutulur; bu dosyayı yedekleyin.

## 2. Telefonların erişebilmesi (en önemli adım)

`localhost` yalnızca sizin bilgisayarınızda geçerlidir; telefonlar uygulamaya **internet üzerinden** ulaşmalıdır.

### Önerilen: Tailscale Funnel — `Baslat-Tailscale.bat`
Uyarı sayfası yok, 60 dakika sınırı yok, adres **sabit**: `https://kocaeli-katilim.<tailnet-adınız>.ts.net`. Bu yüzden QR kod davet yazısına ve masa kartlarına basılabilir. Bağlantı standart 443 portundan kurulur.

İlk kullanımda (bir kez, ~5 dakika):
1. `Baslat-Tailscale.bat` dosyasına çift tıklayın, yönetici izni penceresinde **Evet** deyin.
2. Tailscale kurulu değilse dosya kendisi kurar (önce winget, olmazsa Tailscale'in resmi sitesinden).
3. Pencerede çıkan bağlantıyı açıp Tailscale hesabına giriş yapın (Google, Microsoft veya GitHub hesabıyla; hesap ücretsizdir).
4. İlk Funnel açılışında bir onay bağlantısı daha çıkarsa açıp **Enable** deyin.
5. Pencerede `✔ İNTERNET ADRESİ HAZIR (Tailscale)` satırı görünür. Adres ilk kez kullanılıyorsa genel DNS kaydının yayılması 10 dakikayı bulabilir; toplantı öncesi bir kez deneyin.

**QR okutunca açılmıyorsa:** `Tailscale-Tani.bat` dosyasını çalıştırın. Araç (1) adresin internet DNS'inde görünüp görünmediğini, (2) adresin internetten (Tailscale dışından) açılıp açılmadığını sınar ve sorunun nedenini yazar. Tailscale 1.102.x sürümünde Windows'ta Funnel'ın internetten erişimini bozan bilinen bir hata vardır; araç bunu tespit ederse `araclar\tailscale-surum-dusur.bat` ile 1.98.10 sürümüne dönülür.

Sonraki kullanımlarda dosyaya çift tıklamak yeterlidir; adres aynı kalır. Adresin ilk kısmı dosyadaki `TS_MAKINE_ADI` satırından değiştirilebilir.

Notlar: Tailscale'in ücretsiz Personal planı ticari olmayan kullanım içindir. Funnel trafiği Tailscale'in yayımlamadığı bant genişliği sınırlarına tabidir (bu uygulamanın trafiği çok düşüktür). Kurum ağında program kurulumu ya da Tailscale bağlantısı engelli olabilir; bu durumda başka bir bilgisayar ya da ağ kullanın.

### Alternatif: `Baslat.bat` ile otomatik tünel (kurulum gerektirmez)
> **Kurum ağında:** Cloudflare'in kullandığı 7844 portu KBB ağında kapalı olduğu için `Baslat.bat` varsayılan olarak **Pinggy** kullanır (`TUNEL_SAGLAYICI=pinggy`). Pinggy, Windows'un kendi SSH istemcisiyle standart 443 portundan bağlanır. Ücretsiz sürümde tünel **60 dakikada bir yenilenir**: QR kod kendiliğinden değişir, bağlantısı kopan katılımcılar QR'ı yeniden okutur. Yönetim panelindeki şerit kalan süreyi gösterir. Ücretsiz tünelde telefonda bir kez "Enter site" uyarı sayfası çıkar; lobi ekranı katılımcılara bunu hatırlatır. Uyarıyı ve 60 dakika sınırını kaldırmak için Pinggy Pro anahtarı `Baslat.bat` içindeki `PINGGY_TOKEN=` satırına yazılır. Bu sınır nedeniyle soru oturumunu 60 dakikayı aşmayacak biçimde planlayın ya da tüneli oturumdan hemen önce başlatın.

`Baslat.bat` uygulamayı açarken pakette gelen **Cloudflare tünelini** (`cloudflared/cloudflared.exe`) da başlatır:

1. Siyah pencerede birkaç saniye sonra `✔ İNTERNET ADRESİ HAZIR: https://….trycloudflare.com` satırı çıkar.
2. Yönetim panelinin üstündeki şerit yeşile döner. Yansıtma ekranındaki QR kod **kendiliğinden** bu adrese geçer.
3. Telefonlar Wi-Fi'da ya da mobil veride olabilir; ikisi de çalışır.

Dikkat edilecekler:
- **Adres her başlatmada değişir.** Bu yüzden QR kodu davet yazısına basmayın; QR'ı toplantıda ekrandan okutun.
- **Bilgisayar uyku moduna girmemeli**, siyah pencere kapanmamalı.
- **Tünel 45 saniye içinde açılmazsa** kurum ağı Cloudflare bağlantısını engelliyor olabilir. Bilgisayarı telefonunuzun mobil erişim noktasına (hotspot) bağlayıp yeniden başlatın.
- **Cloudflare bu ücretsiz tüneli "deneme ve geliştirme" amaçlı sunar; kesintisizlik garantisi yoktur.** Tünel canlı yayın tekniğini (SSE) desteklemediği için uygulama bu durumda telefonlarda kendiliğinden 2–3 saniyelik yoklamaya geçer; kullanıcı bir fark görmez.
- **Kurumsal ve kalıcı kullanım için** aşağıdaki A yolu önerilir.

### A) Kalıcı çözüm — KBB Bilgi İşlem sunucusu
Bilgi İşlem'den uygulamayı kurum sunucusunda çalıştırmasını ve bir alt alan adı (ör. `katilim.kocaeli.bel.tr`) ile HTTPS üzerinden yayınlamasını isteyin. Adres sabit kalır, QR davet yazısına basılabilir, veriler kurum içinde kalır. Bu durumda `Baslat.bat` içinde `TUNEL=0` ve `PUBLIC_URL=https://katilim.kocaeli.bel.tr` yapılır. Nginx kullanılıyorsa:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_buffering off;          # canlı güncelleme (SSE) için
    proxy_read_timeout 1h;
}
```

### B) Aynı Wi-Fi ağı
Telefonlar ve bilgisayar aynı Wi-Fi ağındaysa, siyah pencerede yazan `Aynı Wi-Fi ağı için → http://192.168.x.x:3000` adresi de kullanılabilir. Bu adres yönetim panelinde **Adresi elle gir** düğmesiyle tanımlanır. Kurum Wi-Fi'larında cihazlar arası erişim çoğu zaman kapalıdır; ayrıca Windows Güvenlik Duvarı sorusuna "İzin ver" denmelidir.

### C) Render.com — internetten, bilgisayardan bağımsız (önerilen)
Sabit adres (`https://kocaeli-katilim.onrender.com` gibi), uyarı sayfası yok, bilgisayar açık olmak zorunda değil. Kurulum için `kocaeli-katilim-web.zip` paketi ve oradaki adımlar kullanılır (GitHub'a yükle → Render'da Blueprint ile yayınla).

Ücretsiz planın iki kısıtı ve uygulamanın bunlara karşı korumaları:
- **15 dk trafik yoksa uyur, uyanınca yerel veri silinir.** Yönetim paneli açık olan her tarayıcı 4 dakikada bir sunucuya dokunur; panel bir sekmede açık kaldıkça servis uyumaz. Ayrıca panel verinin son hâlini 20 saniyede bir o tarayıcıda saklar; sunucu yeniden başlayıp veri silinmişse panel açılınca **"Yedeği geri yükle"** şeridi çıkar, tek tıkla her şey geri gelir.
- **Uyandıktan sonra ilk açılış ~1 dakika sürer.** Toplantıdan 5 dakika önce yönetim panelini açın.
- Lansman soruları programın içinde tanımlı olduğu için sunucu sıfırlansa da sorular kendiliğinden yerinde olur.
- Kesin güvence için Render'da ücretli "Starter" plana (aylık 7 $'dan) ve kalıcı diske geçilebilir; o durumda uyku ve veri kaybı olmaz.

## 3. Toplantı günü akışı

**Bir gün önce**
- [ ] Ekiple 3–4 telefonla **prova** yapın, sonra *Katılımcılar ve Veri → Sıfırla* ile prova verisini silin.
- [ ] Etkinlik durumunu **Aktif** yapın.
- [ ] Salon Wi-Fi'ını kontrol edin; mobil veri de yeterlidir.
- [ ] İsterseniz *Etkinlik Ayarları → QR kodu indir* ile QR'ı davet yazısına ya da masa kartlarına ekleyin.

**Toplantıda**
1. Projeksiyon bilgisayarında **Yansıtma ekranını aç** → `F` ile tam ekran. Önce **Lobi** görünür (büyük QR + katılımcı sayacı).
2. Yönetim panelini kendi bilgisayarınızda/tabletinizde açık tutun.
3. **Sonraki soru ▶** düğmesi, sıradaki soruyu yanıta açar ve ekrana yansıtır. Önceki soru kendiliğinden kapanır.
4. Etkiyi önlemek isterseniz **🙈 Sonucu gizle** deyin: ekranda yalnızca yanıt sayısı görünür, sonra açarsınız.
5. Açık uçlu yanıtlarda uygunsuz bir ifade olursa önizleme panelindeki **Gizle** ile ekrandan kaldırın (veri silinmez, CSV'de işaretli kalır).
6. Ekranda QR'ı yeniden göstermek için **Lobi / QR ekranı** düğmesi ya da yansıtma ekranında `Q` tuşu.

**Sonra**
- *Katılımcılar ve Veri → Yanıtları Excel (CSV) olarak indir* ile tüm yanıtları alın (kişi, kurum, soru, yanıt, saat).
- Etkinliği **Kapalı** yapın.

**Tüm soruları yansıt:** Yönetim panelindeki **▦ Tüm soruları yansıt** düğmesi bütün soruların sonuçlarını tek ekranda, canlı olarak gösterir; tek soruya dönmek için ilgili sorudaki **⧉ Yalnız yansıt** ya da **Sonraki soru** düğmesini kullanın.

**Anket kipi:** Soruların sunumla eşzamanlı değil, katılımcının kendi hızında yanıtlanmasını istiyorsanız **Tümünü aç** deyin.

## 4. Çalıştay serisi için

Ekoloji çalıştayları gibi aynı soruların tekrarlanacağı etkinliklerde: *Etkinlik Ayarları → Bu etkinliği sorularıyla kopyala*. Kopya, yanıtsız ve Taslak durumda oluşur; kodunu (ör. `EKOLOJI2`) ve tarihini değiştirmeniz yeterli.

## 5. Ayarlar ve güvenlik

- **İstenen bilgiler:** Ad Soyad / Kurum / Birim / Unvan alanlarının her biri *Zorunlu*, *İsteğe bağlı* veya *Sorulmasın* yapılabilir. Dördü de kapalıysa oylama anonimdir.
- **Ekranda isim:** Açık uçlu yanıtların ekranda isim ve kurumla görünmesi varsayılan olarak **kapalıdır**.
- **KVKK:** Hazır gelen aydınlatma metni **taslaktır**. Kullanmadan önce KBB KVKK birimi / Hukuk Müşavirliği onayından geçirin. Katılımcı onay kutusunu işaretlemeden kayıt olamaz.
- **Tekrar oy:** Her telefon tarayıcıda bir katılımcı kimliği alır; bir soruya bir kez yanıt verilir, yanıt soru açıkken değiştirilebilir. (Kişi tarayıcıyı temizleyip yeniden kayıt olabilir; bu, isimli katılımda CSV'den fark edilir.)
- Ayarlar: `PORT`, `ADMIN_PASSWORD`, `PUBLIC_URL`, `DATA_FILE` ortam değişkenleri.

## 6. Kısayollar (yansıtma ekranı)

`F` tam ekran · `Q` QR katmanı · `T` tema: varsayılan "Kocaeli 2053 Vizyon" koyu teması (lacivert zemin, akan altın çerçeve) ile açık tema arasında geçiş · fareyi oynatınca sağ altta düğmeler belirir.

## 7. Teknik not

Node.js (bağımlılıksız) · canlı güncelleme Server-Sent Events ile; akışın geçmediği ağlarda otomatik kısa aralıklı yoklama · veri tek bir JSON dosyasında · QR kod tarayıcıda üretilir (qrcode-generator, MIT). 29 katılımcı ile uçtan uca test edildi; mimari birkaç yüz eşzamanlı katılımcıyı kaldıracak şekilde tasarlandı, büyük etkinlikten önce yük denemesi önerilir.
