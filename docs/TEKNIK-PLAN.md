# hafriyatcim.com — Teknik Plan

Tarih: 2026-10-03 · Durum: Taslak, tartışmaya açık · Sahibi: Engin

Bu doküman repodaki 10 adet birbiriyle çelişen strateji dosyasının yerine geçen **tek teknik referanstır**.
Kararlar burada; değişirse burası güncellenir. Diğer .md dosyaları `docs/arsiv/` altına taşınacak.

---

## 1. Amaç ve sınırlar

**Ürün:** İş sahibi (şantiye/müteahhit) ilan açar, araç sahibi (tırcı/kepçeci) teklif verir, iş sahibi birini seçer.
Platform taşıma ücretine karışmaz; eşleşme anında **her iki taraftan sabit ücret** alır ve karşılığında
**iletişim bilgisini açar**. Sattığımız şey telefon numarasıdır.

**Teknik hedef (6 ay):** Tek kişinin (AI destekli) işletebileceği, veri kaybetmeyen, ödeme alabilen,
ilk 500 kullanıcıyı taşıyan bir sistem. Ölçek problemi değil, güven ve doğruluk problemi çözüyoruz.

**Yapmayacaklarımız (bu dönem):**
- Mobil uygulama (Flutter/React Native). PWA yeter.
- Redis, kuyruk, mikroservis, Kubernetes, PostGIS. Tek Node süreci + Postgres yeter.
- Frontend framework'e geçiş (React/Next). Mevcut HTML'i temizleyip tutuyoruz.
- Yeni tasarım dili ("glassmorphism" vb). Çalışan akış > güzel akış.
- Canlı konum takibi, sohbet, harita. İlk 100 müşteri bunları istemedi, biz uydurduk.

---

## 2. Mevcut durum (özet)

| Alan | Durum |
|---|---|
| Backend | Express, 53 endpoint, 10 route dosyası, ~4.000 satır. Çalışıyor. |
| Veritabanı | NeDB (dosya). Railway'de **her deploy'da siliniyor**. En büyük teknik risk. |
| Auth | İki sistem yan yana: kendi JWT + Supabase. Şifre iki yerde tutuluyor. |
| Ödeme | iyzico resmi SDK, hosted checkout (bugün geçildi). Canlıda henüz test edilmedi. |
| Frontend | 26 HTML + 10 JS, vanilla. 114 adet `innerHTML`, çoğu kaçışsız. 4 ölü JS dosyası. |
| Dashboard | 3 ayrı panel; firma ve müşteri panelleri var olmayan endpoint'leri çağırıyor. |
| Test | Yok. CI yok. |
| Gözlemlenebilirlik | `console.log`. Hata takibi yok. |

Bugün kapatılanlar: static kök sızıntısı, supabase-bridge auth bypass, telefon sızıntısı,
ücretsiz kabul yolu, demo ödeme endpoint'i, elle yazılmış iyzico imzası, sabit admin şifresi.

---

## 3. Mimari kararlar

Her karar: **ne**, **neden**, **neyi reddettik**.

### K1. Veritabanı: PostgreSQL (Railway eklentisi) + Knex
- **Neden:** Veri kaybı kabul edilemez. Postgres sıkıcı, ucuz, yedeklenebilir. Knex ile migration disiplini gelir, ORM büyüsü gelmez.
- **Reddedilen:** NeDB (ephemeral), SQLite (Railway diskinde aynı sorun), Prisma (TS yok, ek araç zinciri), Supabase Postgres (auth kararına bağımlı hale getirir).
- **Not:** Supabase projesi yalnızca ileride dosya depolama için düşünülebilir; şimdilik kullanılmıyor.

### K2. Kimlik: Tek sistem, kendi JWT'miz. Birincil giriş **telefon + SMS OTP**.
- **Neden:** Hedef kitle tırcı. E-posta/şifre onlar için engel; telefon zaten zorunlu alan (SMS ile numara paylaşıyoruz). Google girişi firmalar için ikinci seçenek olarak kalır (mevcut `google-auth.js`).
- **Reddedilen:** Supabase Auth (ikinci şifre deposu, NetGSM için hook gerekiyor, iki sistemin bakımı). Supabase köprüsü ve `supabase.js` kaldırılır.
- **Sonuç:** `users.telefon` benzersiz ve doğrulanmış; şifre alanı opsiyonel (yalnızca admin/eski kullanıcılar).

