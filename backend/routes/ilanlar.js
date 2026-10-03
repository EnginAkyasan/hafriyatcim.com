const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const sms = require('../services/sms');

const router = express.Router();

// GET /api/ilanlar - Herkese açık ilan listesi
router.get('/', async (req, res) => {
  try {
    const { yuk_turu, arac_tipi, ilan_tipi, il, ilce, marka, tonaj_min, tonaj_max, fiyat_birimi_detay, siralama = 'newest', page = 1, limit = 20 } = req.query;

    const query = { durum: 'AKTIF' };
    if (yuk_turu && yuk_turu !== 'all') query.yuk_turu = yuk_turu;
    if (arac_tipi && arac_tipi !== 'all') query.arac_tipi = arac_tipi;
    if (ilan_tipi && ilan_tipi !== 'all') query.ilan_tipi = ilan_tipi;
    if (il && il !== 'all') query.il = il;
    if (ilce) query.ilce = ilce;
    if (marka) query.marka = marka;
    if (fiyat_birimi_detay) query.fiyat_birimi_detay = fiyat_birimi_detay;

    let sort = { created_at: -1 };
    if (siralama === 'price-low') sort = { fiyat: 1 };
    else if (siralama === 'price-high') sort = { fiyat: -1 };

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const skip = (pageNum - 1) * limitNum;

    const [ilanlar, toplam] = await Promise.all([
      db.find('ilanlar', query, { sort, skip, limit: limitNum }),
      db.count('ilanlar', query),
    ]);

    const ilanlarDetay = await Promise.all(
      ilanlar.map(async (ilan) => {
        const [teklif_sayisi, musteri] = await Promise.all([
          db.count('teklifler', { ilan_id: ilan.id }),
          db.findOne('users', { id: ilan.user_id }),
        ]);
        return { ...ilan, teklif_sayisi, musteri_ad: musteri ? musteri.ad : null };
      })
    );

    res.json({ ilanlar: ilanlarDetay, toplam, sayfa: pageNum, toplam_sayfa: Math.ceil(toplam / limitNum) });
  } catch (err) {
    console.error('İlan listesi hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

// GET /api/ilanlar/benim/liste - Kendi ilanlarım (/:id'den ÖNCE olmalı)
router.get('/benim/liste', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const skip = (pageNum - 1) * limitNum;

    const [ilanlar, toplam] = await Promise.all([
      db.find('ilanlar', { user_id: req.user.id }, { sort: { created_at: -1 }, skip, limit: limitNum }),
      db.count('ilanlar', { user_id: req.user.id }),
    ]);

    const ilanlarDetay = await Promise.all(
      ilanlar.map(async (ilan) => {
        const teklif_sayisi = await db.count('teklifler', { ilan_id: ilan.id });
        return { ...ilan, teklif_sayisi };
      })
    );

    res.json({ ilanlar: ilanlarDetay, toplam, sayfa: pageNum, toplam_sayfa: Math.ceil(toplam / limitNum) });
  } catch (err) {
    console.error('Benim ilanlarım hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

// GET /api/ilanlar/:id - İlan detayı
router.get('/:id', async (req, res) => {
  try {
    const ilan = await db.findOne('ilanlar', { id: req.params.id });
    if (!ilan) return res.status(404).json({ hata: 'İlan bulunamadı.' });

    const [musteri, teklifler] = await Promise.all([
      db.findOne('users', { id: ilan.user_id }),
      db.find('teklifler', { ilan_id: ilan.id }, { sort: { created_at: -1 } }),
    ]);

    const tekliflerDetay = await Promise.all(
      teklifler.map(async (t) => {
        const surucu = await db.findOne('users', { id: t.surucu_id });
        return {
          ...t,
          surucu_ad: surucu ? surucu.ad : null,
          // Telefon yalnızca her iki taraf ödeme yaptıktan sonra sipariş üzerinden paylaşılır
          surucu_rating: surucu ? surucu.rating : 0,
        };
      })
    );

    res.json({
      ...ilan,
      musteri_ad: musteri ? musteri.ad : null,
      teklif_sayisi: tekliflerDetay.length,
      teklifler: tekliflerDetay,
    });
  } catch (err) {
    console.error('İlan detayı hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

// POST /api/ilanlar/foto-upload - Fotoğraf yükleme (base64 → dosya)
router.post('/foto-upload', authMiddleware, async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const { fotograflar } = req.body; // array of base64 strings

    if (!fotograflar || !Array.isArray(fotograflar) || fotograflar.length === 0) {
      return res.status(400).json({ hata: 'Fotoğraf verisi bulunamadı.' });
    }
    if (fotograflar.length > 10) {
      return res.status(400).json({ hata: 'En fazla 10 fotoğraf yüklenebilir.' });
    }

    const uploadsDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    const urls = [];
    for (const b64 of fotograflar) {
      const matches = b64.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
      if (!matches) continue;
      const ext = matches[1];
      const data = Buffer.from(matches[2], 'base64');
      const fileName = `${uuidv4()}.${ext}`;
      fs.writeFileSync(path.join(uploadsDir, fileName), data);
      urls.push(`/uploads/${fileName}`);
    }

    res.json({ urls, mesaj: `${urls.length} fotoğraf yüklendi.` });
  } catch (err) {
    console.error('Foto upload hatası:', err);
    res.status(500).json({ hata: 'Fotoğraf yüklenemedi.' });
  }
});

// POST /api/ilanlar - İlan oluştur (tüm roller açabilir)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const {
      baslik,
      ilan_tipi,     // 'TALEP' veya 'TEKLIF'
      arac_tipi,     // kepce, vinc, tir, kamyon, damperli, beko, forklift, mikser, greyder, diger
      yuk_turu,      // toprak, kum, cakil, moloz, hafriyat, beton, asfalt, kaya, diger
      miktar, birim,
      fiyat, fiyat_birimi,
      fiyat_birimi_detay, // saat | gun | hafta | ay | sefer
      konum_dan, konum_a, konum,
      il, ilce,      // 81 il dropdown + ilçe
      aciklama, baslama_tarihi, bitis_tarihi,
      operatorlu,
      marka,         // Caterpillar, Volvo, JCB vb.
      model,         // araç modeli
      uretim_yili,   // üretim yılı
      tonaj,         // ton cinsinden kapasite
      fotograflar,   // base64 veya URL array
    } = req.body;

    if (!konum_dan && !konum) {
      return res.status(400).json({ hata: 'Konum bilgisi zorunludur.' });
    }

    const aracMap = {
      kepce:'Kepçe / Ekskavatör', vinc:'Vinç', tir:'TIR / Çekici',
      kamyon:'Kamyon', damperli:'Damperli Kamyon', beko:'Beko Loder',
      forklift:'Forklift', mikser:'Beton Mikser', greyder:'Greyder', diger:'Diğer Araç',
    };
    const yukMap = {
      toprak:'Toprak', kum:'Kum', cakil:'Çakıl', moloz:'Moloz',
      hafriyat:'Hafriyat', beton:'Hazır Beton', asfalt:'Asfalt', kaya:'Kaya/Taş', diger:'Diğer',
    };

    let autoBaslik = baslik;
    if (!autoBaslik) {
      const aracAd = aracMap[arac_tipi] || 'Araç';
      const yukAd  = yukMap[yuk_turu] || '';
      const tip    = ilan_tipi === 'TEKLIF' ? 'Kiralık' : 'Aranıyor';
      autoBaslik   = [aracAd, yukAd ? `— ${yukAd} Taşıma` : '', tip, konum_dan ? `— ${konum_dan}` : ''].filter(Boolean).join(' ');
    }

    const yeniIlan = await db.insert('ilanlar', {
      id: uuidv4(), user_id: req.user.id, user_rol: req.user.rol,
      baslik: autoBaslik,
      ilan_tipi:           ilan_tipi || 'TALEP',
      arac_tipi:           arac_tipi || 'diger',
      yuk_turu:            yuk_turu || null,
      miktar:              miktar ? parseFloat(miktar) : null,
      birim:               birim || 'ton',
      fiyat:               fiyat ? parseFloat(fiyat) : null,
      fiyat_birimi:        fiyat_birimi || 'sefer',
      fiyat_birimi_detay:  fiyat_birimi_detay || fiyat_birimi || 'gun',
      konum_dan:           il ? `${il}${ilce ? ' / ' + ilce : ''}` : (konum_dan || konum || null),
      konum_a:             konum_a || null,
      konum:               konum || (il ? `${il}${ilce ? ' / ' + ilce : ''}` : konum_dan) || null,
      il:                  il || null,
      ilce:                ilce || null,
      marka:               marka || null,
      model:               model || null,
      uretim_yili:         uretim_yili ? parseInt(uretim_yili) : null,
      tonaj:               tonaj ? parseFloat(tonaj) : null,
      fotograflar:         Array.isArray(fotograflar) ? fotograflar : [],
      aciklama:            aciklama || null,
      baslama_tarihi:      baslama_tarihi || null,
      bitis_tarihi:        bitis_tarihi || null,
      operatorlu:          operatorlu === true || operatorlu === 'true' || false,
      durum: 'AKTIF', goruntuleme: 0,
      created_at: new Date().toISOString(),
    });

    if (ilan_tipi !== 'TEKLIF') {
      db.find('users', { rol: 'SURUCU' })
        .then(suruculer => {
          if (suruculer?.length > 0) sms.sendYeniIlanNotification(suruculer, yeniIlan).catch(console.error);
        }).catch(console.error);
    }

    res.status(201).json({ mesaj: 'İlan başarıyla yayınlandı!', ilan: yeniIlan });
  } catch (err) {
    console.error('İlan oluşturma hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

// PUT /api/ilanlar/:id - İlan güncelle
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const ilan = await db.findOne('ilanlar', { id: req.params.id });
    if (!ilan) return res.status(404).json({ hata: 'İlan bulunamadı.' });

    if (ilan.user_id !== req.user.id && req.user.rol !== 'ADMIN') {
      return res.status(403).json({ hata: 'Bu ilanı düzenleme yetkiniz yok.' });
    }

    const allowed = ['yuk_turu','miktar','birim','fiyat','konum_dan','konum_a','aciklama','baslama_tarihi','durum'];
    const guncelleme = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) guncelleme[f] = req.body[f]; });

    await db.update('ilanlar', { id: req.params.id }, { $set: guncelleme });
    const guncellenmis = await db.findOne('ilanlar', { id: req.params.id });
    res.json({ mesaj: 'İlan güncellendi.', ilan: guncellenmis });
  } catch (err) {
    console.error('İlan güncelleme hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

// DELETE /api/ilanlar/:id - İlanı iptal et (soft)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const ilan = await db.findOne('ilanlar', { id: req.params.id });
    if (!ilan) return res.status(404).json({ hata: 'İlan bulunamadı.' });

    if (ilan.user_id !== req.user.id && req.user.rol !== 'ADMIN') {
      return res.status(403).json({ hata: 'Bu ilanı silme yetkiniz yok.' });
    }

    await db.update('ilanlar', { id: req.params.id }, { $set: { durum: 'IPTAL' } });
    res.json({ mesaj: 'İlan iptal edildi.' });
  } catch (err) {
    console.error('İlan silme hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

module.exports = router;
