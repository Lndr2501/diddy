// Diddy website. No cookies, no storage, no requests to third parties.
(() => {
  'use strict';

  // Update on every release (see website/README.md).
  const VERSION = '1.7.1';
  const REPO = 'https://github.com/Lndr2501/diddy';
  const assetUrl = (suffix) =>
    `${REPO}/releases/download/v${VERSION}/Diddy_${VERSION}_${suffix}`;

  document.querySelectorAll('[data-version]').forEach((el) => {
    el.textContent = `v${VERSION}`;
  });
  document.querySelectorAll('[data-asset]').forEach((a) => {
    a.href = assetUrl(a.dataset.asset);
  });
  document.querySelectorAll('[data-year]').forEach((el) => {
    el.textContent = String(new Date().getFullYear());
  });

  // ---------- Platform detection (local only, nothing is sent anywhere) ----------
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const platform = isIOS ? 'ios' : /Mac/.test(ua) ? 'mac' : /Linux|X11/.test(ua) && !/Android/.test(ua) ? 'linux' : null;
  const labels = {
    mac: ['Download for macOS', 'Apple Silicon · free · AGPL-3.0'],
    linux: ['Download for Linux', '.deb · .rpm · AppImage · free · AGPL-3.0'],
    ios: ['Get the iOS beta', 'Sideload with AltStore or SideStore · free'],
  };
  if (platform) {
    const [label, note] = labels[platform];
    const cta = document.querySelector('[data-cta-label]');
    const ctaNote = document.querySelector('[data-cta-note]');
    if (cta) cta.textContent = label;
    if (ctaNote) ctaNote.textContent = `${note} ·`;
  }

  // ---------- Header ----------
  const header = document.querySelector('.site-header');
  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  const toggle = document.querySelector('.menu-toggle');
  const nav = document.getElementById('site-nav');
  const setMenu = (open) => {
    nav.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.querySelector('use').setAttribute('href', open ? '#i-close' : '#i-menu');
    toggle.querySelector('.sr-only').textContent = open ? 'Close menu' : 'Open menu';
  };
  toggle.addEventListener('click', () => setMenu(!nav.classList.contains('open')));
  nav.addEventListener('click', (e) => {
    if (e.target.closest('a')) setMenu(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('open')) {
      setMenu(false);
      toggle.focus();
    }
  });

  // Highlight the section in view
  const navLinks = [...nav.querySelectorAll('a[href^="#"]')];
  const sections = navLinks
    .map((a) => document.querySelector(a.getAttribute('href')))
    .filter(Boolean);
  if ('IntersectionObserver' in window) {
    const spy = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          navLinks.forEach((a) =>
            a.setAttribute('aria-current', String(a.getAttribute('href') === `#${entry.target.id}`))
          );
        });
      },
      { rootMargin: '-45% 0px -50% 0px' }
    );
    sections.forEach((s) => spy.observe(s));
  }

  // ---------- Download: open the tab for the visitor's platform ----------
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const selectTab = (tab, focus) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    });
    if (focus) tab.focus();
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => selectTab(tab, false));
    tab.addEventListener('keydown', (e) => {
      let next = null;
      if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
      if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
      if (e.key === 'Home') next = tabs[0];
      if (e.key === 'End') next = tabs[tabs.length - 1];
      if (next) {
        e.preventDefault();
        selectTab(next, true);
      }
    });
  });
  if (platform) {
    const tab = document.getElementById(`tab-${platform}`);
    if (tab) selectTab(tab, false);
  }

  // ---------- Copy buttons ----------
  document.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const label = btn.querySelector('span');
      const icon = btn.querySelector('use');
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
        label.textContent = 'Copied';
        icon.setAttribute('href', '#i-check');
        btn.classList.add('done');
      } catch {
        label.textContent = 'Select & copy';
        const range = document.createRange();
        range.selectNodeContents(btn.previousElementSibling);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
      setTimeout(() => {
        label.textContent = 'Copy';
        icon.setAttribute('href', '#i-copy');
        btn.classList.remove('done');
      }, 1800);
    });
  });

  // ---------- Theme showcase ----------
  const themeImg = document.getElementById('theme-img');
  const caption = document.getElementById('theme-caption');
  const themeButtons = [...document.querySelectorAll('[data-theme]')];
  const preloaded = new Set();
  const preload = (t) => {
    if (preloaded.has(t)) return;
    preloaded.add(t);
    new Image().src = `assets/img/theme-${t}.webp`;
  };
  themeButtons.forEach((btn) => {
    const theme = btn.dataset.theme;
    const name = btn.textContent.trim();
    btn.addEventListener('pointerenter', () => preload(theme));
    btn.addEventListener('focus', () => preload(theme));
    btn.addEventListener('click', () => {
      themeButtons.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      themeImg.classList.add('loading');
      const next = new Image();
      next.onload = next.onerror = () => {
        themeImg.src = next.src;
        themeImg.alt = `Diddy in the ${name} theme.`;
        themeImg.classList.remove('loading');
      };
      next.src = `assets/img/theme-${theme}.webp`;
      caption.textContent = `Theme: ${name}`;
    });
  });

  // ---------- Voice message waveform ----------
  const wave = document.querySelector('[data-wave]');
  if (wave) {
    const bars = [6, 10, 16, 22, 14, 9, 18, 26, 20, 12, 8, 15, 24, 28, 18, 10, 7, 13, 21, 17, 11, 8, 14, 19, 12, 7, 10, 16, 9, 6];
    wave.innerHTML = bars
      .map((h, i) => `<i style="height:${h}px"${i < 12 ? ' class="on"' : ''}></i>`)
      .join('');
  }

  // ---------- Reveal on scroll ----------
  const reveals = document.querySelectorAll('.reveal');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) {
    reveals.forEach((el) => el.classList.add('in'));
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px' }
    );
    reveals.forEach((el) => io.observe(el));
  }
})();
