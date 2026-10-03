/**
 * hafriyatcim.com — Motion Animation System v1.0
 * Powered by Motion (motion.dev) — Vanilla JS API
 * Inspired by 21st.dev community components
 */

// ─── Motion CDN yüklendi mi kontrol ─────────────────────────────
const motionReady = () => typeof window.Motion !== 'undefined' && typeof window.Motion.animate === 'function';

// Motion kısayolları
const mAnimate = (...args) => motionReady() ? window.Motion.animate(...args) : null;
const mStagger = (...args) => motionReady() ? window.Motion.stagger(...args) : 0;
const mInView  = (...args) => motionReady() ? window.Motion.inView(...args)  : null;

// ─── Temel Yardımcılar ───────────────────────────────────────────
const ease = {
  spring:    [0.34, 1.56, 0.64, 1],   // Framer Motion default spring feel
  smooth:    [0.4, 0, 0.2, 1],
  decelerate:[0, 0, 0.2, 1],
  sharp:     [0.4, 0, 0.6, 1],
  bounce:    [0.68, -0.55, 0.27, 1.55],
};

// ─── 1. SAYFA GEÇİŞ SİSTEMİ ─────────────────────────────────────
class PageTransition {
  constructor() {
    this.overlay = this._createOverlay();
    this.isAnimating = false;
  }

  _createOverlay() {
    const el = document.createElement('div');
    el.id = 'page-transition-overlay';
    el.style.cssText = `
      position:fixed;inset:0;z-index:99999;pointer-events:none;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
      opacity:0;transform:translateY(100%);
    `;
    document.body.appendChild(el);
    return el;
  }

  async navigateTo(url) {
    if (this.isAnimating) return;
    this.isAnimating = true;

    // Çıkış animasyonu
    this.overlay.style.pointerEvents = 'all';
    await this._animate(this.overlay, { opacity: [0, 1], transform: ['translateY(-100%)', 'translateY(0%)'] }, { duration: 0.35, easing: ease.decelerate });

    window.location.href = url;
  }

  async enter() {
    // Giriş animasyonu (sayfa yüklenince)
    this.overlay.style.transform = 'translateY(0%)';
    this.overlay.style.opacity = '1';
    await this._animate(this.overlay, { opacity: [1, 0], transform: ['translateY(0%)', 'translateY(100%)'] }, { duration: 0.45, easing: ease.decelerate });
    this.overlay.style.pointerEvents = 'none';
    this.isAnimating = false;
  }

  _animate(el, keyframes, options) {
    return new Promise(resolve => {
      if (motionReady()) {
        const anim = Motion.animate(el, keyframes, options);
        anim.finished.then(resolve);
      } else {
        setTimeout(resolve, (options.duration || 0.3) * 1000);
      }
    });
  }
}

// ─── 2. SCROLL REVEAL (IntersectionObserver + Motion) ────────────
class ScrollReveal {
  constructor() {
    this.observer = new IntersectionObserver(this._onIntersect.bind(this), {
      threshold: 0.12,
      rootMargin: '0px 0px -60px 0px',
    });
    this.init();
  }

  init() {
    // Tüm reveal elemanlarını gözlemle
    const selectors = [
      '[data-reveal]',
      '.feature-card',
      '.step-card',
      '.stat-item',
      '.ilan-card',
      '.dashboard-card',
      '.stat-card',
    ];

    document.querySelectorAll(selectors.join(',')).forEach((el, i) => {
      if (el.dataset.revealDone) return;
      el.dataset.revealIndex = i;
      el.style.opacity = '0';
      el.style.transform = 'translateY(32px)';
      el.style.transition = 'none';
      this.observer.observe(el);
    });
  }

