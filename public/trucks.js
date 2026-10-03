// ============================================
// hafriyatcim.com — Tır Animasyonları & Motion
// ============================================

// ── Motion CDN ile scroll animasyonları ──────
const { animate, inView, stagger } = window.Motion;

// Sayfa yüklenince hero elementlerini animate et
animate('.badge',        { opacity: [0, 1], y: [-20, 0] }, { duration: 0.6, delay: 0.1 });
animate('.hero h1',      { opacity: [0, 1], y: [40, 0]  }, { duration: 0.7, delay: 0.25 });
animate('.hero p',       { opacity: [0, 1], y: [30, 0]  }, { duration: 0.6, delay: 0.4 });
animate('.hero-buttons', { opacity: [0, 1], y: [20, 0]  }, { duration: 0.6, delay: 0.55 });
animate('.stats',        { opacity: [0, 1], y: [20, 0]  }, { duration: 0.6, delay: 0.7 });
animate('.glass-card',   { opacity: [0, 1], x: [60, 0]  }, { duration: 0.8, delay: 0.3 });

// ── InView animasyonları ──────────────────────
// Adımlar (nasıl çalışır bölümü)
inView('.step-card', ({ target }) => {
  animate(target, { opacity: [0, 1], y: [40, 0], scale: [0.95, 1] }, { duration: 0.55 });
}, { margin: '-80px' });

// Feature kartları (staggered)
inView('.features-grid', ({ target }) => {
  animate(target.querySelectorAll('.feature-card'), { opacity: [0, 1], y: [50, 0] },
    { delay: stagger(0.12), duration: 0.5 });
}, { margin: '-60px' });

// Avantajlar
inView('.benefit-item', ({ target }) => {
  animate(target, { opacity: [0, 1], x: [-30, 0] }, { duration: 0.5 });
}, { margin: '-60px' });

