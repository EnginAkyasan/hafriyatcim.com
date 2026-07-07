/**
 * hafriyatcim.com — Siparişler Router
 * Sipariş/iş takibi, durum güncellemeleri, tamamlama ve konum sorgulama
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const sms = require('../services/sms');

const router = express.Router();

// ─── Sabitler ─────────────────────────────────────────────────────────────────

/** Sürücü tarafından güncellenebilecek iş durumları */
const SURUCU_DURUMLARI = ['YOLA_CIKTI', 'MOLA_VERDI', 'TESLIM_EDILDI'];

/** Durum → Türkçe etiket eşlemesi */
const DURUM_ETIKETLERI = {
  YOLA_CIKTI:     '🚛 Yola Çıktı',
  MOLA_VERDI:     '⏸️ Mola Verdi',
  TESLIM_EDILDI:  '✅ Teslim Edildi',
  TAMAMLANDI:     '🏁 Tamamlandı',
  BEKLIYOR:       '⏳ Bekliyor',
  IPTAL:          '❌ İptal',
};

// ─── Yardımcı: Siparişe ilan detayı ekle ─────────────────────────────────────

async function ilanDetayEkle(siparis) {
  const ilan = await db.findOne('ilanlar', { id: siparis.ilan_id });
  return {
    ...siparis,
    ilan_baslik:    ilan ? ilan.baslik   : null,
    ilan_yuk_turu:  ilan ? ilan.yuk_turu : null,
    ilan_yuklenecek: ilan ? ilan.konum_dan : null,
    ilan_teslim:    ilan ? ilan.konum_a  : null,
    ilan_miktar:    ilan ? ilan.miktar   : null,
    ilan_birim:     ilan ? ilan.birim    : null,
  };
}

// ─── Yardımcı: Kullanıcı bilgileri ekle ──────────────────────────────────────

async function kullaniciBilgileriEkle(siparis) {
  const [musteri, surucu] = await Promise.all([
    db.findOne('users', { id: siparis.musteri_id }),
    db.findOne('users', { id: siparis.surucu_id }),
  ]);
  return {
    ...siparis,
    musteri_ad:      musteri ? musteri.ad      : null,
    musteri_telefon: musteri ? musteri.telefon : null,
    surucu_ad:       surucu  ? surucu.ad       : null,
    surucu_telefon:  surucu  ? surucu.telefon  : null,
  };
}

// ─── Yardımcı: Socket.IO ile güvenli emit ─────────────────────────────────────

function emitSocket(req, oda, olay, veri) {
  try {
    const io = req.app.get('io');
    if (io) {
      io.to(oda).emit(olay, veri);
      console.log(`📡 Socket emit → [${oda}] ${olay}`);
    }
  } catch (socketErr) {
    console.error('⚠️  Socket emit hatası:', socketErr.message);
  }
}

// ─── Yardımcı: Bildirim kaydet ────────────────────────────────────────────────

