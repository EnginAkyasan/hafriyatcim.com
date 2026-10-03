// ─── Güvenlik: HTML Escape Yardımcısı ────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Dashboard Controller ─────────────────────────────────────────────────────
let currentUser = null;
let socket = null;
let trackMap = null;
let trackMarker = null;
let activeChatUserId = null;
let currentAdminTab = 'kullanicilar';
let notifDropdownOpen = false;

// ─── Başlatma ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;

  currentUser = getUser();

  // ─── Rol bazlı yönlendirme ───────────────────────────────────────────────
  // dashboard.html artık sadece router — rolüne göre doğru panele gönder
  if (window.location.pathname.endsWith('dashboard.html') || window.location.pathname === '/dashboard') {
    if (currentUser.rol === 'SURUCU' || currentUser.rol === 'FIRMA') {
      window.location.replace('firma-dashboard.html');
      return;
    } else if (currentUser.rol === 'MUSTERI') {
      window.location.replace('musteri-dashboard.html');
      return;
    }
    // ADMIN: dashboard.html'de kal
  }

  setupUI();
  await setupSocket();
  showSection('sec-dashboard');
  loadBildirimler();
});

function setupUI() {
  // Avatar & isim
  const initials = currentUser.ad.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  document.getElementById('userAvatar').textContent = initials;
  document.getElementById('userName').textContent = currentUser.ad;
  document.getElementById('userRoleLabel').textContent =
    currentUser.rol === 'MUSTERI' ? '🏗️ İnşaat Sahibi' :
    currentUser.rol === 'SURUCU' ? '🚛 Sürücü' : '👑 Admin';

  // Sidebar navigation (role-based)
  buildSidebar();
}

function buildSidebar() {
  const nav = document.getElementById('sidebarNav');
  const items = getSidebarItems();
  nav.innerHTML = items.map(item => {
    if (item.type === 'label') {
      return `<div class="nav-section-label">${item.text}</div>`;
    }
    return `
      <div class="nav-item" id="nav-${item.id}" onclick="showSection('sec-${item.id}')">
        <span class="nav-icon">${item.icon}</span>
        <span>${item.label}</span>
        <span class="nav-badge" id="badge-${item.id}"></span>
      </div>
    `;
  }).join('');
}

function getSidebarItems() {
  const common = [
    { id: 'dashboard', icon: '📊', label: 'Dashboard' },
    { id: 'siparisler', icon: '📦', label: 'Siparişlerim' },
    { id: 'takip', icon: '🗺️', label: 'Canlı Takip' },
    { id: 'mesajlar', icon: '💬', label: 'Mesajlar' },
    { type: 'label', text: 'Hesap' },
    { id: 'profil', icon: '👤', label: 'Profilim' },
  ];

  if (currentUser.rol === 'MUSTERI') {
    return [
      { id: 'dashboard', icon: '📊', label: 'Dashboard' },
      { type: 'label', text: 'İlanlar' },
      { id: 'ilanlar', icon: '📋', label: 'İlanlarım' },
      { id: 'yeni-ilan', icon: '➕', label: 'Yeni İlan' },
      { type: 'label', text: 'Operasyon' },
      { id: 'siparisler', icon: '📦', label: 'Siparişlerim' },
      { id: 'takip', icon: '🗺️', label: 'Canlı Takip' },
      { id: 'mesajlar', icon: '💬', label: 'Mesajlar' },
      { type: 'label', text: 'Hesap' },
      { id: 'profil', icon: '👤', label: 'Profilim' },
    ];
  }

  if (currentUser.rol === 'SURUCU') {
    return [
      { id: 'dashboard', icon: '📊', label: 'Dashboard' },
      { type: 'label', text: 'İş Bul' },
      { id: 'tum-ilanlar', icon: '🔍', label: 'Aktif İlanlar' },
      { id: 'tekliflerim', icon: '💼', label: 'Tekliflerim' },
      { type: 'label', text: 'Operasyon' },
      { id: 'siparisler', icon: '📦', label: 'Siparişlerim' },
      { id: 'takip', icon: '🗺️', label: 'Konum Paylaş' },
      { id: 'mesajlar', icon: '💬', label: 'Mesajlar' },
      { type: 'label', text: 'Hesap' },
      { id: 'profil', icon: '👤', label: 'Profilim' },
    ];
  }

  if (currentUser.rol === 'ADMIN') {
    return [
      { id: 'dashboard', icon: '📊', label: 'Dashboard' },
      { type: 'label', text: 'Yönetim' },
      { id: 'admin', icon: '👑', label: 'Admin Paneli' },
      { id: 'ilanlar', icon: '📋', label: 'Tüm İlanlar' },
      { id: 'siparisler', icon: '📦', label: 'Tüm Siparişler' },
      { id: 'mesajlar', icon: '💬', label: 'Mesajlar' },
      { type: 'label', text: 'Hesap' },
      { id: 'profil', icon: '👤', label: 'Profilim' },
    ];
  }

  return common;
}

// ─── Sayfa Geçişi ─────────────────────────────────────────────────────────────
function showSection(sectionId) {
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const section = document.getElementById(sectionId);
  if (section) section.classList.add('active');

  const navId = sectionId.replace('sec-', '');
  const navItem = document.getElementById(`nav-${navId}`);
  if (navItem) navItem.classList.add('active');

  // Sayfa başlıkları
  const titles = {
    'sec-dashboard': ['Dashboard', 'Genel bakış ve özet bilgiler'],
    'sec-ilanlar': ['İlanlarım', 'Oluşturduğunuz hafriyat ilanları'],
    'sec-tum-ilanlar': ['Aktif İlanlar', 'Teklif verebileceğiniz ilanlar'],
    'sec-yeni-ilan': ['Yeni İlan', 'Yeni hafriyat ilanı oluştur'],
    'sec-tekliflerim': ['Tekliflerim', 'Verdiğiniz tekliflerin durumu'],
    'sec-siparisler': ['Siparişlerim', 'Aktif ve geçmiş siparişler'],
    'sec-takip': ['Canlı Takip', 'Gerçek zamanlı konum takibi'],
    'sec-mesajlar': ['Mesajlar', 'Sürücü ve müşteri sohbetleri'],
    'sec-admin': ['Admin Paneli', 'Platform yönetimi ve istatistikler'],
    'sec-profil': ['Profilim', 'Hesap bilgileri ve ayarlar'],
  };

  const [title, subtitle] = titles[sectionId] || ['Dashboard', ''];
  document.getElementById('pageTitle').textContent = title;
  document.getElementById('pageSubtitle').textContent = subtitle;

  // Section-specific data loading
  switch (sectionId) {
    case 'sec-dashboard': loadDashboard(); break;
    case 'sec-ilanlar': loadBenimIlanlar(); break;
    case 'sec-tum-ilanlar': loadTumIlanlar(); break;
    case 'sec-tekliflerim': loadTekliflerim(); break;
    case 'sec-siparisler': loadSiparisler(); break;
    case 'sec-takip': initTakip(); break;
    case 'sec-mesajlar': loadMesajlar(); break;
    case 'sec-admin': loadAdmin(); break;
    case 'sec-profil': loadProfil(); break;
  }
}

