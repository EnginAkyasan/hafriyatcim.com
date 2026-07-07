/**
 * hafriyatcim.com — NetGSM SMS Servisi
 * Türkiye'nin en büyük SMS sağlayıcısı ile entegrasyon
 * netgsm.com.tr üzerinden API credentials alınmalı
 */

const https = require('https');
const querystring = require('querystring');

// ─── NetGSM API Config ────────────────────────────────────────────────────────
const NETGSM_CONFIG = {
  username: process.env.NETGSM_USERNAME || '',
  password: process.env.NETGSM_PASSWORD || '',
  header:   process.env.NETGSM_HEADER   || 'HAFRIYAT',   // Gönderici başlığı (max 11 karakter)
  encoding: 'TR',                                          // Türkçe karakter desteği
};

// ─── Yardımcı: Telefon numarasını temizle ─────────────────────────────────────
function formatPhone(tel) {
  if (!tel) return null;
  // 0532... → 90532..., +90532... → 90532..., boşluk/tire temizle
  let cleaned = tel.replace(/[\s\-\(\)]/g, '');
  if (cleaned.startsWith('+')) cleaned = cleaned.slice(1);
  if (cleaned.startsWith('0'))  cleaned = '9' + cleaned;
  if (!cleaned.startsWith('90')) cleaned = '90' + cleaned;
  return cleaned;
}

// ─── Yardımcı: NetGSM API çağrısı ────────────────────────────────────────────
async function sendSMS(telefonlar, mesaj) {
  // Sandbox modda sadece log yaz, gerçek SMS gönderme
  if (process.env.NODE_ENV !== 'production' && !process.env.NETGSM_USERNAME) {
    console.log('\n📱 [SMS SANDBOX] ─────────────────────────────');
    console.log(`   Alıcılar  : ${Array.isArray(telefonlar) ? telefonlar.join(', ') : telefonlar}`);
    console.log(`   Mesaj     : ${mesaj}`);
    console.log('─────────────────────────────────────────────\n');
    return { basarili: true, sandbox: true };
  }

  const numaralar = Array.isArray(telefonlar) ? telefonlar : [telefonlar];
  const formatliNumaralar = numaralar.map(formatPhone).filter(Boolean);

  if (formatliNumaralar.length === 0) {
    console.warn('⚠️  SMS: Geçerli telefon numarası bulunamadı.');
    return { basarili: false, hata: 'Geçersiz numara' };
  }

  const params = querystring.stringify({
    usercode: NETGSM_CONFIG.username,
    password: NETGSM_CONFIG.password,
    gsmno:    formatliNumaralar.join(','),
    message:  mesaj,
    msgheader: NETGSM_CONFIG.header,
    dil:      NETGSM_CONFIG.encoding,
    filter:   '0',
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.netgsm.com.tr',
      path:     `/sms/send/get/?${params}`,
      method:   'GET',
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        // NetGSM başarı kodları: 00, 01, 02
        const basarili = data.startsWith('00') || data.startsWith('01') || data.startsWith('02');
        if (basarili) {
          console.log(`✅ SMS gönderildi → ${formatliNumaralar.join(', ')}`);
        } else {
          console.error(`❌ SMS hatası → Kod: ${data}`);
        }
        resolve({ basarili, kod: data.trim() });
      });
    });

    req.on('error', (err) => {
      console.error('❌ SMS bağlantı hatası:', err.message);
      resolve({ basarili: false, hata: err.message });
    });

    req.end();
  });
}

// ─── EXPORTED SMS FONKSİYONLARI ───────────────────────────────────────────────

/**
 * Yeni ilan açıldığında tüm aktif tırcılara bildirim
 * @param {Array<{telefon: string, ad: string}>} suruculer
 * @param {{baslik: string, konum_dan: string, konum_a: string, yuk_turu: string, miktar: number, birim: string}} ilan
 */
async function sendYeniIlanNotification(suruculer, ilan) {
  if (!suruculer || suruculer.length === 0) return;

  const mesaj = `🚛 YENİ İŞ İLANI - hafriyatcim.com\n` +
    `${ilan.baslik || `${ilan.yuk_turu} Taşıma`}\n` +
    `📍 ${ilan.konum_dan} → ${ilan.konum_a}\n` +
    `📦 ${ilan.miktar} ${ilan.birim || 'ton'}\n` +
    `Teklif vermek için: hafriyatcim.com/ilanlar`;

  const telefonlar = suruculer.map(s => s.telefon).filter(Boolean);
  return sendSMS(telefonlar, mesaj);
}

