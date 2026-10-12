// Aurora Glass interactions shared by every page. Loaded synchronously in <head> so the
// saved theme applies before first paint; everything else waits for DOMContentLoaded.
(() => {
  const root = document.documentElement;
  const KEY = 'aurora_theme';
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch { /* storage blocked */ }
  if (saved === 'light' || saved === 'dark') root.dataset.theme = saved;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isDark = () => (root.dataset.theme ? root.dataset.theme === 'dark' : !matchMedia('(prefers-color-scheme: light)').matches);
  const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';

  function themeButton() {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'theme-toggle';
    const paint = () => {
      b.innerHTML = isDark() ? SUN : MOON;
      b.setAttribute('aria-label', isDark() ? 'Light theme' : 'Dark theme');
      b.title = b.getAttribute('aria-label');
    };
    b.addEventListener('click', () => {
      root.dataset.theme = isDark() ? 'light' : 'dark';
      try { localStorage.setItem(KEY, root.dataset.theme); } catch { /* ignore */ }
      paint();
      document.dispatchEvent(new CustomEvent('aurora:theme'));
    });
    paint();
    return b;
  }

  function init() {
    const slot = document.querySelector('.site-header nav, .adm-controls');
    if (slot) slot.append(themeButton());
    if (reduced) return;

    // Aurora follows the cursor a little (2–4 %), throttled to animation frames.
    let raf = 0;
    addEventListener('pointermove', (e) => {
      if (raf || e.pointerType !== 'mouse') return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        root.style.setProperty('--mx', ((e.clientX / innerWidth) * 2 - 1).toFixed(3));
        root.style.setProperty('--my', ((e.clientY / innerHeight) * 2 - 1).toFixed(3));
      });
    }, { passive: true });

    // Magnetic primary buttons: drift up to 6px toward the cursor.
    for (const btn of document.querySelectorAll('.btn-large, #buy-btn, .hero-cta .btn')) {
      btn.addEventListener('pointermove', (e) => {
        const r = btn.getBoundingClientRect();
        const dx = ((e.clientX - r.left) / r.width - 0.5) * 12;
        const dy = ((e.clientY - r.top) / r.height - 0.5) * 12;
        btn.style.setProperty('--tx', `${dx.toFixed(1)}px`);
        btn.style.setProperty('--ty', `${dy.toFixed(1)}px`);
      });
      btn.addEventListener('pointerleave', () => {
        btn.style.setProperty('--tx', '0px');
        btn.style.setProperty('--ty', '0px');
      });
    }

    // Hero headline appears word by word (40 ms stagger) but is visible from the first frame.
    const h1 = document.querySelector('.hero h1');
    if (h1) {
      let i = 0;
      const wrap = (node) => {
        for (const child of [...node.childNodes]) {
          if (child.nodeType === 3) {
            const frag = document.createDocumentFragment();
            for (const part of child.textContent.split(/(\s+)/)) {
              if (!part) continue;
              if (/^\s+$/.test(part)) { frag.append(part); continue; }
              const s = document.createElement('span');
              s.className = 'w';
              s.textContent = part;
              s.style.animationDelay = `${i++ * 40}ms`;
              frag.append(s);
            }
            child.replaceWith(frag);
          } else if (child.nodeType === 1) wrap(child);
        }
      };
      wrap(h1);
    }

    // Sections below the fold rise 12px as they enter.
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        for (const en of entries) if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      }, { rootMargin: '0px 0px -8% 0px' });
      for (const el of document.querySelectorAll('.section > .container, .adm-main > .card, .adm-main > .grid2')) {
        if (el.getBoundingClientRect().top > innerHeight) { el.classList.add('reveal'); io.observe(el); }
      }
    }

    // While a file is dragged over the page, the aurora gathers toward the drop zone.
    const dz = document.querySelector('.dropzone');
    if (dz) {
      let depth = 0;
      addEventListener('dragenter', () => { depth++; root.classList.add('dragging'); });
      addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; root.classList.remove('dragging'); } });
      addEventListener('drop', () => {
        depth = 0;
        root.classList.remove('dragging');
        dz.classList.remove('drop');
        void dz.offsetWidth;
        dz.classList.add('drop');
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