// ─── Socket.IO ────────────────────────────────────────────────────────────────
async function setupSocket() {
  const token = localStorage.getItem('accessToken');
  if (!token) return;

  const SOCKET_URL = ['localhost', '127.0.0.1'].includes(location.hostname)
    ? 'http://localhost:5050'
    : window.location.origin;
  socket = io(SOCKET_URL, { auth: { token } });

  // Bağlantı logları production'da devre dışı bırakıldı (güvenlik)
  // socket.on('connect', () => console.log('🔌 Socket bağlı'));
  // socket.on('disconnect', () => console.log('🔌 Socket ayrıldı'));

  socket.on('yeni_mesaj', (mesaj) => {
    if (activeChatUserId === mesaj.gonderen_id) {
      appendMessage(mesaj, false);
    }
    showToast(`${escapeHtml(mesaj.gonderen_ad)}: ${escapeHtml(mesaj.icerik.substring(0, 40))}`, 'info');
    updateBadge('mesajlar');
  });

  socket.on('bildirim', (bildirim) => {
    showToast(bildirim.icerik, 'info');
    updateBadge('dashboard');
    loadBildirimler();
  });

  socket.on('siparis_durum', ({ siparisId, durum }) => {
    showToast(`Sipariş durumu: ${durum}`, 'info');
  });

  socket.on('konum_guncellendi', (data) => {
    updateMapMarker(data.lat, data.lng);
  });
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
async function loadDashboard() {
  const grid = document.getElementById('statsGrid');
  const cards = document.getElementById('dashboardCards');

  try {
    // Siparişleri çek
    const siparisRes = await api.get('/siparisler');
    const siparisData = await siparisRes.json();
    const siparisler = siparisData.siparisler || [];

    let statsHTML = '';

    if (currentUser.rol === 'MUSTERI') {
      const ilanRes = await api.get('/ilanlar/benim/liste');
      const ilanData = await ilanRes.json();
      const ilanlar = ilanData.ilanlar || [];
      const aktifIlan = ilanlar.filter(i => i.durum === 'AKTIF').length;
      const aktifSiparis = siparisler.filter(s => s.durum === 'YOLDA' || s.durum === 'YUKLENIYOR').length;
      const tamamlanan = siparisler.filter(s => s.durum === 'TESLIM_EDILDI').length;

      statsHTML = `
        <div class="stat-card"><div class="stat-card-label">📋 Aktif İlan</div><div class="stat-card-value" style="color:var(--primary)">${aktifIlan}</div><div class="stat-card-sub">${ilanlar.length} toplam ilan</div></div>
        <div class="stat-card"><div class="stat-card-label">🚛 Aktif Sipariş</div><div class="stat-card-value" style="color:var(--warning)">${aktifSiparis}</div><div class="stat-card-sub">Devam eden taşıma</div></div>
        <div class="stat-card"><div class="stat-card-label">✅ Tamamlanan</div><div class="stat-card-value" style="color:var(--success)">${tamamlanan}</div><div class="stat-card-sub">Başarılı teslimat</div></div>
        <div class="stat-card"><div class="stat-card-label">📦 Toplam Sipariş</div><div class="stat-card-value">${siparisler.length}</div><div class="stat-card-sub">Tüm zamanlar</div></div>
      `;

      // Son ilanlar kartı
      const sonIlanlar = ilanlar.slice(0, 3);
      cards.innerHTML = `
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
            <h3 style="font-size:16px;font-weight:700;">Son İlanlar</h3>
            <button class="btn-outline" style="padding:6px 14px;font-size:12px;" onclick="showSection('sec-ilanlar')">Tümü →</button>
          </div>
          ${sonIlanlar.length ? sonIlanlar.map(ilan => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--border);">
              <div>
                <div style="font-size:14px;font-weight:600;">${formatYukTuru(ilan.yuk_turu)}</div>
                <div style="font-size:12px;color:var(--text-muted);">${ilan.konum_dan} → ${ilan.konum_a}</div>
              </div>
              <div style="text-align:right;">
                ${formatDurum(ilan.durum)}
                <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">${ilan.teklif_sayisi} teklif</div>
              </div>
            </div>
          `).join('') : '<div class="empty-state" style="padding:32px 0;"><p>Henüz ilan yok</p><button class="btn-primary" onclick="showSection(\'sec-yeni-ilan\')" style="margin-top:12px;">+ İlan Oluştur</button></div>'}
        </div>
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
            <h3 style="font-size:16px;font-weight:700;">Son Siparişler</h3>
            <button class="btn-outline" style="padding:6px 14px;font-size:12px;" onclick="showSection('sec-siparisler')">Tümü →</button>
          </div>
          ${siparisler.slice(0,3).map(s => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--border);">
              <div>
                <div style="font-size:14px;font-weight:600;">${s.ilan_baslik || s.yuk_turu}</div>
                <div style="font-size:12px;color:var(--text-muted);">🚛 ${s.surucu_ad}</div>
              </div>
              ${formatDurum(s.durum)}
            </div>
          `).join('') || '<div style="padding:32px 0;text-align:center;color:var(--text-muted);">Henüz sipariş yok</div>'}
        </div>
      `;

    } else if (currentUser.rol === 'SURUCU') {
      const teklifRes = await api.get('/teklifler/benim');
      const teklifData = await teklifRes.json();
      const teklifler = teklifData.teklifler || [];
      const bekleyen = teklifler.filter(t => t.durum === 'BEKLIYOR').length;
      const kabul = teklifler.filter(t => t.durum === 'KABUL').length;
      const aktifSiparis = siparisler.filter(s => s.durum === 'YOLDA').length;

      statsHTML = `
        <div class="stat-card"><div class="stat-card-label">💼 Bekleyen Teklif</div><div class="stat-card-value" style="color:var(--warning)">${bekleyen}</div><div class="stat-card-sub">Yanıt bekleniyor</div></div>
        <div class="stat-card"><div class="stat-card-label">✅ Kabul Edilen</div><div class="stat-card-value" style="color:var(--success)">${kabul}</div><div class="stat-card-sub">Toplam teklif</div></div>
        <div class="stat-card"><div class="stat-card-label">🚛 Aktif Taşıma</div><div class="stat-card-value" style="color:var(--primary)">${aktifSiparis}</div><div class="stat-card-sub">Şu an yolda</div></div>
        <div class="stat-card"><div class="stat-card-label">📦 Toplam Teslimat</div><div class="stat-card-value">${siparisler.filter(s => s.durum === 'TESLIM_EDILDI').length}</div><div class="stat-card-sub">Tamamlanan</div></div>
      `;
      cards.innerHTML = `
        <div class="card">
          <h3 style="font-size:16px;font-weight:700;margin-bottom:16px;">Son Teklifler</h3>
          ${teklifler.slice(0,4).map(t => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);">
              <div>
                <div style="font-size:13px;font-weight:600;">${t.ilan_baslik}</div>
                <div style="font-size:11px;color:var(--text-muted);">${formatPara(t.fiyat)}</div>
              </div>
              ${formatDurum(t.durum)}
            </div>
          `).join('') || '<p style="color:var(--text-muted);font-size:14px;">Henüz teklif vermediniz</p>'}
        </div>
        <div class="card">
          <h3 style="font-size:16px;font-weight:700;margin-bottom:16px;">Hızlı Erişim</h3>
          <div style="display:flex;flex-direction:column;gap:10px;">
            <button class="btn-primary btn-large" onclick="showSection('sec-tum-ilanlar')">🔍 Aktif İlanları Gör</button>
            <button class="btn-secondary btn-large" onclick="showSection('sec-siparisler')">📦 Siparişlerim</button>
            <button class="btn-secondary btn-large" onclick="showSection('sec-takip')">📍 Konum Paylaş</button>
          </div>
        </div>
      `;
    } else if (currentUser.rol === 'ADMIN') {
      const adminRes = await api.get('/admin/istatistik');
      if (adminRes && adminRes.ok) {
        const stats = await adminRes.json();
        statsHTML = `
          <div class="stat-card"><div class="stat-card-label">👥 Toplam Kullanıcı</div><div class="stat-card-value" style="color:var(--primary)">${stats.kullanicilar.toplam}</div><div class="stat-card-sub">${stats.kullanicilar.musteri} müşteri · ${stats.kullanicilar.surucu} sürücü</div></div>
          <div class="stat-card"><div class="stat-card-label">📋 Aktif İlan</div><div class="stat-card-value" style="color:var(--warning)">${stats.ilanlar.aktif}</div><div class="stat-card-sub">${stats.ilanlar.toplam} toplam</div></div>
          <div class="stat-card"><div class="stat-card-label">📦 Bu Ay Sipariş</div><div class="stat-card-value" style="color:var(--success)">${stats.siparisler.bu_ay}</div><div class="stat-card-sub">${stats.siparisler.tamamlanan} tamamlanan</div></div>
          <div class="stat-card"><div class="stat-card-label">💰 Toplam Ciro</div><div class="stat-card-value">${formatPara(stats.finans.toplam_ciro)}</div><div class="stat-card-sub">Tamamlanan ödemeler</div></div>
        `;
      }
      cards.innerHTML = `
        <div class="card">
          <h3 style="font-size:16px;font-weight:700;margin-bottom:16px;">Hızlı Yönetim</h3>
          <div style="display:flex;flex-direction:column;gap:10px;">
            <button class="btn-primary btn-large" onclick="showSection('sec-admin')">👑 Admin Paneline Git</button>
          </div>
        </div>
        <div class="card"><p style="color:var(--text-muted);">Platform sağlıklı çalışıyor ✅</p></div>
      `;
    }

    grid.innerHTML = statsHTML;
  } catch (err) {
    console.error('Dashboard yükleme hatası:', err);
    grid.innerHTML = '<div class="empty-state"><p>Veriler yüklenirken hata oluştu</p></div>';
  }
}

// ─── İlanlar ─────────────────────────────────────────────────────────────────
async function loadBenimIlanlar() {
  const container = document.getElementById('ilanlarContainer');
  container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    const res = await api.get('/ilanlar/benim/liste');
    const data = await res.json();
    const ilanlar = data.ilanlar || [];

    if (!ilanlar.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <h3>Henüz İlan Yok</h3>
          <p>İlk hafriyat ilanınızı oluşturun, sürücüler sizi bulsun!</p>
          <button class="btn-primary btn-large" onclick="showSection('sec-yeni-ilan')">+ Yeni İlan Oluştur</button>
        </div>
      `;
      return;
    }

    container.innerHTML = `<div class="ilan-grid">${ilanlar.map(ilan => ilanKart(ilan, true)).join('')}</div>`;
  } catch { container.innerHTML = '<div class="empty-state"><p>Yükleme hatası</p></div>'; }
}

