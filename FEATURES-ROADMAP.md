# hafriyatcim.com — Özellik Yol Haritası & Pazar Analizi

> Hazırlanış tarihi: Haziran 2026 | Proje sürümü: v2.0 (production öncesi)

---

## 1. Türk Hafriyat Sektörü Gerçekleri

### Pazar Büyüklüğü
- Türkiye'de yıllık inşaat sektörü hacmi yaklaşık **180-220 milyar TL** (2024 fiyatlarıyla). Hafriyat ve nakliye bu pastadan **%8-12** pay alır — yani yaklaşık **15-25 milyar TL/yıl** hafriyat taşıma maliyeti. Buna moloz, toprak, kum-çakıl, asfalt döküm işleri dahil.
- İstanbul tek başına Türkiye hafriyat hacminin **%35-40**'ını oluşturur. Ankara %12, İzmir %8, Bursa %5.

### Dijital Penetrasyon — Gerçek Tablo
- Sektörde iş bulma hâlâ **%85 oranında telefon/WhatsApp/tanıdık referansıyla** gerçekleşiyor. "Tır durağında bekle, müşteri seni bulsun" mantığı hâkim.
- Online iş bulan tır sahiplerinin oranı tahminen **%10-15** — ve bunların büyük çoğunluğu da forklift/nakliye uygulamaları veya ilanveren/sahibinden gibi genel platformlar üzerinden.
- Hafriyata özel dijital pazar yeri Türkiye'de **fiilen yok** (aşağıdaki rakipler bölümüne bak).

### Hedef Kullanıcı Profili

**Müşteri tarafı (inşaat sahipleri / şantiye şefleri):**
- Yaş: 35-55
- Eğitim: Ortaokul-lise ağırlıklı, yükseköğretim azınlık
- Telefon kullanımı: Akıllı telefon var, WhatsApp günlük kullanıcısı. Ama uygulama indirme konusunda isteksiz.
- Dijital alışkanlık: Bankamatik, fatura ödeme, WhatsApp — ötesi sınırlı. Online alışveriş az.
- Karar alma: Fiyat önce, güven ikinci. Tanıdık referansı çok önemli.
- Ağrı noktası: Sabahın 7'sinde araç bul, öğleden önce şantiyeye getir. Telefon çevirmekten bıktı.

**Sürücü tarafı (tır ve kamyon sahipleri):**
- Yaş: 30-55
- Eğitim: İlkokul-ortaokul ağırlıklı
- Telefon kullanımı: Temel WhatsApp, arama, çok az ötesi. Uygulamadan uzak duran kitle.
- Dijital alışkanlık: Dijital bankacılık yok, esnaf vergi konusunda muğlak. Nakit tercih eder.
- Ağrı noktası: Boşa dönüyor, yakıt parasını çıkaramıyor. İstanbul'dan Ankara'ya mal götürdü, geri dönüş yükü yok.
- Kritik ihtiyaç: "Bölgemde iş var mı?" sorusunu hızlı yanıtlamak.

### Mevsimsellik
- **Yoğun sezon:** Mart-Kasım (inşaat mevsimi). Mayıs-Ekim pik.
- **Düşük sezon:** Aralık-Şubat. Dondurucu soğuk, şantiyeler duruyor. Bu dönemde platform trafiği düşer — bu dönemde sürücüyü platformda tutmak için içerik/topluluk gerekir.
- **Özel dönemler:** Belediye seçimleri öncesi yol yapımı patlaması (2027 seçimleri hafriyat için iyi), deprem sonrası yeniden yapılanma projeleri (Hatay, Kahramanmaraş bölgesi hâlâ aktif).

### Rakip Platformlar — Türkiye
| Platform | Ne Yapıyor | Hafriyat Özelliği |
|----------|-----------|-------------------|
| ilanveren.com | Genel nakliye ilanları | Var ama filtresiz, güvensiz |
| sahibinden.com | Araç/ilan | Tır kiralama ilanları var, pazar yeri değil |
| netnakliyat.com | Nakliye teklif sistemi | Ev/eşya taşıma odaklı, hafriyat yok |
| kariyer/iş ilanları siteleri | Sürücü istihdamı | Platform değil |
| WhatsApp grupları | Tır durağı/meslek grupları | Organize değil, kayıt yok |

**Sonuç:** Hafriyata özel, güvenli ödeme + GPS takip + fiyat rekabeti sunan bir platform **Türkiye'de yok**. Bu hafriyatcim.com'un penceresi.

### hafriyatcim.com'un Differentiator'ı
1. **Çift taraflı güvenli ödeme:** Para escrow'da bekliyor (iyzico), işi yapmayana ödeme yok.
2. **GPS canlı takip:** Şantiye müdürü ekranda sürücüyü izliyor — sektörde devrim.
3. **Fiyat rekabeti:** Sürücüler teklif veriyor, müşteri en iyisini seçiyor. Komisyoncu yok.
4. **Dikey odak:** Genel nakliye değil, sadece hafriyat. SEO'da kazanım sağlar.

---

## 2. Kritik Eksikler — Production Öncesi Zorunlu (P0)

Bu eksikler olmadan platform canlıya çıkmamalı. Kullanıcı kaybı, fraud, yasal risk.

---

### 2.1 E-posta Doğrulama (Kayıt Sonrası)

**Sorun:** `auth.js` incelendiğinde, kayıt (`POST /api/auth/kayit`) sonrasında doğrulama e-postası gönderilmiyor. Kullanıcı sahte/yanlış e-posta ile kayıt olabiliyor. `email_verified` alanı veritabanı şemasında mevcut değil.

**Kullanıcıya etkisi:** Sahte hesaplar, spam ilanlar, iletişim kopukluğu (kullanıcı e-posta alamaması).

**Çözüm önerisi:**
- Kayıt sonrası 6 haneli OTP veya UUID token oluştur, e-posta gönder (Nodemailer + Gmail SMTP veya Resend.com).
- `users` tablosuna `email_verified: false` alanı ekle. Doğrulanmamış hesap ilan açamaz.
- Token için `email_tokens` tablosu: `{ id, user_id, token, expires_at, used }`.
- Doğrulama linki: `hafriyatcim.com/dogrula?token=xxx` — 24 saat geçerli.

