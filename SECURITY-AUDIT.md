# hafriyatcim.com Güvenlik Audit Raporu

**Tarih:** 2026-06-21  
**Auditor:** Claude Code (claude-sonnet-4-6)  
**Kapsam:** Frontend JS/HTML dosyaları + backend/server.js + backend/routes/odeme.js + backend/middleware/auth.js

---

## Özet

| Seviye   | Sayı |
|----------|------|
| KRİTİK   | 3    |
| YÜKSEK   | 4    |
| ORTA     | 4    |
| DÜŞÜK    | 3    |
| **TOPLAM** | **14** |

---

## Bulgular

---

### [SEV-001] KRİTİK — token vs accessToken Tutarsızlığı (Auth Bypass)

**Dosyalar:**
- `odeme.html` satır 445 (DÜZELTİLDİ)
- `ilan-detay.html` satır 238–239, 512 (DÜZELTİLDİ)
- `ilanlar.html` satır 298, 416, 448 (DÜZELTİLDİ)

**Açıklama:**  
`api.js` tüm tokenları `accessToken` anahtarıyla `localStorage`'a yazar. Ancak `odeme.html`, `ilan-detay.html` ve `ilanlar.html` dosyaları `localStorage.getItem('token')` kullanıyordu — bu key hiç dolu olmuyor. Sonuç: kimliği doğrulanmış kullanıcı bile bu sayfalarda `null` token alıyordu; ödeme ve teklif işlemleri çalışmıyor ya da yetkisiz istek gönderilebiliyordu.

**Risk:**  
Ödeme sayfasında `token` null gelince kullanıcı giriş sayfasına yönlendiriliyordu — **ödeme hiç çalışmıyordu**. Daha kötü senaryoda, null token ile `Bearer null` gönderilirse sunucu tarafı middleware bu durumu yakalamazsa yetkilendirme atlatılabilirdi.

**Kod (öncesi):**
```js
// odeme.html:445
const token = localStorage.getItem('token');  // YANLIŞ — her zaman null
```

**Düzeltme:** `'token'` → `'accessToken'` olarak değiştirildi (tüm üç dosyada).

---

### [SEV-002] KRİTİK — XSS: Mesaj İçeriği innerHTML'e Doğrudan Enjekte Ediliyor

**Dosya:** `dashboard.js` satır 843–849, 866, 878 (DÜZELTİLDİ)

**Açıklama:**  
Kullanıcıdan gelen mesaj içeriği (`mesaj.icerik`) ve gönderen adı (`mesaj.gonderen_ad`) HTML escape edilmeden `div.innerHTML` içine yazılıyordu. Kötü niyetli bir kullanıcı mesaj olarak `<img src=x onerror=alert(document.cookie)>` gönderirse alıcının tarayıcısında script çalışabilir.

**Risk:**  
Oturum ele geçirme (session hijacking), localStorage token çalınması, phishing sayfasına yönlendirme.

**Kod (öncesi):**
```js
// dashboard.js:866
div.innerHTML = `${icerik}<div class="message-time">Şimdi</div>`;

// dashboard.js:878
div.innerHTML = `${mesaj.icerik}<div class="message-time">...</div>`;

// socket yeni_mesaj handler:
showToast(`${mesaj.gonderen_ad}: ${mesaj.icerik.substring(0, 40)}`, 'info');
```

**Düzeltme:** `escapeHtml()` fonksiyonu eklendi ve tüm bu alanlarda kullanılır hale getirildi.

---

### [SEV-003] KRİTİK — Google OAuth Sonrası localStorage Key Tutarsızlığı

**Dosya:** `giris.html` satır 657 (DÜZELTİLDİ)

**Açıklama:**  
Normal giriş/kayıt işlemi kullanıcı objesini `localStorage.setItem('user', ...)` ile kaydediyor. Ancak Google OAuth sonrası `finishLogin()` fonksiyonu `localStorage.setItem('kullanici', ...)` kullanıyordu. `api.js`'deki `getUser()` fonksiyonu `localStorage.getItem('user')` okuyor — yani Google ile giriş yapan kullanıcılar **dashboard'a hiç giremiyordu** (`requireAuth()` false dönüyordu).