### K3. Ödeme: iyzico hosted checkout, kart bilgisi asla bizde değil.
- Bugün yapıldı. Kalan: sandbox'ta gerçek uçtan uca test, callback'in `FRONTEND_URL` ile doğru dönmesi, iade endpoint'i.
- Ücret ve KDV ortam değişkeni. **İş kararı bekleyen:** %26 → %20 (toplam 252 → 240 ₺) düzeltilecek mi?

### K4. Frontend: Vanilla kalır, ama tek ortak çekirdek.
- `public/js/core.js`: API istemcisi, auth durumu, `esc()` kaçış fonksiyonu, toast, tarih/para formatı. Her sayfa bunu yükler; sayfa içi kopya kod silinir.
- Tüm `innerHTML` çıktıları `esc()` üzerinden geçer veya `textContent` kullanır. Bu bir seferlik temizlik, yeni kod için kural.
- Rol başına tek panel: `panel-musteri.html`, `panel-surucu.html`, `panel-admin.html`. Ölü dosyalar silinir.

### K5. Sürüm kalitesi: test + CI zorunlu.
- `vitest` + `supertest` ile kritik akış testleri (aşağıda liste). GitHub Actions her PR'da çalıştırır.
- "Test yoksa merge yok" kuralı yalnızca para ve yetki akışlarında katı; UI için değil.

### K6. Gözlemlenebilirlik: pino + Sentry (ücretsiz katman) + Railway logları.
- Her istekte `request_id`; hata loglarında kullanıcı id'si var, telefon/şifre yok.
- `/api/health` DB'ye de dokunur (`SELECT 1`).

### K7. Bildirim: SMS (NetGSM) ana kanal, WhatsApp yalnızca `wa.me` linki.
- WhatsApp Business API başvurusu, doğrulama ve maliyet bu dönem için fazla. SMS zaten entegre.

---

## 4. Veri modeli (Postgres)

Kısıtlar veritabanında, uygulamada değil. Tablolar ve kritik kurallar:

```
users          id, telefon UNIQUE NOT NULL, telefon_dogrulandi bool, email UNIQUE NULL,
               ad, rol ENUM(MUSTERI,SURUCU,ADMIN), aktif, sifre_hash NULL,
               google_id NULL, rating NUMERIC, rating_count INT, created_at, updated_at

listings       id, user_id FK, ilan_tipi, arac_tipi, yuk_turu, il, ilce, konum_dan, konum_a,
               miktar, birim, fiyat NULL, aciklama, fotograflar JSONB, durum ENUM(AKTIF,KAPALI,IPTAL),
               created_at  — INDEX (durum, created_at DESC), (user_id)

offers         id, listing_id FK, surucu_id FK, fiyat, mesaj, durum ENUM(BEKLIYOR,KABUL,RED),
               created_at  — UNIQUE (listing_id, surucu_id)

orders         id, listing_id FK UNIQUE, offer_id FK UNIQUE, musteri_id, surucu_id,
               durum ENUM(BEKLIYOR_SURUCU,AKTIF,TESLIM_EDILDI,TAMAMLANDI,IPTAL),
               musteri_odeme ENUM(BEKLIYOR,ODENDI,IADE), surucu_odeme ENUM(...),
               iletisim_acildi bool DEFAULT false, created_at
               — CHECK: iletisim_acildi = true yalnızca iki ödeme de ODENDI iken (trigger)

payments       id, order_id FK, user_id FK, tip ENUM(MUSTERI,SURUCU), conversation_id UNIQUE,
               iyzico_payment_id NULL, tutar, durum ENUM(BEKLIYOR,ISLENIYOR,BASARILI,BASARISIZ,IADE),
               ham_yanit JSONB, created_at, updated_at

otp_codes      id, telefon, kod_hash, amac ENUM(GIRIS,SIFRE), deneme INT, expires_at, used_at NULL
refresh_tokens id, user_id FK, token_hash UNIQUE, expires_at, revoked_at NULL
notifications  id, user_id FK, turu, baslik, icerik, okundu, ilgili_id, created_at
ratings        id, order_id FK, veren_id, alan_id, puan CHECK 1..5, yorum, created_at
               — UNIQUE (order_id, veren_id)
```