**Tahmini süre:** 2-3 gün (backend + basit doğrulama sayfası)

---

### 2.2 Telefon Doğrulama — SMS OTP

**Sorun:** Platform her iki taraftan 252 TL ödeme alıyor ve ödeme sonrası telefon numaralarını paylaşıyor. Telefon numarası doğrulanmıyor. Birisi sahte numara yazarsa tüm iş akışı çöküyor.

**Kullanıcıya etkisi:** Müşteri 252 TL ödedi, SMS geldi ama numara yanlış/sahte. Hem para gitti hem iş yapılmadı. En kritik güven riski.

**Çözüm önerisi:**
- Profil tamamlama adımında telefon OTP zorunlu.
- `.env`'de Twilio zaten tanımlı (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE`). Entegrasyon var ama aktif mi belirsiz — kontrol et.
- Alternatif: Twilio pahalıysa NetGSM veya iletimerkezi.com.tr (Türk SMS sağlayıcısı, daha ucuz, Türkçe destek).
- `users` tablosuna `telefon_verified: false` ekle. Doğrulanmamış telefon ile teklif kabul edilemesin.
- OTP: 6 haneli, 5 dakika geçerli, maksimum 3 deneme.

**Tahmini süre:** 2-3 gün

---

### 2.3 Şifremi Unuttum Akışı

**Sorun:** `giris.html`'de "Şifremi Unuttum" linki görünür ama `auth.js` route'larında `POST /api/auth/sifre-sifirla` endpoint'i yok. Tıklanınca hiçbir şey olmuyor.

**Kullanıcıya etkisi:** Şifresini unutan kullanıcı platformdan çıkıyor, geri dönmüyor. Türk kullanıcı "kırık" gördüğü platformu terk eder.

**Çözüm önerisi:**
- `POST /api/auth/sifre-sifirla-talep` → e-posta al, token oluştur, mail gönder.
- `POST /api/auth/sifre-sifirla-onayla` → token + yeni şifre al, güncelle.
- `password_reset_tokens` tablosu: `{ id, user_id, token, expires_at, used }`.
- Frontend: basit bir `sifre-sifirla.html` sayfası — e-posta giriş formu + yeni şifre formu.

**Tahmini süre:** 1-2 gün

---

### 2.4 Araç Bilgisi Doğrulama — Ruhsat Yükleme & Admin Onayı

**Sorun:** Sürücü dashboard'da araç bilgisi giriyor (`iYukTuru`, araç bilgisi teklif formunda `teklifArac` serbest metin). Araç ruhsatı yükleme akışı `profil.html`'de var mı kontrol edilemedi ama admin onay mekanizması görünmüyor. Herhangi biri kendini tır sahibi ilan edip teklif verebiliyor.

**Kullanıcıya etkisi:** Sahte sürücüler, araç kapasitesi olmayan kişilerin teklif vermesi, müşteri güven kaybı.