  _onIntersect(entries) {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const delay = (parseInt(el.dataset.revealDelay) || 0) + (parseInt(el.dataset.revealIndex) % 4) * 80;

      if (motionReady()) {
        Motion.animate(
          el,
          { opacity: [0, 1], transform: ['translateY(32px)', 'translateY(0px)'] },
          { duration: 0.55, delay: delay / 1000, easing: ease.smooth }
        );
      } else {
        setTimeout(() => {
          el.style.transition = `opacity 0.55s ${ease.smooth}, transform 0.55s ${ease.smooth}`;
          el.style.opacity = '1';
          el.style.transform = 'translateY(0)';
        }, delay);
      }

      el.dataset.revealDone = '1';
      this.observer.unobserve(el);
    });
  }

  refresh() {
    this.init();
  }
}

// ─── 3. HERO ANİMASYONU ──────────────────────────────────────────
function animateHero() {
  const hero = document.querySelector('.hero');
  if (!hero) return;

  const badge = hero.querySelector('.badge');
  const h1 = hero.querySelector('h1');
  const p = hero.querySelector('p');
  const buttons = hero.querySelector('.hero-buttons');
  const statsContainer = hero.querySelector('.stats');
  const glassCard = hero.querySelector('.glass-card');

  const elements = [badge, h1, p, buttons, statsContainer, glassCard].filter(Boolean);

  // Başlangıç durumunu inline olarak ayarla (CSS bağımsız)
  elements.forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
  });

  if (motionReady()) {
    Motion.animate(elements, { opacity: [0, 1], transform: ['translateY(30px)', 'translateY(0)'] }, {
      duration: 0.7,
      delay: Motion.stagger(0.1),
      easing: ease.spring,
    });
  } else {
    elements.forEach((el, i) => {
      setTimeout(() => {
        el.style.transition = 'all 0.7s cubic-bezier(0.34,1.56,0.64,1)';
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      }, 100 + i * 120);
    });
  }
}

// ─── 4. TYPEWRITER EFEKTİ ────────────────────────────────────────
class TypeWriter {
  constructor(el, texts, options = {}) {
    this.el = typeof el === 'string' ? document.querySelector(el) : el;
    if (!this.el) return;
    this.texts = texts;
    this.opts = { speed: 60, deleteSpeed: 30, pause: 2000, loop: true, ...options };
    this.currentIndex = 0;
    this.charIndex = 0;
    this.isDeleting = false;
    this.el.classList.add('typewriter-cursor');
    this._tick();
  }

  _tick() {
    const text = this.texts[this.currentIndex];
    if (this.isDeleting) {
      this.el.textContent = text.slice(0, this.charIndex--);
    } else {
      this.el.textContent = text.slice(0, this.charIndex++);
    }

    let delay = this.isDeleting ? this.opts.deleteSpeed : this.opts.speed;

    if (!this.isDeleting && this.charIndex > text.length) {
      this.isDeleting = true;
      delay = this.opts.pause;
    } else if (this.isDeleting && this.charIndex < 0) {
      this.isDeleting = false;
      this.currentIndex = (this.currentIndex + 1) % this.texts.length;
      delay = 400;
    }

    setTimeout(() => this._tick(), delay);
  }
}

// ─── 5. SAYAÇ ANİMASYONU (Count-up) ─────────────────────────────
class CountUp {
  constructor(el, target, options = {}) {
    this.el = typeof el === 'string' ? document.querySelector(el) : el;
    if (!this.el) return;
    this.target = target;
    this.opts = { duration: 1800, prefix: '', suffix: '', decimals: 0, easing: true, ...options };
    this._observe();
  }

  _observe() {
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        this._run();
        obs.disconnect();
      }
    }, { threshold: 0.5 });
    obs.observe(this.el);
  }

  _run() {
    const start = performance.now();
    const { duration, prefix, suffix, decimals } = this.opts;

    const tick = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = this.opts.easing ? this._easeOut(progress) : progress;
      const value = (this.target * eased).toFixed(decimals);
      this.el.textContent = prefix + Number(value).toLocaleString('tr-TR') + suffix;
      if (progress < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }

  _easeOut(t) { return 1 - Math.pow(1 - t, 3); }
}

// ─── 6. TOAST BİLDİRİM SİSTEMİ ──────────────────────────────────
class ToastManager {
  constructor() {
    this.container = this._createContainer();
    this.queue = [];
  }

