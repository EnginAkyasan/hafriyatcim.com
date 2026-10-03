require('dotenv').config({ path: require('path').join(__dirname, '.env') });

// ─── Zorunlu Gizli Anahtar Kontrolü ──────────────────────────────────────────
const ZAYIF_SECRETLER = ['gizli_anahtar_degistir', 'refresh_gizli_anahtar_degistir'];
for (const anahtar of ['JWT_SECRET', 'REFRESH_SECRET']) {
  const deger = process.env[anahtar];
  if (!deger || ZAYIF_SECRETLER.includes(deger) || deger.length < 32) {
    console.error(`HATA: ${anahtar} tanımlanmamış, varsayılan değerde veya 32 karakterden kısa! (backend/.env.example'a bakın)`);
    process.exit(1);
  }
}
if (process.env.JWT_SECRET === process.env.REFRESH_SECRET) {
  console.error('HATA: JWT_SECRET ve REFRESH_SECRET farklı olmalıdır.');
  process.exit(1);
}

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const db = require('./db/database'); // sql.js async init
const path = require('path');

const app = express();
const server = http.createServer(app);

// Railway/ters proxy arkasında gerçek istemci IP'si (rate limit ve iyzico için)
app.set('trust proxy', 1);

const ALLOWED_ORIGINS = [
  'http://localhost:4000',
  'http://localhost:5000',
  'http://localhost:5050',
  'http://127.0.0.1:5000',
  'http://127.0.0.1:5050',
  'https://hafriyatcim.com',
  'https://www.hafriyatcim.com',
  /\.railway\.app$/,
  /\.up\.railway\.app$/,
  /\.loca\.lt$/,       // localtunnel
  /\.ngrok\.io$/,      // ngrok
  /\.ngrok-free\.app$/ // ngrok free tier
];

const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // Frontend inline CSS/JS var, şimdilik kapalı
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    const ok = ALLOWED_ORIGINS.some(o =>
      typeof o === 'string' ? o === origin : o.test(origin)
    );
    cb(ok ? null : new Error('CORS blocked'), ok);
  },
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// io'yu app'e bağla (route'lardan erişim için)
app.set('io', io);

// ─── Static Files (Frontend) ──────────────────────────────────────────────────
// Yalnızca public/ servis edilir; backend/, db dosyaları ve dokümanlar dışarı açılmaz.
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
app.use(express.static(PUBLIC_DIR));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/auth', require('./routes/google-auth'));
app.use('/api/ilanlar', require('./routes/ilanlar'));
app.use('/api/teklifler', require('./routes/teklifler'));
app.use('/api/siparisler', require('./routes/siparisler'));
app.use('/api/mesajlar', require('./routes/mesajlar'));
app.use('/api/bildirimler', require('./routes/bildirimler'));
app.use('/api/odeme', require('./routes/odeme'));
app.use('/api/puanlar', require('./routes/puanlar'));
app.use('/api/admin', require('./routes/admin'));


// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), version: '2.0.0' });
});

// ─── Socket.IO ────────────────────────────────────────────────────────────────
require('./socket')(io);

// ─── SPA Fallback (tüm HTML sayfaları için) ───────────────────────────────────
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.includes('.')) {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  } else {
    res.status(404).json({ error: 'Bulunamadı' });
  }
});

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Hata:', err.message);
  res.status(500).json({ error: 'Sunucu hatası' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

// ─── Admin Seed (ortam değişkeninden) ─────────────────────────────────────────
// ADMIN_EMAIL + ADMIN_PASSWORD tanımlıysa ve bu e-posta yoksa ADMIN kullanıcısı oluşturulur.
// Var olan bir kullanıcının rolü değiştirilmez; şifre loglanmaz.
async function seedAdmin() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const sifre = process.env.ADMIN_PASSWORD || '';
  if (!email || !sifre) {
    console.warn('⚠️  ADMIN_EMAIL / ADMIN_PASSWORD tanımlı değil; admin hesabı oluşturulmadı.');
    return;
  }
  if (sifre.length < 12) {
    console.error('HATA: ADMIN_PASSWORD en az 12 karakter olmalıdır.');
    process.exit(1);
  }
  const mevcut = await db.findOne('users', { email });
  if (mevcut) {
    if (mevcut.rol !== 'ADMIN') {
      console.warn(`⚠️  ${email} zaten kayıtlı ama rolü ${mevcut.rol}; otomatik yükseltme yapılmadı.`);
    }
    return;
  }
  const bcrypt = require('bcryptjs');
  const { v4: uuidv4 } = require('uuid');
  const now = new Date().toISOString();
  await db.insert('users', {
    id: uuidv4(),
    ad: process.env.ADMIN_NAME || 'Yönetici',
    email,
    telefon: null,
    sifre: await bcrypt.hash(sifre, 12),
    rol: 'ADMIN',
    aktif: true,
    rating: 0,
    rating_count: 0,
    created_at: now,
    updated_at: now,
  });
  console.log(`👤 Admin hesabı oluşturuldu: ${email}`);
}

db.init().then(seedAdmin).then(() => {
  server.listen(PORT, () => {
    console.log('');
    console.log('🚛 ═══════════════════════════════════════════');
    console.log('   hafriyatcim.com Backend v2.0 Başlatıldı!');
    console.log(`   📡 API: http://localhost:${PORT}/api`);
    console.log(`   🌐 Web: http://localhost:${PORT}`);
    console.log(`   🔧 Ortam: ${process.env.NODE_ENV || 'development'}`);
    console.log('═══════════════════════════════════════════════');
    console.log('');
  });
}).catch(err => {
  console.error('❌ Veritabanı başlatılamadı:', err);
  process.exit(1);
});