async function bildirimEkle(userId, turu, baslik, icerik) {
  try {
    await db.insert('bildirimler', {
      id:      uuidv4(),
      user_id: userId,
      turu,
      baslik,
      icerik,
      okundu:  false,
    });
  } catch (err) {
    console.error('⚠️  Bildirim kayıt hatası:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/siparisler - Tüm siparişler (Admin, sayfalama + filtre ile)
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 10, durum } = req.query;
    const pageNum  = parseInt(page)  || 1;
    const limitNum = parseInt(limit) || 10;
    const skip     = (pageNum - 1) * limitNum;

    let query = {};
    if (req.user.rol === 'SURUCU') {
      query.surucu_id = req.user.id;
    } else if (req.user.rol === 'MUSTERI') {
      query.musteri_id = req.user.id;
    }
    // ADMIN için query boş kalır (hepsini görür)

    if (durum) query.durum = durum;

    const [siparisler, toplam] = await Promise.all([
      db.find('siparisler', query, { sort: { created_at: -1 }, skip, limit: limitNum }),
      db.count('siparisler', query),
    ]);

    const siparislerDetay = await Promise.all(
      siparisler.map(async (s) => {
        const [withIlan, withUsers] = await Promise.all([
          ilanDetayEkle(s),
          kullaniciBilgileriEkle(s),
        ]);
        return { ...withIlan, ...withUsers, ...s };
      })
    );

    res.json({
      siparisler: siparislerDetay,
      toplam,
      sayfa:         pageNum,
      toplam_sayfa:  Math.ceil(toplam / limitNum),
    });
  } catch (err) {
    console.error('Siparişler listesi hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/siparisler/benim - Kendi siparişlerim (rol bazlı)
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/benim', authMiddleware, async (req, res) => {
  try {
    const { durum, page = 1, limit = 20 } = req.query;
    const pageNum  = parseInt(page)  || 1;
    const limitNum = parseInt(limit) || 20;
    const skip     = (pageNum - 1) * limitNum;

    // Rol bazlı filtre
    let query = {};
    if (req.user.rol === 'MUSTERI') {
      query.musteri_id = req.user.id;
    } else if (req.user.rol === 'SURUCU') {
      query.surucu_id = req.user.id;
    } else if (req.user.rol === 'ADMIN') {
      // Admin tüm siparişleri görür
    } else {
      return res.status(403).json({ hata: 'Bu işlem için yetkiniz yok.' });
    }

    if (durum) query.durum = durum;

    const [siparisler, toplam] = await Promise.all([
      db.find('siparisler', query, { sort: { created_at: -1 }, skip, limit: limitNum }),
      db.count('siparisler', query),
    ]);

    // Her siparişe ilan detayı + kullanıcı bilgisi ekle
    const siparislerDetay = await Promise.all(
      siparisler.map(async (siparis) => {
        const ilan = await db.findOne('ilanlar', { id: siparis.ilan_id });
        const [musteri, surucu] = await Promise.all([
          db.findOne('users', { id: siparis.musteri_id }),
          db.findOne('users', { id: siparis.surucu_id }),
        ]);

        return {
          ...siparis,
          durum_etiketi:   DURUM_ETIKETLERI[siparis.durum] || siparis.durum,
          ilan_baslik:     ilan ? ilan.baslik    : null,
          ilan_yuk_turu:   ilan ? ilan.yuk_turu  : null,
          ilan_yuklenecek: ilan ? ilan.konum_dan : null,
          ilan_teslim:     ilan ? ilan.konum_a   : null,
          ilan_miktar:     ilan ? ilan.miktar     : null,
          ilan_birim:      ilan ? ilan.birim      : null,
          musteri_ad:      musteri ? musteri.ad      : null,
          musteri_telefon: musteri ? musteri.telefon : null,
          surucu_ad:       surucu  ? surucu.ad       : null,
          surucu_telefon:  surucu  ? surucu.telefon  : null,
          surucu_rating:   surucu  ? surucu.rating   : null,
        };
      })
    );

    res.json({
      siparisler: siparislerDetay,
      toplam,
      sayfa:        pageNum,
      toplam_sayfa: Math.ceil(toplam / limitNum),
    });
  } catch (err) {
    console.error('Benim siparişlerim hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/siparisler/:id - Sipariş detayı (yalnızca taraf olanlar)
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const siparis = await db.findOne('siparisler', { id: req.params.id });
    if (!siparis) {
      return res.status(404).json({ hata: 'Sipariş bulunamadı.' });
    }

    // Erişim kontrolü: sadece müşteri, sürücü veya admin görebilir
    if (
      req.user.rol !== 'ADMIN' &&
      siparis.musteri_id !== req.user.id &&
      siparis.surucu_id  !== req.user.id
    ) {
      return res.status(403).json({ hata: 'Bu siparişe erişim yetkiniz yok.' });
    }

    // Manuel join: ilan + müşteri + sürücü + teklif
    const [ilan, musteri, surucu, teklif] = await Promise.all([
      db.findOne('ilanlar',   { id: siparis.ilan_id    }),
      db.findOne('users',     { id: siparis.musteri_id }),
      db.findOne('users',     { id: siparis.surucu_id  }),
      db.findOne('teklifler', { id: siparis.teklif_id  }),
    ]);

    // Son konum
    const konumlar = await db.find(
      'konumlar',
      { siparis_id: siparis.id },
      { sort: { created_at: -1 }, limit: 1 }
    );
    const sonKonum = konumlar.length > 0 ? konumlar[0] : null;

    res.json({
      ...siparis,
      durum_etiketi: DURUM_ETIKETLERI[siparis.durum] || siparis.durum,
      ilan,
      musteri_ad:       musteri ? musteri.ad       : null,
      musteri_telefon:  musteri ? musteri.telefon  : null,
      surucu_ad:        surucu  ? surucu.ad        : null,
      surucu_telefon:   surucu  ? surucu.telefon   : null,
      surucu_rating:    surucu  ? surucu.rating    : null,
      teklif_aciklama:  teklif  ? teklif.aciklama  : null,
      teklif_fiyat:     teklif  ? teklif.fiyat     : null,
      son_konum: sonKonum,
    });
  } catch (err) {
    console.error('Sipariş detayı hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PUT /api/siparisler/:id/durum - İş durumunu güncelle (SURUCU only)
//   Body: { durum: 'YOLA_CIKTI' | 'MOLA_VERDI' | 'TESLIM_EDILDI' }
// ═══════════════════════════════════════════════════════════════════════════════

router.put('/:id/durum', authMiddleware, async (req, res) => {
  try {
    // Yalnızca SURUCU güncelleyebilir
    if (req.user.rol !== 'SURUCU' && req.user.rol !== 'ADMIN') {
      return res.status(403).json({ hata: 'Yalnızca sürücüler iş durumunu güncelleyebilir.' });
    }

    const siparis = await db.findOne('siparisler', { id: req.params.id });
    if (!siparis) {
      return res.status(404).json({ hata: 'Sipariş bulunamadı.' });
    }

    // Sadece bu siparişin sürücüsü güncelleyebilir
    if (siparis.surucu_id !== req.user.id && req.user.rol !== 'ADMIN') {
      return res.status(403).json({ hata: 'Bu siparişi güncelleme yetkiniz yok.' });
    }

    // Zaten tamamlanmış/iptal edilmişse güncelleme yapılamaz
    if (['TAMAMLANDI', 'IPTAL'].includes(siparis.durum)) {
      return res.status(400).json({
        hata: `Sipariş "${DURUM_ETIKETLERI[siparis.durum]}" durumunda olduğu için güncellenemez.`,
      });
    }

    // Geçerli durum kontrolü
    const { durum } = req.body;
    if (!durum || !SURUCU_DURUMLARI.includes(durum)) {
      return res.status(400).json({
        hata: `Geçersiz durum. Geçerli değerler: ${SURUCU_DURUMLARI.join(', ')}`,
      });
    }

    const now          = new Date().toISOString();
    const durumEtiketi = DURUM_ETIKETLERI[durum];

    // Siparişi güncelle
    await db.update(
      'siparisler',
      { id: req.params.id },
      { $set: { durum, updated_at: now } },
      {}
    );

    // Müşteri bilgisi
    const musteri = await db.findOne('users', { id: siparis.musteri_id });
    const ilan    = await db.findOne('ilanlar', { id: siparis.ilan_id });
    const ilanBaslik = ilan ? ilan.baslik : 'Siparişiniz';

    // ── Socket.IO: Müşteriye anlık bildirim ──────────────────────────────────
    emitSocket(req, `kullanici_${siparis.musteri_id}`, 'siparis_durum', {
      siparis_id:    siparis.id,
      durum,
      durum_etiketi: durumEtiketi,
      guncelleme_at: now,
    });

    // ── Bildirim kaydı (müşteri için) ────────────────────────────────────────
    await bildirimEkle(
      siparis.musteri_id,
      'SIPARIS_DURUM',
      durumEtiketi,
      `"${ilanBaslik}" siparişinizin durumu güncellendi: ${durumEtiketi}`
    );

    // ── Teslim Edildi: ödeme oluştur + ilanı kapat + SMS ─────────────────────
    if (durum === 'TESLIM_EDILDI') {
      // Ödeme kaydı
      await db.insert('odemeler', {
        id:          uuidv4(),
        siparis_id:  siparis.id,
        musteri_id:  siparis.musteri_id,
        surucu_id:   siparis.surucu_id,
        tutar:       siparis.toplam_tutar || 0,
        durum:       'BEKLIYOR', // Müşteri onayı bekleniyor
      });

      // Ödeme durumunu siparişe işle
      await db.update('siparisler', { id: siparis.id }, { $set: { odeme_durumu: 'BEKLIYOR' } });

      // İlanı kapat
      if (ilan) {
        await db.update(
          'ilanlar',
          { id: siparis.ilan_id },
          { $set: { durum: 'TAMAMLANDI', updated_at: now } },
          {}
        );
      }

      // SMS: müşteriye teslim bildirimi
      if (musteri && musteri.telefon) {
        sms.sendSMS(
          musteri.telefon,
          `✅ TESLİMAT TAMAM - hafriyatcim.com\n` +
          `"${ilanBaslik}" siparişiniz teslim edildi.\n` +
          `Lütfen ödemeyi onaylayın: hafriyatcim.com`
        ).catch((e) => console.error('SMS hatası (teslim):', e.message));
      }
    }

    const guncellenmis = await db.findOne('siparisler', { id: req.params.id });
    res.json({
      mesaj:   `Sipariş durumu "${durumEtiketi}" olarak güncellendi.`,
      siparis: { ...guncellenmis, durum_etiketi: durumEtiketi },
    });
  } catch (err) {
    console.error('Sipariş durum güncelleme hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PUT /api/siparisler/:id/tamamla - Her iki tarafın tamamlama onayı
//   Body: { onay: true }
//   MUSTERI → musteri_onay=true, SURUCU → surucu_onay=true
//   İkisi de true olduğunda: durum=TAMAMLANDI
// ═══════════════════════════════════════════════════════════════════════════════

router.put('/:id/tamamla', authMiddleware, async (req, res) => {
  try {
    const { onay } = req.body;
    if (onay !== true) {
      return res.status(400).json({ hata: 'Onay değeri true olmalıdır.' });
    }

    const siparis = await db.findOne('siparisler', { id: req.params.id });
    if (!siparis) {
      return res.status(404).json({ hata: 'Sipariş bulunamadı.' });
    }

    // Sadece taraflar onay verebilir
    const isMusteri = siparis.musteri_id === req.user.id;
    const isSurucu  = siparis.surucu_id  === req.user.id;
    if (!isMusteri && !isSurucu && req.user.rol !== 'ADMIN') {
      return res.status(403).json({ hata: 'Bu siparişe erişim yetkiniz yok.' });
    }

    // Zaten tamamlanmışsa tekrar onaylanamaz
    if (siparis.durum === 'TAMAMLANDI') {
      return res.status(400).json({ hata: 'Sipariş zaten tamamlanmış.' });
    }

    // Onay alanını güncelle
    const guncelleme = {};
    if (isMusteri || req.user.rol === 'ADMIN') guncelleme.musteri_onay = true;
    if (isSurucu  || req.user.rol === 'ADMIN') guncelleme.surucu_onay  = true;

    await db.update(
      'siparisler',
      { id: req.params.id },
      { $set: guncelleme },
      {}
    );

    // Güncel siparişi çek
    const guncellenmis = await db.findOne('siparisler', { id: req.params.id });
    const now          = new Date().toISOString();

    // ── Her iki taraf da onayladıysa: TAMAMLANDI ─────────────────────────────
    if (guncellenmis.musteri_onay && guncellenmis.surucu_onay) {
      await db.update(
        'siparisler',
        { id: req.params.id },
        { $set: { durum: 'TAMAMLANDI', tamamlama_tarihi: now } },
        {}
      );

      const ilan = await db.findOne('ilanlar', { id: siparis.ilan_id });
      const ilanBaslik = ilan ? ilan.baslik : 'Siparişiniz';
      const bildirimIcerik = `"${ilanBaslik}" işi tamamlandı! Lütfen değerlendirme yapın.`;

      // ── Socket.IO: Her iki tarafa da bildirim ─────────────────────────────
      const socketVeri = { siparis_id: siparis.id, durum: 'TAMAMLANDI' };
      emitSocket(req, `kullanici_${siparis.musteri_id}`, 'siparis_tamamlandi', socketVeri);
      emitSocket(req, `kullanici_${siparis.surucu_id}`,  'siparis_tamamlandi', socketVeri);

      // ── Bildirimler ───────────────────────────────────────────────────────
      await Promise.all([
        bildirimEkle(siparis.musteri_id, 'IS_TAMAMLANDI', '🏁 İş Tamamlandı!', bildirimIcerik),
        bildirimEkle(siparis.surucu_id,  'IS_TAMAMLANDI', '🏁 İş Tamamlandı!', bildirimIcerik),
      ]);

      const sonHal = await db.findOne('siparisler', { id: req.params.id });
      return res.json({
        mesaj:         'Sipariş her iki tarafça onaylandı ve tamamlandı.',
        tamamlandi:    true,
        siparis:       { ...sonHal, durum_etiketi: DURUM_ETIKETLERI['TAMAMLANDI'] },
      });
    }

    // ── Henüz bir taraf onayladı ──────────────────────────────────────────────
    const bekleyenTaraf = guncellenmis.musteri_onay ? 'Sürücü' : 'Müşteri';
    res.json({
      mesaj:      `Onayınız alındı. ${bekleyenTaraf} onayı bekleniyor.`,
      tamamlandi: false,
      siparis:    guncellenmis,
    });
  } catch (err) {
    console.error('Sipariş tamamlama hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/siparisler/:id/konum - Sürücünün son bilinen konumu
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/:id/konum', authMiddleware, async (req, res) => {
  try {
    const siparis = await db.findOne('siparisler', { id: req.params.id });
    if (!siparis) {
      return res.status(404).json({ hata: 'Sipariş bulunamadı.' });
    }

    // Erişim kontrolü
    if (
      req.user.rol !== 'ADMIN' &&
      siparis.musteri_id !== req.user.id &&
      siparis.surucu_id  !== req.user.id
    ) {
      return res.status(403).json({ hata: 'Bu siparişe erişim yetkiniz yok.' });
    }

    // Koleksiyondan en son konumu getir
    const konumlar = await db.find(
      'konumlar',
      { siparis_id: req.params.id },
      { sort: { created_at: -1 }, limit: 1 }
    );

    if (konumlar.length === 0) {
      return res.json({ konum: null, mesaj: 'Henüz konum verisi yok.' });
    }

    res.json({ konum: konumlar[0] });
  } catch (err) {
    console.error('Son konum hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/siparisler/:id/konum-gecmisi - Tüm konum geçmişi
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/:id/konum-gecmisi', authMiddleware, async (req, res) => {
  try {
    const siparis = await db.findOne('siparisler', { id: req.params.id });
    if (!siparis) {
      return res.status(404).json({ hata: 'Sipariş bulunamadı.' });
    }

    if (
      req.user.rol !== 'ADMIN' &&
      siparis.musteri_id !== req.user.id &&
      siparis.surucu_id  !== req.user.id
    ) {
      return res.status(403).json({ hata: 'Bu siparişe erişim yetkiniz yok.' });
    }

    const konumlar = await db.find(
      'konumlar',
      { siparis_id: req.params.id },
      { sort: { created_at: 1 } }
    );

    res.json({ konumlar, toplam: konumlar.length });
  } catch (err) {
    console.error('Konum geçmişi hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/siparisler/:id/tamamla
// Hem müşteri hem sürücü onayı ile sipariş TAMAMLANDI yapılır.
// Her taraf kendi onay bayrağını set eder; ikisi de true olunca durum değişir.
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id/tamamla', authMiddleware, async (req, res) => {
  try {
    const siparis = await db.findOne('siparisler', { id: req.params.id });
    if (!siparis) {
      return res.status(404).json({ hata: 'Sipariş bulunamadı.' });
    }

    const userId    = req.user.id;
    const isMusteri = siparis.musteri_id === userId;
    const isSurucu  = siparis.surucu_id  === userId;
    const isAdmin   = req.user.rol === 'ADMIN';

    // Yalnızca taraflar veya admin çağırabilir
    if (!isMusteri && !isSurucu && !isAdmin) {
      return res.status(403).json({ hata: 'Bu işlem için yetkiniz yok.' });
    }

    // Zaten tamamlanmış veya iptal edilmişse işlem yapma
    if (siparis.durum === 'TAMAMLANDI') {
      return res.status(400).json({ hata: 'Sipariş zaten tamamlandı.' });
    }
    if (siparis.durum === 'IPTAL') {
      return res.status(400).json({ hata: 'İptal edilmiş siparişler tamamlanamaz.' });
    }

    const now = new Date().toISOString();

    // ── Onay bayraklarını güncelle ────────────────────────────────────────────
    const updateFields = { updated_at: now };
    if (isMusteri || isAdmin) updateFields.musteri_onay = true;
    if (isSurucu  || isAdmin) updateFields.surucu_onay  = true;

    // Güncel onay durumlarını hesapla (mevcut + yeni)
    const musteriOnay = updateFields.musteri_onay || siparis.musteri_onay || false;
    const surucuOnay  = updateFields.surucu_onay  || siparis.surucu_onay  || false;

    // Her iki taraf da onayladıysa → TAMAMLANDI
    let tamamen = false;
    if (musteriOnay && surucuOnay) {
      updateFields.durum    = 'TAMAMLANDI';
      updateFields.tamamlandi_at = now;
      tamamen = true;
    }

    await db.update(
      'siparisler',
      { id: req.params.id },
      { $set: updateFields },
      {}
    );

    // ── Bildirimler ve Socket.IO ──────────────────────────────────────────────
    if (tamamen) {
      const ilan = await db.findOne('ilanlar', { id: siparis.ilan_id });
      const ilanBaslik = ilan ? `"${ilan.baslik}"` : 'Sipariş';

      // Her iki tarafa da bildirim gönder
      const bildirimler = [
        {
          user_id: siparis.musteri_id,
          baslik:  '✅ Sipariş Tamamlandı!',
          icerik:  `${ilanBaslik} tamamlandı. Şimdi sürücünüzü puanlayabilirsiniz.`,
          emit_to: siparis.musteri_id,
        },
        {
          user_id: siparis.surucu_id,
          baslik:  '✅ Sipariş Tamamlandı!',
          icerik:  `${ilanBaslik} tamamlandı. Şimdi müşteriyi puanlayabilirsiniz.`,
          emit_to: siparis.surucu_id,
        },
      ];

      for (const b of bildirimler) {
        await db.insert('bildirimler', {
          id:         uuidv4(),
          user_id:    b.user_id,
          turu:       'SIPARIS_TAMAMLANDI',
          baslik:     b.baslik,
          icerik:     b.icerik,
          okundu:     false,
          created_at: now,
        });
      }

      try {
        const io = req.app.get('io');
        if (io) {
          for (const b of bildirimler) {
            io.to(`kullanici_${b.emit_to}`).emit('siparis_tamamlandi', {
              siparis_id: siparis.id,
              durum:      'TAMAMLANDI',
            });
            io.to(`kullanici_${b.emit_to}`).emit('yeni_bildirim', {
              baslik: b.baslik,
            });
          }
        }
      } catch (socketErr) {
        console.error('Tamamla socket emit hatası:', socketErr);
      }
    } else {
      // Henüz tek taraf onayladı — bekleyen tarafa bildir
      const bekleyenId    = isMusteri ? siparis.surucu_id : siparis.musteri_id;
      const onaylayanAdi  = req.user.ad || 'Karşı taraf';
      const bildirimBaslik = isMusteri
        ? '🔔 Müşteri Tamamlandı Olarak İşaretledi'
        : '🔔 Sürücü Tamamlandı Olarak İşaretledi';
      const bildirimIcerik = `${onaylayanAdi} siparişin tamamlandığını onayladı. Siz de onaylayın.`;

      await db.insert('bildirimler', {
        id:         uuidv4(),
        user_id:    bekleyenId,
        turu:       'TAMAMLA_ONAY_BEKLENIYOR',
        baslik:     bildirimBaslik,
        icerik:     bildirimIcerik,
        okundu:     false,
        created_at: now,
      });

      try {
        const io = req.app.get('io');
        if (io) {
          io.to(`kullanici_${bekleyenId}`).emit('tamamla_onay_bekleniyor', {
            siparis_id: siparis.id,
          });
          io.to(`kullanici_${bekleyenId}`).emit('yeni_bildirim', {
            baslik: bildirimBaslik,
          });
        }
      } catch (socketErr) {
        console.error('Tamamla onay socket emit hatası:', socketErr);
      }
    }

    const guncellenmis = await db.findOne('siparisler', { id: req.params.id });
    return res.json({
      mesaj:         tamamen
        ? 'Sipariş başarıyla tamamlandı! Her iki taraf da puanlama yapabilir.'
        : 'Onayınız alındı. Diğer tarafın onayı bekleniyor.',
      tamamlandi:    tamamen,
      musteri_onay:  guncellenmis.musteri_onay || false,
      surucu_onay:   guncellenmis.surucu_onay  || false,
      durum:         guncellenmis.durum,
    });
  } catch (err) {
    console.error('Sipariş tamamla hatası:', err);
    return res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

module.exports = router;

