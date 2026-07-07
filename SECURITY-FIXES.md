# Güvenlik Düzeltmeleri — hafriyatcim.com Backend

**Tarih:** 2026-06-21  
**Ortam:** Node.js + Express + NeDB + JWT

---

## FIX 1: Helmet (HTTP Güvenlik Başlıkları)

**Dosya:** `backend/server.js`  
**Paket:** `helmet@^7.2.0`

### Ne Yapıldı
- `helmet` paketi yüklendi ve middleware olarak CORS'tan önce eklendi.
- `contentSecurityPolicy: false` — Frontend'de inline CSS/JS bulunduğundan şimdilik devre dışı.
- `crossOriginEmbedderPolicy: false` — Socket.IO uyumluluğu için devre dışı.

### Eklenen Başlıklar (Otomatik)
- `X-DNS-Prefetch-Control`
- `X-Frame-Options: SAMEORIGIN` (clickjacking koruması)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy`
- `X-XSS-Protection`
- `Strict-Transport-Security` (HSTS)

### Test
```bash
curl -I http://localhost:5000/api/health
# X-Frame-Options: SAMEORIGIN görünmeli
# X-Content-Type-Options: nosniff görünmeli
```

### Kalan Risk
- `contentSecurityPolicy` kapalı. Frontend refactor sonrası açılmalı.

---

## FIX 2: Rate Limiting — Login Endpoint

**Dosya:** `backend/routes/auth.js`  
**Paket:** `express-rate-limit@^7.5.1`

### Ne Yapıldı
- `loginLimiter` middleware'i oluşturuldu: 15 dakikada max 10 deneme.
- `/api/auth/giris` route'una uygulandı.
- Aşıldığında `{ hata: 'Çok fazla giriş denemesi. 15 dakika bekleyin.' }` döner.
- `standardHeaders: true` — `RateLimit-*` header'ları aktif.

### Test
```bash
# 11 kez art arda login dene:
for i in {1..11}; do
  curl -s -X POST http://localhost:5000/api/auth/giris \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","sifre":"yanlis"}' | jq .
done
# 11. istekte 429 Too Many Requests dönmeli
```

### Kalan Risk
- `/api/auth/kayit` endpoint'ine rate limit eklenmedi. Spam kayıt saldırısına açık.
- Redis tabanlı store kullanılmıyor; sunucu restart'ta sayaç sıfırlanır.

---

## FIX 3: JWT_SECRET Zorunluluk Kontrolü

**Dosya:** `backend/server.js`

### Ne Yapıldı
- Sunucu başlamadan önce `JWT_SECRET` kontrol edilir.
- Tanımlanmamış veya varsayılan `'gizli_anahtar_degistir'` değerindeyse `process.exit(1)` ile kapanır.
- Bu sayede yanlış konfigürasyonla production'a çıkış engellenir.

### Test
```bash
# .env'den JWT_SECRET'i geçici olarak kaldır veya varsayılana döndür:
JWT_SECRET=gizli_anahtar_degistir node server.js
# "HATA: JWT_SECRET ..." yazıp process 1 koduyla çıkmalı
```

### Kalan Risk
- `REFRESH_SECRET` de `'refresh_gizli_anahtar_degistir'` varsayılanıyla `routes/auth.js`'de tanımlı.
  Aynı kontrol REFRESH_SECRET için de uygulanmalı.

---

## FIX 4: Demo Şifrelerini console.log'dan Kaldır

**Dosya:** `backend/server.js`

### Ne Yapıldı
- Admin, demo müşteri ve demo sürücü şifreleri artık yalnızca `NODE_ENV !== 'production'` durumunda loglanır.
- Production sunucusunda (Railway vb.) bu bilgiler konsola yazılmaz.

### Test
```bash
NODE_ENV=production node server.js
# Konsolda "Admin123!", "Demo123!" görünmemeli

NODE_ENV=development node server.js
# Geliştirme modunda görünmeli
```

### Kalan Risk
- Demo hesaplar veritabanında hâlâ mevcut. Production'da demo hesapları silmek veya devre dışı bırakmak gerekir.

---

## FIX 5: npm install

**Komut:** `npm install helmet express-rate-limit`  
**Sonuç:** 2 paket eklendi, toplam 184 paket denetlendi.

### npm audit Uyarısı
`npm audit` 11 güvenlik açığı bildirdi (1 moderate, 7 high, 3 critical).  
Bu açıklar büyük olasılıkla `nedb` veya eski bağımlılıklardan kaynaklanmaktadır.

```bash
cd backend && npm audit
# Hangi paketlerin etkilendiğini gör
npm audit fix
# Breaking change olmayan fix'leri otomatik uygula
```

---

## Kalan Riskler (Öncelik Sırası)

| # | Risk | Öneri |
|---|------|-------|
| 1 | `REFRESH_SECRET` varsayılan değer kontrolü yok | `server.js`'e aynı check ekle |
| 2 | `/api/auth/kayit` rate limit yok | `kayitLimiter` ekle (saatte 5 kayıt) |
| 3 | `npm audit` 11 açık | `npm audit fix` çalıştır, `nedb`'yi değerlendirin |
| 4 | `contentSecurityPolicy` kapalı | Frontend inline script/style'ları temizleyip CSP aç |
| 5 | Production'da demo hesaplar aktif | DB'de demo kullanıcıları `aktif: false` yap |
| 6 | Rate limiter in-memory | Redis store ekle (pm2 cluster/multi-instance için) |
| 7 | HTTPS enforced değil | Helmet HSTS aktif ama reverse proxy arkasında `trust proxy` ayarlanmalı |