**Risk:**  
Google OAuth ile giriş yapan kullanıcılar dashboard'da oturum açmış görünmüyor, tüm korumalı işlemler başarısız oluyor.

**Kod (öncesi):**
```js
// giris.html — finishLogin()
localStorage.setItem('kullanici', JSON.stringify(data.kullanici)); // YANLIŞ KEY
```

**Düzeltme:** `'kullanici'` → `'user'` olarak değiştirildi.

---

### [SEV-004] YÜKSEK — Ödeme Sayfasında Kart Verisi Client-Side İşleniyor

**Dosya:** `odeme.html` satır 434–459

**Açıklama:**  
Kart numarası, CVV, son kullanma tarihi ve kart adı doğrudan JavaScript değişkenlerine alınıp `fetch()` ile backend'e gönderiliyor. Bu veriler herhangi bir JavaScript hatası, tarayıcı eklentisi veya XSS saldırısı ile intercept edilebilir.

**Risk:**  
PCI DSS uyumsuzluğu. Kart bilgilerinin ortadaki adam saldırılarına maruz kalması.

**Not:** Backend sandbox modunda kart bilgilerini almıyor (simüle ediyor). Production'da iyzico 3D Secure formu gönderiyor — bu doğru yaklaşım. Ancak mevcut frontend kodu kart bilgilerini doğrudan backend'e POST ediyor; production'da da bu yol açık kalıyor.

**Düzeltme (önerilen):**  
Production modda `checkoutFormContent` (iyzico formu) kullanılmalı. Frontend hiçbir zaman ham kart numarasını backend'e göndermemeli — bunun yerine iyzico.js SDK ile tokenize edilmeli.

---

### [SEV-005] YÜKSEK — Varsayılan JWT Secret

**Dosya:** `backend/middleware/auth.js` satır 4, `backend/routes/auth.js` satır 10

**Açıklama:**  
Ortam değişkeni tanımlanmamışsa kod `'gizli_anahtar_degistir'` ve `'refresh_gizli_anahtar_degistir'` varsayılanlarını kullanıyor.

**Risk:**  
`.env` dosyası eksik olan herhangi bir deployment'ta saldırgan bu sabit secretları kullanarak geçerli JWT token üretebilir → tüm kullanıcı hesaplarına erişim.

**Kod:**
```js
const JWT_SECRET = process.env.JWT_SECRET || 'gizli_anahtar_degistir';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'refresh_gizli_anahtar_degistir';
```

**Düzeltme:**  
Varsayılan değer yerine süreç durdurulmalı:
```js
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) { console.error('HATA: JWT_SECRET ortam değişkeni zorunlu!'); process.exit(1); }
```

---

### [SEV-006] YÜKSEK — İlan Başlığı ve Kullanıcı Adları innerHTML'e Escape Edilmeden Yazılıyor

**Dosya:** `dashboard.js` satır 224, 240, 270, 501, 562–564, 602, 800, 818–819

**Açıklama:**  
`s.ilan_baslik`, `s.surucu_ad`, `s.musteri_ad`, `t.ilan_baslik`, `t.surucu_ad`, `s.diger_ad` gibi sunucudan gelen veriler template literal içinde `${...}` ile direkt HTML'e yazılıyor, escape edilmiyor.

**Risk:**  
Bir kullanıcı adını veya ilan başlığını `<script>alert(1)</script>` olarak kaydetirse — ya da XSS'i backend bypass ederek veritabanına yazarsa — tüm bu sayfalar etkilenir.

**Örnek:**
```js
// dashboard.js:270
`<div class="teklif-name">${t.surucu_ad}</div>`  // ESCAPE YOK
// dashboard.js:800
`<div class="chat-item-name">${s.diger_ad}</div>` // ESCAPE YOK
```

