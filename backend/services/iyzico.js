/**
 * hafriyatcim.com — iyzico Ödeme Servisi
 * 252₺ (200₺ + %26 KDV) eşleşme ücreti
 * Sandbox: https://sandbox-api.iyzipay.com
 * Production: https://api.iyzipay.com
 */

const https = require('https');
const crypto = require('crypto');

// ─── Config ──────────────────────────────────────────────────────────────────
const IYZICO_CONFIG = {
  apiKey:    process.env.IYZICO_API_KEY    || 'sandbox-demo-key',
  secretKey: process.env.IYZICO_SECRET_KEY || 'sandbox-demo-secret',
  baseUrl:   process.env.IYZICO_BASE_URL   || 'https://sandbox-api.iyzipay.com',
};

const PLATFORM_FEE = {
  net:  200,   // ₺
  kdv:  52,    // ₺ (%26 KDV)
  total: 252,  // ₺
};

// ─── iyzico İmzalama ─────────────────────────────────────────────────────────
function generateAuthorizationHeader(body) {
  const randomKey = Math.random().toString(36).substr(2);
  const str = IYZICO_CONFIG.apiKey + randomKey + IYZICO_CONFIG.secretKey + JSON.stringify(body);
  const hash = crypto.createHmac('sha256', IYZICO_CONFIG.secretKey)
    .update(str, 'utf8')
    .digest('base64');

  return `IYZWS apiKey="${IYZICO_CONFIG.apiKey}", randomKey="${randomKey}", signature="${hash}"`;
}

// ─── HTTP Yardımcı ───────────────────────────────────────────────────────────
function iyzicoRequest(endpoint, body) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const url = new URL(IYZICO_CONFIG.baseUrl + endpoint);
    const authHeader = generateAuthorizationHeader(body);

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Accept': 'application/json',
        'x-iyzi-rnd': Math.random().toString(36).substr(2),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ status: 'failure', errorMessage: 'JSON parse hatası: ' + data });
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error('iyzico bağlantı hatası: ' + err.message));
    });

    req.write(postData);
    req.end();
  });
}

// ─── 3D Secure Ödeme Başlat ──────────────────────────────────────────────────
/**
 * iyzico 3D Secure ödeme formu başlat
 * @param {Object} params
 * @param {string} params.conversationId - Benzersiz işlem ID (siparis_id + tipi)
 * @param {Object} params.kullanici - {id, ad, soyad, email, telefon}
 * @param {string} params.aciklama - Ödeme açıklaması (ör: "Eşleşme Ücreti - İş #123")
 * @param {string} params.callbackUrl - 3D Secure dönüş URL
 * @param {string} params.ip - Kullanıcı IP
 * @returns {Promise<{checkoutFormContent?: string, paymentPageUrl?: string, token?: string, status: string}>}
 */
async function initiate3DPayment({ conversationId, kullanici, aciklama, callbackUrl, ip }) {
  const body = {
    locale: 'tr',
    conversationId: conversationId,
    price: PLATFORM_FEE.total.toFixed(2),
    paidPrice: PLATFORM_FEE.total.toFixed(2),
    currency: 'TRY',
    basketId: conversationId,
    paymentGroup: 'PRODUCT',
    callbackUrl: callbackUrl,
    enabledInstallments: [1],
    buyer: {
      id: kullanici.id,
      name: kullanici.ad || 'Ad',
      surname: kullanici.soyad || 'Soyad',
      gsmNumber: kullanici.telefon ? `+90${kullanici.telefon.replace(/^0/, '').replace(/^\+90/, '')}` : '+905000000000',
      email: kullanici.email || `user${kullanici.id}@hafriyatcim.com`,
      identityNumber: '11111111111', // Production'da gerçek TC gerekir
      lastLoginDate: new Date().toISOString().replace('T', ' ').split('.')[0],
      registrationDate: new Date().toISOString().replace('T', ' ').split('.')[0],
      registrationAddress: 'Türkiye',
      ip: ip || '85.34.78.112',
      city: 'Istanbul',
      country: 'Turkey',
    },
    shippingAddress: {
      contactName: kullanici.ad || 'Ad Soyad',
      city: 'Istanbul',
      country: 'Turkey',
      address: 'Türkiye',
    },
    billingAddress: {
      contactName: kullanici.ad || 'Ad Soyad',
      city: 'Istanbul',
      country: 'Turkey',
      address: 'Türkiye',
    },
    basketItems: [
      {
        id: conversationId,
        name: aciklama || 'hafriyatcim.com Eşleşme Ücreti',
        category1: 'Dijital Hizmet',
        itemType: 'VIRTUAL',
        price: PLATFORM_FEE.total.toFixed(2),
      },
    ],
  };

  try {
    const result = await iyzicoRequest('/payment/iyzipos/checkoutform/initialize/auth/ecom', body);
    console.log('💳 iyzico 3D başlatıldı:', conversationId, '→ Status:', result.status);
    return result;
  } catch (err) {
    console.error('❌ iyzico başlatma hatası:', err.message);
    throw err;
  }
}

// ─── 3D Secure Callback Doğrulama ────────────────────────────────────────────
/**
 * iyzico callback'ten gelen token ile ödemeyi doğrula
 * @param {string} token - iyzico'dan gelen token
 * @returns {Promise<{basarili: boolean, conversationId?: string, odemeId?: string, hata?: string}>}
 */
async function verify3DPayment(token) {
  const body = {
    locale: 'tr',
    token: token,
  };

  try {
    const result = await iyzicoRequest('/payment/iyzipos/checkoutform/auth/ecom/detail', body);

    if (result.status === 'success' && result.paymentStatus === 'SUCCESS') {
      console.log('✅ iyzico ödeme doğrulandı:', result.paymentId);
      return {
        basarili: true,
        conversationId: result.conversationId,
        odemeId: result.paymentId,
        tutar: result.paidPrice,
      };
    } else {
      console.error('❌ iyzico ödeme başarısız:', result.errorMessage);
      return {
        basarili: false,
        hata: result.errorMessage || result.errorCode || 'Ödeme başarısız',
      };
    }
  } catch (err) {
    console.error('❌ iyzico doğrulama hatası:', err.message);
    return { basarili: false, hata: err.message };
  }
}

// ─── Sandbox Test ─────────────────────────────────────────────────────────────
/**
 * Geliştirme ortamında ödeme simüle et
 */
function simulatePayment(conversationId) {
  console.log('\n💳 [ÖDEME SANDBOX] ─────────────────────────────');
  console.log(`   Conversation ID : ${conversationId}`);
  console.log(`   Tutar           : ${PLATFORM_FEE.total} ₺ (${PLATFORM_FEE.net}₺ + ${PLATFORM_FEE.kdv}₺ KDV)`);
  console.log(`   Durum           : BAŞARILI (Sandbox)`);
  console.log('─────────────────────────────────────────────────\n');
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
  PLATFORM_FEE,
};
