const menuButton = document.querySelector('.menu-toggle');
const navigation = document.querySelector('.site-nav');
const riderModal = document.querySelector('#rider-modal');
const riderModalCloseButton = riderModal?.querySelector('.rider-modal-close');
const downloadToast = document.querySelector('#download-toast');
const downloadToastCopy = document.querySelector('#download-toast-copy');
let downloadToastTimer;

const closeRiderModal = () => {
  if (!riderModal) return;
  riderModal.hidden = true;
  document.body.classList.remove('rider-modal-open');
  if (window.location.hash === '#rider') {
    history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}`);
  }
};

const openRiderModal = (event) => {
  event?.preventDefault();
  if (!riderModal) return;
  riderModal.hidden = false;
  document.body.classList.add('rider-modal-open');
  navigation?.classList.remove('is-open');
  menuButton?.setAttribute('aria-expanded', 'false');
  history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}#rider`);
  riderModalCloseButton?.focus();
};

menuButton?.addEventListener('click', () => {
  const isOpen = navigation.classList.toggle('is-open');
  menuButton.setAttribute('aria-expanded', String(isOpen));
});

navigation?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    navigation.classList.remove('is-open');
    menuButton?.setAttribute('aria-expanded', 'false');
  });
});

document.querySelectorAll('[data-rider-open]').forEach((link) => {
  link.addEventListener('click', openRiderModal);
});

riderModal?.querySelectorAll('[data-rider-close]').forEach((control) => {
  control.addEventListener('click', closeRiderModal);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && riderModal && !riderModal.hidden) {
    closeRiderModal();
  }
});

if (window.location.hash === '#rider') openRiderModal();

const showDownloadToast = (event) => {
  if (!downloadToast) return;
  const link = event.currentTarget;
  const label = link.dataset.downloadLabel || 'LahuzGo';
  downloadToastCopy.textContent = `${label} APK download is starting.`;
  downloadToast.hidden = false;
  window.clearTimeout(downloadToastTimer);
  downloadToastTimer = window.setTimeout(() => {
    downloadToast.hidden = true;
  }, 4200);
};

document.querySelectorAll('a[download]').forEach((link) => {
  link.addEventListener('click', showDownloadToast);
});

const year = document.querySelector('#year');
if (year) year.textContent = String(new Date().getFullYear());
