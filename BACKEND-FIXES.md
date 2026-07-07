# hafriyatcim.com — Backend Fixes (2026-06-21)

## FIX 1: Şifremi Unuttum OTP Akışı

### Değişen Dosyalar
- `backend/routes/auth.js` — 2 yeni endpoint eklendi
- `giris.html` — "Şifremi unuttum" linki + modal + JS fonksiyonları eklendi
- `giris.html` — Google Auth URL'i 5000 → 5050 düzeltildi

### Ne Yapıldı
**backend/routes/auth.js'e eklendi:**
- `POST /api/auth/sifre-sifirla-talep` → email alır, 6 haneli OTP üretir, user kaydına `sifre_reset_otp` ve `sifre_reset_expiry` (15 dk) yazar, konsola log basar. Güvenlik: e-posta mevcut olsa da olmasa da aynı mesajı döner.
- `POST /api/auth/sifre-sifirla` → email + otp + yeniSifre alır, OTP doğrular, süresini kontrol eder, şifreyi bcrypt ile hashler, mevcut refresh token'larını iptal eder.

**giris.html'e eklendi:**
- "Şifremi unuttum" link `onclick="sifremiUnuttumAc(event)"` bağlandı
- 2 adımlı modal: Adım1 (email + "Kod Gönder"), Adım2 (OTP kodu + yeni şifre + "Şifreyi Sıfırla")
- Modal dışına tıklayınca otomatik kapanır
- Başarılı sıfırlamada giriş formuna e-postayı doldurur ve login tab'ına geçer

### Neden Önemli
`giris.html`'de link vardı ama backend route yoktu — kullanıcılar şifre sıfırlayamıyordu.

### Test
```bash
# 1. Talep et
curl -X POST http://localhost:5050/api/auth/sifre-sifirla-talep \
  -H "Content-Type: application/json" \
  -d '{"email":"musteri@demo.com"}'
# Konsola: 🔑 [ŞİFRE SIFIRLA] musteri@demo.com → OTP: 123456 (15 dk geçerli)

# 2. Sıfırla
curl -X POST http://localhost:5050/api/auth/sifre-sifirla \
  -H "Content-Type: application/json" \
  -d '{"email":"musteri@demo.com","otp":"123456","yeniSifre":"YeniSifre123!"}'
```

---

## FIX 2: Profil Kaydet Düzeltildi

### Değişen Dosyalar
- `profil.html` — Token key, API URL, loadRatings field isimleri, form handler'ları düzeltildi
- `api.js` — API_BASE URL 5000 → 5050 düzeltildi

### Ne Yapıldı
`profil.html` eski token sistemi kullanıyordu:
- `localStorage.getItem('token')` → `accessToken || token` fallback ile düzeltildi
- `BASE_URL` port 5000 → 5050 düzeltildi
- `api()` fonksiyonu `apiCall()` olarak yeniden adlandırıldı (global `api` objesiyle çakışma vardı)
- `loadRatings()`: API `{kullanici, puanlar, dagilim, toplam}` döner ama kod `{puanlar, ortalama, toplam}` bekliyordu → `kullanici.rating` alanından okunacak şekilde düzeltildi
- `editForm` ve `vehicleForm` submit handler'larına: başarılı kayıt sonrası `localStorage.setItem('user', ...)` ile güncelleme eklendi
- `editForm` başarı sonrası profil header'ını (isim + avatar) da anında günceller

**Backend `PUT /api/auth/profil` zaten mevcuttu** ve doğru çalışıyordu.

### Neden Önemli
profil.html'de "Kaydet" butonu API çağrısı yapıyordu ama yanlış port ve token key kullandığından her zaman 401 alıyordu. localStorage da güncellenmiyordu.

### Test
```bash
# Token al
TOKEN=$(curl -s -X POST http://localhost:5050/api/auth/giris \
  -H "Content-Type: application/json" \
  -d '{"email":"surucu@demo.com","sifre":"Demo123!"}' | jq -r '.accessToken')

# Profil güncelle
curl -X PUT http://localhost:5050/api/auth/profil \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"ad":"Ahmet Kaya","arac_turu":"tir","plaka":"34 ABC 123","kapasite":25}'
```

---

## FIX 3: Socket.IO URL Dinamik Hale Getirildi

### Değişen Dosyalar
- `dashboard.js` — `setupSocket()` fonksiyonu düzeltildi
- `api.js` — API_BASE port 5000 → 5050 düzeltildi