  _createContainer() {
    const existing = document.getElementById('toast-container');
    if (existing) return existing;

    const c = document.createElement('div');
    c.id = 'toast-container';
    c.style.cssText = `
      position:fixed;bottom:24px;right:24px;z-index:10000;
      display:flex;flex-direction:column;gap:10px;
      pointer-events:none;
    `;
    document.body.appendChild(c);
    return c;
  }

  show(message, type = 'info', duration = 4000) {
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️', loading: '⏳' };
    const colors = {
      success: '#22c55e', error: '#ef4444',
      warning: '#f59e0b', info: '#3b82f6', loading: '#f97316'
    };

    const toast = document.createElement('div');
    toast.style.cssText = `
      display:flex;align-items:center;gap:12px;
      padding:14px 20px;border-radius:14px;
      background:rgba(15,23,42,0.95);
      border:1px solid ${colors[type]}40;
      box-shadow:0 8px 32px rgba(0,0,0,0.4),0 0 0 1px ${colors[type]}20;
      backdrop-filter:blur(20px);
      color:#f8fafc;font-family:'Inter',sans-serif;font-size:14px;
      max-width:360px;pointer-events:all;cursor:pointer;
      opacity:0;transform:translateX(120px) scale(0.85);
      transition:all 0s;
      border-left:3px solid ${colors[type]};
    `;

    toast.innerHTML = `
      <span style="font-size:20px;flex-shrink:0">${icons[type]}</span>
      <span style="flex:1;line-height:1.4">${message}</span>
      <span style="font-size:18px;opacity:0.5;flex-shrink:0">×</span>
    `;

    this.container.appendChild(toast);

    // Giriş animasyonu — spring
    requestAnimationFrame(() => {
      if (motionReady()) {
        Motion.animate(toast,
          { opacity: [0, 1], transform: ['translateX(120px) scale(0.85)', 'translateX(0) scale(1)'] },
          { duration: 0.45, easing: ease.spring }
        );
      } else {
        setTimeout(() => {
          toast.style.transition = 'all 0.45s cubic-bezier(0.34,1.56,0.64,1)';
          toast.style.opacity = '1';
          toast.style.transform = 'translateX(0) scale(1)';
        }, 10);
      }
    });

    const dismiss = () => {
      if (motionReady()) {
        const anim = Motion.animate(toast,
          { opacity: [1, 0], transform: ['translateX(0)', 'translateX(60px)'] },
          { duration: 0.28, easing: ease.sharp }
        );
        anim.finished.then(() => toast.remove());
      } else {
        toast.style.transition = 'all 0.28s ease-in';
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(60px)';
        setTimeout(() => toast.remove(), 300);
      }
    };

    toast.addEventListener('click', dismiss);
    if (duration > 0 && type !== 'loading') setTimeout(dismiss, duration);

    return { dismiss };
  }

  success(msg, dur) { return this.show(msg, 'success', dur); }
  error(msg, dur)   { return this.show(msg, 'error', dur); }
  warning(msg, dur) { return this.show(msg, 'warning', dur); }
  info(msg, dur)    { return this.show(msg, 'info', dur); }
  loading(msg)      { return this.show(msg, 'loading', 0); }
}

// ─── 7. MODAL ANİMASYONU ─────────────────────────────────────────
class AnimatedModal {
  static open(modalEl) {
    if (!modalEl) return;
    const content = modalEl.querySelector('.modal-content');
    modalEl.classList.add('active');

    if (motionReady() && content) {
      Motion.animate(content,
        { opacity: [0, 1], transform: ['scale(0.8) translateY(20px)', 'scale(1) translateY(0)'] },
        { duration: 0.4, easing: ease.spring }
      );
      Motion.animate(modalEl,
        { backgroundColor: ['rgba(0,0,0,0)', 'rgba(0,0,0,0.7)'] },
        { duration: 0.3 }
      );
    }
  }

