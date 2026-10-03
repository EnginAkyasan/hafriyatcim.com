/**
 * hafriyatcim.com — iyzico Ödeme Servisi (resmi `iyzipay` SDK)
 *
 * Akış: Checkout Form (hosted). Kart bilgisi hiçbir zaman bu sunucuya gelmez;
 * kullanıcı iyzico'nun ödeme sayfasına yönlendirilir (paymentPageUrl),
 * 3D Secure sonrası iyzico callbackUrl'e POST ile `token` gönderir,
 * biz de `checkoutForm.retrieve` ile sonucu iyzico'dan doğrularız.
 *
 * Sandbox: https://sandbox-api.iyzipay.com
 * Production: https://api.iyzipay.com
 */

const Iyzipay = require('iyzipay');

// ─── Config ──────────────────────────────────────────────────────────────────
const IYZICO_API_KEY    = process.env.IYZICO_API_KEY    || '';
const IYZICO_SECRET_KEY = process.env.IYZICO_SECRET_KEY || '';
const IYZICO_BASE_URL   = process.env.IYZICO_BASE_URL   || 'https://sandbox-api.iyzipay.com';

// Platform ücreti: ortam değişkeniyle ayarlanabilir, varsayılan 200 ₺ net + %26 KDV = 252 ₺.
// NOT: Türkiye'de genel KDV oranı %20'dir; %26 projenin mevcut ticari varsayımıdır.
const FEE_NET  = parseFloat(process.env.PLATFORM_FEE_NET || '200');
const KDV_RATE = parseFloat(process.env.PLATFORM_KDV_ORANI || '26');
const FEE_KDV  = Math.round(FEE_NET * KDV_RATE) / 100;

const PLATFORM_FEE = {
  net:   FEE_NET,
  kdv:   FEE_KDV,
  kdv_orani: KDV_RATE,
  total: Math.round((FEE_NET + FEE_KDV) * 100) / 100,
};

let client = null;
function getClient() {
  if (!IYZICO_API_KEY || !IYZICO_SECRET_KEY) {
    throw new Error('IYZICO_API_KEY / IYZICO_SECRET_KEY tanımlı değil.');
  }
  if (!client) {
    client = new Iyzipay({ apiKey: IYZICO_API_KEY, secretKey: IYZICO_SECRET_KEY, uri: IYZICO_BASE_URL });
  }
  return client;
}

function isConfigured() {
  return Boolean(IYZICO_API_KEY && IYZICO_SECRET_KEY);
}

// SDK callback → Promise
function call(fn, req) {
  return new Promise((resolve, reject) => {
    fn(req, (err, result) => (err ? reject(err) : resolve(result)));
  });
}

function nowIyzico() {
  return new Date().toISOString().replace('T', ' ').split('.')[0];
}

function gsm(telefon) {
  if (!telefon) return '+905000000000';
  const d = String(telefon).replace(/\D/g, '').replace(/^90/, '').replace(/^0/, '');
  return `+90${d}`;
}

// ─── Checkout Form Başlat ────────────────────────────────────────────────────
/**
 * @param {Object} params
 * @param {string} params.conversationId - Benzersiz işlem ID
 * @param {Object} params.kullanici - {id, ad, soyad?, email, telefon}
 * @param {string} params.aciklama
 * @param {string} params.callbackUrl - iyzico'nun token POST edeceği URL
 * @param {string} params.ip
 * @returns {Promise<{status:string, paymentPageUrl?:string, checkoutFormContent?:string, token?:string, errorMessage?:string}>}
 */
async function initiate3DPayment({ conversationId, kullanici, aciklama, callbackUrl, ip }) {
  const price = PLATFORM_FEE.total.toFixed(2);
  const adParcalari = String(kullanici.ad || 'Ad Soyad').trim().split(/\s+/);
  const name = adParcalari[0] || 'Ad';
  const surname = kullanici.soyad || adParcalari.slice(1).join(' ') || 'Soyad';

  const request = {
    locale: Iyzipay.LOCALE.TR,
    conversationId,
    price,
    paidPrice: price,
    currency: Iyzipay.CURRENCY.TRY,
    basketId: conversationId,
    paymentGroup: Iyzipay.PAYMENT_GROUP.PRODUCT,
    callbackUrl,
    enabledInstallments: [1],
    buyer: {
      id: String(kullanici.id),
      name,
      surname,
      gsmNumber: gsm(kullanici.telefon),
      email: kullanici.email || `user-${kullanici.id}@hafriyatcim.com`,
      // iyzico zorunlu alan; gerçek TCKN toplanmadığı için sabit değer gönderilir.
      identityNumber: process.env.IYZICO_DEFAULT_IDENTITY || '11111111111',
      lastLoginDate: nowIyzico(),
      registrationDate: nowIyzico(),
      registrationAddress: 'Türkiye',
      ip: ip || '127.0.0.1',
      city: 'Istanbul',
      country: 'Turkey',
    },
    shippingAddress: { contactName: kullanici.ad || 'Ad Soyad', city: 'Istanbul', country: 'Turkey', address: 'Türkiye' },
    billingAddress:  { contactName: kullanici.ad || 'Ad Soyad', city: 'Istanbul', country: 'Turkey', address: 'Türkiye' },
    basketItems: [{
      id: conversationId,
      name: aciklama || 'hafriyatcim.com Eşleşme Ücreti',
      category1: 'Dijital Hizmet',
      itemType: Iyzipay.BASKET_ITEM_TYPE.VIRTUAL,
      price,
    }],
  };

  const c = getClient();
  const result = await call(c.checkoutFormInitialize.create.bind(c.checkoutFormInitialize), request);
  console.log('💳 iyzico checkout başlatıldı:', conversationId, '→', result.status);
  return result;
}

// ─── Callback Doğrulama ──────────────────────────────────────────────────────
/**
 * iyzico callback'inden gelen token ile ödeme sonucunu iyzico'dan çek.
 * Dönen conversationId, callback gövdesindeki değil iyzico'nun kaydettiği değerdir.
 */
async function verify3DPayment(token) {
  try {
    const c = getClient();
    const result = await call(c.checkoutForm.retrieve.bind(c.checkoutForm), {
      locale: Iyzipay.LOCALE.TR,
      token,
    });

    if (result.status === 'success' && result.paymentStatus === 'SUCCESS') {
      return {
        basarili: true,
        conversationId: result.conversationId,
        odemeId: result.paymentId,
        tutar: result.paidPrice,
      };
    }
    console.error('❌ iyzico ödeme başarısız:', result.errorMessage || result.paymentStatus);
    return { basarili: false, hata: result.errorMessage || result.errorCode || 'Ödeme başarısız' };
  } catch (err) {
    console.error('❌ iyzico doğrulama hatası:', err.message);
    return { basarili: false, hata: 'Ödeme doğrulanamadı' };
  }
}

// ─── Sandbox Simülasyonu (yalnızca NODE_ENV !== production) ─────────────────
function simulatePayment(conversationId) {
  console.log(`💳 [ÖDEME SANDBOX] ${conversationId} → ${PLATFORM_FEE.total} ₺ BAŞARILI (simüle)`);
  return {
    basarili: true,
    conversationId,
    odemeId: 'SANDBOX_' + Date.now(),
    tutar: PLATFORM_FEE.total,
    sandbox: true,
  };
}

module.exports = {
  initiate3DPayment,
  verify3DPayment,
  simulatePayment,
  isConfigured,
  PLATFORM_FEE,
};