async function loadTumIlanlar() {
  const container = document.getElementById('tumIlanlarContainer');
  container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  const filter = document.getElementById('filterYuk')?.value || 'all';
  const endpoint = filter === 'all' ? '/ilanlar' : `/ilanlar?yuk_turu=${filter}`;

  try {
    const res = await api.get(endpoint);
    const data = await res.json();
    const ilanlar = data.ilanlar || [];

    if (!ilanlar.length) {
      container.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="empty-icon">📋</div><h3>İlan Bulunamadı</h3><p>Şu an aktif ilan yok.</p></div>`;
      return;
    }

    container.innerHTML = ilanlar.map(ilan => ilanKart(ilan, false)).join('');
  } catch { container.innerHTML = '<div class="empty-state"><p>Yükleme hatası</p></div>'; }
}

function ilanKart(ilan, isOwner) {
  return `
    <div class="ilan-card">
      <div class="ilan-card-header">
        <div>
          <div class="ilan-yuk">${formatYukTuru(ilan.yuk_turu).split(' ')[0]}</div>
          <div class="ilan-title">${formatYukTuru(ilan.yuk_turu)}</div>
          <div class="ilan-route">📍 ${ilan.konum_dan} → ${ilan.konum_a}</div>
        </div>
        ${formatDurum(ilan.durum)}
      </div>
      <div class="ilan-card-body">
        <div class="ilan-meta">
          <div class="ilan-meta-row">
            <span class="label">Miktar</span>
            <span class="value">${ilan.miktar} ${ilan.birim}</span>
          </div>
          <div class="ilan-meta-row">
            <span class="label">Fiyat</span>
            <span class="value price-value">${formatPara(ilan.fiyat)}/${ilan.birim}</span>
          </div>
          <div class="ilan-meta-row">
            <span class="label">Teklif Sayısı</span>
            <span class="value"><span class="badge badge-orange">${ilan.teklif_sayisi || 0} teklif</span></span>
          </div>
          ${ilan.baslama_tarihi ? `<div class="ilan-meta-row"><span class="label">Başlama</span><span class="value">${new Date(ilan.baslama_tarihi).toLocaleDateString('tr-TR')}</span></div>` : ''}
        </div>
      </div>
      <div class="ilan-card-footer">
        ${isOwner
          ? `<button class="btn-outline" style="padding:7px 14px;font-size:13px;" onclick="showTeklifler('${ilan.id}')">📋 Teklifleri Gör (${ilan.teklif_sayisi})</button>
             <button class="btn-danger" style="margin-left:auto;" onclick="ilanIptal('${ilan.id}')">İptal</button>`
          : `<button class="btn-primary" style="padding:7px 14px;font-size:13px;width:100%;" onclick="showTeklifVer('${ilan.id}', '${ilan.yuk_turu}', ${ilan.fiyat})">💼 Teklif Ver</button>`
        }
      </div>
    </div>
  `;
}

async function handleIlanSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('ilanSubmitBtn');
  btn.textContent = 'Yayınlanıyor...'; btn.disabled = true;

  try {
    const res = await api.post('/ilanlar', {
      yuk_turu: document.getElementById('iYukTuru').value,
      miktar: parseFloat(document.getElementById('iMiktar').value),
      birim: document.getElementById('iBirim').value,
      fiyat: parseFloat(document.getElementById('iFiyat').value),
      konum_dan: document.getElementById('iKonumDan').value,
      konum_a: document.getElementById('iKonumA').value,
      aciklama: document.getElementById('iAciklama').value,
      baslama_tarihi: document.getElementById('iTarih').value,
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'İlan oluşturulamadı', 'error'); return; }

    showToast('İlan başarıyla yayınlandı! 🎉', 'success');
    document.getElementById('ilanForm').reset();
    setTimeout(() => showSection('sec-ilanlar'), 800);
  } catch { showToast('Bağlantı hatası', 'error'); }
  finally { btn.textContent = 'İlan Yayınla 🚀'; btn.disabled = false; }
}

async function ilanIptal(ilanId) {
  if (!confirm('Bu ilanı iptal etmek istiyor musunuz?')) return;
  const res = await api.delete(`/ilanlar/${ilanId}`);
  if (res.ok) { showToast('İlan iptal edildi', 'warning'); loadBenimIlanlar(); }
  else showToast('İptal işlemi başarısız', 'error');
}

// Teklif Ver Modal
function showTeklifVer(ilanId, yukTuru, oneriFiyat) {
  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.id = 'teklifModal';
  modal.innerHTML = `
    <div class="modal-content" style="max-width:480px;">
      <div class="modal-icon">💼</div>
      <h2>Teklif Ver</h2>
      <p style="margin-bottom:20px;">İlan: ${formatYukTuru(yukTuru)}</p>
      <form onsubmit="submitTeklif(event,'${ilanId}')" style="display:flex;flex-direction:column;gap:14px;">
        <div class="input-group">
          <label>Fiyat Teklifiniz (₺)</label>
          <div class="input-wrapper">
            <input type="number" id="teklifFiyat" value="${oneriFiyat}" min="1" required placeholder="Teklif fiyatı">
            <span class="input-suffix">₺</span>
          </div>
        </div>
        <div class="input-group">
          <label>💰 Taşıma Bedeli (Toplam Sefer Ücreti)</label>
          <div class="input-wrapper">
            <input type="number" id="teklifSeferBedeli" placeholder="Ör: 30000" min="1">
            <span class="input-suffix">₺</span>
          </div>
          <small style="font-size:11px;color:var(--text-muted);margin-top:4px;display:block;" id="komisyonHesap">
            Komisyon: —
          </small>
        </div>
        <div class="input-group">
          <label>Araç Bilgisi</label>
          <div class="input-wrapper"><input type="text" id="teklifArac" placeholder="Ör: Ford Cargo 1833 - 18 ton"></div>
        </div>
        <div class="input-group">
          <label>Mesajınız</label>
          <div class="input-wrapper"><textarea id="teklifMesaj" rows="2" placeholder="Müşteriye bir not ekleyin..."></textarea></div>
        </div>
        <div style="display:flex;gap:10px;">
          <button type="submit" class="btn-primary btn-large" style="flex:1;">Teklifi Gönder 🚀</button>
          <button type="button" class="btn-secondary" onclick="document.getElementById('teklifModal').remove()">İptal</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);

  // Komisyon hesaplama
  setTimeout(() => {
    const seferInput = document.getElementById('teklifSeferBedeli');
    const komisyonEl = document.getElementById('komisyonHesap');
    if (seferInput && komisyonEl) {
      seferInput.addEventListener('input', () => {
        const bedel = parseFloat(seferInput.value) || 0;
        const komisyon = Math.max(252, Math.round(bedel * 0.01));
        if (bedel > 0) {
          komisyonEl.innerHTML = `Platform komisyonu: <strong style="color:var(--primary)">${komisyon.toLocaleString('tr-TR')} ₺</strong> (her taraftan) — Toplam: <strong>${(komisyon*2).toLocaleString('tr-TR')} ₺</strong>`;
        } else {
          komisyonEl.textContent = 'Komisyon: —';
        }
      });
    }
  }, 100);
}

async function submitTeklif(e, ilanId) {
  e.preventDefault();
  const seferBedeli = parseFloat(document.getElementById('teklifSeferBedeli')?.value) || 0;
  const komisyon = Math.max(252, Math.round(seferBedeli * 0.01));
  const res = await api.post('/teklifler', {
    ilan_id: ilanId,
    fiyat: parseFloat(document.getElementById('teklifFiyat').value),
    arac_bilgisi: document.getElementById('teklifArac').value,
    mesaj: document.getElementById('teklifMesaj').value,
    sefer_bedeli: seferBedeli,
    komisyon: komisyon,
  });
  const data = await res.json();
  if (res.ok) {
    showToast('Teklifiniz gönderildi! 🎉', 'success');
    document.getElementById('teklifModal').remove();
  } else {
    showToast(data.error || 'Teklif gönderilemedi', 'error');
  }
}

// Teklifleri göster
async function showTeklifler(ilanId) {
  const res = await api.get(`/teklifler/ilan/${ilanId}`);
  const data = await res.json();
  const teklifler = data.teklifler || [];

  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.id = 'tekliflerModal';
  modal.innerHTML = `
    <div class="modal-content" style="max-width:600px;max-height:80vh;overflow-y:auto;">
      <h2 style="margin-bottom:24px;">📋 Teklifler (${teklifler.length})</h2>
      ${teklifler.length ? teklifler.map(t => `
        <div class="teklif-card" style="margin-bottom:12px;">
          <div class="teklif-avatar">${t.surucu_ad.split(' ').map(w=>w[0]).join('').slice(0,2)}</div>
          <div class="teklif-info">
            <div class="teklif-name">${t.surucu_ad}</div>
            <div class="teklif-rating">⭐ ${t.surucu_rating || 0} · ${t.surucu_telefon || ''}</div>
            ${t.arac_bilgisi ? `<div class="teklif-mesaj">🚛 ${t.arac_bilgisi}</div>` : ''}
            ${t.mesaj ? `<div class="teklif-mesaj">💬 ${t.mesaj}</div>` : ''}
          </div>
          <div style="text-align:right;">
            <div class="teklif-price">${formatPara(t.fiyat)}</div>
            ${t.sefer_bedeli ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">
              Sefer: ${parseFloat(t.sefer_bedeli).toLocaleString('tr-TR')} ₺ ·
              Komisyon: ${Math.max(252, Math.round(t.sefer_bedeli*0.01)).toLocaleString('tr-TR')} ₺/taraf
            </div>` : ''}
            ${formatDurum(t.durum)}
            ${t.durum === 'BEKLIYOR' ? `
              <div class="teklif-actions" style="margin-top:8px;">
                <button class="btn-primary" style="padding:6px 12px;font-size:12px;" onclick="kabul('${t.id}')">✅ Kabul</button>
                <button class="btn-danger" style="padding:6px 12px;font-size:12px;" onclick="reddet('${t.id}')">❌ Red</button>
              </div>
            ` : ''}
          </div>
        </div>
      `).join('') : '<div class="empty-state"><p>Henüz teklif yok</p></div>'}
      <button class="btn-secondary btn-full" style="margin-top:16px;" onclick="document.getElementById('tekliflerModal').remove()">Kapat</button>
    </div>
  `;
  document.body.appendChild(modal);
}

async function kabul(teklifId) {
  // Artık direkt kabul değil — ödeme sayfasına yönlendiriyoruz
  const teklifModal = document.getElementById('tekliflerModal');
  const ilanBaslik = teklifModal?.querySelector('h2')?.textContent?.replace(/Teklifler.*/, '').trim() || 'Hafriyat İşi';
  
  if (!confirm('Bu tırcıya işi vermek istiyor musunuz?\n\n→ Onaylarsanız 252 ₺ platform ücreti ödeme sayfasına yönlendirileceksiniz.')) return;
  
  // Ödeme sayfasına yönlendir
  const baslik = encodeURIComponent('Hafriyat İşi');
  window.location.href = `/odeme.html?tip=musteri&id=${teklifId}&baslik=${baslik}`;
}

async function reddet(teklifId) {
  const res = await api.put(`/teklifler/${teklifId}/red`);
  if (res.ok) { showToast('Teklif reddedildi', 'warning'); document.getElementById('tekliflerModal')?.remove(); loadBenimIlanlar(); }
}

// ─── Tekliflerim (Sürücü) ─────────────────────────────────────────────────────
async function loadTekliflerim() {
  const container = document.getElementById('tekliflerimContainer');
  container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    const res = await api.get('/teklifler/benim');
    const data = await res.json();
    const teklifler = data.teklifler || [];

    if (!teklifler.length) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">💼</div><h3>Henüz Teklif Yok</h3><p>Aktif ilanlara teklif verin ve iş kazanın.</p><button class="btn-primary btn-large" onclick="showSection('sec-tum-ilanlar')">🔍 İlanları Gör</button></div>`;
      return;
    }

    container.innerHTML = teklifler.map(t => `
      <div class="teklif-card">
        <div class="teklif-avatar" style="background:var(--surface-4);">💼</div>
        <div class="teklif-info">
          <div class="teklif-name">${t.ilan_baslik}</div>
          <div class="teklif-rating">📍 ${t.konum_dan} → ${t.konum_a}</div>
          <div class="teklif-mesaj">📏 ${t.miktar} ${t.birim} · ${formatTarih(t.created_at)}</div>
        </div>
        <div style="text-align:right;">
          <div class="teklif-price">${formatPara(t.fiyat)}</div>
          ${formatDurum(t.durum)}
        </div>
      </div>
    `).join('');
  } catch { container.innerHTML = '<div class="empty-state"><p>Yükleme hatası</p></div>'; }
}