  static close(modalEl) {
    if (!modalEl) return;
    const content = modalEl.querySelector('.modal-content');

    if (motionReady() && content) {
      const anim = Motion.animate(content,
        { opacity: [1, 0], transform: ['scale(1)', 'scale(0.9)'] },
        { duration: 0.25, easing: ease.sharp }
      );
      Motion.animate(modalEl,
        { backgroundColor: ['rgba(0,0,0,0.7)', 'rgba(0,0,0,0)'] },
        { duration: 0.25 }
      );
      anim.finished.then(() => modalEl.classList.remove('active'));
    } else {
      modalEl.classList.remove('active');
    }
  }
}

// ─── 8. HOVER EFEKTLERİ ──────────────────────────────────────────
function initHoverEffects() {
  // Shimmer border efekti — butonlar
  document.querySelectorAll('.btn-primary,.btn-secondary,.card,.ilan-kart').forEach(el => {
    el.addEventListener('mouseenter', () => {
      if (motionReady()) {
        Motion.animate(el, { scale: 1.015 }, { duration: 0.2, easing: ease.smooth });
      }
    });
    el.addEventListener('mouseleave', () => {
      if (motionReady()) {
        Motion.animate(el, { scale: 1 }, { duration: 0.2, easing: ease.smooth });
      }
    });
  });

  // Magnetic button efekti (nav logo)
  const logo = document.querySelector('.logo');
  if (logo) {
    logo.addEventListener('mousemove', (e) => {
      const rect = logo.getBoundingClientRect();
      const x = (e.clientX - rect.left - rect.width / 2) * 0.15;
      const y = (e.clientY - rect.top - rect.height / 2) * 0.15;
      if (motionReady()) {
        Motion.animate(logo, { x, y }, { duration: 0.3, easing: ease.smooth });
      }
    });
    logo.addEventListener('mouseleave', () => {
      if (motionReady()) {
        Motion.animate(logo, { x: 0, y: 0 }, { duration: 0.4, easing: ease.spring });
      }
    });
  }
}

// ─── 9. SCROLL PROGRESS BAR ──────────────────────────────────────
function initScrollProgress() {
  const bar = document.createElement('div');
  bar.id = 'scroll-progress';
  bar.style.cssText = `
    position:fixed;top:0;left:0;height:3px;z-index:9999;
    background:linear-gradient(90deg,#f97316,#ea580c,#f59e0b);
    transform-origin:left;transform:scaleX(0);
    box-shadow:0 0 10px rgba(249,115,22,0.6);
    transition:transform 0.1s linear;
  `;
  document.body.appendChild(bar);

  const update = () => {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = docHeight > 0 ? scrollTop / docHeight : 0;
    bar.style.transform = `scaleX(${progress})`;
  };

  window.addEventListener('scroll', update, { passive: true });
}

// ─── 10. NAVBAR SCROLL EFEKTİ ────────────────────────────────────
function initNavbarScroll() {
  const navbar = document.querySelector('.navbar');
  if (!navbar) return;

  let lastScroll = 0;
  window.addEventListener('scroll', () => {
    const scrollY = window.scrollY;
    navbar.classList.toggle('scrolled', scrollY > 20);

    // Yukarı kaydırırken göster, aşağı kaydırırken gizle
    if (scrollY > 80) {
      if (scrollY > lastScroll + 5) {
        // Aşağı kaydırma
        if (motionReady()) {
          Motion.animate(navbar, { y: '-100%' }, { duration: 0.3, easing: ease.sharp });
        }
      } else if (scrollY < lastScroll - 5) {
        // Yukarı kaydırma
        if (motionReady()) {
          Motion.animate(navbar, { y: '0%' }, { duration: 0.3, easing: ease.decelerate });
        }
      }
    } else {
      if (motionReady()) {
        Motion.animate(navbar, { y: '0%' }, { duration: 0.2 });
      }
    }

    lastScroll = scrollY;
  }, { passive: true });
}