**Düzeltme:**  
Tüm API'den gelen kullanıcı kaynaklı string'ler için `escapeHtml()` kullanılmalı. (Fonksiyon dashboard.js'e eklendi — kalan alanlar için de uygulanmalı.)

---

### [SEV-007] YÜKSEK — Redirect Parametresi Doğrulanmıyor (Open Redirect)

**Dosya:** `giris.html` satır 514–515, `ilanlar.html` satır 417

**Açıklama:**  
URL'deki `?redirect=` parametresi doğrulanmadan `window.location.href` değeri olarak kullanılıyor.

**Risk:**  
Saldırgan `giris.html?redirect=https://evil.com` linki göndererek phishing saldırısı yapabilir.

**Kod:**
```js
// giris.html:514
const redirect = new URLSearchParams(window.location.search).get('redirect');
setTimeout(() => window.location.href = redirect || 'dashboard.html', 800);
```

**Düzeltme:**
```js
const redirect = new URLSearchParams(window.location.search).get('redirect');
// Sadece göreceli URL'lere izin ver
const safeRedirect = (redirect && redirect.startsWith('/') && !redirect.startsWith('//'))
  ? redirect : 'dashboard.html';
setTimeout(() => window.location.href = safeRedirect, 800);
```

---

### [SEV-008] ORTA — İyzico Callback'i CSRF Korumasız

**Dosya:** `backend/routes/odeme.js` satır 187

**Açıklama:**  
`POST /api/odeme/callback` endpoint'i authentication middleware olmadan açık. iyzico'nun token parametresi bir doğrulama mekanizması sağlasa da, bu endpoint'e sahte istek gönderilebilir.

**Risk:**  
Sahte callback ile sahte ödeme tamamlandı durumu oluşturulabilir (iyzico token doğrulaması bu riski azaltıyor ama tamamen kapatmıyor).

**Düzeltme:**  
iyzico'nun callback imza doğrulaması (`hashParams`) mutlaka uygulanmalı.

---

### [SEV-009] ORTA — Bildirim İçeriği innerHTML'e Yazılıyor

**Dosya:** `dashboard.js` satır 1011–1016

**Açıklama:**  
`b.baslik` ve `b.icerik` (sunucudan gelen bildirim verileri) escape edilmeden innerHTML içine yazılıyor.

**Kod:**
```js
list.innerHTML = bildirimler.map(b => `
  <div class="notif-item ${b.okundu ? '' : 'unread'}">
    <div class="notif-title">${b.baslik}</div>   // ESCAPE YOK
    <div class="notif-body">${b.icerik}</div>    // ESCAPE YOK
  </div>
`).join('');
```

**Düzeltme:** `escapeHtml(b.baslik)` ve `escapeHtml(b.icerik)` kullanılmalı.

---

### [SEV-010] ORTA — Content Security Policy (CSP) Header Yok

**Dosya:** `backend/server.js`

**Açıklama:**  
Herhangi bir Content-Security-Policy header tanımlı değil. XSS başarılı olursa tarayıcı hiçbir ek koruma sağlamıyor.

**Düzeltme:**  
`helmet` paketi ile temel CSP eklenebilir:
```js
const helmet = require('helmet');
app.use(helmet({ contentSecurityPolicy: {
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "https://accounts.google.com", "https://cdnjs.cloudflare.com"],
    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    imgSrc: ["'self'", "data:", "https:"],
  }
}}));
```

---

### [SEV-011] ORTA — Admin Demo Credentials Sunucu Logunda Görünüyor

**Dosya:** `backend/server.js` satır 104–106

**Açıklama:**  
Sunucu başlatılınca admin, müşteri ve sürücü demo şifreleri console'a yazdırılıyor.

**Risk:**  
Sunucu logları bir log aggregation servisine (Papertrail, DataDog, Railway logs) gönderiliyorsa kimlik bilgileri açığa çıkar.

**Kod:**
```js
console.log('   👤 Admin: admin@hafriyatcim.com / Admin123!');
console.log('   👤 Demo Müşteri: musteri@demo.com / Demo123!');
console.log('   👤 Demo Sürücü: surucu@demo.com / Demo123!');
```

**Düzeltme:** Bu satırları kaldırın ya da yalnızca `NODE_ENV !== 'production'` koşulunda gösterin.

---

### [SEV-012] DÜŞÜK — localStorage'da refreshToken Saklanıyor

**Dosya:** `api.js` satır 9, 54–55

**Açıklama:**  
Refresh token (7 gün geçerli) `localStorage`'da saklanıyor. XSS saldırısı başarılı olursa refresh token çalınabilir ve uzun süreli erişim sağlanabilir.

**Risk:** Refresh token çalındığında saldırgan 7 gün boyunca yeni access token üretebilir.

**Düzeltme (ideal):**  
Refresh token `HttpOnly; Secure; SameSite=Strict` cookie'de saklanmalı. Bu büyük bir mimari değişiklik gerektirir; kısa vadede XSS açıklarını kapatmak öncelikli.

---

### [SEV-013] DÜŞÜK — Rate Limiting Yok

**Dosya:** `backend/server.js`

**Açıklama:**  
`/api/auth/giris` endpoint'inde brute-force koruması yok. Saldırgan şifre deneme saldırısı yapabilir.

**Düzeltme:**  
```js
const rateLimit = require('express-rate-limit');
app.use('/api/auth/giris', rateLimit({ windowMs: 15*60*1000, max: 10 }));
```

---

### [SEV-014] DÜŞÜK — iyzico 3D Callback'ten Gelen checkoutFormContent DOM'a innerHTML ile Yazılıyor

**Dosya:** `odeme.html` satır 477–479

**Açıklama:**  
iyzico'dan dönen HTML içerik `document.body.innerHTML = data.checkoutFormContent` ile DOM'a yazılıyor. Bu iyzico'nun resmi entegrasyon yöntemi olmakla birlikte, response intercept edilirse zararlı HTML enjekte edilebilir.

**Risk:** HTTPS zorunlu tutulursa bu risk büyük ölçüde azalır.

**Düzeltme:**  
HTTPS enforce edilmeli; response iyzico imzasıyla doğrulanmalı.

---

## Hızlı Çözümler (10 dakikadan az)

1. ✅ **token → accessToken** — `odeme.html`, `ilan-detay.html`, `ilanlar.html` (DÜZELTİLDİ)
2. ✅ **escapeHtml** fonksiyonu ekle ve mesaj içeriklerini escape et — `dashboard.js` (DÜZELTİLDİ)
3. ✅ **Google OAuth localStorage key** — `'kullanici'` → `'user'` — `giris.html` (DÜZELTİLDİ)
4. **JWT_SECRET varsayılan kaldır** — `backend/middleware/auth.js`, `backend/routes/auth.js`
5. **Demo şifreleri log'dan kaldır** — `backend/server.js` satır 104–106
6. **Open Redirect düzelt** — `giris.html` redirect parametresi validasyonu

---

## Kritik Production Blokerlar

Bunlar production'a geçmeden önce mutlaka düzeltilmeli:

1. **JWT_SECRET/REFRESH_SECRET** ortam değişkeni boşsa uygulama başlamasın (process.exit)
2. **HTTPS zorunlu** — HTTP ile production trafiği kabul edilmemeli
3. **Rate limiting** — login endpoint'inde brute-force koruması
4. **İyzico kart verisi** — Frontend ham kart numarası backend'e göndermiyor olmalı (sadece sandbox dışı modda)
5. **CSP header** — helmet ile temel Content Security Policy

---

## Bu Audit'te Düzeltilen Sorunlar

| # | Dosya | Sorun | Durum |
|---|-------|-------|-------|
| SEV-001 | `odeme.html`, `ilan-detay.html`, `ilanlar.html` | `localStorage.getItem('token')` → `'accessToken'` | ✅ DÜZELTİLDİ |
| SEV-002 | `dashboard.js` | Mesaj innerHTML XSS — `escapeHtml()` eklendi | ✅ DÜZELTİLDİ |
| SEV-003 | `giris.html` | Google OAuth `'kullanici'` key → `'user'` key | ✅ DÜZELTİLDİ |
| — | `dashboard.js` | Socket toast'ta `gonderen_ad` escape edilmedi | ✅ DÜZELTİLDİ |
| — | `dashboard.js` | Socket connect/disconnect log kaldırıldı | ✅ DÜZELTİLDİ |

**Toplam 5 değişiklik 4 dosyada yapıldı.**