// ─── Siparişler ───────────────────────────────────────────────────────────────
async function loadSiparisler() {
  const container = document.getElementById('siparislerContainer');
  container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    const res = await api.get('/siparisler');
    const data = await res.json();
    const siparisler = data.siparisler || [];

    if (!siparisler.length) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">📦</div><h3>Henüz Sipariş Yok</h3></div>`;
      return;
    }

    container.innerHTML = `
      <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;">
        <table class="data-table">
          <thead><tr>
            <th>Sipariş</th><th>Güzergah</th>
            ${currentUser.rol === 'MUSTERI' ? '<th>Sürücü</th>' : '<th>Müşteri</th>'}
            <th>Tutar</th><th>Durum</th><th>Ödeme</th><th>İşlem</th>
          </tr></thead>
          <tbody>
            ${siparisler.map(s => `
              <tr>
                <td><div style="font-size:13px;font-weight:600;">${s.ilan_baslik || s.yuk_turu}</div><div style="font-size:11px;color:var(--text-muted);">${formatTarih(s.created_at)}</div></td>
                <td style="font-size:13px;">${s.baslangic_konum} → ${s.hedef_konum}</td>
                <td style="font-size:13px;">${currentUser.rol === 'MUSTERI' ? (s.surucu_ad || '-') : (s.musteri_ad || '-')}</td>
                <td style="font-weight:700;color:var(--primary);">${s.toplam_tutar ? formatPara(s.toplam_tutar) : '-'}</td>
                <td>${formatDurum(s.durum)}</td>
                <td>${formatDurum(s.odeme_durumu)}</td>
                <td>
                  ${currentUser.rol === 'SURUCU' && (s.durum === 'BEKLIYOR' || s.durum === 'YUKLENIYOR' || s.durum === 'YOLDA') ? `
                    <select onchange="durumGuncelle('${s.id}',this.value)" style="background:var(--surface-3);border:1px solid var(--border);color:var(--text);padding:5px 8px;border-radius:6px;font-size:12px;">
                      <option>Güncelle</option>
                      <option value="YUKLENIYOR">📦 Yükleniyor</option>
                      <option value="YOLDA">🚛 Yolda</option>
                      <option value="TESLIM_EDILDI">✅ Teslim Edildi</option>
                    </select>
                  ` : ''}
                  ${currentUser.rol === 'SURUCU' && s.durum === 'BEKLIYOR_SURUCU' && s.musteri_odeme_durumu === 'ODENDI' && s.surucu_odeme_durumu !== 'ODENDI' ? `
                    <div style="text-align:center;">
                      <div style="font-size:11px;color:#f59e0b;margin-bottom:6px;">⏳ Müşteri ödedi, sıra sizde!</div>
                      <button class="btn-primary" style="padding:6px 12px;font-size:12px;background:linear-gradient(135deg,#22c55e,#16a34a);border:none;border-radius:8px;color:#fff;cursor:pointer;font-weight:700;"
                        onclick="isiAlOdeme('${s.id}','${(s.ilan_baslik||'Hafriyat').replace(/'/g,'')}')">✅ İşi Al — 252 ₺</button>
                    </div>
                  ` : ''}
                  ${s.iletisim_acildi ? `
                    <div style="font-size:11px;color:#22c55e;font-weight:600;">📞 İletişim Açıldı ✓</div>
                  ` : ''}
                  ${(s.durum === 'TESLIM_EDILDI' || s.durum === 'TAMAMLANDI') && !s._puanVerildi ? `
                    <button class="btn-outline" style="padding:5px 10px;font-size:12px;margin-top:4px;" onclick="puanVer('${s.id}', '${currentUser.rol === 'MUSTERI' ? s.surucu_id : s.musteri_id}', '${currentUser.rol === 'MUSTERI' ? (s.surucu_ad||'Sürücü') : (s.musteri_ad||'Müşteri')}')">⭐ Puan Ver</button>
                  ` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch { container.innerHTML = '<div class="empty-state"><p>Yükleme hatası</p></div>'; }
}

