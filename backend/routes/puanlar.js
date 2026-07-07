/**
 * hafriyatcim.com — Puanlama (Ratings) API Rotaları
 * ─────────────────────────────────────────────────
 * POST   /api/puanlar                          → Sipariş sonrası puan ver
 * GET    /api/puanlar/kullanici/:userId        → Kullanıcının aldığı puanlar (public)
 * GET    /api/puanlar/siparis/:siparisId/benim → Bu siparişi puanladım mı? (auth)
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// ─── Yardımcı: Kullanıcı ortalama puanını yeniden hesapla ─────────────────────
/**
 * Ağırlıklı kayan ortalama:
 *   yeni_rating = (eski_rating * eski_sayi + yeni_puan) / (eski_sayi + 1)
 *
 * @param {object} user     - Mevcut kullanıcı belgesi
 * @param {number} yeniPuan - 1–5 arası yeni puan
 * @returns {{ yeniRating: number, yeniSayi: number }}
 */
async function kullaniciPuanGuncelle(user, yeniPuan) {
  const eskiRating = typeof user.rating === 'number' ? user.rating : 0;
  const eskiSayi   = typeof user.rating_count === 'number' ? user.rating_count : 0;

  const yeniSayi   = eskiSayi + 1;
  const yeniRating = parseFloat(
    ((eskiRating * eskiSayi + yeniPuan) / yeniSayi).toFixed(2)
  );

  await db.update(
    'users',
    { id: user.id },
    { $set: { rating: yeniRating, rating_count: yeniSayi } },
    {}
  );

  return { yeniRating, yeniSayi };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/puanlar
// Body: { siparis_id, puan (1-5), yorum? }
// Auth: Zorunlu
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { siparis_id, puan, yorum } = req.body;

    // ── 1. Temel validasyon ──────────────────────────────────────────────────
    if (!siparis_id) {
      return res.status(400).json({ hata: 'siparis_id zorunludur.' });
    }

    const puanSayi = Number(puan);
    if (!Number.isInteger(puanSayi) || puanSayi < 1 || puanSayi > 5) {
      return res.status(400).json({ hata: 'Puan 1 ile 5 arasında tam sayı olmalıdır.' });
    }

    // Yorum: isteğe bağlı, en fazla 500 karakter
    const yorumTemiz = typeof yorum === 'string' ? yorum.trim().slice(0, 500) : '';

    // ── 2. Sipariş kontrolü ──────────────────────────────────────────────────
    const siparis = await db.findOne('siparisler', { id: siparis_id });
    if (!siparis) {
      return res.status(404).json({ hata: 'Sipariş bulunamadı.' });
    }

    // Kullanıcı bu siparişin müşterisi veya sürücüsü olmalı
    const veren_id  = req.user.id;
    const isMusteri = siparis.musteri_id === veren_id;
    const isSurucu  = siparis.surucu_id  === veren_id;

    if (!isMusteri && !isSurucu) {
      return res.status(403).json({ hata: 'Bu siparişi puanlamaya yetkiniz yok.' });
    }

    // ── 3. Sipariş TAMAMLANDI durumunda olmalı ───────────────────────────────
    const tamamlanmislar = ['TAMAMLANDI', 'TESLIM_EDILDI'];
    if (!tamamlanmislar.includes(siparis.durum)) {
      return res.status(400).json({
        hata: `Yalnızca tamamlanmış siparişler puanlanabilir. Mevcut durum: ${siparis.durum}`,
      });
    }

    // ── 4. Daha önce puanladı mı? (aynı sipariş için tekrar puanlama yasak) ──
    const mevcutPuan = await db.findOne('puanlar', { siparis_id, veren_id });
    if (mevcutPuan) {
      return res.status(409).json({ hata: 'Bu siparişi zaten puanladınız.' });
    }

    // ── 5. Puanlanacak kullanıcıyı belirle ───────────────────────────────────
    // Müşteri → Sürücüyü puanlar;  Sürücü → Müşteriyi puanlar
    const alan_id = isMusteri ? siparis.surucu_id : siparis.musteri_id;

    const alanKullanici = await db.findOne('users', { id: alan_id });
    if (!alanKullanici) {
      return res.status(404).json({ hata: 'Puanlanacak kullanıcı bulunamadı.' });
    }

    // ── 6. Puan belgesini kaydet ──────────────────────────────────────────────
    const now = new Date().toISOString();
    const yeniPuanDoc = await db.insert('puanlar', {
      id:         uuidv4(),
      siparis_id,
      veren_id,
      alan_id,
      puan:       puanSayi,
      yorum:      yorumTemiz,
      created_at: now,
    });

    // ── 7. Kullanıcı rating ortalamasını güncelle ─────────────────────────────
    const { yeniRating, yeniSayi } = await kullaniciPuanGuncelle(alanKullanici, puanSayi);

    // ── 8. Bildirim oluştur ───────────────────────────────────────────────────
    const [verenKullanici, ilan] = await Promise.all([
      db.findOne('users',  { id: veren_id }),
      db.findOne('ilanlar', { id: siparis.ilan_id }),
    ]);

    const verenAd    = verenKullanici ? verenKullanici.ad : 'Biri';
    const ilanBaslik = ilan ? `"${ilan.baslik}"` : 'son siparişiniz';
    const yildizlar  = '⭐'.repeat(puanSayi);

    const bildirimIcerik = yorumTemiz
      ? `${verenAd}, ${ilanBaslik} için size ${yildizlar} puan verdi: "${yorumTemiz}"`
      : `${verenAd}, ${ilanBaslik} için size ${yildizlar} puan verdi.`;

    await db.insert('bildirimler', {
      id:         uuidv4(),
      user_id:    alan_id,
      turu:       'YENI_PUAN',
      baslik:     `${yildizlar} Yeni Puan Aldınız!`,
      icerik:     bildirimIcerik,
      okundu:     false,
      created_at: now,
    });

    // ── 9. Socket.IO ile anlık bildirim ──────────────────────────────────────
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`kullanici_${alan_id}`).emit('yeni_puan', {
          siparis_id,
          puan:         puanSayi,
          yorum:        yorumTemiz,
          veren_ad:     verenAd,
          yeni_rating:  yeniRating,
          rating_count: yeniSayi,
        });
        io.to(`kullanici_${alan_id}`).emit('yeni_bildirim', {
          baslik: `${yildizlar} Yeni Puan Aldınız!`,
        });
      }
    } catch (socketErr) {
      // Socket hatası iş akışını engellememeli
      console.error('Puan socket emit hatası:', socketErr);
    }

    return res.status(201).json({
      mesaj:        'Puan başarıyla gönderildi.',
      puan:         yeniPuanDoc,
      yeni_rating:  yeniRating,
      rating_count: yeniSayi,
    });
  } catch (err) {
    console.error('Puan gönderme hatası:', err);
    return res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/puanlar/kullanici/:userId
// Public — kimlik doğrulama gerekmez
// Dönüş: son 20 puan + istatistikler
// ─────────────────────────────────────────────────────────────────────────────
router.get('/kullanici/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Kullanıcı varlık kontrolü
    const kullanici = await db.findOne('users', { id: userId });
    if (!kullanici) {
      return res.status(404).json({ hata: 'Kullanıcı bulunamadı.' });
    }

    // Son 20 puan kaydı
    const puanlar = await db.find(
      'puanlar',
      { alan_id: userId },
      { sort: { created_at: -1 }, limit: 20 }
    );

    // Her kayda veren kişinin adını ekle (gizlilik: sadece ad)
    const puanlarDetay = await Promise.all(
      puanlar.map(async (p) => {
        const veren = await db.findOne('users', { id: p.veren_id });
        return {
          id:         p.id,
          siparis_id: p.siparis_id,
          puan:       p.puan,
          yorum:      p.yorum,
          veren_ad:   veren ? veren.ad : 'Anonim',
          veren_rol:  veren ? veren.rol : null,
          created_at: p.created_at,
        };
      })
    );

    // Yıldız dağılımı (son 20 kayda göre)
    const dagilim = [1, 2, 3, 4, 5].reduce((acc, y) => {
      acc[y] = puanlar.filter((p) => p.puan === y).length;
      return acc;
    }, {});

    return res.json({
      kullanici: {
        id:           kullanici.id,
        ad:           kullanici.ad,
        rol:          kullanici.rol,
        rating:       kullanici.rating       ?? 0,
        rating_count: kullanici.rating_count ?? 0,
      },
      puanlar:  puanlarDetay,
      dagilim,
      toplam:   kullanici.rating_count ?? 0,
    });
  } catch (err) {
    console.error('Kullanıcı puanları hatası:', err);
    return res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/puanlar/siparis/:siparisId/benim
// Auth: Zorunlu
// Dönüş: { puanladim, puanim, bana_puan, benim_puanim, siparis_durum, puanlayabilir }
// ─────────────────────────────────────────────────────────────────────────────
router.get('/siparis/:siparisId/benim', authMiddleware, async (req, res) => {
  try {
    const { siparisId } = req.params;
    const veren_id = req.user.id;

    // Sipariş varlık kontrolü
    const siparis = await db.findOne('siparisler', { id: siparisId });
    if (!siparis) {
      return res.status(404).json({ hata: 'Sipariş bulunamadı.' });
    }

    // Erişim kontrolü: sadece taraflar veya admin
    const isMusteri = siparis.musteri_id === veren_id;
    const isSurucu  = siparis.surucu_id  === veren_id;

    if (!isMusteri && !isSurucu && req.user.rol !== 'ADMIN') {
      return res.status(403).json({ hata: 'Bu siparişe erişim yetkiniz yok.' });
    }

    // Benim verdiğim puan
    const mevcutPuan = await db.findOne('puanlar', {
      siparis_id: siparisId,
      veren_id,
    });

    // Karşı tarafın bana verdiği puan
    const alan_id   = isMusteri ? siparis.surucu_id : siparis.musteri_id;
    const karsiPuan = await db.findOne('puanlar', {
      siparis_id: siparisId,
      veren_id:   alan_id,
      alan_id:    veren_id,
    });

    return res.json({
      puanladim:     !!mevcutPuan,
      puanim:        mevcutPuan  || null,   // Ben verdim mi?
      bana_puan:     !!karsiPuan,
      benim_puanim:  karsiPuan  || null,    // Karşı taraf bana verdiyse detay
      siparis_durum: siparis.durum,
      // Hem sipariş tamamlanmış hem de henüz puanlamamışsa true
      puanlayabilir: ['TAMAMLANDI', 'TESLIM_EDILDI'].includes(siparis.durum) && !mevcutPuan,
    });
  } catch (err) {
    console.error('Puan kontrol hatası:', err);
    return res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

module.exports = router;
