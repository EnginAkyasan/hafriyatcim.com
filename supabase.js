// ─────────────────────────────────────────────────────────────
// hafriyatcim.com — Supabase Auth Client v1.0
// Supabase ile Google OAuth + mevcut backend JWT ile bridge
// ─────────────────────────────────────────────────────────────

// Supabase config — .env'den alınacak (production için)
const SUPABASE_URL = 'https://unwbimbnalvfdecobqey.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVud2JpbWJuYWx2ZmRlY29icWV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MzIyMTYsImV4cCI6MjA5OTEwODIxNn0._nDyQ80u_GZz_wwYq5Qmvt3Adt-QzAoX53mu3SdAL9Y';

// Supabase JS CDN üzerinden yükleniyor (index.html'de <script> ile ekleniyor)
// Bu dosya supabase CDN yüklendikten sonra çalışır

let supabaseClient = null;

function initSupabase() {
  if (typeof window.supabase === 'undefined') {
    console.warn('Supabase CDN henüz yüklenmedi');
    return null;
  }
  if (!supabaseClient) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabaseClient;
}

// ─── Supabase ile Google Sign-In ──────────────────────────────
async function supabaseGoogleSignIn() {
  const sb = initSupabase();
  if (!sb) {
    // Supabase yoksa veya config eksikse eski Google flow'a yönlendir
    if (typeof googleSignIn === 'function') googleSignIn();
    return;
  }

  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/giris.html?oauth=google`,
      queryParams: { access_type: 'offline', prompt: 'consent' }
    }
  });

  if (error) {
    console.error('Supabase Google auth hatası:', error);
    if (typeof showToast === 'function') {
      showToast('Google ile giriş başarısız. Lütfen tekrar deneyin.', 'error');
    }
  }
}

// ─── Supabase Session'ı dinle ─────────────────────────────────
async function initSupabaseAuth() {
  const sb = initSupabase();
  if (!sb) return;

  // Session değişikliklerini dinle
  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      // Supabase token'ı var — backend'e bridge et
      await bridgeSupabaseToBackend(session);
    } else if (event === 'SIGNED_OUT') {
      // Supabase çıkış — backend oturumunu da temizle
      if (typeof api !== 'undefined') {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
      }
    }
  });

  // Mevcut session kontrolü
  const { data: { session } } = await sb.auth.getSession();
  if (session && !localStorage.getItem('accessToken')) {
    await bridgeSupabaseToBackend(session);
  }
}

// ─── Supabase → Backend JWT Bridge ───────────────────────────
// Supabase token'ı backend'e gönderip backend JWT alıyoruz
async function bridgeSupabaseToBackend(session) {
  try {
    const API_BASE = ['localhost', '127.0.0.1'].includes(location.hostname)
      ? 'http://localhost:5050/api'
      : '/api';

    const res = await fetch(`${API_BASE}/auth/supabase-bridge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supabase_token: session.access_token,
        user: {
          id: session.user.id,
          email: session.user.email,
          name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0],
          avatar: session.user.user_metadata?.avatar_url
        }
      })
    });

    if (res.ok) {
      const data = await res.json();
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      localStorage.setItem('user', JSON.stringify(data.kullanici));

      // Eğer giris.html'deyse dashboard'a yönlendir
      if (window.location.pathname.includes('giris')) {
        const redirect = new URLSearchParams(window.location.search).get('redirect');
        window.location.href = redirect || 'dashboard.html';
      }
    } else {
      // Backend'de kullanıcı yok → rol seçimi gerekebilir
      const data = await res.json();
      if (data.needsRole && typeof showGoogleRoleModal === 'function') {
        showGoogleRoleModal(session);
      }
    }
  } catch (err) {
    console.error('Backend bridge hatası:', err);
  }
}

// ─── Email/Şifre ile Kayıt (Supabase Auth) ───────────────────
// NeDB kayıt başarılı olduktan sonra Supabase'e de kaydeder (sessizce)
async function supabaseEmailSignUp(email, password) {
  const sb = initSupabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) {
      console.warn('Supabase signUp:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.warn('Supabase signUp exception:', err);
    return null;
  }
}

// ─── Email/Şifre ile Giriş (Supabase Auth) ───────────────────
async function supabaseEmailSignIn(email, password) {
  const sb = initSupabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      console.warn('Supabase signIn:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.warn('Supabase signIn exception:', err);
    return null;
  }
}

// ─── Supabase Çıkış ───────────────────────────────────────────
async function supabaseSignOut() {
  const sb = initSupabase();
  if (sb) {
    await sb.auth.signOut();
  }
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  window.location.href = '/giris.html';
}

// ─── Supabase Session Kontrol ─────────────────────────────────
async function getSupabaseSession() {
  const sb = initSupabase();
  if (!sb) return null;
  const { data: { session } } = await sb.auth.getSession();
  return session;
}

// Global exports
window.supabaseGoogleSignIn = supabaseGoogleSignIn;
window.supabaseEmailSignUp  = supabaseEmailSignUp;
window.supabaseEmailSignIn  = supabaseEmailSignIn;
window.initSupabaseAuth = initSupabaseAuth;
window.supabaseSignOut = supabaseSignOut;
window.getSupabaseSession = getSupabaseSession;

// Auto-init on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  // Supabase CDN yüklendikten 100ms sonra init et
  setTimeout(initSupabaseAuth, 100);
});