async function durumGuncelle(siparisId, durum) {
  if (durum === 'Güncelle') return;
  const res = await api.put(`/siparisler/${siparisId}/durum`, { durum });
  if (res.ok) { showToast(`Durum güncellendi: ${durum}`, 'success'); loadSiparisler(); }
  else showToast('Güncelleme başarısız', 'error');
}

// ─── Puan Ver ─────────────────────────────────────────────────────────────────
function puanVer(siparisId, hedefKullaniciId, hedefAd) {
  // Daha önce puan verildi mi kontrol et
  api.get(`/puanlar/siparis/${siparisId}/benim`).then(async res => {
    const data = await res.json();
    if (data.puanladim) {
      showToast('Bu siparişi zaten puanladınız.', 'warning');
      return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'puanModal';
    modal.innerHTML = `
      <div class="modal-content" style="max-width:420px;">
        <div class="modal-icon">⭐</div>
        <h2>${hedefAd} için Puan Ver</h2>
        <p style="margin-bottom:20px;color:var(--text-muted);font-size:14px;">Deneyiminizi paylaşın</p>
        <div style="display:flex;gap:8px;justify-content:center;margin-bottom:20px;" id="yildizlar">
          ${[1,2,3,4,5].map(i => `
            <span id="yildiz-${i}" onclick="yildizSec(${i})"
              style="font-size:36px;cursor:pointer;color:var(--border);transition:color 0.15s;" title="${i} yıldız">★</span>
          `).join('')}
        </div>
        <div style="margin-bottom:16px;">
          <textarea id="puanYorum" rows="3" placeholder="Yorum ekleyin (isteğe bağlı)"
            style="width:100%;background:var(--surface-2);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:10px 14px;font-size:14px;font-family:var(--font);resize:vertical;"></textarea>
        </div>
        <div style="display:flex;gap:10px;">
          <button class="btn-primary btn-large" style="flex:1;" onclick="submitPuan('${siparisId}')">Puanı Gönder ⭐</button>
          <button class="btn-secondary" onclick="document.getElementById('puanModal').remove()">İptal</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    window._secilenPuan = 0;
  }).catch(() => {
    // API erişilemiyorsa doğrudan modal aç
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'puanModal';
    modal.innerHTML = `
      <div class="modal-content" style="max-width:420px;">
        <div class="modal-icon">⭐</div>
        <h2>${hedefAd} için Puan Ver</h2>
        <div style="display:flex;gap:8px;justify-content:center;margin-bottom:20px;" id="yildizlar">
          ${[1,2,3,4,5].map(i => `
            <span id="yildiz-${i}" onclick="yildizSec(${i})"
              style="font-size:36px;cursor:pointer;color:var(--border);transition:color 0.15s;" title="${i} yıldız">★</span>
          `).join('')}
        </div>
        <div style="margin-bottom:16px;">
          <textarea id="puanYorum" rows="3" placeholder="Yorum ekleyin (isteğe bağlı)"
            style="width:100%;background:var(--surface-2);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:10px 14px;font-size:14px;font-family:var(--font);resize:vertical;"></textarea>
        </div>
        <div style="display:flex;gap:10px;">
          <button class="btn-primary btn-large" style="flex:1;" onclick="submitPuan('${siparisId}')">Puanı Gönder ⭐</button>
          <button class="btn-secondary" onclick="document.getElementById('puanModal').remove()">İptal</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    window._secilenPuan = 0;
  });
}

function yildizSec(puan) {
  window._secilenPuan = puan;
  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById(`yildiz-${i}`);
    if (el) el.style.color = i <= puan ? '#f59e0b' : 'var(--border)';
  }
}

