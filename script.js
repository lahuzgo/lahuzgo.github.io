(() => {
  'use strict';
  const root = document.documentElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const header = document.querySelector('.site-header');
  const menuButton = document.querySelector('.menu-toggle');
  const navigation = document.querySelector('#site-nav');
  const dialog = document.querySelector('#rider-modal');
  const toast = document.querySelector('#site-toast');
  let dialogTrigger;
  let toastTimer;

  const closeMenu = ({ returnFocus = false } = {}) => {
    navigation?.classList.remove('is-open');
    menuButton?.setAttribute('aria-expanded', 'false');
    menuButton?.setAttribute('aria-label', 'Open navigation');
    if (returnFocus) menuButton?.focus();
  };
  menuButton?.addEventListener('click', () => {
    const expanded = menuButton.getAttribute('aria-expanded') !== 'true';
    navigation?.classList.toggle('is-open', expanded);
    menuButton.setAttribute('aria-expanded', String(expanded));
    menuButton.setAttribute('aria-label', expanded ? 'Close navigation' : 'Open navigation');
  });
  navigation?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => closeMenu()));
  document.addEventListener('click', event => {
    if (!event.target.closest('.header-inner')) closeMenu();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menuButton?.getAttribute('aria-expanded') === 'true') closeMenu({returnFocus:true});
  });
  window.matchMedia('(min-width: 721px)').addEventListener('change', event => {
    if (event.matches) closeMenu();
  });
  const updateHeader = () => header?.classList.toggle('is-scrolled', window.scrollY > 12);
  window.addEventListener('scroll', updateHeader, {passive:true});
  updateHeader();

  // Both descriptions remain readable without JS. Enhance into tabs only when ready.
  const tabs = [...document.querySelectorAll('.service-tab')];
  const panels = tabs.map(tab => document.getElementById(tab.getAttribute('aria-controls')));
  const activateService = (index, {focus = false} = {}) => {
    tabs.forEach((tab, current) => {
      const active = current === index;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      panels[current].hidden = !active;
    });
    if (focus) tabs[index].focus();
  };
  if (tabs.length === 2 && panels.every(Boolean)) {
    document.querySelector('.service-tabs').hidden = false;
    panels.forEach((panel, index) => {
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tabs[index].id);
      panel.tabIndex = 0;
    });
    activateService(0);
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => activateService(index));
      tab.addEventListener('keydown', event => {
        const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
          : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
          : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
        if (next !== null) {
          event.preventDefault();
          activateService(next, {focus:true});
        }
      });
    });
  }

  document.querySelectorAll('[data-rider-open]').forEach(trigger => {
    trigger.addEventListener('click', () => {
      if (!dialog) return;
      dialogTrigger = trigger;
      closeMenu();
      if (!dialog.open) dialog.showModal();
    });
  });
  const closeDialog = () => { if (dialog?.open) dialog.close(); };
  dialog?.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const controls = [...dialog.querySelectorAll('button:not([disabled]), a[href], [tabindex="0"]')]
      .filter(element => element.getClientRects().length > 0);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  });
  dialog?.querySelectorAll('[data-rider-close]').forEach(button => button.addEventListener('click', closeDialog));
  dialog?.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) closeDialog();
  });
  dialog?.addEventListener('close', () => dialogTrigger?.focus());
  // Keep old shared rider links working without hijacking the new rider section.
  if (window.location.hash === '#rider' && dialog) dialog.showModal();

  const showToast = (title, message) => {
    if (!toast) return;
    window.clearTimeout(toastTimer);
    document.querySelector('#toast-title').textContent = title;
    document.querySelector('#toast-copy').textContent = message;
    toast.hidden = false;
    toastTimer = window.setTimeout(() => { toast.hidden = true; }, 6500);
  };
  document.querySelector('[data-toast-close]')?.addEventListener('click', () => {
    window.clearTimeout(toastTimer);
    toast.hidden = true;
  });
  document.querySelectorAll('[data-ios-coming]').forEach(button => {
    button.addEventListener('click', () => showToast('A little more time for iOS.',
      'The iPhone app is coming soon. LahuzGo is currently available on Android.'));
  });
  document.querySelectorAll('a[download]').forEach(link => {
    link.addEventListener('click', () => showToast('Opening your Android download.',
      (link.dataset.downloadLabel || 'LahuzGo') + ' is served by this website. Follow your browser’s download prompt.'));
  });
  document.querySelectorAll('.faq-list details').forEach(details => {
    details.addEventListener('toggle', () => {
      if (!details.open) return;
      document.querySelectorAll('.faq-list details').forEach(other => {
        if (other !== details) other.open = false;
      });
    });
  });
  const year = document.querySelector('#year');
  if (year) year.textContent = String(new Date().getFullYear());

  // Never leave content hidden with motion reduction or without observer support.
  const reveals = [...document.querySelectorAll('.reveal')];
  if ('IntersectionObserver' in window && !reducedMotion.matches) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, {threshold:.08, rootMargin:'0px 0px -16px 0px'});
    root.classList.add('js');
    reveals.forEach(element => observer.observe(element));
    reducedMotion.addEventListener('change', event => {
      if (!event.matches) return;
      observer.disconnect();
      reveals.forEach(element => element.classList.add('is-visible'));
    });
  }
  document.addEventListener('visibilitychange', () => root.classList.toggle('is-backgrounded', document.hidden));
})();