`messages` ve `locations` tabloları bu dönem **taşınmıyor**; mesajlaşma ve canlı takip askıda (bkz. §1).

---

## 5. Fazlar

Süreler tek kişi + AI için kaba tahmindir. Her faz sonunda deploy edilebilir bir sistem vardır.

### Faz 0 — Güvenlik tabanı ✅ (bugün)
Tamamlandı, `claude/amazing-clarke-aqc2ow` dalında. Kalan: Railway env değişkenleri, eski dosyaların silinmesi, iyzico sandbox testi.

### Faz 1 — Veri kaybetmeyen üretim (1 hafta)
Çıkış kriteri: Deploy sonrası kullanıcılar yerinde duruyor; bir hata olduğunda nerede olduğunu görüyoruz.

1. Railway Postgres eklentisi; `knex` + ilk migration (§4 şeması, `messages`/`locations` hariç).
2. `backend/db/database.js` arayüzünü koruyarak altını Knex'e çevir (`findOne/find/insert/update/count` → sorgu). Route'lar değişmez. Sonra route'lar yavaş yavaş doğrudan Knex'e geçer.
3. NeDB → Postgres tek seferlik aktarım scripti (varsa canlı veri için).
4. pino logger, request id, Sentry. `/api/health` DB kontrolü.
5. `vitest` + `supertest`; CI. İlk testler (her biri bugün elle doğrulananların otomatik hali):
   - static: `/backend/db/users.db` → 404
   - `supabase-bridge` yerine (Faz 2'de silinecek) → şimdilik 503 testi
   - teklif → müşteri ödemesi → telefon gizli → sürücü ödemesi → telefon açık → 3. kişi 403
   - `PUT /teklifler/:id/kabul` → 404, `/bildirimler/odeme/*` → 404
   - admin seed: env yoksa admin yok; env varsa tek sefer oluşur
6. Ölü dosyaları sil: `server.js` (kök), loglar, `.bat`, logo varyantları, `auth.js`, `script.js`, `trucks.js`, `ilan.js`, `sw.js`.
7. Dokümanları `docs/arsiv/` altına taşı; README'yi bu plana ve `.env.example`'a bağla.

### Faz 2 — Tek kimlik, gerçek OTP (1–2 hafta)
Çıkış kriteri: Bir tırcı sadece telefon numarasıyla 30 saniyede kayıt olup teklif verebiliyor.

1. `POST /api/auth/otp/gonder` (telefon) → NetGSM ile 6 haneli kod; `otp_codes` tablosu; dakikada 1, günde 5 limit; kod `crypto.randomInt`, hash'li saklanır, 3 yanlışta iptal.
2. `POST /api/auth/otp/dogrula` (telefon, kod, rol?) → kullanıcı yoksa oluştur, JWT + refresh döner. Refresh token hash'li saklanır, rotasyon korunur.
3. Google girişi mevcut route ile kalır; e-posta ile giriş yalnızca `sifre_hash` olanlar için (admin).
4. Supabase tamamen kaldırılır: `supabase-bridge`, `supabase.js`, `giris.html` içindeki sessiz Supabase senkronu, CDN script'i.
5. `giris.html` yeniden: telefon → kod → rol seçimi (ilk kez) → panel. Üç ekran, başka bir şey yok.
6. Şifre sıfırlama akışı silinir (şifre yok). Admin için `ADMIN_PASSWORD` + e-posta kalır.
7. Refresh token `HttpOnly` cookie'ye taşınır; access token bellekte. `localStorage` yalnızca kullanıcı adı/rol için.

### Faz 3 — İlk 100 kullanıcının gerçekten kullanabildiği ürün (2–3 hafta)
Çıkış kriteri: Müşteri paneli ve sürücü paneli backend'le %100 uyumlu; iyzico sandbox'ta iki taraflı ödeme akışı tamamlanıyor.

1. `public/js/core.js`; her sayfadaki kopya `API_BASE`, fetch, toast kodu kaldırılır.
2. XSS temizliği: 114 `innerHTML` noktası gözden geçirilir; kullanıcı verisi `esc()` ile. CSP açılır (`script-src 'self'` + Google), inline script'ler dosyaya taşınır.
3. Paneller: `panel-musteri` ve `panel-surucu` backend'in gerçek endpoint'lerine bağlanır; var olmayan `/durum` çağrıları silinir; `FIRMA` rolü ve uydurma alan adları temizlenir. Admin paneli `dashboard.js`'den ayrılır.
4. İlan yaşam döngüsü: açık → teklif → ödeme → aktif → teslim → tamamlandı/iptal. İptal ve iade kuralı: sürücü ödemeden önce müşteri iptal ederse müşteri ücreti iade (iyzico refund endpoint'i), sonrası iade yok. Bu kural ürün sayfasında yazar.
5. Bildirimler: her durum geçişinde SMS şablonu + panel bildirimi. SMS şablonları tek dosyada, test edilebilir.
6. Fotoğraf yükleme: base64 yerine `multer` + boyut/tür sınırı (jpeg/png/webp, 5 MB, 6 adet); SVG yasak; dosyalar Railway volume veya S3 uyumlu depoya.
7. Puanlama: yalnızca TAMAMLANDI siparişte, taraf başına bir kez (DB UNIQUE).
8. KVKK/gizlilik/iade sayfaları footer'a bağlanır; gizlilik metni kart verisi iddiasıyla uyumlu hale getirilir.
9. iyzico sandbox uçtan uca test kaydı (`docs/test-raporu-odeme.md`), sonra canlı anahtar.

### Faz 4 — Büyüme hazırlığı (ihtiyaç doğduğunda)
Sıralama yok; metrik tetikler.
- PWA (manifest + offline kabuk) — mobil trafik %60'ı geçince.
- İl/ilçe bazlı arama indeksleri, basit mesafe hesabı — ilan sayısı 1.000'i geçince.
- WhatsApp Business API — SMS maliyeti aylık 2.000 ₺'yi geçince.
- Mesajlaşma ve canlı takip — kullanıcılar sorarsa.
- Veritabanı read replica, Redis — asla, ta ki `EXPLAIN` bize aksini söyleyene kadar.

---

## 6. Çalışma kuralları

- **Branch:** `main` korumalı; her iş PR; CI yeşil + bir göz (AI review kabul).
- **Deploy:** `main`'e merge = Railway otomatik deploy. Migration'lar deploy öncesi `knex migrate:latest` ile (Railway "pre-deploy command").
- **Sırlar:** yalnızca Railway Variables. Repoda `.env` yok; `.env.example` güncel tutulur.
- **Her PR'da üç soru:** Bu değişiklik neyi dışarı açıyor? Neye güveniyor? Para veya telefon akışına dokunuyor mu? Üçüncüsü evetse test şart.
- **Dokümantasyon:** Karar değişirse bu dosya değişir. Yeni strateji .md'si açılmaz.

---

## 7. Açık kararlar (senin vermen gerekenler)

| # | Karar | Seçenekler | Önerim |
|---|---|---|---|
| 1 | KDV oranı | %26 (mevcut) / %20 (yasal) | %20, toplam 240 ₺ |
| 2 | İade kuralı | iade yok / sürücü ödemeden önce iade | sürücü ödemeden önce iade |
| 3 | Google girişi | kalsın / kaldır | kalsın, yalnızca MUSTERI için |
| 4 | Mesajlaşma | şimdi / askıya al | askıya al |
| 5 | Dosya deposu | Railway volume / Cloudflare R2 | R2 (ücretsiz 10 GB, S3 uyumlu) |

---

## 8. Riskler

- **iyzico onayı:** Canlı anahtar için şirket evrakları ve site uyum kontrolü gerekir; 1–3 hafta sürebilir. Faz 2'de başvurulmalı.
- **NetGSM başlık onayı:** "HAFRIYAT" gönderici adı için belge gerekir; OTP akışı buna bağlı.
- **Tek kişi riski:** Plan tek geliştiriciye göre. Ödeme ve auth kodunu AI ile yazarken her PR'da §6'daki üç soru atlanmamalı.
- **Veri aktarımı:** Canlıda gerçek kullanıcı varsa NeDB → Postgres geçişi deploy öncesi script ile yapılmalı; yoksa sıfırdan başlanır.
