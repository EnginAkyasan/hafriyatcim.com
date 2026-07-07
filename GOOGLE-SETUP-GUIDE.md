# Google OAuth Client ID Kurulum Kılavuzu

## Neden Gerekli?
"Google ile Giriş" butonu çalışmak için Google Cloud Console'dan bir Client ID gerektirir.

## Adımlar (15 dakika)

### 1. Google Cloud Console'a Git
https://console.cloud.google.com/

### 2. Proje Oluştur
- Sağ üstte proje seçici → "Yeni Proje"
- Proje adı: `hafriyatcim`
- Oluştur'a tıkla

### 3. OAuth Onay Ekranı Ayarla
- Sol menü → "APIs & Services" → "OAuth consent screen"
- User Type: **External** seç → Oluştur
- App name: `hafriyatcim.com`
- User support email: kendi e-postanı gir
- Developer contact: kendi e-postanı gir
- Kaydet ve Devam Et (3 kez)

### 4. Client ID Oluştur
- Sol menü → "APIs & Services" → "Credentials"
- "+ CREATE CREDENTIALS" → "OAuth 2.0 Client ID"
- Application type: **Web application**
- Name: `hafriyatcim Web`
- Authorized JavaScript origins:
  - `http://localhost:5050` (geliştirme)
  - `https://hafriyatcim.com` (production — alan adın hazırsa)
- Oluştur'a tıkla

### 5. Client ID'yi Kopyala
Örnek format: `123456789-abcdefg.apps.googleusercontent.com`

### 6. Projeye Ekle

**backend/.env dosyasına:**
```
GOOGLE_CLIENT_ID=123456789-abcdefg.apps.googleusercontent.com
```

**giris.html dosyasında (satır ~633):**
```js
const GOOGLE_CLIENT_ID = '123456789-abcdefg.apps.googleusercontent.com';
```

### 7. Sunucuyu Yeniden Başlat
```bash
node backend/server.js
```

### Test
- http://localhost:5050/giris.html aç
- "Google ile Devam Et" butonuna tıkla
- Google hesabı seç → Dashboard'a yönlenmeli

## Sorun Giderme
- **"redirect_uri_mismatch"**: Authorized origins'e localhost:5050 ekledinizden emin olun
- **"invalid_client"**: Client ID'yi doğru kopyaladığınızdan emin olun
- **Production**: Alan adınızı Authorized origins'e eklemeyi unutmayın