async function submitPuan(siparisId) {
  const puan = window._secilenPuan || 0;
  if (!puan) { showToast('Lütfen bir yıldız seçin', 'warning'); return; }
  const yorum = document.getElementById('puanYorum')?.value?.trim() || '';

  try {
    const res = await api.post('/puanlar', { siparis_id: siparisId, puan, yorum });
    const data = await res.json();
    if (!res.ok) { showToast(data.hata || 'Puan gönderilemedi', 'error'); return; }

    showToast('Puanınız gönderildi! Teşekkürler ⭐', 'success');
    document.getElementById('puanModal')?.remove();
    // Butonu kaldır
    document.querySelectorAll('button[onclick*="puanVer"]').forEach(btn => {
      if (btn.closest('tr')) btn.remove();
    });
  } catch { showToast('Bağlantı hatası', 'error'); }
}

// ─── İşi Al — Sürücü ödeme yönlendirmesi ────────────────────────────────────
function isiAlOdeme(siparisId, baslik) {
  if (!confirm(`"${baslik}" işini almak istiyor musunuz?\n\n→ 252 ₺ platform ücreti ödenecek\n→ Müşterinin telefon numarası SMS ile size gönderilecek\n→ Müşteri de sizin numaranızı alacak`)) return;

  const enc = encodeURIComponent(baslik);
  window.location.href = `/odeme.html?tip=surucu&id=${siparisId}&baslik=${enc}`;
}

// ─── Canlı Takip ─────────────────────────────────────────────────────────────
function initTakip() {
  if (!trackMap) {
    trackMap = L.map('trackMap').setView([39.9334, 32.8597], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(trackMap);
  }

  if (currentUser.rol === 'SURUCU') {
    initSurucuTakip();
  } else {
    initMusteriTakip();
  }
}

function initSurucuTakip() {
  const bilgi = document.getElementById('takipBilgi');
  bilgi.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <h3 style="font-size:16px;font-weight:700;margin-bottom:12px;">📍 Konum Paylaş</h3>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">Aktif siparişiniz için konumunuzu gerçek zamanlı paylaşın.</p>
      <div class="input-group" style="margin-bottom:12px;">
        <label>Sipariş Seç</label>
        <div class="input-wrapper"><select id="aktifSiparisSelect"><option value="">Seçin...</option></select></div>
      </div>
      <button id="konumBtn" class="btn-primary btn-full" onclick="toggleKonumPaylas()">📡 Konum Paylaşmaya Başla</button>
      <div id="konumStatus" style="margin-top:10px;font-size:13px;color:var(--text-muted);text-align:center;"></div>
    </div>
  `;

  // Aktif siparişleri yükle
  api.get('/siparisler').then(res => res.json()).then(data => {
    const select = document.getElementById('aktifSiparisSelect');
    const aktifler = (data.siparisler || []).filter(s => s.durum === 'YOLDA' || s.durum === 'YUKLENIYOR');
    aktifler.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.ilan_baslik} → ${s.hedef_konum}`;
      select.appendChild(opt);
    });
  });
}

let konumInterval = null;
let paylasiyor = false;

