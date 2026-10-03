# hafriyatcim.com — Railway Deploy Kılavuzu

## Ön Gereksinimler
- Railway hesabı: https://railway.app
- GitHub hesabı (kodu push etmek için)
- Git kurulu

## Adım 1: GitHub'a Yükle

```bash
git init
git add .
git commit -m "feat: hafriyatcim.com ilk versiyon"
git branch -M main
git remote add origin https://github.com/KULLANICI_ADI/hafriyatcim.git
git push -u origin main
```

## Adım 2: Railway'e Deploy

1. https://railway.app adresine git, GitHub ile giriş yap
2. "New Project" → "Deploy from GitHub repo"
3. hafriyatcim repo'sunu seç
4. Railway otomatik build başlar (~2 dakika)

## Adım 3: Environment Variables Ekle

Railway Dashboard → Proje → Variables sekmesi:

Zorunlu değişkenler (tam liste ve açıklamalar için `backend/.env.example`):
- JWT_SECRET (en az 32 karakter rastgele string; yoksa sunucu açılmaz)
- REFRESH_SECRET (farklı, en az 32 karakter; yoksa sunucu açılmaz)
- NODE_ENV=production
- FRONTEND_URL=https://[railway-domain].railway.app (iyzico callback bu adrese döner)
- ADMIN_EMAIL + ADMIN_PASSWORD (ilk açılışta admin hesabı oluşturulur; kodda sabit admin yoktur)
- IYZICO_API_KEY + IYZICO_SECRET_KEY + IYZICO_BASE_URL (production'da ödeme için zorunlu; yoksa ödeme 503 döner)
- SUPABASE_URL + SUPABASE_ANON_KEY (Google ile giriş köprüsü için; yoksa o akış 503 döner)

## Adım 4: Domain Ayarla

Railway Dashboard → Settings → Domains:
- "Generate Domain" ile otomatik domain al
- Veya özel domain ekle (CNAME kaydı)

## Adım 5: Kontrol Et

- https://[domain]/api/health → {"status":"ok"} dönmeli
- https://[domain]/backend/db/users.db → 404 dönmeli (yalnızca `public/` servis edilir)
- https://[domain]/ → Ana sayfa açılmalı
- https://[domain]/giris.html → Kayıt/giriş çalışmalı

## Önemli Notlar

### NeDB → Production
NeDB dosya tabanlı veritabanı Railway'de çalışır AMA:
- Her deploy'da veriler SİLİNİR (ephemeral storage)
- Production için Railway Postgres eklentisi önerilir
- Şimdilik demo/MVP için NeDB yeterli

### Railway Postgres'e Geçiş (İleride)
1. Railway Dashboard → "Add Plugin" → PostgreSQL
2. DATABASE_URL environment variable otomatik eklenir
3. NeDB yerine pg/knex kullanacak şekilde database.js güncellenir

## Hızlı Komutlar

```bash
# Local çalıştır
node backend/server.js

# Logları izle (Railway CLI)
railway logs

# Deploy durumu
railway status
```