**Çözüm önerisi:**
- `users` tablosuna `arac_dogrulandi: false`, `ruhsat_url: null` ekle.
- Dosya upload: Multer + `/uploads/ruhsatlar/` klasörü (server.js'te `/uploads` statik route zaten var).
- Admin panelinde "Doğrulama Bekleyenler" tab'ı: ruhsatı görüntüle, onayla/reddet.
- Doğrulanmamış araç: teklif verebilir ama "Araç Doğrulanmamış" rozeti gösterilsin. Müşteri görünsün.
- İlk aşamada tam otomasyona gerek yok — manuel admin onayı yeter.

**Tahmini süre:** 3-4 gün

---

### 2.5 Sürücü Gelmedi / İptal Senaryosu — Para İadesi

**Sorun:** Müşteri teklifi kabul edip 252 TL ödedi (`odeme.html` → iyzico). Sürücü "İşi Al" ödedikten sonra gelmiyor veya siparişi TESLIM_EDILDI yapmıyor. Ne olacak? Kod incelendiğinde iade (`IADE`) durumu tanımlı ama tetikleme mekanizması yok.

**Kullanıcıya etkisi:** En yüksek şikayet sebebi olacak senaryo. İlk olumsuz yorumları bu getirir.

**Çözüm önerisi:**
- Müşteri için "Sürücü Gelmedi" butonu — sipariş BEKLIYOR/YUKLENIYOR durumunda 2 saatten sonra aktif.
- Admin bildirim tetikle: "Anlaşmazlık: Sipariş #{id}".
- 48 saat içinde admin karar vermezse otomatik iade.
- iyzico sandbox'ta iade API'si var — `refund` endpointi implement et.
- Policy sayfası: `iptal-iade.html` — KVKK kadar önemli, hukuki zorunluluk.

**Tahmini süre:** 4-5 gün (backend + policy sayfası)

---

### 2.6 Anlaşmazlık Çözüm Mekanizması

**Sorun:** "Yük teslim edilmedi", "eksik teslim edildi", "hasar var" gibi durumlar için hiç mekanizma yok. Admin'e bildirme butonu görünmüyor.

**Kullanıcıya etkisi:** Kullanıcı çözümsüz kalır, sosyal medyada şikayet eder.

**Çözüm önerisi:**
- Tamamlanan siparişlerde 72 saat içinde müşteriye "Sorun var mı?" bildirimi.
- "Şikayet Oluştur" formu: sebep seç (gelme/eksik/hasar/ödeme) + açıklama + fotoğraf yükle.
- Admin dashboard'da `sec-admin` sekmesine "Şikayetler" tab'ı.
- SLA: Admin 24 saat içinde yanıt verir (startup aşamasında kurucu bizzat bakabilir).

**Tahmini süre:** 3-4 gün

---

### 2.7 E-posta Bildirimleri (Transactional)

**Sorun:** Socket.IO ile anlık bildirimler var ama kullanıcı uygulamayı kapattığında hiçbir şey almıyor. Kritik aksiyonlar (yeni teklif, teklif kabul, ödeme onayı) için e-posta yok.

**Kullanıcıya etkisi:** Müşteri gün içinde dashboarda girmeyebilir. Sürücü teklifinin kabul edildiğini saatlerce bilmeyebilir. Kaçan işler.

**Çözüm önerisi:**
- Nodemailer + Resend.com (ücretsiz plan: 3.000 e-posta/ay — başlangıç için yeterli).
- Tetikleyici e-postalar:
  - Yeni teklif → Müşteriye: "Hafriyat ilanınıza X teklif geldi"
  - Teklif kabul → Sürücüye: "Teklifiniz kabul edildi, ödeme yapmanız bekleniyor"
  - Ödeme onayı → Her ikisine de
  - Sipariş tamamlandı → Her ikisine de + puan verme hatırlatıcısı
- HTML e-posta şablonu: minimal, mobil uyumlu, marka renklerinde (turuncu)

**Tahmini süre:** 2-3 gün

---

### 2.8 localStorage Token Tutarsızlığı (Teknik Debt, Kritik)

**Sorun (kodda doğrulandı):** CLAUDE.md'de açıkça belirtilmiş — `profil.html` ve `ilan-detay.html` `localStorage.getItem('token')` kullanırken, `ilanlar.html` ve diğerleri de `localStorage.getItem('token')` kullanıyor. Ama `dashboard.js` line 153'te `localStorage.getItem('accessToken')` kullanılıyor (Socket.IO auth için). Bu iki farklı key problemi: kullanıcı giriş yaptığında hangisi set edildiğine göre bazı sayfalar çalışmıyor.

**Kullanıcıya etkisi:** Bazı kullanıcılar "giriş yapıyorum ama panel çalışmıyor" hatası alıyor. Support yükü.

**Çözüm önerisi:** `api.js`'te token set edilirken her iki key'e de yaz: `localStorage.setItem('token', token); localStorage.setItem('accessToken', token);` Kalıcı çözüm: tek key'e geçiş ve tüm sayfaları güncelle. 1-2 saatlik iş ama kritik.

**Tahmini süre:** 2-4 saat

---

## 3. Müşteri (İnşaat Sahibi) Deneyimi İyileştirmeleri (P1)

---

### 3.1 Tekrar Sipariş — Aynı Güzergah

**Ne:** Önceki ilanlardan birine "Tekrar İlan Aç" butonu. Tüm alanlar otomatik dolar, sadece tarih seçilir.

**Neden:** İnşaatçılar genellikle aynı güzergahı tekrar tekrar kullanır (şantiye-döküm alanı sabit). Her seferinde doldurmak sinir bozucu.

**Uygulama notu:** `dashboard.js`'teki `ilanKart()` fonksiyonuna "Tekrar Aç" butonu ekle. Tıklanınca `sec-yeni-ilan` section'a geç, form alanlarını eski ilan verisiyle doldur.

**Tahmini süre:** 4-6 saat

---

### 3.2 Favori Sürücüler

**Ne:** Müşteri beğendiği sürücüyü "Favori" olarak işaretler. Yeni ilan açtığında favorilerine önce bildirim gönderilir.

**Neden:** B2B ilişkilerde güven tekrar kullanımdır. "Geçen sefer çalıştığım Ahmet Bey nerede?" sorusunu çözer.

**Uygulama notu:** `favorite_drivers` tablosu: `{ musteri_id, surucu_id, created_at }`. Dashboard'da yeni sekme veya profil altında liste.

**Tahmini süre:** 1 gün

---

### 3.3 Şantiye Adresleri Kaydetme

**Ne:** Kullanıcı sık kullandığı lokasyonları "Şantiyelerim" listesine kaydeder. İlan oluştururken dropdown'dan seçer, yazmaz.

**Neden:** Hafriyatçıların çoğu 2-5 şantiyeyi sürekli döndürüyor. Her seferinde adresi yazmak hata yaratır.

**Uygulama notu:** `saved_locations` tablosu: `{ user_id, isim, adres, koordinatlar, created_at }`. Leaflet haritasında pin ile kaydetme seçeneği eklenirse çok güçlü olur.

**Tahmini süre:** 1-2 gün

---

### 3.4 Toplu İlan — Birden Fazla Güzergah

**Ne:** Müşteri tek seferde 3-5 güzergah için ilan açabilsin. "+" butonu ile satır ekle.

**Neden:** Büyük şantiyeler aynı anda birden fazla noktaya hafriyat taşır. Şu an her ilan için ayrı form doldurması gerekiyor.

**Uygulama notu:** Frontend'de dinamik form satırları. Backend'de `POST /api/ilanlar/toplu` endpoint: array al, loop ile insert et.

**Tahmini süre:** 2-3 gün

---

### 3.5 Fatura / e-Fatura Alma (KDV'li)

**Ne:** Ödeme sonrası müşteriye PDF fatura indir seçeneği. B2B müşterilerin %100'ü bunu sorar.

**Neden:** Şirket olarak hafriyat işi yaptıran müşteri vergi beyannamesinde bu ödemeyi göstermek zorunda. Fatura yoksa platformu kullanamaz.

**Uygulama notu:** İlk aşama: Basit PDF fatura generate (pdfkit npm paketi). İkinci aşama: e-Fatura entegrasyonu (Logo Tiger/Paraşüt API). Şimdilik basit PDF yeterli. `GET /api/fatura/:siparisId` endpoint'i + PDF indir butonu.

**Tahmini süre:** 2-3 gün (basit PDF), 1-2 hafta (e-Fatura tam entegrasyon)

---

### 3.6 Sürücü Geçmişi Görüntüleme

**Ne:** Teklif listesinde sürücü kartına tıklayınca: kaç iş yaptı, hangi güzergahlarda, ortalama puanı, son yorumlar.

**Neden:** Rating sayısı (şu an `surucu_rating` field'ı var) tek başına yetersiz. "127 işten 4.8 puan" çok farklı güven verir.

**Uygulama notu:** `GET /api/kullanici/:id/profil-public` endpoint'i. Puanlar tablosu (`puanlar` route'u zaten var — bağla). Modal veya yeni sayfa.

**Tahmini süre:** 1-2 gün

---

### 3.7 İlana Teklif Gelmediğinde Fiyat Önerisi

**Ne:** 24 saat teklif gelmemiş ilanı tespit et. Müşteriye bildirim gönder: "Bu güzergahta ortalama fiyat X TL. Bütçenizi günceller misiniz?"

**Neden:** Müşteri piyasayı bilmiyor, düşük fiyat koyuyor. Sistem bunu tespit edip yönlendirirse dönüşüm artar.

**Uygulama notu:** Cron job (node-cron): her 6 saatte çalışır, 0 teklifli ve 24+ saatten eski ilanları tespit eder. Aynı güzergah/yük türü için ortalama kabul edilen teklif fiyatını hesapla.

**Tahmini süre:** 2-3 gün

---

### 3.8 Mobil Uygulama vs PWA Analizi

**Mevcut durum:** `sw.js` ve `manifest.json` mevcut. PWA altyapısı kurulu. `manifest.json`'da `start_url`, `icons`, `display: standalone` tanımlanmış olmalı.

**Analiz:**
- PWA iOS'ta push notification **hâlâ kısıtlı** (Safari 16.4+ kısmen destekliyor ama pratikte sorunlu).
- PWA Android'de push notification **tam çalışıyor** ve ana ekrana ekleme akıcı.
- Hedef kitle tırcılar: %70+ Android kullanıcısı. PWA bu kitleyi karşılar.
- App Store / Play Store'a çıkmak ilk 6 ay gereksiz maliyet ve gecikme yaratır.

**Karar önerisi:** İlk 12 ay PWA yeterli. React Native'e geçiş için tetikleyici şart: 1.000+ aktif sürücü kullanıcısı veya iOS push notification kaçırılan iş miktarı anlamlı hale geldiğinde.

---

## 4. Sürücü (Tır Sahibi) Deneyimi İyileştirmeleri (P1)

---

### 4.1 Gelir Takibi — Aylık/Yıllık Kazanç Özeti

**Ne:** Dashboard'da sürücüye özel "Kazancım" sekmesi: bu ay X TL kazandı, bu yıl Y TL, en çok çalıştığı müşteri, en karlı güzergah.

**Neden:** Sürücüler kazancını takip edemiyorlar. Bu özellik hem bağlılık sağlar hem de vergi döneminde "ne kadar kazandım" sorusunu cevaplar.

**Uygulama notu:** `sec-dashboard` sürücü versiyonuna ekle. Kaynak: tamamlanan sipariş tablosu (`durum === 'TESLIM_EDILDI'` + `odeme_durumu === 'ODENDI'`). Aggregation query gerekiyor.

**Tahmini süre:** 1-2 gün

---

### 4.2 Tercih Bölgesi Ayarı

**Ne:** Sürücü profilinde "Sadece şu şehirlerdeki ilanları göster" seçimi. "İstanbul, Kocaeli, Bursa" gibi.

**Neden:** İstanbullu tırcı Erzurum ilanı görmek istemez. Filtre olmadan liste kirlenince uygulama değersizleşir.

**Uygulama notu:** `users` tablosuna `tercih_bolgeler: JSON` alanı. `GET /api/ilanlar` query'sine `?sehir=Istanbul,Kocaeli` parametresi. Dashboard'da filtre otomatik uygulanır.

**Tahmini süre:** 2 gün

---

### 4.3 Yük Türü Tercihi Filtresi

**Ne:** Sürücü "sadece toprak ve hafriyat ilanlarını göster" ayarlayabilir. Tercih kayıtlı kalır.

**Neden:** Tır tiplerine göre yük uyumu önemli. Frigorifik tır sahibi hafriyat işi alamaz.

**Uygulama notu:** `users.tercih_yukler: JSON array`. Dashboard ilk yüklemede bu tercihe göre filtrele. Mevcut `filterYuk` dropdown'ı localStorage'a kaydetmek geçici çözüm olarak hızlı uygulanabilir.

**Tahmini süre:** 4-8 saat

---

### 4.4 Push Notification — Yeni İlan Bildirimi

**Ne:** Tercih bölgesine ve yük türüne uyan yeni ilan açıldığında sürücüye push notification gitsin.

**Neden:** Sürücü sürekli uygulamaya girmeyecek. Bildirim gelince bakacak. En kritik aktivasyon mekanizması.

**Mevcut durum:** PWA service worker (`sw.js`) mevcut. Push notification için Web Push API + VAPID anahtarı eksik.

**Uygulama notu:**
- `web-push` npm paketi. VAPID anahtar çifti oluştur.
- `push_subscriptions` tablosu: `{ user_id, endpoint, p256dh, auth, created_at }`.
- `POST /api/push/subscribe` endpoint'i.
- `sw.js`'e `push` event listener ekle.
- İlan oluşturulduğunda backend uygun sürücülere push gönderir.

**Tahmini süre:** 3-4 gün

---

### 4.5 Çoklu Araç Yönetimi — Filo Sahibi

**Ne:** Sürücü hesabına birden fazla araç ekleyebilsin. Teklif verirken hangi araçla gideceğini seçsin.

**Neden:** Küçük filo sahipleri (2-5 araç) bu platformda en değerli kullanıcılar. Onları şu an dışlıyoruz.

**Uygulama notu:** `vehicles` tablosu: `{ id, user_id, plaka, marka_model, kapasite_ton, yuk_tipi, ruhsat_url, aktif }`. Teklif verirken araç seçimi dropdown. Platform ücreti araç başına değil, iş başına.

**Tahmini süre:** 2-3 gün

---

### 4.6 Teklif Şablonu

**Ne:** Sürücü "Bu bilgileri kaydet, sonraki teklifte kullan" seçeneği. Araç bilgisi, standart mesaj otomatik dolar.

**Neden:** Tır sahipleri aynı araç bilgisini her teklif için yazmaktan bıkıyor. Sürtünmeyi kaldır.

**Uygulama notu:** `teklif_sablonlari` tablosu: `{ user_id, arac_bilgisi, standart_mesaj }`. Teklif formunda "Şablon Kullan" checkbox.

**Tahmini süre:** 4-6 saat

---

### 4.7 Çalışma Saatleri / Müsaitlik Ayarı

**Ne:** Sürücü "Hafta sonu çalışmıyorum" veya "Sadece 07:00-18:00" ayarlayabilir. Bu saatlerin dışındaki ilanlar push notification göndermez.

**Neden:** Gece 02:00'de bildirim gelen sürücü bildirimleri kapatır. Kapatınca önemli bildirimler de gitmez. Hassas ayar bağlılığı korur.

**Uygulama notu:** `user_availability` tablosu: `{ user_id, gun, baslangic, bitis }`. Push göndermeden önce saati kontrol et.

**Tahmini süre:** 1-2 gün

---

## 5. Platform Güveni & Kalite (P1)

---

### 5.1 Kimlik Doğrulama — T.C. Kimlik No veya e-Devlet

**Ne:** Kayıt veya profil tamamlama aşamasında T.C. kimlik no zorunluluğu.

**Neden:** Para transferi olan bir platformda anonim kullanıcı kabul edilemez. Fraud için en büyük kapıyı kapatır.

**Uygulama notu:**
- **Kısa vade:** T.C. kimlik no + doğum tarihi al, NVI (Nüfus ve Vatandaşlık İşleri) doğrulama servisi — ücretsiz ama API erişimi zor.
- **Alternatif (daha kolay):** e-Devlet ile giriş (OAuth benzeri, Türkiye'ye özel). Mevcut altyapı yok ama 2025'te bazı startuplar entegre etti.
- **Pratik başlangıç:** T.C. no + selfie fotoğrafı yükle — admin manuel doğrulama. Ölçeklenince otomasyona geç.

**Tahmini süre:** 1 hafta (manuel), 3-4 hafta (API entegrasyon)

---

### 5.2 Araç Ruhsatı Politika Kararı

**Ne:** Teklif vermek için ruhsat zorunlu mu opsiyonel mi? Bu bir iş kararı, teknik karar değil.

**Öneri:** İlk 3 ay opsiyonel bırak, "Doğrulanmış Sürücü" rozeti ver. Kullanıcı tabanı büyüyünce zorunlu yap. Çünkü başlangıçta arz tarafı kıttır — sürücü sayısını artırmak öncelik.

---

### 5.3 Kullanıcı Şikayet Sistemi — Admin'e Bildir

**Ne:** Her profil, ilan veya siparişte "Şikayet Et" butonu. Kategori seç (sahte ilan, taciz, dolandırıcılık) + açıklama.

**Uygulama notu:** `sikayetler` tablosu. Admin paneline "Şikayetler" tab'ı ekle (`switchAdminTab` fonksiyonu zaten genişletilebilir).

**Tahmini süre:** 1-2 gün

---

### 5.4 İlan Kalite Skoru

**Ne:** İlan oluştururken gerçek zamanlı kalite göstergesi: "Açıklama çok kısa", "Fotoğraf ekle" gibi öneriler. Yüksek kaliteli ilanlar daha üstte sıralanır.

**Neden:** Belirsiz ilanlar az teklif alır. Müşteri hayal kırıklığı yaşar. Sistem kaliteli içerik üretmeye yönlendirmeli.

**Uygulama notu:** Frontend'de form submit öncesi skor hesapla: açıklama uzunluğu + fotoğraf + tarih = 0-100 puan. Görsel gösterge yeterli, backende kaydetmek şart değil.

**Tahmini süre:** 4-6 saat

---

### 5.5 "Güvenli Sürücü" Rozeti Kriterleri

**Kriterler önerisi:**
- 5+ tamamlanmış sipariş
- 4.0+ ortalama puan
- Araç ruhsatı doğrulanmış
- Telefon doğrulanmış
- Hesap 30+ gündür aktif

**Uygulama notu:** Her sipariş tamamlandığında rozet kriter kontrolü yap. `users.guvenlı_surucu: boolean` güncelle. İlan listesinde ve teklif kartında rozet göster.

**Tahmini süre:** 1 gün

---

### 5.6 Fraud Tespiti

**Temel kurallar (başlangıç için):**
- Aynı IP'den 24 saatte 5'ten fazla kayıt → engelle.
- Aynı telefon numarası birden fazla hesapta → uyar.
- 0 taşıma geçmişiyle 10+ teklif veren sürücü → flag.
- Aynı sürücü aynı müşteriye 5 dakika içinde 3 farklı ilanda teklif → rate limit.

**Uygulama notu:** Express middleware düzeyinde rate limiter (`express-rate-limit` zaten yaygın). Fraud flag'li hesapları admin panelinde göster.

**Tahmini süre:** 2 gün

---

### 5.7 Rating Sistemi UI Tamamlama

**Sorun (kodda görüldü):** `puanlar` API route'u (`/api/puanlar/kullanici/:id`) mevcut. Ama sipariş tamamlandıktan sonra puan verme UI'ı dashboardda görünmüyor. `sec-siparisler`'de `TESLIM_EDILDI` siparişler için puan butonu yok.

**Uygulama notu:** `siparisler` tablosunda `durum === 'TESLIM_EDILDI'` ve `puan_verildi: false` olan kayıtlar için "Puan Ver" butonu göster. 5 yıldızlı arayüz (basit star click). `POST /api/puanlar` endpoint'ine bağla.

**Tahmini süre:** 1 gün

---

## 6. Büyüme Özellikleri (P2)

---

### 6.1 Referral Sistemi

**Mekanizma:**
- Her kullanıcıya benzersiz referral kodu (`REF-XXXX`).
- Yeni kullanıcı kodla kayıt olur → referral veren bir sonraki işlemde 50 TL indirim.
- Sürücü getirirse: "Getiren sürücü bir sonraki platform ücretini ödemez."

**Neden:** Tır sahipleri birbirini tanır. Bir tırcı 3-4 arkadaşını getirebilir. Organik büyümenin en ucuz yolu.

**Tahmini süre:** 3-4 gün

---

### 6.2 Sürücü Abonelik Planı

**Model önerisi:**
- **Ücretsiz:** Her eşleşmede 252 TL platform ücreti.
- **Premium — 399 TL/ay:** Platform ücreti yok, öncelikli ilan bildirimleri, profil ön plana çıkar.

**Ne zaman sunulmalı:** 200+ aktif sürücüden sonra. Şu an sürücü sayısı az, abonelik teklif etmek erken.

**Tahmini süre:** 3-4 gün

---

### 6.3 Blog / SEO İçerik

**Hedef anahtar kelimeler (hacim bazlı öncelik):**
1. "hafriyat kamyon kiralama" — orta hacim, düşük rekabet
2. "istanbul hafriyat firmaları" — yüksek hacim
3. "hafriyat nakliye fiyatları 2026"
4. "moloz döküm alanları istanbul"
5. "toprak taşıma ton fiyatı"

**İlk 5 makale konusu:**
1. "Hafriyat Maliyeti Nasıl Hesaplanır? 2026 Fiyat Rehberi"
2. "İstanbul'da Hafriyat Döküm Alanları — Güncel Liste"
3. "Tır Sahibi Olarak Nasıl Daha Fazla İş Bulunur?"
4. "Şantiye İçin Hangi Kamyon Tipi Uygun?"
5. "Hafriyatta Kayıp Ton Problemi ve Nasıl Önlenir"

**Tahmini süre:** İçerik yazımı devam eden iş — teknik kurulum 1 gün (basit blog route'u veya Ghost CMS).

---

### 6.4 Araç GPS Tracker Entegrasyonu

**Ne:** OBD2 cihazı veya Teltonika GPS tracker ile sürücünün telefon bağımlılığı olmadan konum otomatik paylaşılır.

**Neden:** Sürücü telefonunu kapattığında takip kopuyor. Müşteri endişeleniyor.

**Uygulama notu:** Teltonika FMB920 (Türkiye'de yaygın, ~1.200 TL). MQTT veya HTTP protokolüyle backend'e konum push. İlk aşama: pilot program, 10 sürücüye cihaz hediye et, geri bildirim al.

**Tahmini süre:** 2-3 hafta (sıfırdan entegrasyon)

---

## 7. Türk Pazarına Özel (P1-P2)

---

### 7.1 e-Fatura Entegrasyonu

**Durum:** Türkiye'de ciroya göre e-Fatura zorunluluğu var (2024 itibarıyla 500K TL ciro üzeri tüm mükellefler). Platform büyüdükçe kullanıcılarınızın büyük çoğunluğu e-Fatura mükellefi olacak.

**Pratik yol:** GIB'in e-Fatura API'sine doğrudan entegre olmak yerine **aracı entegratör** kullan.
- Paraşüt API (Türkiye'nin en yaygın muhasebe yazılımı — iyi API'ı var)
- Logo Tiger entegratörü
- e-Dönüşüm Türkiye (GIB onaylı entegratör)

**Akış:** Sipariş tamamlanır → platform, iyzico ödeme makbuzu yayınlar → müşteri talep ederse e-Fatura entegratöre JSON gönderilir → GIB'e iletilir → müşteri e-Posta ile alır.

**Tahmini süre:** 2-3 hafta (entegratör seçimi + API entegrasyon)

---

### 7.2 Vergi Hesaplayıcı — Sürücüler İçin

**Sorun:** Türk tır sahiplerinin büyük çoğunluğu esnaf (gerçek usul veya basit usul mükellef). Platform üzerinden kazandıkları parayı nasıl beyan edeceklerini bilmiyorlar.

**Ne sunulmalı:**
- "Aylık X TL kazandınız. Bu gelirinizi beyan etmek için vergi dairenize başvurmanız gerekmektedir."
- Basit hesaplayıcı: "Yıllık kazancınız Y TL. Basit usulde vergi muafiyeti Z TL — ödeyeceğiniz tahmini vergi W TL."
- Muhasebeci yönlendirme: Platform anlaşmalı bir muhasebe firmasıyla komsiyon paylaşabilir.

**Tahmini süre:** 1-2 gün (bilgilendirme sayfası), 1 hafta (hesaplayıcı)

---

### 7.3 Banka Havalesi / EFT Seçeneği

**Neden:** Türk B2B pazarında büyük şirketler korporat politika gereği kart ödemesi yapamaz. CFO "iyzico'ya kart bilgisi vermeyiz" diyebilir. EFT ile ödeme kabul etmek bu müşterileri kazandırır.

**Pratik uygulama:**
- Büyük iş (500 TL+ platform ücreti) → "Havale/EFT ile öde" seçeneği sun.
- Havale bildirimi → admin manuel onay → sipariş açılır.
- Dezavantaj: Manuel süreç, fraud riski yüksek. İlk aşamada 100 TL+ işlemlere öner.

**Tahmini süre:** 2-3 gün (backend + admin onay akışı)

---

### 7.4 Taksit Seçeneği

**Neden:** Büyük hafriyat projeleri (1.000 ton+) için platform ücreti yüksek görünüyor. 3-6 taksit büyük müşteri engeli kaldırır.

**Pratik uygulama:** iyzico taksit API'sini aktif et (sandbox'ta mevcut ama production'da banka anlaşması gerekiyor). Taksit için minimum tutar belirle (örn: 500 TL+ platform ücreti → 3 taksit sunulur).

**Tahmini süre:** 2 gün (iyzico taksit parametrelerini aktif etmek)

---

### 7.5 WhatsApp Entegrasyonu

**Neden:** Türk B2B pazarının iletişim kanalı WhatsApp'tır. "Bildirimi e-posta yerine WhatsApp'a gönder" seçeneği Türk kullanıcı için e-postadan 5 kat daha değerli.

**Pratik yol:**
- **Meta Business API** (en güçlü ama pahalı ve onay süreci uzun)
- **Twilio WhatsApp** (sandbox ücretsiz, production'da Meta onayı gerekli — ama Twilio zaten `.env`'de tanımlı!)
- **Ücreti olmayan başlangıç çözümü:** WhatsApp Business hesabı + Zapier (no-code) entegrasyonu. Manuel ama hızlı.

**İlk adım:** Twilio WhatsApp sandbox'ı aktive et. Kritik bildirimler (teklif kabul, ödeme onayı) WhatsApp'a da gitsin.

**Tahmini süre:** 2-3 gün (Twilio WhatsApp sandbox), 1-2 hafta (Meta API onay süreci)

---

### 7.6 Belediyelere Özel — Hafriyat Döküm Alanları Listeleme

**Neden:** Hafriyat toprağı her yere dökülemiyor. Belediyeler lisanslı döküm alanları belirliyor. Bu liste değerli içerik — hem SEO hem kullanıcı değeri.

**İçerik:** İstanbul (İSKİ, İBB), Ankara (ASKİ, EGO), İzmir — lisanslı döküm alanları, koordinatlar, telefon numaraları, çalışma saatleri.

**Uygulama notu:** Statik veri, JSON dosyasına yaz. Leaflet haritada göster. Her ilan oluştururken "Nereye dökülecek?" sorusuna yanıt olur.

**Tahmini süre:** 2-3 gün (veri toplama + harita entegrasyon)

---

### 7.7 e-Devlet Ruhsat Sorgulama

**Ne:** Araç plakası girildiğinde e-Devlet / TRAMER üzerinden araç sahibi ve ruhsat bilgisi otomatik çekilsin.

**Pratik durum:** TRAMER ve TÜVİK API'lerine erişim bürokratik — sigorta şirketleri ve yetkili kurumlar alabiliyor. Startup olarak doğrudan erişim zor.

**Pratik alternatif:** Plaka + ruhsat fotoğrafı kombinasyonu. Admin görsel doğrulama yapar. Uzun vadede ruhsat doğrulama API'si sunan bir servis (Şekerbank gibi fintech partnerler üzerinden).

**Tahmini süre:** Şu an için manuel süreç + form (1 gün). API entegrasyon: 1-2 ay (bürokratik)

---

## 8. Monetizasyon Alternatifleri

**Mevcut model:** Her eşleşmede her taraftan 252 TL (200 TL + %26 KDV).

---

### 8.1 Sürücü Premium Aboneliği
- **399 TL/ay** → Platform ücreti sıfır, öncelikli bildirim.
- **Ne zaman ekle:** 200+ aktif sürücüde.
- **Aylık potansiyel:** 200 sürücü × 399 TL = ~80.000 TL/ay

### 8.2 Öne Çıkan İlan (Müşteri İçin)
- **49-99 TL** → İlan en üste sabitlenir, 24-48 saat.
- İlan listesinde "Öne Çıkan" rozeti.
- **Ne zaman ekle:** İlan sayısı 50+'yı geçtiğinde (rekabet oluşunca anlam kazanır).

### 8.3 Sigorta Entegrasyonu
- Yük sigortası satışı: her taşıma için yük değerinin %0.3-0.5'i prim.
- Partner: Allianz, Mapfre veya Türkiye'nin insurtech'leri (Digiturunc, Sigorta Sepeti API).
- Komisyon: %20-30 sigorta priminden pay.
- **Müşteri değeri:** "Sigortalı taşıma" rozeti platformda güven artırır.

### 8.4 Akaryakıt Kartı Ortaklığı
- Shell, BP, Petrol Ofisi kurumsal kartı: sürücüler platform üzerinden indirimli akaryakıt.
- Komisyon modeli: yakıt şirketi sürücü başına sabit ücret öder.
- **Neden çalışır:** Tır sahipleri için en büyük gider yakıt. Bu avantaj rakipsiz değer önerisi olur.

### 8.5 Veri Satışı — Anonim Piyasa Fiyat Verisi
- İnşaat firmaları, belediyeler, danışmanlar için: "Bu güzergahta ortalama hafriyat fiyatı nedir?"
- Anonim ve aggregate veri, KVKK sorun değil.
- Abonelik modeli: Aylık 500-2.000 TL kurumsal plan.
- **Ne zaman:** 1.000+ tamamlanmış işlem verisi biriktiğinde anlamlı.

---

## 9. 6 Aylık Roadmap Özeti

| Ay | Ana Hedef | Kritik Özellikler | Başarı Metriği |
|----|-----------|-------------------|----------------|
| Ay 1 | Legal + Teknik Zemin | E-posta doğrulama, şifremi unuttum, localStorage tutarsızlığı, KVKK sayfası, iade politikası | Sıfır kritik bug, KVKK uyumlu |
| Ay 2 | İlk Kullanıcılar | SMS OTP, WhatsApp bildirimleri, push notification, SEO meta ekle | 50 sürücü + 20 müşteri |
| Ay 3 | Güven & Kalite | Araç doğrulama, rating UI, "Güvenli Sürücü" rozeti, şikayet sistemi | 4.0+ ortalama platform puanı |
| Ay 4 | Gelir Artışı | Abonelik planı, öne çıkan ilan, fatura PDF, referral sistemi | İlk 50 abonelik veya 200 eşleşme |
| Ay 5 | Ölçeklendirme | e-Fatura, taksit, banka havalesi, çoklu araç, filo yönetimi | Kurumsal müşteri kazanımı |
| Ay 6 | Genişleme & Karar | PWA iyileştirme veya React Native kararı, yeni şehir açılımı | İkinci şehirde 20+ aktif sürücü |

---

## 10. İlk 100 Gerçek Kullanıcıyı Getirme Stratejisi

### Müşteri Tarafı — İnşaatçılar (Hedef: 30 müşteri)

**Kanal 1 — Doğrudan Satış (En Hızlı):**
İstanbul'da 3-5 aktif şantiye belirle. Sabah 08:00-09:00 arası şantiyeye git, şantiye şefi veya mühendisle konuş. "Şu an kaç araba hafriyat arıyorsunuz?" diye sor. Sorunu orada çöz, telefonda kayıt yaptır. İlk 10 müşteri bu şekilde gelir.

**Kanal 2 — İnşaat Firmaları WhatsApp Grupları:**
İnşaat mühendisleri ve müteahhitler "müteahhit grubu" veya "inşaat sektörü" gruplarında toplanıyor. Kurucu bu gruplara katılır, değer katar, sonra platformu tanıtır. Spam değil, soruları yanıtla önce.

**Kanal 3 — LinkedIn Hedefli Mesaj:**
"Proje müdürü", "şantiye şefi", "inşaat müteahhidi" filtresiyle İstanbul/Ankara/İzmir LinkedIn araması. 20 kişiye kişiselleştirilmiş mesaj gönder. Conversion düşük ama kaliteli lead.

**Kanal 4 — İnşaat Malzemeleri Tedarikçileri:**
Çakıl ocağı, kum ocağı, hazır beton firmaları müşterilerinin hafriyat ihtiyacını biliyor. Onlarla partnership kur: "Müşterinize hafriyat lazım olunca bizi önerin, getirdiğiniz her müşteriden 100 TL referral öderiz."

**Kanal 5 — Google Ads (Küçük Bütçe, Hedefli):**
"istanbul hafriyat kamyon ara" veya "şantiye hafriyat taşıma" gibi anahtar kelimeler. Günlük 50-100 TL bütçe, hedef: Marmara Bölgesi. Click-to-Call kampanyası — ilan açma sayfasına değil, WhatsApp'a yönlendir.

---

### Sürücü Tarafı — Tırcılar (Hedef: 70 sürücü)

**Kanal 1 — Tır Durağı Doğrudan Ziyaret (En Etkili):**
İstanbul'daki büyük tır duraklarına git: Hadımköy, Halkalı, Gebze. Kahvehane köşesinde oturan tır sahiplerine tablet/telefon göster, "Bak, şu an 5 iş var bölgende" de. Canlı demo, kayıt yaptır. İlk 20 sürücü bu şekilde gelir.

**Kanal 2 — Tırcı WhatsApp Grupları:**
"Tırcılar grubu", "İstanbul nakliyeciler", "tır esnafı" grupları Facebook ve WhatsApp'ta mevcut. Kurucu bu gruplara katılır. Önce değer paylaş (moloz döküm alanları bilgisi, fiyat bilgisi), sonra platformu tanıt.

**Kanal 3 — Facebook Hedefli Reklam (Tırcı Kitlesi):**
Facebook'ta "Mesleki ilgi: tır şoförü, nakliyeci, kamyoncu" hedeflemesi. 30-55 yaş, Türkiye. Video reklam: sürücünün telefona bakıp iş bulduğu 15 saniyelik klip. "İş ararken telefon çevirme, sen onu bulsun."

**Kanal 4 — Ticaret Odası / Nakliyeciler Derneği:**
Türkiye genelinde "nakliyeciler odası", "esnaf ve sanatkarlar odası" gibi yapılar var. Buraya başvur, üyelerine duyuru gönder. Ücretsiz tanıtım imkanı.

**Kanal 5 — Referral Zinciri Başlat:**
İlk 10 sürücüye platform ücretsiz kullandır (3 ay). Onlara "Her getirdiğin sürücü için bir işte ücret almayacaksın" de. Tırcı topluluğu referransla büyür.

---

### Büyüme Loopları — Network Effect Nasıl Yaratılır

**Loop 1 — Arz-Talep Çevrimi:**
Daha fazla sürücü → müşteri için daha fazla seçenek → fiyatlar düşer → daha fazla müşteri → daha fazla iş → daha fazla sürücü.

Başlangıç için arzı yapay olarak besle: Platform kurucusu ilanda "Şu an 3 sürücü aktif bölgede" diyebilmek için başlangıçta bazı şehirlere yoğunlaş. İstanbul'da 50 sürücü varken Erzurum'a açılma.

**Loop 2 — Güven Çevrimi:**
İlk iş tamamlanır → iki taraf puan verir → rating birikir → yeni kullanıcılar güvenle gelir → daha fazla işlem → daha fazla rating.

Bu loopun başlaması için ilk 50 işlemin sorunsuz tamamlanması şart. Kurucu her siparişi manuel takip etmeli, sorunları telefon ile çözmeli.

**Loop 3 — İçerik-SEO Çevrimi:**
Blog yazısı yazar → Google'da rank alır → yeni kullanıcı gelir → işlem yapar → veri birikir → daha iyi içerik yazılır → daha fazla trafik.

"İstanbul'da hafriyat döküm alanları" yazısı yaz, arama motoruna düş. Bu kullanıcılar organik ve maliyetsiz.

**Loop 4 — WhatsApp Referral:**
Sürücü memnun → arkadaşına WhatsApp'tan linki atar → arkadaşı kaydolur → her ikisi de birlikte dönem ücreti ödemez (referral bonus).

---

## Notlar

- Bu roadmap koddaki gerçek duruma dayalıdır. Token tutarsızlığı (`accessToken` vs `token`), profil güncelleme butonu (`showToast('Profil güncelleme yakında!','info')` — gerçek kaydetme yok), ve rating UI eksikliği gibi somut bulgular dahil edilmiştir.
- iyzico sandbox modunda. Production'a geçmeden önce iyzico'nun KVK ve PCI DSS gereksinimlerini karşılayan anlaşmayı imzala.
- NeDB migration yok — schema değişikliklerinde `backend/database/` silmek zorunda kalıyorsun. Production'a geçmeden önce PostgreSQL veya SQLite'e migrate et.
- Socket.IO bağlantısı `dashboard.js` line 157'de `http://localhost:5000` hardcoded — production ortamında dinamik URL gerekiyor.