function toggleKonumPaylas() {
  const siparisId = document.getElementById('aktifSiparisSelect')?.value;
  if (!siparisId) { showToast('Lütfen bir sipariş seçin', 'warning'); return; }

  const btn = document.getElementById('konumBtn');
  const status = document.getElementById('konumStatus');

  if (!paylasiyor) {
    paylasiyor = true;
    btn.textContent = '⏹ Durdur';
    btn.style.background = 'var(--error)';
    socket?.emit('siparis_katil', siparisId);

    if (!navigator.geolocation) { showToast('Tarayıcınız konum desteklemiyor', 'error'); return; }

    konumInterval = setInterval(() => {
      navigator.geolocation.getCurrentPosition((pos) => {
        const { latitude: lat, longitude: lng, speed } = pos.coords;
        socket?.emit('konum_guncelle', { siparisId, lat, lng, hiz: speed || 0 });
        updateMapMarker(lat, lng);
        status.textContent = `📡 Konum paylaşılıyor: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      }, () => {
        // Demo: Ankara civarında sahte hareket
        const demoLat = 39.9334 + (Math.random() - 0.5) * 0.01;
        const demoLng = 32.8597 + (Math.random() - 0.5) * 0.01;
        socket?.emit('konum_guncelle', { siparisId, lat: demoLat, lng: demoLng, hiz: 60 });
        updateMapMarker(demoLat, demoLng);
        status.textContent = `📡 Demo konum: ${demoLat.toFixed(5)}, ${demoLng.toFixed(5)}`;
      });
    }, 3000);

  } else {
    paylasiyor = false;
    clearInterval(konumInterval);
    btn.textContent = '📡 Konum Paylaşmaya Başla';
    btn.style.background = '';
    status.textContent = 'Konum paylaşımı durduruldu.';
  }
}

function initMusteriTakip() {
  const bilgi = document.getElementById('takipBilgi');
  api.get('/siparisler').then(res => res.json()).then(data => {
    const aktif = (data.siparisler || []).find(s => s.durum === 'YOLDA');
    if (!aktif) return;

    socket?.emit('siparis_katil', aktif.id);
    bilgi.innerHTML = `
      <div class="card" style="margin-bottom:16px;">
        <h3 style="font-size:15px;font-weight:700;margin-bottom:8px;">${aktif.ilan_baslik}</h3>
        <div style="font-size:13px;color:var(--text-muted);">🚛 ${aktif.surucu_ad}</div>
        <div style="margin-top:12px;">${formatDurum(aktif.durum)}</div>
      </div>
    `;
  });
}

function updateMapMarker(lat, lng) {
  if (!trackMap) return;
  const pos = [lat, lng];
  if (!trackMarker) {
    const icon = L.divIcon({
      html: '<div style="width:36px;height:36px;background:var(--primary);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 4px 12px rgba(249,115,22,0.4);">🚛</div>',
      iconSize: [36, 36], iconAnchor: [18, 18], className: ''
    });
    trackMarker = L.marker(pos, { icon }).addTo(trackMap);
  } else {
    trackMarker.setLatLng(pos);
  }
  trackMap.panTo(pos, { animate: true, duration: 1 });
}

// ─── Mesajlar ─────────────────────────────────────────────────────────────────
async function loadMesajlar() {
  const chatList = document.getElementById('chatList');
  chatList.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    const res = await api.get('/mesajlar/sohbet/liste');
    const data = await res.json();
    const sohbetler = data.sohbetler || [];

    if (!sohbetler.length) {
      chatList.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px;">Henüz sohbet yok</div>';
      return;
    }

    chatList.innerHTML = sohbetler.map(s => `
      <div class="chat-item" onclick="openChat('${s.diger_user_id}','${s.diger_ad}','${s.diger_rol}')">
        <div class="chat-avatar">${s.diger_ad.split(' ').map(w=>w[0]).join('').slice(0,2)}</div>
        <div class="chat-item-info">
          <div class="chat-item-name">${s.diger_ad}</div>
          <div class="chat-item-preview">${s.son_mesaj || 'Mesaj yok'}</div>
        </div>
        ${s.okunmamis > 0 ? `<span class="chat-unread">${s.okunmamis}</span>` : ''}
      </div>
    `).join('');
  } catch { chatList.innerHTML = '<div style="padding:20px;color:var(--error);">Yükleme hatası</div>'; }
}

async function openChat(userId, ad, rol) {
  activeChatUserId = userId;
  document.querySelectorAll('.chat-item').forEach(i => i.classList.remove('active'));

  const chatWindow = document.getElementById('chatWindow');
  chatWindow.innerHTML = `
    <div class="chat-header">
      <div class="chat-avatar">${ad.split(' ').map(w=>w[0]).join('').slice(0,2)}</div>
      <div>
        <div style="font-weight:700;">${ad}</div>
        <div style="font-size:12px;color:var(--text-muted);">${rol === 'SURUCU' ? '🚛 Sürücü' : '🏗️ Müşteri'}</div>
      </div>
    </div>
    <div class="chat-messages" id="chatMessages"><div class="loading"><div class="spinner"></div></div></div>
    <div class="chat-input-area">
      <div class="chat-input">
        <div class="input-wrapper">
          <input type="text" id="chatInput" placeholder="Mesajınızı yazın..." onkeypress="if(event.key==='Enter') sendMessage('${userId}')">
        </div>
      </div>
      <button class="btn-primary" onclick="sendMessage('${userId}')">Gönder</button>
    </div>
  `;

  const res = await api.get(`/mesajlar/${userId}`);
  const data = await res.json();
  const msgs = document.getElementById('chatMessages');
  const mesajlar = data.mesajlar || [];

  if (!mesajlar.length) {
    msgs.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">Henüz mesaj yok. Merhaba deyin! 👋</div>';
  } else {
    msgs.innerHTML = mesajlar.map(m => {
      const isSent = m.gonderen_id === currentUser.id;
      return `
        <div class="message ${isSent ? 'sent' : 'received'}">
          ${escapeHtml(m.icerik)}
          <div class="message-time">${new Date(m.created_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}</div>
        </div>
      `;
    }).join('');
    msgs.scrollTop = msgs.scrollHeight;
  }
}

async function sendMessage(aliciId) {
  const input = document.getElementById('chatInput');
  const icerik = input.value.trim();
  if (!icerik) return;
  input.value = '';

  socket?.emit('mesaj_gonder', { alici_id: aliciId, icerik });

  const msgs = document.getElementById('chatMessages');
  if (msgs) {
    const div = document.createElement('div');
    div.className = 'message sent';
    div.innerHTML = `${escapeHtml(icerik)}<div class="message-time">Şimdi</div>`;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }
}

function appendMessage(mesaj, isSent) {
  const msgs = document.getElementById('chatMessages');
  if (!msgs) return;
  const div = document.createElement('div');
  div.className = `message ${isSent ? 'sent' : 'received'}`;
  div.innerHTML = `${escapeHtml(mesaj.icerik)}<div class="message-time">${new Date(mesaj.created_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}</div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

// ─── Admin ────────────────────────────────────────────────────────────────────
async function loadAdmin() {
  const statsGrid = document.getElementById('adminStatsGrid');

  try {
    const res = await api.get('/admin/istatistik');
    if (!res) return;
    const stats = await res.json();

    statsGrid.innerHTML = `
      <div class="admin-stat"><div class="admin-stat-label">👤 Kullanıcılar</div><div class="admin-stat-val" style="color:var(--primary)">${stats.kullanicilar.toplam}</div><div class="admin-stat-sub">${stats.kullanicilar.musteri} müşteri · ${stats.kullanicilar.surucu} sürücü</div></div>
      <div class="admin-stat"><div class="admin-stat-label">📋 İlanlar</div><div class="admin-stat-val" style="color:var(--warning)">${stats.ilanlar.aktif} aktif</div><div class="admin-stat-sub">${stats.ilanlar.toplam} toplam</div></div>
      <div class="admin-stat"><div class="admin-stat-label">📦 Siparişler</div><div class="admin-stat-val" style="color:var(--success)">${stats.siparisler.tamamlanan}</div><div class="admin-stat-sub">${stats.siparisler.bu_ay} bu ay</div></div>
      <div class="admin-stat"><div class="admin-stat-label">💰 Toplam Ciro</div><div class="admin-stat-val">${formatPara(stats.finans.toplam_ciro)}</div><div class="admin-stat-sub">Demo ödeme</div></div>
    `;
  } catch {}

  switchAdminTab('kullanicilar', document.querySelector('.admin-tab'));
}

async function switchAdminTab(tab, btn) {
  currentAdminTab = tab;
  document.querySelectorAll('.admin-tab').forEach(b => {
    b.style.color = 'var(--text-muted)';
    b.style.borderBottomColor = 'transparent';
  });
  if (btn) { btn.style.color = 'var(--primary)'; btn.style.borderBottom = '2px solid var(--primary)'; }

  const container = document.getElementById('adminTableContainer');
  container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  let res, data, html;

  try {
    if (tab === 'kullanicilar') {
      res = await api.get('/admin/kullanicilar'); data = await res.json();
      html = `<table class="data-table"><thead><tr><th>Ad</th><th>E-posta</th><th>Telefon</th><th>Rol</th><th>Kayıt</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>
        ${(data.kullanicilar||[]).map(u => `<tr>
          <td style="font-weight:600;">${u.ad}</td><td>${u.email}</td><td>${u.telefon||'-'}</td>
          <td><span class="badge badge-orange">${u.rol}</span></td>
          <td style="font-size:12px;">${new Date(u.created_at).toLocaleDateString('tr-TR')}</td>
          <td>${u.aktif ? '<span class="badge badge-green">Aktif</span>' : '<span class="badge badge-red">Askıda</span>'}</td>
          <td><button class="${u.aktif?'btn-danger':'btn-primary'}" style="padding:4px 10px;font-size:12px;" onclick="toggleKullanici('${u.id}',${!u.aktif})">${u.aktif?'Askıya Al':'Aktifleştir'}</button></td>
        </tr>`).join('')}
      </tbody></table>`;
    } else if (tab === 'ilanlar') {
      res = await api.get('/admin/ilanlar'); data = await res.json();
      html = `<table class="data-table"><thead><tr><th>İlan</th><th>Müşteri</th><th>Yük</th><th>Güzergah</th><th>Fiyat</th><th>Durum</th><th>Teklif</th></tr></thead><tbody>
        ${(data.ilanlar||[]).map(i => `<tr>
          <td style="font-size:12px;font-weight:600;">${i.baslik}</td>
          <td style="font-size:13px;">${i.musteri_ad}</td>
          <td>${formatYukTuru(i.yuk_turu)}</td>
          <td style="font-size:12px;">${i.konum_dan}→${i.konum_a}</td>
          <td style="font-weight:700;color:var(--primary);">${formatPara(i.fiyat)}</td>
          <td>${formatDurum(i.durum)}</td>
          <td><span class="badge badge-blue">${i.teklif_sayisi}</span></td>
        </tr>`).join('')}
      </tbody></table>`;
    } else if (tab === 'siparisler') {
      res = await api.get('/admin/siparisler'); data = await res.json();
      html = `<table class="data-table"><thead><tr><th>İlan</th><th>Müşteri</th><th>Sürücü</th><th>Tutar</th><th>Durum</th><th>Ödeme</th></tr></thead><tbody>
        ${(data.siparisler||[]).map(s => `<tr>
          <td style="font-size:13px;font-weight:600;">${s.ilan_baslik}</td>
          <td>${s.musteri_ad}</td><td>${s.surucu_ad}</td>
          <td style="font-weight:700;color:var(--primary);">${s.toplam_tutar?formatPara(s.toplam_tutar):'-'}</td>
          <td>${formatDurum(s.durum)}</td><td>${formatDurum(s.odeme_durumu)}</td>
        </tr>`).join('')}
      </tbody></table>`;
    } else if (tab === 'odemeler') {
      res = await api.get('/admin/odemeler'); data = await res.json();
      html = `<table class="data-table"><thead><tr><th>İlan</th><th>Müşteri</th><th>Sürücü</th><th>Tutar</th><th>Durum</th><th>Tarih</th></tr></thead><tbody>
        ${(data.odemeler||[]).map(o => `<tr>
          <td>${o.ilan_baslik}</td><td>${o.musteri_ad}</td><td>${o.surucu_ad}</td>
          <td style="font-weight:700;color:var(--primary);">${formatPara(o.tutar)}</td>
          <td>${formatDurum(o.durum)}</td>
          <td style="font-size:12px;">${new Date(o.created_at).toLocaleDateString('tr-TR')}</td>
        </tr>`).join('')}
      </tbody></table>`;
    }

    container.innerHTML = html;
  } catch { container.innerHTML = '<div class="empty-state"><p>Yükleme hatası</p></div>'; }
}

async function toggleKullanici(userId, aktif) {
  await api.put(`/admin/kullanicilar/${userId}/aktif`, { aktif });
  showToast(aktif ? 'Kullanıcı aktifleştirildi' : 'Kullanıcı askıya alındı', aktif ? 'success' : 'warning');
  switchAdminTab('kullanicilar', document.querySelector('.admin-tab'));
}

// ─── Profil ───────────────────────────────────────────────────────────────────
async function loadProfil() {
  try {
    const res = await api.get('/auth/ben');
    const data = await res.json();
    const u = data.kullanici;

    document.getElementById('profAd').value = u.ad;
    document.getElementById('profEmail').value = u.email;
    document.getElementById('profTelefon').value = u.telefon || '';

    const initials = u.ad.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    document.getElementById('profAvatar').textContent = initials;
    document.getElementById('profRole').textContent = u.rol === 'MUSTERI' ? '🏗️ İnşaat Sahibi' : u.rol === 'SURUCU' ? '🚛 Sürücü' : '👑 Admin';
    document.getElementById('profRating').textContent = u.rating_count > 0 ? `⭐ ${u.rating} (${u.rating_count} değerlendirme)` : 'Henüz değerlendirme yok';
    document.getElementById('profSince').textContent = `Üye: ${new Date(u.created_at).toLocaleDateString('tr-TR')}`;
  } catch {}
}


// ─── Bildirimler ──────────────────────────────────────────────────────────────
async function loadBildirimler() {
  try {
    const res = await api.get('/bildirimler');
    const data = await res.json();

    const dot = document.getElementById('notifDot');
    if (data.okunmamis > 0) dot.classList.add('visible');
    else dot.classList.remove('visible');

    const list = document.getElementById('notifList');
    const bildirimler = data.bildirimler || [];

    if (!bildirimler.length) {
      list.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px;">Bildirim yok</div>';
      return;
    }

    list.innerHTML = bildirimler.map(b => `
      <div class="notif-item ${b.okundu ? '' : 'unread'}">
        <div class="notif-title">${b.baslik}</div>
        <div class="notif-body">${b.icerik}</div>
        <div class="notif-time">${formatTarih(b.created_at)}</div>
      </div>
    `).join('');
  } catch {}
}

async function tumunuOku() {
  await api.put('/bildirimler/tumunu-oku');
  document.getElementById('notifDot').classList.remove('visible');
  loadBildirimler();
}

function toggleNotifDropdown() {
  const dropdown = document.getElementById('notifDropdown');
  notifDropdownOpen = !notifDropdownOpen;
  dropdown.classList.toggle('open', notifDropdownOpen);
  if (notifDropdownOpen) loadBildirimler();
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('#notifBtn') && !e.target.closest('#notifDropdown')) {
    document.getElementById('notifDropdown').classList.remove('open');
    notifDropdownOpen = false;
  }
});

function updateBadge(navId) {
  const badge = document.getElementById(`badge-${navId}`);
  if (badge) badge.classList.add('visible');
}

// ─── Motion Animation Entegrasyonu ───────────────────────────────────────────

// Toast sistemi — HafAnim.toast'a delege et, yoksa basit alert
function showToast(message, type = 'info') {
  if (window.HafAnim?.toast) {
    window.HafAnim.toast.show(message, type);
  } else {
    // Fallback: basit div toast
    const t = document.createElement('div');
    const colors = { success:'#22c55e', error:'#ef4444', warning:'#f59e0b', info:'#3b82f6' };
    t.style.cssText = `position:fixed;bottom:20px;right:20px;z-index:9999;padding:12px 20px;background:#1e293b;border-left:3px solid ${colors[type]||'#3b82f6'};border-radius:10px;color:#f8fafc;font-size:14px;font-family:Inter,sans-serif;box-shadow:0 8px 32px rgba(0,0,0,0.4);max-width:340px;`;
    t.textContent = message;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 4000);
  }
}

// Stat kartlarına giriş animasyonu
function animateStatCards() {
  const cards = document.querySelectorAll('.stat-card');
  if (!cards.length || !window.Motion?.animate) return;

  window.Motion.animate(
    Array.from(cards),
    { opacity: [0, 1], transform: ['translateY(24px) scale(0.95)', 'translateY(0) scale(1)'] },
    { duration: 0.5, delay: window.Motion.stagger(0.08), easing: [0.34, 1.56, 0.64, 1] }
  );
}

// Section değişince içerik animasyonu
const _origShowSection = typeof showSection === 'function' ? showSection : null;
function showSectionAnimated(sectionId) {
  // Mevcut section'ı kapat
  const current = document.querySelector('.page-section.active');
  if (current && window.Motion?.animate) {
    window.Motion.animate(current, { opacity: [1, 0] }, { duration: 0.15 });
  }

  // Yeni section'ı aç
  setTimeout(() => {
    _origShowSection?.(sectionId);

    const next = document.getElementById(sectionId);
    if (next && window.Motion?.animate) {
      window.Motion.animate(next,
        { opacity: [0, 1], transform: ['translateY(12px)', 'translateY(0)'] },
        { duration: 0.3, easing: [0.4, 0, 0.2, 1] }
      );
    }

    // İçerik yüklenince animasyon tetikle
    setTimeout(() => {
      animateStatCards();
      if (window.HafAnim?.scrollReveal) window.HafAnim.scrollReveal.refresh();
    }, 300);
  }, current ? 100 : 0);
}

// Dashboard stat animasyonu — MutationObserver ile otomatik tetiklenir (yukarıda zaten var)
// NOT: loadDashboard override KALDIRILDI — sonsuz döngüye yol açıyordu.
// animateStatCards, gridObserver üzerinden otomatik çalışır.

// Modal animasyonu
function openModal(modalEl) {
  if (window.HafAnim?.modal) window.HafAnim.modal.open(modalEl);
  else if (modalEl) modalEl.classList.add('active');
}

function closeModal(modalEl) {
  if (window.HafAnim?.modal) window.HafAnim.modal.close(modalEl);
  else if (modalEl) modalEl.classList.remove('active');
}

// İlan grid kartlarına shimmer border efekti ekle (MutationObserver ile)
const gridObserver = new MutationObserver(() => {
  document.querySelectorAll('.ilan-card:not(.anim-ready)').forEach(card => {
    card.classList.add('anim-ready', 'shimmer-border');
    if (window.Motion?.animate) {
      card.addEventListener('mouseenter', () =>
        window.Motion.animate(card, { y: -4, scale: 1.01 }, { duration: 0.2, easing: [0.4,0,0.2,1] })
      );
      card.addEventListener('mouseleave', () =>
        window.Motion.animate(card, { y: 0, scale: 1 }, { duration: 0.25, easing: [0.34,1.56,0.64,1] })
      );
    }
  });

  // Stat kartları için count-up
  document.querySelectorAll('.stat-card-value:not(.counted)').forEach(el => {
    const num = parseFloat(el.textContent.replace(/[^0-9.]/g, ''));
    if (!isNaN(num) && num > 0) {
      el.classList.add('counted');
      if (window.HafAnim) {
        window.HafAnim.countUp(el, num, { duration: 1200, decimals: 0 });
      }
    }
  });
});

gridObserver.observe(document.getElementById('app') || document.body, {
  childList: true, subtree: true
});