### Ne Yapıldı
**Önceki (hatalı):**
```js
socket = io('http://localhost:5000', { auth: { token } });
```

**Sonraki (dinamik):**
```js
const SOCKET_URL = ['localhost', '127.0.0.1'].includes(location.hostname)
  ? 'http://localhost:5050'
  : window.location.origin;
socket = io(SOCKET_URL, { auth: { token } });
```

`api.js`'deki `API_BASE` da 5000 → 5050 olarak güncellendi (.env ile tutarlı).

### Neden Önemli
Hardcoded localhost:5000 production'da çalışmıyordu (Railway/ngrok deployment'larda). Ayrıca port 5050'ye bağlanamazdı.

### Test
Tarayıcı konsolunda:
```js
// dashboard.html açıkken
socket.connected // → true beklenir
socket.io.uri    // → localhost: 'http://localhost:5050', production: window.location.origin
```

---

## FIX 4: Tamamlanan Siparişlerde Puan Ver

### Değişen Dosyalar
- `dashboard.js` — Siparişler tablosuna "Puan Ver" butonu + `puanVer()`, `yildizSec()`, `submitPuan()` fonksiyonları eklendi
- `backend/routes/puanlar.js` — Durum kontrolü `TAMAMLANDI` + `TESLIM_EDILDI` kabul edecek şekilde genişletildi

### Ne Yapıldı
**Backend `POST /api/puanlar` zaten mevcuttu** ama yalnızca `durum === 'TAMAMLANDI'` kabul ediyordu. Frontend `TESLIM_EDILDI` durumunu kullandığı için puan verilemiyor:
```js
// Önceki
if (siparis.durum !== 'TAMAMLANDI') { ... }

// Sonraki
const tamamlanmislar = ['TAMAMLANDI', 'TESLIM_EDILDI'];
if (!tamamlanmislar.includes(siparis.durum)) { ... }
```
`/siparis/:id/benim` endpoint'indeki `puanlayabilir` kontrolü de aynı şekilde güncellendi.

**Dashboard.js'e eklendi:**
- Sipariş satırında `TESLIM_EDILDI` veya `TAMAMLANDI` durumundaki siparişlere "⭐ Puan Ver" butonu
- `puanVer(siparisId, hedefKullaniciId, hedefAd)` — önce `/puanlar/siparis/:id/benim` ile daha önce puanlanıp puanlanmadığını kontrol eder, sonra modal açar
- `yildizSec(puan)` — 1-5 yıldız görsel seçimi
- `submitPuan(siparisId)` — `POST /api/puanlar` çağrısı, başarı sonrası butonu kaldırır

### Neden Önemli
Kullanıcılar tamamlanan siparişler için hiç puan veremiyordu. Backend infrastructure vardı ama frontend bağlantısı yoktu + durum kontrolü yanlıştı.

### Test
```bash
# Tamamlanmış sipariş varsa ve token alındıysa:
curl -X POST http://localhost:5050/api/puanlar \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MUSTERI_TOKEN" \
  -d '{"siparis_id":"SIPARIS_ID_BURAYA","puan":5,"yorum":"Harika sürücü, zamanında teslim!"}'

# Puan verildi mi kontrol et
curl http://localhost:5050/api/puanlar/siparis/SIPARIS_ID_BURAYA/benim \
  -H "Authorization: Bearer $MUSTERI_TOKEN"
```

---

## Özet Tablo

| Fix | Dosyalar | Durum |
|-----|----------|-------|
| #1 Şifremi Unuttum | `backend/routes/auth.js`, `giris.html` | ✅ Tamamlandı |
| #2 Profil Kaydet | `profil.html`, `api.js` | ✅ Tamamlandı |
| #3 Socket.IO URL | `dashboard.js`, `api.js` | ✅ Tamamlandı |
| #4 Rating UI | `dashboard.js`, `backend/routes/puanlar.js` | ✅ Tamamlandı |

## Notlar
- OTP sistemi şu an konsola yazıyor. Production'da `backend/.env`'deki `NETGSM_*` veya `EMAIL_*` değişkenleri doldurularak SMS/mail entegrasyonu yapılabilir.
- `profil.html` bağımsız bir `api()` fonksiyonu kullanıyordu; `apiCall()` olarak yeniden adlandırıldı. Bu sadece profil.html içinde geçerli — global `window.api` (api.js'den) etkilenmedi.
