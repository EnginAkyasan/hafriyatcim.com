const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const db = require('../db/database');

const router = express.Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const JWT_SECRET = process.env.JWT_SECRET || 'gizli_anahtar_degistir';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'refresh_gizli_anahtar_degistir';
const REFRESH_EXPIRES_IN = process.env.REFRESH_EXPIRES_IN || '7d';

const client = new OAuth2Client(GOOGLE_CLIENT_ID);

const generateTokens = (user) => {
  const payload = { id: user.id, email: user.email, rol: user.rol };
  const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  const refreshToken = jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES_IN });
  return { accessToken, refreshToken };
};

// POST /api/auth/google
// Body: { credential: <Google ID Token>, rol?: 'MUSTERI'|'SURUCU', telefon? }
router.post('/google', async (req, res) => {
  try {
    const { credential, rol, telefon } = req.body;

    if (!credential) {
      return res.status(400).json({ hata: 'Google token (credential) zorunludur.' });
    }

    if (!GOOGLE_CLIENT_ID) {
      return res.status(500).json({ hata: 'Google Client ID yapılandırılmamış.' });
    }

    // Google token doğrula
    let payload;
    try {
      const ticket = await client.verifyIdToken({
        idToken: credential,
        audience: GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (verifyErr) {
      console.error('Google token doğrulama hatası:', verifyErr.message);
      return res.status(401).json({ hata: 'Google token geçersiz.' });
    }

    const { email, name, picture, sub: googleId } = payload;

    // Kullanıcı var mı?
    let kullanici = await db.findOne('users', { email });

    if (kullanici) {
      // Var → google_id güncelle (ilk kez Google ile giriyorsa)
      if (!kullanici.google_id) {
        await db.update('users', { id: kullanici.id }, {
          $set: { google_id: googleId, avatar: picture }
        });
        kullanici = await db.findOne('users', { id: kullanici.id });
      }

      if (!kullanici.aktif) {
        return res.status(403).json({ hata: 'Hesabınız devre dışı bırakılmış.' });
      }
    } else {
      // Yeni kullanıcı → rol seçimi gerekli
      const seciliRol = ['MUSTERI', 'SURUCU'].includes(rol) ? rol : null;
      if (!seciliRol) {
        // Rol seçilmemişse frontend'e bildir
        return res.status(202).json({
          yeni_kullanici: true,
          mesaj: 'Rol seçimi gerekli',
          google_email: email,
          google_ad: name,
          google_avatar: picture,
          google_credential: credential,
        });
      }

      kullanici = await db.insert('users', {
        id: uuidv4(),
        ad: name,
        email,
        telefon: telefon || null,
        sifre: null, // Google ile kayıt → şifre yok
        rol: seciliRol,
        google_id: googleId,
        avatar: picture,
        rating: 0,
        rating_count: 0,
        aktif: true,
      });

      console.log(`✅ Google ile yeni kayıt: ${email} (${seciliRol})`);
    }

    // Token üret
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
      mesaj: 'Google ile giriş başarılı.',
      kullanici: kullaniciVerisi,
      accessToken,
      refreshToken,
    });

  } catch (err) {
    console.error('Google auth hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

module.exports = router;
