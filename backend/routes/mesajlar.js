const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// GET /api/mesajlar/sohbet/liste - Sohbet listesi (/:userId'den ÖNCE gelmeli)
router.get('/sohbet/liste', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    // Kullanıcının gönderdiği veya aldığı tüm mesajlar
    const gonderilen = await db.find('mesajlar', { gonderen_id: userId }, {});
    const alinan = await db.find('mesajlar', { alici_id: userId }, {});

    // Eşsiz sohbet partnerlerini bul
    const partnerIds = new Set();
    gonderilen.forEach((m) => partnerIds.add(m.alici_id));
    alinan.forEach((m) => partnerIds.add(m.gonderen_id));

    // Her partner için son mesajı ve okunmamış sayısını hesapla
    const sohbetler = await Promise.all(
      Array.from(partnerIds).map(async (partnerId) => {
        const [partner, tumMesajlar] = await Promise.all([
          db.findOne('users', { id: partnerId }),
          db.find(
            'mesajlar',
            {
              $or: [
                { gonderen_id: userId, alici_id: partnerId },
                { gonderen_id: partnerId, alici_id: userId },
              ],
            },
            { sort: { created_at: -1 } }
          ),
        ]);

        const sonMesaj = tumMesajlar.length > 0 ? tumMesajlar[0] : null;
        const okunmamis = tumMesajlar.filter(
          (m) => m.alici_id === userId && !m.okundu
        ).length;

        return {
          diger_user_id: partnerId,
          diger_ad: partner ? partner.ad : 'Bilinmiyor',
          diger_rol: partner ? partner.rol : null,
          son_mesaj: sonMesaj ? sonMesaj.icerik : null,
          son_mesaj_tarih: sonMesaj ? sonMesaj.created_at : null,
          okunmamis: okunmamis,
        };
      })
    );

    // Son mesaj tarihine göre sırala
    sohbetler.sort((a, b) => {
      if (!a.son_mesaj_tarih) return 1;
      if (!b.son_mesaj_tarih) return -1;
      return new Date(b.son_mesaj_tarih) - new Date(a.son_mesaj_tarih);
    });

    res.json({ sohbetler });
  } catch (err) {
    console.error('Sohbet listesi hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

// GET /api/mesajlar/bildirimler/okunmamis - Okunmamış mesaj sayısı (/:userId'den ÖNCE gelmeli)
router.get('/bildirimler/okunmamis', authMiddleware, async (req, res) => {
  try {
    const sayi = await db.count('mesajlar', {
      alici_id: req.user.id,
      okundu: false,
    });

    res.json({ okunmamis_sayi: sayi });
  } catch (err) {
    console.error('Okunmamış mesaj sayısı hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

// GET /api/mesajlar/:userId - İki kullanıcı arasındaki mesajlar, okundu olarak işaretle
router.get('/:userId', authMiddleware, async (req, res) => {
  try {
    const benimId = req.user.id;
    const karsimId = req.params.userId;

    const karsiKullanici = await db.findOne('users', { id: karsimId });
    if (!karsiKullanici) {
      return res.status(404).json({ hata: 'Kullanıcı bulunamadı.' });
    }

    const mesajlar = await db.find(
      'mesajlar',
      {
        $or: [
          { gonderen_id: benimId, alici_id: karsimId },
          { gonderen_id: karsimId, alici_id: benimId },
        ],
      },
      { sort: { created_at: 1 } }
    );

    // Karşıdan gelen okunmamış mesajları okundu olarak işaretle
    await db.update(
      'mesajlar',
      { gonderen_id: karsimId, alici_id: benimId, okundu: false },
      { $set: { okundu: true } },
      { multi: true }
    );

    res.json({
      mesajlar,
      karsi_kullanici: {
        id: karsiKullanici.id,
        ad: karsiKullanici.ad,
      },
    });
  } catch (err) {
    console.error('Mesaj geçmişi hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

// POST /api/mesajlar - Mesaj gönder
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { alici_id, icerik, siparis_id } = req.body;

    if (!alici_id || !icerik) {
      return res.status(400).json({ hata: 'Alıcı ID ve mesaj içeriği zorunludur.' });
    }

    const alici = await db.findOne('users', { id: alici_id });
    if (!alici) {
      return res.status(404).json({ hata: 'Alıcı bulunamadı.' });
    }

    if (alici_id === req.user.id) {
      return res.status(400).json({ hata: 'Kendinize mesaj gönderemezsiniz.' });
    }

    const now = new Date().toISOString();
    const yeniMesaj = await db.insert('mesajlar', {
      id: uuidv4(),
      gonderen_id: req.user.id,
      alici_id,
      icerik,
      siparis_id: siparis_id || null,
      okundu: false,
      created_at: now,
    });

    // Socket.IO ile alıcıya gerçek zamanlı gönder
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`kullanici_${alici_id}`).emit('yeni_mesaj', {
          ...yeniMesaj,
          gonderen_ad: req.user.ad,
        });
      }
    } catch (socketErr) {
      console.error('Socket emit hatası:', socketErr);
    }

    // Alıcıya bildirim oluştur
    await db.insert('bildirimler', {
      id: uuidv4(),
      user_id: alici_id,
      turu: 'YENI_MESAJ',
      baslik: 'Yeni Mesaj',
      icerik: `${req.user.ad} size bir mesaj gönderdi.`,
      okundu: false,
    });

    // Socket: alıcıya bildirim badge için
    try {
      const io = req.app.get('io');
      if (io) io.to(`kullanici_${alici_id}`).emit('yeni_bildirim', { baslik: 'Yeni mesaj' });
    } catch {}

    res.status(201).json({ mesaj: 'Mesaj gönderildi.', veri: yeniMesaj });
  } catch (err) {
    console.error('Mesaj gönderme hatası:', err);
    res.status(500).json({ hata: 'Sunucu hatası.' });
  }
});

module.exports = router;
