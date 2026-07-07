const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();

// Tüm admin rotaları için authMiddleware + adminMiddleware uygula
router.use(authMiddleware, adminMiddleware);

// GET /api/admin/istatistik - Genel istatistikler
router.get('/istatistik', async (req, res) => {
  try {
    const buAyBaslangic = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1
    ).toISOString();

    const [
      toplamKullanici,
      musteriSayisi,
      surucuSayisi,
      toplamIlan,
      aktifIlan,
      toplamSiparis,
      tamamlananSiparis,
      buAySiparis,
      basariliOdemeler,
    ] = await Promise.all([
      db.count('users', {}),
      db.count('users', { rol: 'MUSTERI' }),
      db.count('users', { rol: 'SURUCU' }),
      db.count('ilanlar', {}),
      db.count('ilanlar', { durum: 'AKTIF' }),
      db.count('siparisler', {}),
      db.count('siparisler', { durum: 'TESLIM_EDILDI' }),
      db.count('siparisler', { created_at: { $gte: buAyBaslangic } }),
      db.find('odemeler', { durum: 'BASARILI' }, {}),
    ]);

    const toplamCiro = basariliOdemeler.reduce(
      (acc, o) => acc + (parseFloat(o.tutar) || 0),
      0
    );

    res.json({
      kullanicilar: {
        toplam: toplamKullanici,
        musteri: musteriSayisi,
        surucu: surucuSayisi,
      },
      ilanlar: {
        toplam: toplamIlan,
        aktif: aktifIlan,
      },
      siparisler: {
        toplam: toplamSiparis,
        tamamlanan: tamamlananSiparis,
        bu_ay: buAySiparis,
      },
      finans: {
        toplam_ciro: toplamCiro,
      },
    });
  } catch (err) {
    console.error('Admin istatistik hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

// GET /api/admin/kullanicilar - Kullanıcı listesi (sayfalı, rol filtresi)
router.get('/kullanicilar', async (req, res) => {
  try {
    const { rol, page = 1, limit = 20 } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const skip = (pageNum - 1) * limitNum;

    const query = {};
    if (rol) query.rol = rol;

    const [kullanicilar, toplam] = await Promise.all([
      db.find('users', query, { sort: { created_at: -1 }, skip, limit: limitNum }),
      db.count('users', query),
    ]);

    // Şifreleri çıkar
    const kullanicilarTemiz = kullanicilar.map(({ sifre, ...rest }) => rest);

    res.json({
      kullanicilar: kullanicilarTemiz,
      toplam,
      sayfa: pageNum,
      toplam_sayfa: Math.ceil(toplam / limitNum),
    });
  } catch (err) {
    console.error('Admin kullanıcılar hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

// PUT /api/admin/kullanicilar/:id/aktif - Kullanıcı aktif/pasif toggle
router.put('/kullanicilar/:id/aktif', async (req, res) => {
  try {
    const kullanici = await db.findOne('users', { id: req.params.id });
    if (!kullanici) {
      return res.status(404).json({ hata: 'Kullanıcı bulunamadı.' });
    }

    const yeniAktif = !kullanici.aktif;
    await db.update(
      'users',
      { id: req.params.id },
      { $set: { aktif: yeniAktif, updated_at: new Date().toISOString() } },
      {}
    );

    res.json({
      mesaj: `Kullanıcı ${yeniAktif ? 'aktif' : 'pasif'} yapıldı.`,
      aktif: yeniAktif,
    });
  } catch (err) {
    console.error('Admin kullanıcı aktif toggle hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

// GET /api/admin/ilanlar - Tüm ilanlar (musteri_ad ve teklif_sayisi ile)
router.get('/ilanlar', async (req, res) => {
  try {
    const { durum, page = 1, limit = 20 } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const skip = (pageNum - 1) * limitNum;

    const query = {};
    if (durum) query.durum = durum;

    const [ilanlar, toplam] = await Promise.all([
      db.find('ilanlar', query, { sort: { created_at: -1 }, skip, limit: limitNum }),
      db.count('ilanlar', query),
    ]);

    const ilanlarDetay = await Promise.all(
      ilanlar.map(async (ilan) => {
        const [musteri, teklif_sayisi] = await Promise.all([
          db.findOne('users', { id: ilan.user_id }),
          db.count('teklifler', { ilan_id: ilan.id }),
        ]);
        return {
          ...ilan,
          musteri_ad: musteri ? musteri.ad : null,
          musteri_email: musteri ? musteri.email : null,
          teklif_sayisi,
        };
      })
    );

    res.json({
      ilanlar: ilanlarDetay,
      toplam,
      sayfa: pageNum,
      toplam_sayfa: Math.ceil(toplam / limitNum),
    });
  } catch (err) {
    console.error('Admin ilanlar hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

// DELETE /api/admin/ilanlar/:id - İlan sil (gerçek silme)
router.delete('/ilanlar/:id', async (req, res) => {
  try {
    const ilan = await db.findOne('ilanlar', { id: req.params.id });
    if (!ilan) {
      return res.status(404).json({ hata: 'İlan bulunamadı.' });
    }

    await db.remove('ilanlar', { id: req.params.id }, {});

    res.json({ mesaj: 'İlan silindi.' });
  } catch (err) {
    console.error('Admin ilan silme hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

// GET /api/admin/siparisler - Tüm siparişler (ilgili adlar ile)
router.get('/siparisler', async (req, res) => {
  try {
    const { durum, page = 1, limit = 20 } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const skip = (pageNum - 1) * limitNum;

    const query = {};
    if (durum) query.durum = durum;

    const [siparisler, toplam] = await Promise.all([
      db.find('siparisler', query, { sort: { created_at: -1 }, skip, limit: limitNum }),
      db.count('siparisler', query),
    ]);

    const siparislerDetay = await Promise.all(
      siparisler.map(async (siparis) => {
        const [ilan, musteri, surucu] = await Promise.all([
          db.findOne('ilanlar', { id: siparis.ilan_id }),
          db.findOne('users', { id: siparis.musteri_id }),
          db.findOne('users', { id: siparis.surucu_id }),
        ]);
        return {
          ...siparis,
          ilan_baslik: ilan ? ilan.baslik : null,
          musteri_ad: musteri ? musteri.ad : null,
          musteri_email: musteri ? musteri.email : null,
          surucu_ad: surucu ? surucu.ad : null,
          surucu_email: surucu ? surucu.email : null,
        };
      })
    );

    res.json({
      siparisler: siparislerDetay,
      toplam,
      sayfa: pageNum,
      toplam_sayfa: Math.ceil(toplam / limitNum),
    });
  } catch (err) {
    console.error('Admin siparişler hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

// GET /api/admin/odemeler - Tüm ödemeler (ilgili adlar ile)
router.get('/odemeler', async (req, res) => {
  try {
    const { durum, page = 1, limit = 20 } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const skip = (pageNum - 1) * limitNum;

    const query = {};
    if (durum) query.durum = durum;

    const [odemeler, toplam] = await Promise.all([
      db.find('odemeler', query, { sort: { created_at: -1 }, skip, limit: limitNum }),
      db.count('odemeler', query),
    ]);

    const odemelerDetay = await Promise.all(
      odemeler.map(async (odeme) => {
        const [siparis, musteri, surucu] = await Promise.all([
          db.findOne('siparisler', { id: odeme.siparis_id }),
          db.findOne('users', { id: odeme.musteri_id }),
          db.findOne('users', { id: odeme.surucu_id }),
        ]);
        const ilan = siparis ? await db.findOne('ilanlar', { id: siparis.ilan_id }) : null;
        return {
          ...odeme,
          ilan_baslik: ilan ? ilan.baslik : null,
          musteri_ad: musteri ? musteri.ad : null,
          musteri_email: musteri ? musteri.email : null,
          surucu_ad: surucu ? surucu.ad : null,
          surucu_email: surucu ? surucu.email : null,
        };
      })
    );

    const toplamCiro = odemeler
      .filter((o) => o.durum === 'BASARILI')
      .reduce((acc, o) => acc + (parseFloat(o.tutar) || 0), 0);

    res.json({
      odemeler: odemelerDetay,
      toplam,
      toplam_ciro: toplamCiro,
      sayfa: pageNum,
      toplam_sayfa: Math.ceil(toplam / limitNum),
    });
  } catch (err) {
    console.error('Admin ödemeler hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

module.exports = router;
