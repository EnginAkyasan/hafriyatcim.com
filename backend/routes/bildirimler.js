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

// POST /api/bildirimler/odeme/baslat — DEMO ödeme başlat
router.post('/odeme/baslat', authMiddleware, async (req, res) => {
  try {
    const { siparis_id } = req.body;
    if (!siparis_id) return res.status(400).json({ hata: 'Sipariş ID zorunludur.' });

    const siparis = await db.findOne('siparisler', { id: siparis_id });
    if (!siparis) return res.status(404).json({ hata: 'Sipariş bulunamadı.' });
    if (siparis.musteri_id !== req.user.id && req.user.rol !== 'ADMIN') {
      return res.status(403).json({ hata: 'Yetki yok.' });
    }

    // Mevcut ödeme kaydını bul veya oluştur
    let odeme = await db.findOne('odemeler', { siparis_id });
    if (!odeme) {
      odeme = await db.insert('odemeler', {
        id: uuidv4(),
        siparis_id,
        musteri_id: siparis.musteri_id,
        surucu_id: siparis.surucu_id,
        tutar: siparis.toplam_tutar,
        durum: 'BEKLIYOR',
        demo_token: `DEMO_${Date.now()}`,
      });
    }

    res.json({ mesaj: 'Demo ödeme başlatıldı.', odeme_id: odeme.id, token: odeme.demo_token, durum: odeme.durum });
  } catch (err) {
    console.error('Ödeme başlatma hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

// POST /api/bildirimler/odeme/tamamla — DEMO ödeme tamamla
router.post('/odeme/tamamla', authMiddleware, async (req, res) => {
  try {
    const { siparis_id } = req.body;
    if (!siparis_id) return res.status(400).json({ hata: 'Sipariş ID zorunludur.' });

    const siparis = await db.findOne('siparisler', { id: siparis_id });
    if (!siparis) return res.status(404).json({ hata: 'Sipariş bulunamadı.' });
    if (siparis.musteri_id !== req.user.id && req.user.rol !== 'ADMIN') {
      return res.status(403).json({ hata: 'Yetki yok.' });
    }

    // Ödeme güncelle
    await db.update('odemeler', { siparis_id }, { $set: { durum: 'BASARILI' } });

    // Sipariş ödeme durumu güncelle
    await db.update('siparisler', { id: siparis_id }, { $set: { odeme_durumu: 'ODENDI' } });

    // Sürücüye bildirim
    const ilan = await db.findOne('ilanlar', { id: siparis.ilan_id });
    await db.insert('bildirimler', {
      id: uuidv4(),
      user_id: siparis.surucu_id,
      turu: 'ODEME_ALINDI',
      baslik: '💰 Ödeme Alındı!',
      icerik: `${(siparis.toplam_tutar || 0).toLocaleString('tr-TR')}₺ tutarındaki ödemeniz alındı.`,
      okundu: false,
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`kullanici_${siparis.surucu_id}`).emit('odeme_alindi', { siparis_id, tutar: siparis.toplam_tutar });
      io.to(`kullanici_${siparis.musteri_id}`).emit('yeni_bildirim', { baslik: 'Ödeme tamamlandı!' });
    }

    res.json({ mesaj: 'Ödeme tamamlandı (DEMO)! ✅', durum: 'BASARILI' });
  } catch (err) {
    console.error('Ödeme tamamlama hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

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