/**
 * Müşteriye yeni teklif geldi bildirimi
 * @param {string} musteriTelefon
 * @param {{ad: string}} surucu
 * @param {number} fiyat
 * @param {string} ilanBaslik
 */
async function sendTeklifGeldi(musteriTelefon, surucu, fiyat, ilanBaslik) {
  const mesaj = `💼 YENİ TEKLİF - hafriyatcim.com\n` +
    `"${ilanBaslik}" ilanınıza yeni teklif!\n` +
    `Tırcı: ${surucu.ad || 'Anonim'}\n` +
    `Fiyat: ${parseFloat(fiyat).toLocaleString('tr-TR')} ₺\n` +
    `Teklifleri görmek için giriş yapın: hafriyatcim.com`;

  return sendSMS(musteriTelefon, mesaj);
}

/**
 * Müşteri "İşi Ver" tıkladı ve ödeme yaptı → Tırcıya bildirim
 * @param {string} suruculTelefon
 * @param {{ad: string}} musteri
 * @param {string} ilanBaslik
 */
async function sendIsiAlDavet(suruculTelefon, musteri, ilanBaslik) {
  const mesaj = `🎉 İŞ TEKLİFİ - hafriyatcim.com\n` +
    `"${ilanBaslik}" ilanını almak ister misiniz?\n` +
    `İş sahibi: ${musteri.ad || 'İnşaat Firması'}\n` +
    `Kabul etmek için giriş yapın ve "İşi Al" butonuna tıklayın.\n` +
    `hafriyatcim.com`;

  return sendSMS(suruculTelefon, mesaj);
}

/**
 * Her iki taraf da ödeme yaptı → İletişim bilgileri SMS ile paylaşılır
 * @param {{ad: string, telefon: string}} musteri
 * @param {{ad: string, telefon: string}} surucu
 * @param {string} ilanBaslik
 */
async function sendIletisimBilgileri(musteri, surucu, ilanBaslik) {
  // Müşteriye sürücünün numarasını gönder
  const musteriMesaj = `✅ ANLAŞMA TAMAM - hafriyatcim.com\n` +
    `"${ilanBaslik}"\n` +
    `Tırcınız: ${surucu.ad}\n` +
    `📞 Telefon: ${surucu.telefon}\n` +
    `İyi çalışmalar! hafriyatcim.com`;

  // Sürücüye müşterinin numarasını gönder
  const suruculMesaj = `✅ İŞ ONAYLANDI - hafriyatcim.com\n` +
    `"${ilanBaslik}"\n` +
    `İş sahibi: ${musteri.ad}\n` +
    `📞 Telefon: ${musteri.telefon}\n` +
    `İyi çalışmalar! hafriyatcim.com`;

  await sendSMS(musteri.telefon, musteriMesaj);
  await sendSMS(surucu.telefon, suruculMesaj);
}

/**
 * Ödeme başarılı bildirimi
 * @param {{ad: string, telefon: string}} kullanici
 * @param {number} tutar
 * @param {string} amaç
 */
async function sendOdemeOnay(kullanici, tutar, amac) {
  const mesaj = `💳 ÖDEME ALINDI - hafriyatcim.com\n` +
    `${kullanici.ad}, ödemeniz alındı.\n` +
    `Tutar: ${tutar.toLocaleString('tr-TR')} ₺\n` +
    `İşlem: ${amac}\n` +
    `Detaylar için: hafriyatcim.com`;

  return sendSMS(kullanici.telefon, mesaj);
}

/**
 * İlan iptal bildirimi
 * @param {string} telefon
 * @param {string} ilanBaslik
 */
async function sendIptal(telefon, ilanBaslik) {
  const mesaj = `❌ İLAN İPTAL - hafriyatcim.com\n` +
    `"${ilanBaslik}" ilanı iptal edildi.\n` +
    `Detaylar için: hafriyatcim.com`;

  return sendSMS(telefon, mesaj);
}

module.exports = {
  sendYeniIlanNotification,
  sendTeklifGeldi,
  sendIsiAlDavet,
  sendIletisimBilgileri,
  sendOdemeOnay,
  sendIptal,
  sendSMS, // ham erişim gerekirse
};