// ─── 11. STAGGER LIST ANİMASYONU ─────────────────────────────────
function animateList(containerEl, itemSelector = 'li, .item, tr') {
  if (!containerEl) return;
  const items = containerEl.querySelectorAll(itemSelector);
  if (!items.length) return;

  items.forEach(item => {
    item.style.opacity = '0';
    item.style.transform = 'translateX(-16px)';
  });

  if (motionReady()) {
    Motion.animate(
      Array.from(items),
      { opacity: [0, 1], transform: ['translateX(-16px)', 'translateX(0)'] },
      { duration: 0.4, delay: Motion.stagger(0.06), easing: ease.smooth }
    );
  } else {
    items.forEach((item, i) => {
      setTimeout(() => {
        item.style.transition = 'all 0.4s ease';
        item.style.opacity = '1';
        item.style.transform = 'translateX(0)';
      }, i * 60);
    });
  }
}

// ─── 12. SAYFA YÜKLENİNCE LOGO ANİMASYONU ───────────────────────
function animateLogo() {
  const logo = document.querySelector('.logo');
  if (!logo || !motionReady()) return;
  Motion.animate(logo,
    { opacity: [0, 1], scale: [0.7, 1] },
    { duration: 0.6, easing: ease.spring, delay: 0.1 }
  );
}

// ─── 13. DRAG-TO-SCROLL (Horizontal scroll areas) ────────────────
function initDragScroll(el) {
  if (!el) return;
  let isDown = false, startX, scrollLeft;

  el.addEventListener('mousedown', e => {
    isDown = true;
    el.style.cursor = 'grabbing';
    startX = e.pageX - el.offsetLeft;
    scrollLeft = el.scrollLeft;
  });

  el.addEventListener('mouseleave', () => { isDown = false; el.style.cursor = 'grab'; });
  el.addEventListener('mouseup', () => { isDown = false; el.style.cursor = 'grab'; });
  el.addEventListener('mousemove', e => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - el.offsetLeft;
    el.scrollLeft = scrollLeft - (x - startX) * 1.5;
  });

  el.style.cursor = 'grab';
  el.style.userSelect = 'none';
}

// ─── ANA BAŞLATMA ────────────────────────────────────────────────
const HafAnim = {
  transition:   null,
  scrollReveal: null,
  toast:        null,
  modal:        AnimatedModal,

  async init() {
    // Sayfa giriş animasyonu
    this.transition = new PageTransition();
    await this.transition.enter();

    // Scroll reveal
    this.scrollReveal = new ScrollReveal();

    // Toast sistemi
    this.toast = new ToastManager();

    // Hero
    animateHero();
    animateLogo();

    // Scroll progress bar
    initScrollProgress();

    // Navbar efekti
    initNavbarScroll();

    // Hover efektleri
    initHoverEffects();

    // Sayaçlar (istatistik sayfaları için)
    document.querySelectorAll('[data-countup]').forEach(el => {
      new CountUp(el, parseFloat(el.dataset.countup), {
        suffix: el.dataset.suffix || '',
        prefix: el.dataset.prefix || '',
        decimals: parseInt(el.dataset.decimals) || 0,
      });
    });

    // Typewriter (data-typewriter="metin1|metin2" formatında)
    document.querySelectorAll('[data-typewriter]').forEach(el => {
      const texts = el.dataset.typewriter.split('|');
      new TypeWriter(el, texts);
    });

    // Drag scroll alanları
    document.querySelectorAll('[data-drag-scroll]').forEach(initDragScroll);

    console.log('🚛 hafriyatcim.com animations initialized');
  },

  // Dashboard içerik yüklenince çağır
  refreshReveal() {
    if (this.scrollReveal) this.scrollReveal.refresh();
  },

  // Sayfa geçişi
  navigateTo(url) {
    if (this.transition) return this.transition.navigateTo(url);
    window.location.href = url;
  },

  // Animasyonlu liste render
  animateList,

  // CountUp manuel başlat
  countUp(el, target, opts) { return new CountUp(el, target, opts); },

  // TypeWriter manuel başlat
  typeWriter(el, texts, opts) { return new TypeWriter(el, texts, opts); },
};

// Global erişim
window.HafAnim = HafAnim;

// DOM hazır olunca başlat
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => HafAnim.init());
} else {
  HafAnim.init();
}
