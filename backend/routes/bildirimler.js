const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// GET /api/bildirimler - Kullanıcının bildirimleri
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const skip = (pageNum - 1) * limitNum;

    const [bildirimler, toplam, okunmamis] = await Promise.all([
      db.find('bildirimler', { user_id: req.user.id }, { sort: { created_at: -1 }, skip, limit: limitNum }),
      db.count('bildirimler', { user_id: req.user.id }),
      db.count('bildirimler', { user_id: req.user.id, okundu: false }),
    ]);

    res.json({ bildirimler, toplam, okunmamis, sayfa: pageNum, toplam_sayfa: Math.ceil(toplam / limitNum) });
  } catch (err) {
    console.error('Bildirimler hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

// PUT /api/bildirimler/tumunu-oku — /:id/oku'dan ÖNCE olmalı
router.put('/tumunu-oku', authMiddleware, async (req, res) => {
  try {
    await db.update('bildirimler', { user_id: req.user.id, okundu: false }, { $set: { okundu: true } }, { multi: true });
    res.json({ mesaj: 'Tüm bildirimler okundu.' });
  } catch (err) {
    console.error('Tümünü oku hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

// NOT: Eski DEMO ödeme endpoint'leri (/odeme/baslat, /odeme/tamamla) kaldırıldı.
// Ödeme yalnızca /api/odeme/* üzerinden iyzico ile yapılır.

// PUT /api/bildirimler/:id/oku
router.put('/:id/oku', authMiddleware, async (req, res) => {
  try {
    const bildirim = await db.findOne('bildirimler', { id: req.params.id });
    if (!bildirim) return res.status(404).json({ hata: 'Bildirim bulunamadı.' });
    if (bildirim.user_id !== req.user.id && req.user.rol !== 'ADMIN') {
      return res.status(403).json({ hata: 'Yetki yok.' });
    }
    await db.update('bildirimler', { id: req.params.id }, { $set: { okundu: true } });
    res.json({ mesaj: 'Bildirim okundu.' });
  } catch (err) {
    console.error('Bildirimi oku hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

module.exports = router;
