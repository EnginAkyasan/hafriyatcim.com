// ─── API İstemcisi ────────────────────────────────────────────────────────────
const API_BASE = (['localhost', '127.0.0.1'].includes(location.hostname))
  ? 'http://localhost:5050/api'
  : '/api';

class ApiClient {
  constructor() {
    this.accessToken = localStorage.getItem('accessToken');
    this.refreshToken = localStorage.getItem('refreshToken');
  }

  getHeaders(extraHeaders = {}) {
    const headers = { 'Content-Type': 'application/json', ...extraHeaders };
    if (this.accessToken) headers['Authorization'] = `Bearer ${this.accessToken}`;
    return headers;
  }

  async request(method, endpoint, body = null, retry = true) {
    const options = { method, headers: this.getHeaders() };
    if (body) options.body = JSON.stringify(body);

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, options);

      if (res.status === 401 && retry) {
        const errData = await res.json();
        if (errData.code === 'TOKEN_EXPIRED') {
          const refreshed = await this.refreshAccessToken();
          if (refreshed) return this.request(method, endpoint, body, false);
        }
        this.logout();
        return null;
      }

      return res;
    } catch (err) {
      console.error('API Hatası:', err);
      throw err;
    }
  }

  async refreshAccessToken() {
    if (!this.refreshToken) return false;
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken })
      });
      if (!res.ok) return false;
      const data = await res.json();
      this.accessToken = data.accessToken;
      this.refreshToken = data.refreshToken;
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      return true;
    } catch { return false; }
  }

  async get(endpoint) { return this.request('GET', endpoint); }
  async post(endpoint, body) { return this.request('POST', endpoint, body); }
  async put(endpoint, body) { return this.request('PUT', endpoint, body); }
  async delete(endpoint) { return this.request('DELETE', endpoint); }

  setTokens(accessToken, refreshToken) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
  }

  logout() {
    if (this.refreshToken) {
      fetch(`${API_BASE}/auth/cikis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken })
      }).catch(() => {});
    }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    this.accessToken = null;
    this.refreshToken = null;
    window.location.href = '/giris.html';
  }
}

// ─── Auth Yardımcıları ─────────────────────────────────────────────────────────
const getUser = () => {
  try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
};

const isLoggedIn = () => !!localStorage.getItem('accessToken') && !!getUser();

const requireAuth = (redirectUrl = '/giris.html') => {
  if (!isLoggedIn()) {
    window.location.href = redirectUrl;
    return false;
  }
  return true;
};

const requireGuest = (redirectUrl = '/dashboard.html') => {
  if (isLoggedIn()) {
    window.location.href = redirectUrl;
    return false;
  }
  return true;
};

// ─── Toast Bildirimleri ───────────────────────────────────────────────────────
function showToast(message, type = 'success', duration = 3500) {
  const existing = document.getElementById('toast-container');
  if (!existing) {
    const container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position:fixed;top:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:10px;';
    document.body.appendChild(container);
  }

  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const colors = {
    success: 'linear-gradient(135deg,#22c55e,#16a34a)',
    error: 'linear-gradient(135deg,#ef4444,#dc2626)',
    warning: 'linear-gradient(135deg,#f59e0b,#d97706)',
    info: 'linear-gradient(135deg,#3b82f6,#2563eb)'
  };

  const toast = document.createElement('div');
  toast.style.cssText = `
    display:flex;align-items:center;gap:12px;padding:14px 20px;
    border-radius:14px;color:#fff;font-family:'Inter',sans-serif;font-size:14px;font-weight:500;
    background:${colors[type]};box-shadow:0 8px 32px rgba(0,0,0,0.25);
    animation:slideIn .3s ease;max-width:360px;
  `;
  toast.innerHTML = `<span style="font-size:18px;">${icons[type]}</span><span>${message}</span>`;

  if (!document.getElementById('toast-style')) {
    const style = document.createElement('style');
    style.id = 'toast-style';
    style.textContent = `
      @keyframes slideIn { from{transform:translateX(120%);opacity:0} to{transform:translateX(0);opacity:1} }
      @keyframes slideOut { from{transform:translateX(0);opacity:1} to{transform:translateX(120%);opacity:0} }
    `;
    document.head.appendChild(style);
  }

  document.getElementById('toast-container').appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'slideOut .3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ─── Format Yardımcıları ──────────────────────────────────────────────────────
function formatTarih(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('tr-TR', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function formatPara(amount) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(amount);
}

function formatYukTuru(turu) {
  const map = { toprak: '🟤 Toprak', kum: '🟡 Kum', cakil: '⚪ Çakıl', moloz: '🧱 Moloz',
    hafriyat: '🏗️ Hafriyat', beton: '🔘 Hazır Beton', asfalt: '⬛ Asfalt', diger: '📦 Diğer' };
  return map[turu] || turu;
}

function formatDurum(durum) {
  const map = {
    AKTIF: '<span class="badge badge-green">✅ Aktif</span>',
    KAPALI: '<span class="badge badge-yellow">🔒 Kapandı</span>',
    TAMAMLANDI: '<span class="badge badge-blue">✔️ Tamamlandı</span>',
    IPTAL: '<span class="badge badge-red">❌ İptal</span>',
    BEKLIYOR: '<span class="badge badge-yellow">⏳ Bekliyor</span>',
    KABUL: '<span class="badge badge-green">✅ Kabul</span>',
    RED: '<span class="badge badge-red">❌ Red</span>',
    YUKLENIYOR: '<span class="badge badge-yellow">📦 Yükleniyor</span>',
    YOLDA: '<span class="badge badge-blue">🚛 Yolda</span>',
    TESLIM_EDILDI: '<span class="badge badge-green">✅ Teslim Edildi</span>',
  };
  return map[durum] || `<span class="badge">${durum}</span>`;
}

// Global instance
window.api = new ApiClient();
window.getUser = getUser;
window.isLoggedIn = isLoggedIn;
window.requireAuth = requireAuth;
window.requireGuest = requireGuest;
window.showToast = showToast;
window.formatTarih = formatTarih;
window.formatPara = formatPara;
window.formatYukTuru = formatYukTuru;
window.formatDurum = formatDurum;
