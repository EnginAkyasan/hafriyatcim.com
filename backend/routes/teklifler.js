const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const sms = require('../services/sms');

const router = express.Router();

// GET /api/teklifler/benim - Sürücünün kendi teklifleri
router.get('/benim', authMiddleware, async (req, res) => {
  try {
    if (req.user.rol !== 'SURUCU' && req.user.rol !== 'ADMIN') {
      return res.status(403).json({ hata: 'Yalnızca sürücüler kendi tekliflerini görebilir.' });
    }

    const teklifler = await db.find('teklifler', { surucu_id: req.user.id }, { sort: { created_at: -1 } });

    const tekliflerDetay = await Promise.all(
      teklifler.map(async (teklif) => {
        const ilan = await db.findOne('ilanlar', { id: teklif.ilan_id });
        return {
          ...teklif,
          ilan_baslik: ilan ? ilan.baslik : null,
          ilan_durum: ilan ? ilan.durum : null,
          konum_dan: ilan ? ilan.konum_dan : null,
          konum_a: ilan ? ilan.konum_a : null,
          miktar: ilan ? ilan.miktar : null,
          birim: ilan ? ilan.birim : null,
        };
      })
    );

    res.json({ teklifler: tekliflerDetay });
  } catch (err) {
    console.error('Benim tekliflerim hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

// GET /api/teklifler/musteri - Müşterinin tüm ilanlarına gelen teklifler (topluca)
router.get('/musteri', authMiddleware, async (req, res) => {
  try {
    if (req.user.rol !== 'MUSTERI' && req.user.rol !== 'ADMIN') {
      return res.status(403).json({ hata: 'Yalnızca müşteriler bu endpoint’i kullanabilir.' });
    }

    // Kullanıcının tüm ilanlarını bul
    const ilanlar = await db.find('ilanlar', { user_id: req.user.id });
    if (!ilanlar.length) return res.json({ teklifler: [] });

    const ilanIdler = ilanlar.map(i => i.id);

    // Tüm ilanlar için teklifleri çek
    const tumTeklifler = [];
    for (const ilan of ilanlar) {
      const teklifler = await db.find('teklifler', { ilan_id: ilan.id }, { sort: { created_at: -1 } });
      for (const t of teklifler) {
        const gonderen = await db.findOne('users', { id: t.surucu_id });
        tumTeklifler.push({
          ...t,
          ilan_baslik: ilan.baslik,
          ilan_arac_tipi: ilan.arac_tipi,
          gonderen_adi: gonderen ? gonderen.ad : null,
          gonderen_telefon: gonderen ? gonderen.telefon : null,
          gonderen_rating: gonderen ? gonderen.rating : null,
        });
      }
    }

    // En yeni önce
    tumTeklifler.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json({ teklifler: tumTeklifler });
  } catch (err) {
    console.error('Müşteri teklifleri hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});


// GET /api/teklifler/ilan/:ilanId - Bir ilana gelen teklifler (yalnızca ilan sahibi veya ADMIN)
router.get('/ilan/:ilanId', authMiddleware, async (req, res) => {
  try {
    const ilan = await db.findOne('ilanlar', { id: req.params.ilanId });
    if (!ilan) {
      return res.status(404).json({ hata: 'İlan bulunamadı.' });
    }

    if (ilan.user_id !== req.user.id && req.user.rol !== 'ADMIN') {
      return res.status(403).json({ hata: 'Bu ilana gelen teklifleri görme yetkiniz yok.' });
    }

    const teklifler = await db.find(
      'teklifler',
      { ilan_id: req.params.ilanId },
      { sort: { created_at: -1 } }
    );

    // Her teklif için sürücü bilgisini ekle
    const tekliflerDetay = await Promise.all(
      teklifler.map(async (teklif) => {
        const surucu = await db.findOne('users', { id: teklif.surucu_id });
        return {
          ...teklif,
          surucu_ad: surucu ? surucu.ad : null,
          surucu_telefon: surucu ? surucu.telefon : null,
        };
      })
    );

    res.json({ teklifler: tekliflerDetay, ilan });
  } catch (err) {
    console.error('İlan teklifleri hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

// POST /api/teklifler - Teklif ver (SURUCU veya ADMIN)
router.post('/', authMiddleware, async (req, res) => {
  try {
    if (req.user.rol !== 'SURUCU' && req.user.rol !== 'ADMIN') {
      return res.status(403).json({ hata: 'Yalnızca sürücüler teklif verebilir.' });
    }

    const { ilan_id, fiyat, mesaj, arac_bilgisi, sefer_bedeli, komisyon } = req.body;

    if (!ilan_id || !fiyat) {
      return res.status(400).json({ hata: 'İlan ID ve fiyat zorunludur.' });
    }

    const ilan = await db.findOne('ilanlar', { id: ilan_id });
    if (!ilan) return res.status(404).json({ hata: 'İlan bulunamadı.' });
    if (ilan.durum !== 'AKTIF') return res.status(400).json({ hata: 'Bu ilana artık teklif verilemez.' });

    const mevcutTeklif = await db.findOne('teklifler', { ilan_id, surucu_id: req.user.id });
    if (mevcutTeklif) return res.status(409).json({ hata: 'Bu ilana zaten bir teklif verdiniz.' });

    const hesaplananKomisyon = sefer_bedeli
      ? Math.max(252, Math.round(parseFloat(sefer_bedeli) * 0.01))
      : 252;

    const yeniTeklif = await db.insert('teklifler', {
      id: uuidv4(),
      ilan_id,
      surucu_id: req.user.id,
      fiyat: parseFloat(fiyat),
      mesaj: mesaj || null,
      arac_bilgisi: arac_bilgisi || null,
      sefer_bedeli: sefer_bedeli ? parseFloat(sefer_bedeli) : null,
      komisyon: hesaplananKomisyon,
      durum: 'BEKLIYOR',
    });

    // İlan sahibine bildirim
    const surucu = await db.findOne('users', { id: req.user.id });
    await db.insert('bildirimler', {
      id: uuidv4(),
      user_id: ilan.user_id,
      turu: 'YENI_TEKLIF',
      baslik: 'Yeni Teklif Geldi!',
      icerik: `${surucu ? surucu.ad : 'Bir sürücü'} ilanınıza ${parseFloat(fiyat).toLocaleString('tr-TR')}₺ teklif verdi.`,
      okundu: false,
    });

    // Socket emit
    const io = req.app.get('io');
    if (io) io.to(`kullanici_${ilan.user_id}`).emit('yeni_bildirim', { baslik: 'Yeni Teklif!' });

    // SMS bildirim: ilan sahibine (müşteri)
    const ilanSahibi = await db.findOne('users', { id: ilan.user_id });
    if (ilanSahibi?.telefon) {
      sms.sendTeklifGeldi(
        ilanSahibi.telefon,
        surucu,
        parseFloat(fiyat),
        ilan.baslik || 'Hafriyat İlanı'
      ).catch(console.error);
    }

    res.status(201).json({ mesaj: 'Teklif başarıyla gönderildi!', teklif: yeniTeklif });
  } catch (err) {
    console.error('Teklif verme hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

// PUT /api/teklifler/:id/kabul - Teklifi kabul et
router.put('/:id/kabul', authMiddleware, async (req, res) => {
  try {
    const teklif = await db.findOne('teklifler', { id: req.params.id });
    if (!teklif) {
      return res.status(404).json({ hata: 'Teklif bulunamadı.' });
    }

    const ilan = await db.findOne('ilanlar', { id: teklif.ilan_id });
    if (!ilan) {
      return res.status(404).json({ hata: 'İlgili ilan bulunamadı.' });
    }

    if (ilan.user_id !== req.user.id && req.user.rol !== 'ADMIN') {
      return res.status(403).json({ hata: 'Bu teklifi kabul etme yetkiniz yok.' });
    }

    if (ilan.durum !== 'AKTIF') return res.status(400).json({ hata: 'İlan artık aktif değil.' });

    // Teklifi kabul et
    await db.update('teklifler', { id: req.params.id }, { $set: { durum: 'KABUL' } });

    // Diğer teklifleri reddet
    await db.update('teklifler',
      { ilan_id: teklif.ilan_id, id: { $ne: req.params.id }, durum: 'BEKLIYOR' },
      { $set: { durum: 'RED' } }, { multi: true }
    );

    // İlanı kapat
    await db.update('ilanlar', { id: teklif.ilan_id }, { $set: { durum: 'KAPALI' } });

    const yeniSiparis = await db.insert('siparisler', {
      id: uuidv4(),
      ilan_id: teklif.ilan_id,
      teklif_id: teklif.id,
      musteri_id: ilan.user_id,
      surucu_id: teklif.surucu_id,
      toplam_tutar: teklif.fiyat,
      baslangic_konum: ilan.konum_dan,
      hedef_konum: ilan.konum_a,
      durum: 'BEKLIYOR',
      odeme_durumu: 'BEKLIYOR',
    });

    // Sürücüye bildirim
    await db.insert('bildirimler', {
      id: uuidv4(),
      user_id: teklif.surucu_id,
      turu: 'TEKLIF_KABUL',
      baslik: '🎉 Teklifiniz Kabul Edildi!',
      icerik: `"${ilan.baslik}" ilanına verdiğiniz teklif kabul edildi. Sipariş oluşturuldu!`,
      okundu: false,
    });

    const io = req.app.get('io');
    if (io) io.to(`kullanici_${teklif.surucu_id}`).emit('yeni_bildirim', { baslik: 'Teklifiniz kabul edildi!' });

    res.json({ mesaj: 'Teklif kabul edildi, sipariş oluşturuldu! 🎉', siparis: yeniSiparis });
  } catch (err) {
    console.error('Teklif kabul hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

// PUT /api/teklifler/:id/red - Teklifi reddet
router.put('/:id/red', authMiddleware, async (req, res) => {
  try {
    const teklif = await db.findOne('teklifler', { id: req.params.id });
    if (!teklif) {
      return res.status(404).json({ hata: 'Teklif bulunamadı.' });
    }

    const ilan = await db.findOne('ilanlar', { id: teklif.ilan_id });
    if (!ilan) {
      return res.status(404).json({ hata: 'İlgili ilan bulunamadı.' });
    }

    if (ilan.user_id !== req.user.id && req.user.rol !== 'ADMIN') {
      return res.status(403).json({ hata: 'Bu teklifi reddetme yetkiniz yok.' });
    }

    if (teklif.durum !== 'BEKLIYOR') {
      return res.status(400).json({ hata: 'Yalnızca beklemedeki teklifler reddedilebilir.' });
    }

    await db.update('teklifler', { id: req.params.id }, { $set: { durum: 'RED' } });

    await db.insert('bildirimler', {
      id: uuidv4(),
      user_id: teklif.surucu_id,
      turu: 'TEKLIF_RED',
      baslik: 'Teklifiniz Reddedildi',
      icerik: `"${ilan.baslik}" ilanına verdiğiniz teklif reddedildi.`,
      okundu: false,
    });

    res.json({ mesaj: 'Teklif reddedildi.' });
  } catch (err) {
    console.error('Teklif red hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

module.exports = router;
