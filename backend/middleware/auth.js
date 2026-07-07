const jwt = require('jsonwebtoken');
const db = require('../db/database');

const JWT_SECRET = process.env.JWT_SECRET || 'gizli_anahtar_degistir';

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

    if (!token) {
      return res.status(401).json({ hata: 'Yetkisiz: Token bulunamadı.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ hata: 'Yetkisiz: Geçersiz veya süresi dolmuş token.' });
    }

    const user = await db.findOne('users', { id: decoded.id });
    if (!user) {
      return res.status(401).json({ hata: 'Yetkisiz: Kullanıcı bulunamadı.' });
    }

    if (!user.aktif) {
      return res.status(403).json({ hata: 'Hesabınız devre dışı bırakılmıştır.' });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('authMiddleware hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
};

const adminMiddleware = (req, res, next) => {
  if (!req.user || req.user.rol !== 'ADMIN') {
    return res.status(403).json({ hata: 'Yetkisiz: Bu işlem için yönetici yetkisi gereklidir.' });
  }
  next();
};

const surucuMiddleware = (req, res, next) => {
  if (!req.user || (req.user.rol !== 'SURUCU' && req.user.rol !== 'ADMIN')) {
    return res.status(403).json({ hata: 'Yetkisiz: Bu işlem için sürücü yetkisi gereklidir.' });
  }
  next();
};

module.exports = { authMiddleware, adminMiddleware, surucuMiddleware };
