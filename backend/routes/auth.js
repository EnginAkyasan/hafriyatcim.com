const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// ─── Rate Limiter: Login ──────────────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: process.env.NODE_ENV === 'production' ? 10 : 1000, // localhost'ta limit yok
  skip: (req) => req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1',
  message: { hata: 'Çok fazla giriş denemesi. 15 dakika bekleyin.' },
  standardHeaders: true,
  legacyHeaders: false,
});


const JWT_SECRET = process.env.JWT_SECRET || 'gizli_anahtar_degistir';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'refresh_gizli_anahtar_degistir';
const REFRESH_EXPIRES_IN = process.env.REFRESH_EXPIRES_IN || '7d';

const generateTokens = (user) => {
  const payload = { id: user.id, email: user.email, rol: user.rol };
  const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  const refreshToken = jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES_IN });
  return { accessToken, refreshToken };
};

// POST /api/auth/kayit - Kayıt ol
router.post('/kayit', async (req, res) => {
  try {
    const { ad, email, telefon, sifre, rol } = req.body;

    if (!ad || !email || !sifre || !rol) {
      return res.status(400).json({ hata: 'Ad, email, şifre ve rol zorunludur.' });
    }

    const gecerliRoller = ['MUSTERI', 'SURUCU'];
    if (!gecerliRoller.includes(rol)) {
      return res.status(400).json({ hata: 'Geçersiz rol. MUSTERI veya SURUCU olmalıdır.' });
    }

    const mevcutKullanici = await db.findOne('users', { email });
    if (mevcutKullanici) {
      return res.status(409).json({ hata: 'Bu e-posta adresi zaten kullanılmaktadır.' });
    }

    const sifreHash = await bcrypt.hash(sifre, 12);
    const now = new Date().toISOString();

    const yeniKullanici = await db.insert('users', {
      id: uuidv4(),
      ad,
      email,
      telefon: telefon || null,
      sifre: sifreHash,
      rol,
      aktif: true,
      created_at: now,
      updated_at: now,
    });

    const { accessToken, refreshToken } = generateTokens(yeniKullanici);

    // Refresh token'ı kaydet
    await db.insert('refresh_tokens', {
      id: uuidv4(),
      token: refreshToken,
      user_id: yeniKullanici.id,
      created_at: now,
    });

    const { sifre: _, ...kullaniciVerisi } = yeniKullanici;

    res.status(201).json({
      mesaj: 'Kayıt başarılı.',
      kullanici: kullaniciVerisi,
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error('Kayıt hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

// POST /api/auth/giris - Giriş yap
router.post('/giris', loginLimiter, async (req, res) => {
  try {
    const { email, sifre } = req.body;

    if (!email || !sifre) {
      return res.status(400).json({ hata: 'E-posta ve şifre zorunludur.' });
    }

    const kullanici = await db.findOne('users', { email });
    if (!kullanici) {
      return res.status(401).json({ hata: 'E-posta veya şifre hatalı.' });
    }

    if (!kullanici.aktif) {
      return res.status(403).json({ hata: 'Hesabınız devre dışı bırakılmıştır.' });
    }

    const sifreEslesme = kullanici.sifre ? await bcrypt.compare(sifre, kullanici.sifre) : false;
    if (!sifreEslesme) {
      return res.status(401).json({ hata: 'E-posta veya şifre hatalı.' });
    }

    const { accessToken, refreshToken } = generateTokens(kullanici);

    const now = new Date().toISOString();
    await db.insert('refresh_tokens', {
      id: uuidv4(),
      token: refreshToken,
      user_id: kullanici.id,
      created_at: now,
    });

    const { sifre: _, ...kullaniciVerisi } = kullanici;

    res.json({
      mesaj: 'Giriş başarılı.',
      kullanici: kullaniciVerisi,
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error('Giriş hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

// POST /api/auth/refresh - Token yenile
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ hata: 'Refresh token zorunludur.' });
    }

    // DB'de token var mı kontrol et
    const kayitliToken = await db.findOne('refresh_tokens', { token: refreshToken });
    if (!kayitliToken) {
      return res.status(401).json({ hata: 'Geçersiz refresh token.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, REFRESH_SECRET);
    } catch (err) {
      // Geçersiz/süresi dolmuş token'ı sil
      await db.remove('refresh_tokens', { token: refreshToken }, {});
      return res.status(401).json({ hata: 'Refresh token geçersiz veya süresi dolmuş.' });
    }

    const kullanici = await db.findOne('users', { id: decoded.id });
    if (!kullanici || !kullanici.aktif) {
      return res.status(401).json({ hata: 'Kullanıcı bulunamadı veya devre dışı.' });
    }

    // Eski token'ı sil, yeni token oluştur (rotation)
    await db.remove('refresh_tokens', { token: refreshToken }, {});

    const { accessToken, refreshToken: yeniRefreshToken } = generateTokens(kullanici);

    const now = new Date().toISOString();
    await db.insert('refresh_tokens', {
      id: uuidv4(),
      token: yeniRefreshToken,
      user_id: kullanici.id,
      created_at: now,
    });

    res.json({ accessToken, refreshToken: yeniRefreshToken });
  } catch (err) {
    console.error('Refresh hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

// POST /api/auth/cikis - Çıkış yap
router.post('/cikis', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      await db.remove('refresh_tokens', { token: refreshToken }, {});
    }

    res.json({ mesaj: 'Çıkış başarılı.' });
  } catch (err) {
    console.error('Çıkış hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

// GET /api/auth/me (alias for /ben)
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const kullanici = await db.findOne('users', { id: req.user.id });
    if (!kullanici) return res.status(404).json({ hata: 'Kullanıcı bulunamadı.' });
    const { sifre: _, ...kullaniciVerisi } = kullanici;
    res.json({ kullanici: kullaniciVerisi });
  } catch (err) {
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

// GET /api/auth/ben - Mevcut kullanıcı bilgisi
router.get('/ben', authMiddleware, async (req, res) => {
  try {
    const { sifre: _, ...kullaniciVerisi } = req.user;
    res.json({ kullanici: kullaniciVerisi });
  } catch (err) {
    console.error('Ben hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

// PUT /api/auth/profil — Profil güncelle
router.put('/profil', authMiddleware, async (req, res) => {
  try {
    const { ad, email, arac_turu, plaka, kapasite } = req.body;
    const updateData = {};

    if (ad) updateData.ad = ad.trim();
    if (email) {
      const mevcutEmail = await db.findOne('users', { email, id: { $ne: req.user.id } });
      if (mevcutEmail) return res.status(409).json({ hata: 'Bu e-posta zaten kullanılıyor.' });
      updateData.email = email.trim();
    }

    // Sürücü araç bilgileri
    if (req.user.rol === 'SURUCU' || req.user.rol === 'ADMIN') {
      if (arac_turu !== undefined) updateData.arac_turu = arac_turu;
      if (plaka !== undefined) updateData.plaka = plaka.toUpperCase();
      if (kapasite !== undefined) updateData.kapasite = parseFloat(kapasite) || null;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ hata: 'Güncellenecek alan bulunamadı.' });
    }

    await db.update('users', { id: req.user.id }, { $set: updateData });
    const guncel = await db.findOne('users', { id: req.user.id });
    const { sifre: _, ...kullaniciVerisi } = guncel;

    res.json({ mesaj: 'Profil güncellendi.', kullanici: kullaniciVerisi });
  } catch (err) {
    console.error('Profil güncelleme hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

// POST /api/auth/sifre-sifirla-talep — OTP üret ve kaydet
router.post('/sifre-sifirla-talep', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ hata: 'E-posta zorunludur.' });

    const kullanici = await db.findOne('users', { email });
    if (!kullanici) {
      // Güvenlik: e-posta var mı yok mu söyleme
      return res.json({ mesaj: 'Eğer bu e-posta kayıtlıysa sıfırlama kodu gönderildi.' });
    }

    // 6 haneli OTP üret
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiry = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 dk geçerli

    await db.update('users', { id: kullanici.id }, {
      $set: { sifre_reset_otp: otp, sifre_reset_expiry: expiry }
    });

    // Production'da SMS/mail burada gönderilir
    console.log(`\n🔑 [ŞİFRE SIFIRLA] ${email} → OTP: ${otp} (15 dk geçerli)\n`);

    res.json({ mesaj: 'Eğer bu e-posta kayıtlıysa sıfırlama kodu gönderildi.' });
  } catch (err) {
    console.error('Şifre sıfırlama talep hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

// POST /api/auth/sifre-sifirla — OTP doğrula ve şifreyi güncelle
router.post('/sifre-sifirla', async (req, res) => {
  try {
    const { email, otp, yeniSifre } = req.body;
    if (!email || !otp || !yeniSifre) {
      return res.status(400).json({ hata: 'E-posta, OTP kodu ve yeni şifre zorunludur.' });
    }

    if (yeniSifre.length < 6) {
      return res.status(400).json({ hata: 'Yeni şifre en az 6 karakter olmalıdır.' });
    }

    const kullanici = await db.findOne('users', { email });
    if (!kullanici) {
      return res.status(400).json({ hata: 'Geçersiz e-posta veya OTP kodu.' });
    }

    if (!kullanici.sifre_reset_otp || kullanici.sifre_reset_otp !== otp) {
      return res.status(400).json({ hata: 'Geçersiz OTP kodu.' });
    }

    if (!kullanici.sifre_reset_expiry || new Date(kullanici.sifre_reset_expiry) < new Date()) {
      return res.status(400).json({ hata: 'OTP kodunun süresi dolmuş. Yeni kod talep edin.' });
    }

    const sifreHash = await bcrypt.hash(yeniSifre, 12);
    await db.update('users', { id: kullanici.id }, {
      $set: { sifre: sifreHash, sifre_reset_otp: null, sifre_reset_expiry: null }
    });

    // Mevcut refresh token'larını iptal et (güvenlik)
    await db.remove('refresh_tokens', { user_id: kullanici.id }, { multi: true });

    res.json({ mesaj: 'Şifreniz başarıyla güncellendi. Giriş yapabilirsiniz.' });
  } catch (err) {
    console.error('Şifre sıfırlama hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

// ─── POST /api/auth/supabase-bridge ──────────────────────────────────────────
// Supabase access token'ını Supabase Auth API'sine sorarak doğrular, doğrulanmış
// e-posta ile kullanıcıyı bulur veya oluşturur, kendi backend JWT'sini döner.
// İstek gövdesindeki kullanıcı bilgisine GÜVENİLMEZ; kimlik yalnızca Supabase'in
// döndürdüğü kayıttan alınır.
const SUPABASE_URL      = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

async function verifySupabaseToken(token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    const user = await resp.json();
    if (!user || !user.id || !user.email) return null;
    return user;
  } finally {
    clearTimeout(timer);
  }
}

router.post('/supabase-bridge', loginLimiter, async (req, res) => {
  try {
    const { supabase_token, rol } = req.body || {};

    if (typeof supabase_token !== 'string' || !supabase_token) {
      return res.status(400).json({ hata: 'Supabase token zorunludur.' });
    }
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return res.status(503).json({ hata: 'Supabase girişi bu sunucuda yapılandırılmamış.' });
    }

    let sbUser;
    try {
      sbUser = await verifySupabaseToken(supabase_token);
    } catch (err) {
      console.error('Supabase doğrulama isteği başarısız:', err.message);
      return res.status(502).json({ hata: 'Kimlik doğrulama servisine ulaşılamadı.' });
    }
    if (!sbUser) {
      return res.status(401).json({ hata: 'Geçersiz veya süresi dolmuş Supabase oturumu.' });
    }
    // Doğrulanmamış e-posta ile başka birinin hesabına köprü kurulmasını engelle
    if (!sbUser.email_confirmed_at) {
      return res.status(403).json({ hata: 'E-posta adresi doğrulanmamış.' });
    }

    const email  = String(sbUser.email).trim().toLowerCase();
    const meta   = sbUser.user_metadata || {};
    const name   = meta.full_name || meta.name || email.split('@')[0];
    const avatar = meta.avatar_url || meta.picture || null;

    let kullanici = await db.findOne('users', { email });

    if (kullanici) {
      if (kullanici.supabase_id && kullanici.supabase_id !== sbUser.id) {
        return res.status(401).json({ hata: 'Bu hesap başka bir oturumla ilişkilendirilmiş.' });
      }
      if (!kullanici.aktif) {
        return res.status(403).json({ hata: 'Hesabınız devre dışı bırakılmıştır.' });
      }
      if (!kullanici.supabase_id || (!kullanici.avatar && avatar)) {
        await db.update('users', { id: kullanici.id }, {
          $set: { supabase_id: sbUser.id, avatar: kullanici.avatar || avatar, updated_at: new Date().toISOString() },
        });
        kullanici = await db.findOne('users', { id: kullanici.id });
      }
    } else {
      // Yeni kullanıcı — rol gerekli
      if (!rol || !['MUSTERI', 'SURUCU'].includes(rol)) {
        return res.status(202).json({ needsRole: true, email, name, avatar });
      }

      const now = new Date().toISOString();
      kullanici = await db.insert('users', {
        id:           uuidv4(),
        ad:           name,
        email,
        telefon:      null,
        sifre:        null, // Supabase ile kayıt → şifre yok
        rol,
        avatar,
        supabase_id:  sbUser.id,
        aktif:        true,
        rating:       0,
        rating_count: 0,
        created_at:   now,
        updated_at:   now,
      });
    }

    const { accessToken, refreshToken } = generateTokens(kullanici);
    await db.insert('refresh_tokens', {
      id:         uuidv4(),
      user_id:    kullanici.id,
      token:      refreshToken,
      created_at: new Date().toISOString(),
    });

    const { sifre: _, sifre_reset_otp: _o, sifre_reset_expiry: _e, ...kullaniciVerisi } = kullanici;
    res.json({ accessToken, refreshToken, kullanici: kullaniciVerisi });
  } catch (err) {
    console.error('Supabase bridge hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

module.exports = router;
