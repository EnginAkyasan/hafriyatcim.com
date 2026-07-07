require('dotenv').config({ path: require('path').join(__dirname, '.env') });

// ─── JWT_SECRET Zorunluluk Kontrolü ──────────────────────────────────────────
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'gizli_anahtar_degistir') {
  console.error('HATA: JWT_SECRET .env dosyasında tanımlanmamış veya varsayılan değer kullanılıyor!');
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
app.use(express.static(path.join(__dirname, '..')));
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
    res.sendFile(path.join(__dirname, '..', 'index.html'));
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

db.init().then(() => {
  server.listen(PORT, () => {
    console.log('');
    console.log('🚛 ═══════════════════════════════════════════');
    console.log('   hafriyatcim.com Backend v2.0 Başlatıldı!');
    console.log(`   📡 API: http://localhost:${PORT}/api`);
    console.log(`   🌐 Web: http://localhost:${PORT}`);
    if (process.env.NODE_ENV !== 'production') {
      console.log('   👤 Admin: admin@hafriyatcim.com / Admin123!');
      console.log('   👤 Demo Müşteri: musteri@demo.com / Demo123!');
      console.log('   👤 Demo Sürücü: surucu@demo.com / Demo123!');
    }
    console.log('═══════════════════════════════════════════════');
    console.log('');
  });
}).catch(err => {
  console.error('❌ Veritabanı başlatılamadı:', err);
  process.exit(1);
});