// Stat sayaçları animate et
inView('.stats', ({ target }) => {
  target.querySelectorAll('.stat-item h3').forEach(el => {
    const raw   = el.textContent.trim();
    const isK   = raw.includes('k');
    const isPct = raw.includes('%');
    const isDk  = raw.includes('dk');
    const num   = parseFloat(raw.replace(/[^0-9.]/g, ''));
    if (isNaN(num)) return;
    let start = 0;
    const dur = 1500;
    const step = () => {
      start += dur / 60;
      const progress = Math.min(start / dur, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const cur = Math.round(eased * num);
      el.textContent = isPct ? `%${cur}` : isDk ? `${cur}dk` : isK ? `${cur}k+` : `${cur}`;
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}, { once: true });

// ── Tır Animasyonu JS ─────────────────────────
function createTruck(options = {}) {
  const {
    lane       = 0,
    delay      = 0,
    speed      = 18,
    scale      = 1,
    color      = '#FACC15',
    type       = 'hafriyat'
  } = options;

  const wrapper = document.createElement('div');
  wrapper.className = 'truck-wrapper';
  wrapper.style.cssText = `
    position: absolute;
    bottom: ${20 + lane * 46}px;
    left: -260px;
    transform: scale(${scale});
    transform-origin: left bottom;
    animation: truckMove ${speed}s linear ${delay}s infinite;
    z-index: ${3 - lane};
    filter: drop-shadow(0 4px 8px rgba(0,0,0,0.5));
  `;

  wrapper.innerHTML = type === 'hafriyat' ? dumpTruckSVG(color) : semiTruckSVG(color);

  // Egzoz dumanı
  const exhaust = document.createElement('div');
  exhaust.className = 'exhaust-puff';
  const exhaustLeft = type === 'hafriyat' ? 140 : 178;
  exhaust.style.cssText = `animation-delay: ${delay}s; left: ${exhaustLeft}px;`;
  wrapper.appendChild(exhaust);

  return wrapper;
}

function dumpTruckSVG(color) {
  return `
  <svg width="200" height="80" viewBox="0 0 200 80" xmlns="http://www.w3.org/2000/svg">
    <g transform="translate(200,0) scale(-1,1)">
    <!-- Gövde -->
    <rect x="60" y="20" width="130" height="42" rx="4" fill="${color}" />
    <!-- Kabin -->
    <rect x="10" y="26" width="55" height="36" rx="5" fill="${color}" />
    <!-- Kabin cam -->
    <rect x="16" y="30" width="30" height="20" rx="3" fill="rgba(147,210,255,0.7)" />
    <line x1="31" y1="30" x2="31" y2="50" stroke="rgba(0,0,0,0.2)" stroke-width="1"/>
    <!-- Damper (yüklü) -->
    <rect x="62" y="10" width="126" height="30" rx="3" fill="${adjustColor(color, -30)}" />
    <rect x="64" y="12" width="122" height="26" rx="2" fill="${adjustColor(color, -15)}" />
    <!-- Detaylar -->
    <rect x="12" y="58" width="22" height="4" rx="2" fill="${adjustColor(color, -40)}" />
    <!-- Far -->
    <circle cx="14" cy="34" r="4" fill="#FFF9C4"/>
    <circle cx="14" cy="34" r="2" fill="#FFFF00" opacity="0.9"/>
    <!-- Ön tampon -->
    <rect x="8" y="52" width="6" height="8" rx="2" fill="${adjustColor(color, -50)}" />
    <!-- Egzoz borusu -->
    <rect x="55" y="18" width="5" height="14" rx="2" fill="#475569"/>
    <!-- Tekerlekler -->
    <circle cx="35"  cy="66" r="13" fill="#1e293b" /><circle cx="35"  cy="66" r="7" fill="#334155" /><circle cx="35"  cy="66" r="3" fill="#94a3b8" />
    <circle cx="100" cy="66" r="13" fill="#1e293b" /><circle cx="100" cy="66" r="7" fill="#334155" /><circle cx="100" cy="66" r="3" fill="#94a3b8" />
    <circle cx="140" cy="66" r="13" fill="#1e293b" /><circle cx="140" cy="66" r="7" fill="#334155" /><circle cx="140" cy="66" r="3" fill="#94a3b8" />
    <circle cx="170" cy="66" r="13" fill="#1e293b" /><circle cx="170" cy="66" r="7" fill="#334155" /><circle cx="170" cy="66" r="3" fill="#94a3b8" />
    <!-- Şirket yazısı (çift mirror ile okunabilir) -->
    <g transform="translate(95,0) scale(-1,1) translate(-95,0)">
      <text x="95" y="40" font-family="Inter,sans-serif" font-size="9" font-weight="700" fill="rgba(0,0,0,0.5)" text-anchor="middle">hafriyatcim.com</text>
    </g>
    </g>
  </svg>`;
}

function semiTruckSVG(color) {
  return `
  <svg width="240" height="80" viewBox="0 0 240 80" xmlns="http://www.w3.org/2000/svg">
    <g transform="translate(240,0) scale(-1,1)">
    <!-- Römork -->
    <rect x="68" y="18" width="162" height="46" rx="5" fill="#334155" />
    <rect x="70" y="20" width="158" height="42" rx="4" fill="#1e293b" />
    <rect x="72" y="22" width="154" height="6" rx="2" fill="${color}" opacity="0.7"/>
    <!-- Kabin -->
    <rect x="10" y="22" width="62" height="42" rx="6" fill="${color}" />
    <rect x="14" y="26" width="34" height="22" rx="3" fill="rgba(147,210,255,0.7)" />
    <line x1="31" y1="26" x2="31" y2="48" stroke="rgba(0,0,0,0.15)" stroke-width="1"/>
    <!-- Far -->
    <circle cx="13" cy="36" r="4" fill="#FFF9C4"/><circle cx="13" cy="36" r="2" fill="#FFFF00" opacity="0.9"/>
    <!-- Şirket yazısı (çift mirror ile okunabilir) -->
    <g transform="translate(149,0) scale(-1,1) translate(-149,0)">
      <text x="149" y="45" font-family="Inter,sans-serif" font-size="10" font-weight="700" fill="${color}" text-anchor="middle" opacity="0.9">hafriyatcim.com</text>
    </g>
    <!-- Egzoz -->
    <rect x="57" y="14" width="5" height="16" rx="2" fill="#475569"/>
    <!-- Tekerlekler -->
    <circle cx="30"  cy="66" r="12" fill="#0f172a" /><circle cx="30"  cy="66" r="6" fill="#334155" /><circle cx="30"  cy="66" r="2.5" fill="#94a3b8" />
    <circle cx="100" cy="66" r="12" fill="#0f172a" /><circle cx="100" cy="66" r="6" fill="#334155" /><circle cx="100" cy="66" r="2.5" fill="#94a3b8" />
    <circle cx="128" cy="66" r="12" fill="#0f172a" /><circle cx="128" cy="66" r="6" fill="#334155" /><circle cx="128" cy="66" r="2.5" fill="#94a3b8" />
    <circle cx="196" cy="66" r="12" fill="#0f172a" /><circle cx="196" cy="66" r="6" fill="#334155" /><circle cx="196" cy="66" r="2.5" fill="#94a3b8" />
    <circle cx="220" cy="66" r="12" fill="#0f172a" /><circle cx="220" cy="66" r="6" fill="#334155" /><circle cx="220" cy="66" r="2.5" fill="#94a3b8" />
    </g>
  </svg>`;
}

function adjustColor(hex, amount) {
  const num = parseInt(hex.replace('#',''), 16);
  const r = Math.max(0, Math.min(255, (num >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amount));
  const b = Math.max(0, Math.min(255, (num & 0xff) + amount));
  return `#${((r<<16)|(g<<8)|b).toString(16).padStart(6,'0')}`;
}

// Road scene oluştur
function buildRoadScene() {
  const scene = document.getElementById('roadScene');
  if (!scene) return;

  // Tırları oluştur
  const trucks = [
    { lane: 0, delay: 0,   speed: 22, scale: 1,    color: '#FACC15', type: 'hafriyat' },
    { lane: 1, delay: 5,   speed: 19, scale: 0.85, color: '#3B82F6', type: 'semi'     },
    { lane: 0, delay: 10,  speed: 25, scale: 0.9,  color: '#F97316', type: 'hafriyat' },
    { lane: 1, delay: 14,  speed: 20, scale: 0.8,  color: '#FACC15', type: 'hafriyat' },
    { lane: 0, delay: 18,  speed: 23, scale: 1.05, color: '#10B981', type: 'semi'     },
  ];

  trucks.forEach(opts => scene.appendChild(createTruck(opts)));
}

document.addEventListener('DOMContentLoaded', buildRoadScene);
