const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');

const JWT_SECRET = process.env.JWT_SECRET || 'gizli_anahtar_degistir';

/**
 * Socket.IO v4.6.x handler
 * @param {import('socket.io').Server} io
 */
module.exports = (io) => {
  // JWT kimlik doğrulama middleware'i (Socket.IO)
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.split(' ')[1];

      if (!token) {
        return next(new Error('Kimlik doğrulama hatası: Token bulunamadı.'));
      }

      let decoded;
      try {
        decoded = jwt.verify(token, JWT_SECRET);
      } catch (err) {
        return next(new Error('Kimlik doğrulama hatası: Geçersiz token.'));
      }

      const user = await db.findOne('users', { id: decoded.id });
      if (!user || !user.aktif) {
        return next(new Error('Kimlik doğrulama hatası: Kullanıcı bulunamadı veya devre dışı.'));
      }

      socket.user = user;
      next();
    } catch (err) {
      console.error('Socket auth hatası:', err);
      next(new Error('Sunucu hatası.'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.user;
    console.log(`Kullanıcı bağlandı: ${user.ad} (${user.id}) - Socket: ${socket.id}`);

    // Kullanıcıyı kendi odasına al (mesaj/bildirim almak için)
    socket.join(`kullanici_${user.id}`);

    // ─── Sipariş Takibi ────────────────────────────────────────────────────

    // siparis_katil: Sipariş odasına katıl (canlı konum takibi için)
    socket.on('siparis_katil', async (data) => {
      try {
        const { siparis_id } = data || {};
        if (!siparis_id) return;

        const siparis = await db.findOne('siparisler', { id: siparis_id });
        if (!siparis) {
          socket.emit('hata', { mesaj: 'Sipariş bulunamadı.' });
          return;
        }

        // Yalnızca sipariş tarafları odaya katılabilir
        if (
          siparis.musteri_id !== user.id &&
          siparis.surucu_id !== user.id &&
          user.rol !== 'ADMIN'
        ) {
          socket.emit('hata', { mesaj: 'Bu siparişe erişim yetkiniz yok.' });
          return;
        }

        socket.join(`siparis_${siparis_id}`);
        console.log(`${user.ad} siparis_${siparis_id} odasına katıldı.`);
        socket.emit('siparis_katilindi', { siparis_id });
      } catch (err) {
        console.error('siparis_katil hatası:', err);
        socket.emit('hata', { mesaj: 'Sunucu hatası.' });
      }
    });

    // konum_guncelle: Sürücü konumunu güncelle ve odaya yayınla
    socket.on('konum_guncelle', async (data) => {
      try {
        const { siparis_id, enlem, boylam, hiz, yon } = data || {};

        if (!siparis_id || enlem === undefined || boylam === undefined) {
          socket.emit('hata', { mesaj: 'Sipariş ID, enlem ve boylam zorunludur.' });
          return;
        }

        if (user.rol !== 'SURUCU' && user.rol !== 'ADMIN') {
          socket.emit('hata', { mesaj: 'Yalnızca sürücüler konum güncelleyebilir.' });
          return;
        }

        const siparis = await db.findOne('siparisler', { id: siparis_id });
        if (!siparis || siparis.surucu_id !== user.id) {
          socket.emit('hata', { mesaj: 'Bu siparişe erişim yetkiniz yok.' });
          return;
        }

        const now = new Date().toISOString();

        // Konumu veritabanına kaydet
        const konum = await db.insert('konumlar', {
          id: uuidv4(),
          siparis_id,
          surucu_id: user.id,
          enlem: parseFloat(enlem),
          boylam: parseFloat(boylam),
          hiz: hiz !== undefined ? parseFloat(hiz) : null,
          yon: yon !== undefined ? parseFloat(yon) : null,
          created_at: now,
        });

        // Sipariş odasındaki herkese yayınla (gönderen dahil)
        io.to(`siparis_${siparis_id}`).emit('konum_guncellendi', {
          siparis_id,
          enlem: konum.enlem,
          boylam: konum.boylam,
          hiz: konum.hiz,
          yon: konum.yon,
          zaman: now,
          surucu_ad: user.ad,
        });
      } catch (err) {
        console.error('konum_guncelle hatası:', err);
        socket.emit('hata', { mesaj: 'Sunucu hatası.' });
      }
    });

    // ─── Mesajlaşma ────────────────────────────────────────────────────────

    // mesaj_gonder: Gerçek zamanlı mesaj gönder
    socket.on('mesaj_gonder', async (data) => {
      try {
        const { alici_id, icerik, siparis_id } = data || {};

        if (!alici_id || !icerik) {
          socket.emit('hata', { mesaj: 'Alıcı ID ve içerik zorunludur.' });
          return;
        }

        if (alici_id === user.id) {
          socket.emit('hata', { mesaj: 'Kendinize mesaj gönderemezsiniz.' });
          return;
        }

        const alici = await db.findOne('users', { id: alici_id });
        if (!alici) {
          socket.emit('hata', { mesaj: 'Alıcı kullanıcı bulunamadı.' });
          return;
        }

        const now = new Date().toISOString();

        // Mesajı veritabanına kaydet
        const yeniMesaj = await db.insert('mesajlar', {
          id: uuidv4(),
          gonderen_id: user.id,
          alici_id,
          icerik,
          siparis_id: siparis_id || null,
          okundu: false,
          created_at: now,
        });

        const mesajPayload = {
          ...yeniMesaj,
          gonderen_ad: user.ad,
        };

        // Alıcının odasına gönder
        io.to(`kullanici_${alici_id}`).emit('yeni_mesaj', mesajPayload);

        // Gönderene de onay gönder
        socket.emit('mesaj_gonderildi', mesajPayload);

        // Alıcıya bildirim oluştur
        await db.insert('bildirimler', {
          id: uuidv4(),
          user_id: alici_id,
          turu: 'YENI_MESAJ',
          baslik: 'Yeni Mesaj',
          icerik: `${user.ad} size bir mesaj gönderdi.`,
          referans_id: yeniMesaj.id,
          okundu: false,
          created_at: now,
        });

        // Alıcıya bildirim eventi gönder
        io.to(`kullanici_${alici_id}`).emit('yeni_bildirim', {
          tip: 'YENI_MESAJ',
          gonderen_ad: user.ad,
        });
      } catch (err) {
        console.error('mesaj_gonder hatası:', err);
        socket.emit('hata', { mesaj: 'Sunucu hatası.' });
      }
    });

    // ─── Yazıyor Göstergesi ────────────────────────────────────────────────

    // yaziyor: Karşı kullanıcıya yazıyor bildirimi gönder
    socket.on('yaziyor', (data) => {
      try {
        const { alici_id, yaziyor } = data || {};
        if (!alici_id) return;

        io.to(`kullanici_${alici_id}`).emit('yaziyor', {
          gonderen_id: user.id,
          gonderen_ad: user.ad,
          yaziyor: !!yaziyor,
        });
      } catch (err) {
        console.error('yaziyor hatası:', err);
      }
    });

    // ─── Bağlantı Kesildi ──────────────────────────────────────────────────

    socket.on('disconnect', (reason) => {
      console.log(`Kullanıcı ayrıldı: ${user.ad} (${user.id}) - Sebep: ${reason}`);
    });

    socket.on('error', (err) => {
      console.error(`Socket hatası (${user.id}):`, err);
    });
  });
};
