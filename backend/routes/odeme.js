/**
 * hafriyatcim.com — Ödeme Route'ları
 * 
 * AKIŞ:
 * 1. Müşteri → POST /api/odeme/musteri/:teklifId → iyzico formu açılır
 * 2. 3D Secure tamamlanır → POST /api/odeme/callback → sipariş oluşur, tırcıya SMS
 * 3. Tırcı → POST /api/odeme/surucu/:siparisId → iyzico formu açılır  
 * 4. 3D Secure tamamlanır → POST /api/odeme/callback → iletişim bilgileri paylaşılır
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { initiate3DPayment, verify3DPayment, simulatePayment, PLATFORM_FEE } = require('../services/iyzico');
const sms = require('../services/sms');

const router = express.Router();

// ─── GET /api/odeme/bilgi — Ödeme tutarı bilgisi (public) ────────────────────
router.get('/bilgi', (req, res) => {
  res.json({
    net: PLATFORM_FEE.net,
    kdv: PLATFORM_FEE.kdv,
    kdv_orani: 26,
    toplam: PLATFORM_FEE.total,
    aciklama: 'Eşleşme başına her taraftan alınan platform ücreti',
  });
});

// ─── POST /api/odeme/musteri/:teklifId — Müşteri ödeme başlat ────────────────
router.post('/musteri/:teklifId', authMiddleware, async (req, res) => {
  try {
    // Sadece müşteri rolü
    if (req.user.rol !== 'MUSTERI' && req.user.rol !== 'ADMIN') {
      return res.status(403).json({ hata: 'Yalnızca müşteriler bu işlemi yapabilir.' });
    }

    const teklif = await db.findOne('teklifler', { id: req.params.teklifId });
    if (!teklif) return res.status(404).json({ hata: 'Teklif bulunamadı.' });
    if (teklif.durum !== 'BEKLIYOR') return res.status(400).json({ hata: 'Bu teklif artık geçerli değil.' });

    const ilan = await db.findOne('ilanlar', { id: teklif.ilan_id });
    if (!ilan) return res.status(404).json({ hata: 'İlan bulunamadı.' });
    if (ilan.user_id !== req.user.id) return res.status(403).json({ hata: 'Bu işlemi yapamazsınız.' });

    // Zaten ödeme yapıldı mı?
    const mevcutSiparis = await db.findOne('siparisler', {
      ilan_id: ilan.id,
      teklif_id: teklif.id,
      musteri_odeme_durumu: 'ODENDI',
    });
    if (mevcutSiparis) {
      return res.status(409).json({ hata: 'Bu teklif için ödeme zaten yapılmış.' });
    }

    const conversationId = `M_${req.user.id}_${teklif.id}_${Date.now()}`;
    const callbackUrl = `${process.env.FRONTEND_URL || 'http://localhost:5050'}/api/odeme/callback`;

    // Sandbox modda simüle et
    if (process.env.NODE_ENV !== 'production') {
      const sim = simulatePayment(conversationId);

      // Sipariş oluştur veya güncelle
      await _musteriOdemeBasarili(conversationId, req.user.id, teklif, ilan, sim.odemeId, req.app.get('io'));

      return res.json({
        sandbox: true,
        mesaj: 'Ödeme simüle edildi (sandbox modu).',
        conversationId,
        yonlendirme: '/dashboard.html',
      });
    }

    // Production: iyzico 3D formu
    const kullanici = await db.findOne('users', { id: req.user.id });
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    const result = await initiate3DPayment({
      conversationId,
      kullanici: { ...kullanici, id: req.user.id },
      aciklama: `İşi Ver — ${ilan.baslik || 'Hafriyat Taşıma'}`,
      callbackUrl,
      ip,
    });

    if (result.status !== 'success') {
      return res.status(400).json({ hata: result.errorMessage || 'Ödeme başlatılamadı.' });
    }

    // Geçici ödeme kaydı (callback gelince tamamlanacak)
    await db.insert('odeme_bekleyenler', {
      id: uuidv4(),
      conversation_id: conversationId,
      teklif_id: teklif.id,
      ilan_id: ilan.id,
      kullanici_id: req.user.id,
      tip: 'MUSTERI',
      durum: 'BEKLIYOR',
      created_at: new Date().toISOString(),
    });

    res.json({
      checkoutFormContent: result.checkoutFormContent,
      token: result.token,
      conversationId,
    });

  } catch (err) {
    console.error('Müşteri ödeme hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

// ─── POST /api/odeme/surucu/:siparisId — Sürücü ödeme başlat ─────────────────
router.post('/surucu/:siparisId', authMiddleware, async (req, res) => {
  try {
    if (req.user.rol !== 'SURUCU' && req.user.rol !== 'ADMIN') {
      return res.status(403).json({ hata: 'Yalnızca sürücüler bu işlemi yapabilir.' });
    }

    const siparis = await db.findOne('siparisler', { id: req.params.siparisId });
    if (!siparis) return res.status(404).json({ hata: 'Sipariş bulunamadı.' });
    if (siparis.surucu_id !== req.user.id) return res.status(403).json({ hata: 'Bu siparişe erişim yetkiniz yok.' });
    if (siparis.musteri_odeme_durumu !== 'ODENDI') {
      return res.status(400).json({ hata: 'Müşteri henüz ödeme yapmadı. Lütfen bekleyin.' });
    }
    if (siparis.surucu_odeme_durumu === 'ODENDI') {
      return res.status(409).json({ hata: 'Bu sipariş için ödemeniz zaten alınmış.' });
    }

    const ilan = await db.findOne('ilanlar', { id: siparis.ilan_id });
    const conversationId = `S_${req.user.id}_${siparis.id}_${Date.now()}`;
    const callbackUrl = `${process.env.FRONTEND_URL || 'http://localhost:5050'}/api/odeme/callback`;

    // Sandbox
    if (process.env.NODE_ENV !== 'production') {
      const sim = simulatePayment(conversationId);
      await _suruciOdemeBasarili(conversationId, req.user.id, siparis, ilan, sim.odemeId, req.app.get('io'));

      return res.json({
        sandbox: true,
        mesaj: 'Ödeme simüle edildi (sandbox modu).',
        conversationId,
        yonlendirme: '/dashboard.html',
      });
    }

    const kullanici = await db.findOne('users', { id: req.user.id });
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    const result = await initiate3DPayment({
      conversationId,
      kullanici: { ...kullanici, id: req.user.id },
      aciklama: `İşi Al — ${ilan?.baslik || 'Hafriyat Taşıma'}`,
      callbackUrl,
      ip,
    });

    if (result.status !== 'success') {
      return res.status(400).json({ hata: result.errorMessage || 'Ödeme başlatılamadı.' });
    }

    await db.insert('odeme_bekleyenler', {
      id: uuidv4(),
      conversation_id: conversationId,
      siparis_id: siparis.id,
      kullanici_id: req.user.id,
      tip: 'SURUCU',
      durum: 'BEKLIYOR',
      created_at: new Date().toISOString(),
    });

    res.json({
      checkoutFormContent: result.checkoutFormContent,
      token: result.token,
      conversationId,
    });

  } catch (err) {
    console.error('Sürücü ödeme hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

// ─── POST /api/odeme/callback — iyzico 3D Secure Callback ────────────────────
router.post('/callback', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.redirect('/odeme-hata.html?kod=TOKEN_EKSIK');

    // Token doğrula
    const sonuc = await verify3DPayment(token);

    if (!sonuc.basarili) {
      console.error('❌ Ödeme doğrulama başarısız:', sonuc.hata);
      return res.redirect(`/odeme-hata.html?mesaj=${encodeURIComponent(sonuc.hata || 'Ödeme başarısız')}`);
    }

    // Bekleyen ödemeyi bul
    const bekleyen = await db.findOne('odeme_bekleyenler', { conversation_id: sonuc.conversationId });
    if (!bekleyen) {
      console.error('❌ Bekleyen ödeme bulunamadı:', sonuc.conversationId);
      return res.redirect('/odeme-hata.html?kod=KAYIT_BULUNAMADI');
    }

    const io = req.app.get('io');

    if (bekleyen.tip === 'MUSTERI') {
      const teklif = await db.findOne('teklifler', { id: bekleyen.teklif_id });
      const ilan   = await db.findOne('ilanlar',   { id: bekleyen.ilan_id });
      await _musteriOdemeBasarili(sonuc.conversationId, bekleyen.kullanici_id, teklif, ilan, sonuc.odemeId, io);
    } else if (bekleyen.tip === 'SURUCU') {
      const siparis = await db.findOne('siparisler', { id: bekleyen.siparis_id });
      const ilan    = await db.findOne('ilanlar',    { id: siparis?.ilan_id });
      await _suruciOdemeBasarili(sonuc.conversationId, bekleyen.kullanici_id, siparis, ilan, sonuc.odemeId, io);
    }

    // Bekleyen ödeme kaydını temizle
    await db.update('odeme_bekleyenler', { conversation_id: sonuc.conversationId }, { $set: { durum: 'TAMAMLANDI' } });

    res.redirect('/odeme-basarili.html');

  } catch (err) {
    console.error('❌ Callback hatası:', err);
    res.redirect('/odeme-hata.html?kod=SUNUCU_HATASI');
  }
});

// ─── GET /api/odeme/durum/:siparisId — Sipariş ödeme durumu ─────────────────
router.get('/durum/:siparisId', authMiddleware, async (req, res) => {
  try {
    const siparis = await db.findOne('siparisler', { id: req.params.siparisId });
    if (!siparis) return res.status(404).json({ hata: 'Sipariş bulunamadı.' });

    if (siparis.musteri_id !== req.user.id && siparis.surucu_id !== req.user.id && req.user.rol !== 'ADMIN') {
      return res.status(403).json({ hata: 'Bu siparişe erişim yetkiniz yok.' });
    }

    res.json({
      musteri_odeme: siparis.musteri_odeme_durumu || 'BEKLIYOR',
      surucu_odeme:  siparis.surucu_odeme_durumu  || 'BEKLIYOR',
      iletisim_acik: siparis.iletisim_acildi       || false,
      durum:         siparis.durum,
    });
  } catch (err) {
    console.error('Ödeme durum hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

// ─── ÖZEL: Müşteri ödeme başarılı iş akışı ───────────────────────────────────
async function _musteriOdemeBasarili(conversationId, musteriId, teklif, ilan, odemeId, io) {
  try {
    // 1. Teklife KABUL ver (ilan sahibi ödedi = işi vermek istiyor)
    await db.update('teklifler', { id: teklif.id }, { $set: { durum: 'KABUL' } });

    // 2. Diğer teklifleri reddet
    await db.update('teklifler',
      { ilan_id: teklif.ilan_id, id: { $ne: teklif.id }, durum: 'BEKLIYOR' },
      { $set: { durum: 'RED' } }, { multi: true }
    );

    // 3. İlanı kapat
    await db.update('ilanlar', { id: teklif.ilan_id }, { $set: { durum: 'KAPALI' } });

    // 4. Sipariş oluştur veya güncelle
    const mevcutSiparis = await db.findOne('siparisler', { teklif_id: teklif.id });
    let siparisId;

    if (mevcutSiparis) {
      await db.update('siparisler', { id: mevcutSiparis.id }, {
        $set: {
          musteri_odeme_durumu: 'ODENDI',
          musteri_odeme_id: odemeId,
          musteri_odeme_tarihi: new Date().toISOString(),
        }
      });
      siparisId = mevcutSiparis.id;
    } else {
      const yeniSiparis = await db.insert('siparisler', {
        id: uuidv4(),
        ilan_id: teklif.ilan_id,
        teklif_id: teklif.id,
        musteri_id: musteriId,
        surucu_id: teklif.surucu_id,
        toplam_tutar: PLATFORM_FEE.total,
        baslangic_konum: ilan?.konum_dan,
        hedef_konum: ilan?.konum_a,
        durum: 'BEKLIYOR_SURUCU',
        musteri_odeme_durumu: 'ODENDI',
        surucu_odeme_durumu: 'BEKLIYOR',
        musteri_odeme_id: odemeId,
        musteri_odeme_tarihi: new Date().toISOString(),
        iletisim_acildi: false,
        conversation_id: conversationId,
      });
      siparisId = yeniSiparis.id;
    }

    // 5. Bildirim oluştur
    await db.insert('bildirimler', {
      id: uuidv4(),
      user_id: teklif.surucu_id,
      turu: 'ISI_AL_DAVETI',
      baslik: '🎉 Size İş Teklifi Var!',
      icerik: `"${ilan?.baslik || 'Hafriyat İlanı'}" ilanı için işi almak ister misiniz? Dashboard'dan "İşi Al" butonuna tıklayın. (252₺)`,
      okundu: false,
      ilgili_id: siparisId,
    });

    // 6. SMS gönder (tırcıya)
    const surucu = await db.findOne('users', { id: teklif.surucu_id });
    const musteri = await db.findOne('users', { id: musteriId });

    if (surucu?.telefon) {
      await sms.sendIsiAlDavet(surucu.telefon, musteri, ilan?.baslik || 'Hafriyat İlanı');
    }

    // 7. Socket bildirim
    if (io) {
      io.to(`kullanici_${teklif.surucu_id}`).emit('yeni_bildirim', {
        baslik: '🎉 Size İş Teklifi Var!',
        tip: 'ISI_AL_DAVETI',
        siparis_id: siparisId,
      });
    }

    console.log(`✅ Müşteri ödemesi tamamlandı. Sipariş: ${siparisId}`);
    return siparisId;

  } catch (err) {
    console.error('❌ Müşteri ödeme iş akışı hatası:', err);
    throw err;
  }
}

// ─── ÖZEL: Sürücü ödeme başarılı iş akışı ────────────────────────────────────
async function _suruciOdemeBasarili(conversationId, suruciId, siparis, ilan, odemeId, io) {
  try {
    // 1. Siparişi güncelle
    await db.update('siparisler', { id: siparis.id }, {
      $set: {
        surucu_odeme_durumu: 'ODENDI',
        surucu_odeme_id: odemeId,
        surucu_odeme_tarihi: new Date().toISOString(),
        durum: 'AKTIF',
        iletisim_acildi: true,
      }
    });

    // 2. Her iki tarafın bilgilerini çek
    const musteri = await db.findOne('users', { id: siparis.musteri_id });
    const surucu  = await db.findOne('users', { id: suruciId });

    // 3. İletişim bilgilerini SMS ile paylaş — Asıl değer burada!
    if (musteri && surucu) {
      await sms.sendIletisimBilgileri(musteri, surucu, ilan?.baslik || 'Hafriyat İlanı');
    }

    // 4. Her iki tarafa bildirim
    const bildirimler = [
      {
        user_id: siparis.musteri_id,
        baslik: '✅ Anlaşma Tamam! Tırcı Telefonu SMS ile Gönderildi',
        icerik: `${surucu?.ad || 'Tırcı'} işinizi kabul etti. Telefon: ${surucu?.telefon || '—'}`,
      },
      {
        user_id: suruciId,
        baslik: '✅ İş Onaylandı! Müşteri Telefonu SMS ile Gönderildi',
        icerik: `"${ilan?.baslik || 'Hafriyat İlanı'}" işini aldınız. Müşteri: ${musteri?.ad || '—'}, Tel: ${musteri?.telefon || '—'}`,
      },
    ];

    for (const b of bildirimler) {
      await db.insert('bildirimler', {
        id: uuidv4(),
        ...b,
        turu: 'ILETISIM_ACILDI',
        okundu: false,
        ilgili_id: siparis.id,
      });
    }

    // 5. Socket bildirim
    if (io) {
      io.to(`kullanici_${siparis.musteri_id}`).emit('yeni_bildirim', { baslik: '✅ Anlaşma Tamam!', tip: 'ILETISIM_ACILDI' });
      io.to(`kullanici_${suruciId}`).emit('yeni_bildirim', { baslik: '✅ İş Onaylandı!', tip: 'ILETISIM_ACILDI' });
    }

    console.log(`✅ Sürücü ödemesi tamamlandı. İletişim açıldı. Sipariş: ${siparis.id}`);

  } catch (err) {
    console.error('❌ Sürücü ödeme iş akışı hatası:', err);
    throw err;
  }
}

module.exports = router;
