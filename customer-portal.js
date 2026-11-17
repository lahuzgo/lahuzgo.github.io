import { CustomerPortalData, SERVICE_NAMES, escapeHTML as e, pesos, ongoing, accepted, history, searchStage, bookingStatus, portalError, validPin, philippineDay, detectMediaType } from './customer-data.js';
import { modal, pinPicker, pinName, trackingMap } from './customer-map.js';
import { BookingWizard } from './customer-booking.js';
import { takePhoto, enableNotifications, permissionState, hasNewUpdate, showBookingNotification } from './customer-permissions.js';

const paths = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
  chat: '<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H3l2-5.5A8.5 8.5 0 1 1 21 11.5Z"/><path d="M8 10h8M8 14h5"/>',
  account: '<circle cx="12" cy="8" r="4"/><path d="M4 22v-2a8 8 0 0 1 16 0v2"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  arrow: '<path d="M5 19 19 5M5 5h14v14"/>',
  back: '<path d="m12 5-7 7 7 7M5 12h15"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 8a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 16h.01"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 6a8 8 0 0 1 14 6M18 18A8 8 0 0 1 4 12"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  send: '<path d="m21 3-7 18-4-7-7-4 18-7ZM10 14 21 3"/>',
  attach: '<path d="m9 14 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l9-9"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="4"/>',
  logout: '<path d="M9 4H4v16h5M14 8l4 4-4 4M9 12h12"/>',
};
export const icon = name => `<svg class="p-icon" aria-hidden="true" viewBox="0 0 24 24">${paths[name] || paths.pin}</svg>`;
const time = value => { const date = new Date(value); return Number.isFinite(+date) ? new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' }).format(date) : ''; };
const dateLabel = value => { const date = new Date(value); return Number.isFinite(+date) ? new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }).format(date) : ''; };
const initials = profile => [profile.first_name, profile.last_name].filter(Boolean).map(value => value[0]).join('').slice(0, 2).toUpperCase() || 'LG';
const name = profile => [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'LahuzGo Customer';
const services = [
  { id: 'angkas', kicker: 'YOUR NEXT STOP', title: 'Pa-angkas', text: 'A ride to where you need to be.', photo: 'pa-angkas-ride-640.webp', className: 'angkas' },
  { id: 'deliver', kicker: 'A THOUGHTFUL SEND', title: 'Padala', text: 'Your parcel. Their doorstep.', photo: 'padala-handover-640.webp', className: 'padala' },
  { id: 'pabili', kicker: 'A LITTLE HELP WITH THE LIST', title: 'Pabili', text: 'Your essentials, brought to you.', photo: 'pabili-groceries-640.webp', className: 'pabili' },
];

export class CustomerPortal {
  constructor({ root, client, profile, onSignOut }) {
    this.root = root; this.profile = profile; this.onSignOut = onSignOut; this.data = new CustomerPortalData(client, profile.id);
    this.rows = []; this.addresses = []; this.controls = {}; this.messages = new Map(); this.drafts = new Map(); this.pending = new Map(); this.mediaUrls = new Map(); this.detailCache = new Map();
    this.tab = 'home'; this.filter = 'ongoing'; this.selectedId = null; this.epoch = 0; this.ready = false; this.stopped = false; this.chatLoading = false; this.notificationRows = null;
    this.boundClick = event => this.click(event); this.boundSubmit = event => this.submitForm(event);
    this.boundInput = event => { if (event.target.matches('[name="message"]')) this.drafts.set(this.selectedId, event.target.value); };
    this.boundOnline = () => this.refresh(true); this.boundOffline = () => this.connection('offline');
    this.boundVisibility = () => { if (!document.hidden) this.refresh(true); };
    this.boundResize = () => {
      if (!matchMedia('(max-width:650px)').matches || this.tab !== 'chat' || !this.selectedId) return;
      const height = window.visualViewport?.height || window.innerHeight;
      const top = this.root.querySelector('.portal-topbar').getBoundingClientRect().bottom;
      const nav = this.root.querySelector('.portal-sidebar').getBoundingClientRect().height;
      this.root.style.setProperty('--portal-chat-height', `${Math.max(200, height - top - nav)}px`);
    };
  }
  async start() {
    this.root.hidden = false; this.renderShell();
    this.root.addEventListener('click', this.boundClick); this.root.addEventListener('submit', this.boundSubmit); this.root.addEventListener('input', this.boundInput);
    window.addEventListener('online', this.boundOnline); window.addEventListener('offline', this.boundOffline); document.addEventListener('visibilitychange', this.boundVisibility);
    window.addEventListener('resize', this.boundResize); window.visualViewport?.addEventListener('resize', this.boundResize);
    this.stopWatching = this.data.watch(() => this.scheduleRefresh(), event => { if (event.new?.conversation_id === this.selectedId) this.refreshChat(); this.scheduleRefresh(); }, status => this.connection(status === 'SUBSCRIBED' ? 'live' : 'reconnecting'));
    this.timer = setInterval(() => { if (!document.hidden) this.refresh(); }, 20_000);
    this.searchTimer = setInterval(() => { if (this.tab === 'chat' && this.current && !accepted(this.current) && ongoing(this.current)) this.renderChatStatus(); }, 30_000);
    await this.refresh(true);
  }
  stop() {
    this.cameraController?.abort();
    this.stopped = true; this.epoch++; clearInterval(this.timer); clearInterval(this.searchTimer); clearTimeout(this.refreshTimer); clearTimeout(this.toastTimer); this.stopWatching?.();
    this.root.removeEventListener('click', this.boundClick); this.root.removeEventListener('submit', this.boundSubmit); this.root.removeEventListener('input', this.boundInput);
    window.removeEventListener('online', this.boundOnline); window.removeEventListener('offline', this.boundOffline); document.removeEventListener('visibilitychange', this.boundVisibility);
    window.removeEventListener('resize', this.boundResize); window.visualViewport?.removeEventListener('resize', this.boundResize);
    document.querySelectorAll('.portal-dialog').forEach(dialog => dialog.close()); this.root.replaceChildren(); this.root.hidden = true;
  }
  get current() { return this.rows.find(row => row.id === this.selectedId); }
  updateProfile(profile) { this.profile = profile; if (this.tab === 'account') this.renderAccount(); }
  renderShell() {
    this.root.innerHTML = `${this.data.demo ? '<div class="portal-preview-note">LOCAL PREVIEW · Sample bookings and messages. Nothing is sent to riders.</div>' : ''}<aside class="portal-sidebar"><a class="p-brand" href="./" aria-label="LahuzGo website"><img src="assets/lahuzgo-launcher-icon.png" alt="" width="38" height="38"><span>Lahuz<span>Go.</span></span></a><p class="sidebar-label">YOUR EVERYDAY, A LITTLE EASIER.</p><nav class="portal-nav" aria-label="Customer navigation">${['home', 'chat', 'account'].map(tab => `<button type="button" data-tab="${tab}">${icon(tab)}<span>${tab[0].toUpperCase() + tab.slice(1)}</span>${tab === 'chat' ? '<b class="chat-badge" hidden></b>' : ''}</button>`).join('')}</nav><div class="sidebar-bottom"><button type="button" class="sidebar-help" data-action="help">${icon('help')}<span>A little help, anytime.</span>${icon('arrow')}</button><div class="sidebar-person"><span class="p-avatar">${e(initials(this.profile))}</span><p><strong>${e(name(this.profile))}</strong><small>Customer account</small></p></div></div></aside><div class="portal-workspace"><header class="portal-topbar"><div class="topbar-location">${icon('pin')}<p><small>ROOTED IN</small><strong>Ormoc City, Leyte</strong></p></div><a href="./" class="p-brand mobile-brand"><img src="assets/lahuzgo-launcher-icon.png" alt="" width="32" height="32"><span>Lahuz<span>Go.</span></span></a><div class="topbar-actions"><span class="connection-label" role="status"><i></i>Connecting…</span><button type="button" class="p-icon-button" data-action="refresh" aria-label="Refresh bookings">${icon('refresh')}</button><button type="button" class="p-icon-button activity-button" data-action="activity" aria-label="Notifications">${icon('bell')}<b class="activity-dot" hidden></b></button><button type="button" class="p-avatar avatar-button" data-tab="account" aria-label="Open account">${e(initials(this.profile))}</button></div></header><div class="portal-alert" role="status" hidden></div><main class="portal-content" id="customer-home" tabindex="-1"><section data-view="home"></section><section data-view="chat" hidden></section><section data-view="account" hidden></section></main><footer class="portal-footnote"><span>Local rides. Everyday errands.</span><a href="./">LahuzGo website ↗</a></footer></div><div class="portal-toast" role="status" hidden></div>`;
    if (!this.data.demo && document.body.dataset.customerEnvironment === 'local-live') {
      const note = document.createElement('div'); note.className = 'portal-preview-note local-live';
      note.textContent = 'LOCAL WEBSITE · Live bookings and messages from your customer account.';
      this.root.prepend(note);
    }
    this.renderHome(); this.renderChat(); this.renderAccount(); this.navigate('home', false);
  }
  navigate(tab, focus = true) {
    if (!['home', 'chat', 'account'].includes(tab)) return;
    this.tab = tab; this.root.dataset.tab = tab;
    for (const view of this.root.querySelectorAll('[data-view]')) view.hidden = view.dataset.view !== tab;
    for (const button of this.root.querySelectorAll('.portal-nav [data-tab]')) { button.classList.toggle('active', button.dataset.tab === tab); if (button.dataset.tab === tab) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); }
    document.title = `${tab[0].toUpperCase() + tab.slice(1)} — LahuzGo`;
    this.boundResize();
    if (tab === 'chat' && this.selectedId) this.refreshChat();
    if (focus) { window.scrollTo({ top: 0, behavior: 'instant' }); this.root.querySelector('.portal-content').focus({ preventScroll: true }); }
  }
  connection(status) {
    if (this.stopped) return;
    const label = this.root.querySelector('.connection-label'); if (!label) return;
    const offline = !navigator.onLine || status === 'offline';
    label.dataset.status = offline ? 'offline' : status;
    label.innerHTML = `<i></i>${offline ? 'Offline' : status === 'live' ? 'Live updates' : 'Reconnecting…'}`;
  }
  toast(message) {
    const toast = this.root.querySelector('.portal-toast'); if (!toast) return;
    toast.textContent = message; toast.hidden = false; clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => toast.hidden = true, 5500);
  }
  scheduleRefresh() { clearTimeout(this.refreshTimer); this.refreshTimer = setTimeout(() => this.refresh(), 300); }
  async refresh(all = false) {
    if (this.refreshing || this.stopped) return;
    this.refreshing = true;
    const refreshButton = this.root.querySelector('[data-action="refresh"]'); if (refreshButton) refreshButton.disabled = true;
    try {
      const rows = await this.data.requests(); if (this.stopped) return;
      if (document.hidden && hasNewUpdate(this.notificationRows, rows)) showBookingNotification().catch(() => {});
      // Chat refreshes replace this.rows independently. Keep a separate baseline so
      // a realtime chat refresh cannot swallow the next unread/status alert.
      this.notificationRows = rows.map(row => ({ ...row }));
      this.rows = rows; this.ready = true;
      this.root.querySelector('.portal-alert').hidden = true; this.renderHome(); this.renderList(); this.updateBadge();
      if (this.tab === 'chat' && this.selectedId) await this.refreshChat();
      if (all) {
        const extras = await Promise.allSettled([this.data.addresses(), this.data.mapControls(), this.data.notice()]); if (this.stopped) return;
        if (extras[0].status === 'fulfilled') { this.addresses = extras[0].value; this.addressError = null; } else this.addressError = 'Could not refresh saved addresses. Please try again.';
        if (extras[1].status === 'fulfilled' && extras[1].value) this.controls = extras[1].value;
        if (extras[2].status === 'fulfilled') this.notice = extras[2].value;
        this.renderHome(); this.renderAccount();
      }
    } catch (error) {
      if (!this.stopped) { const alert = this.root.querySelector('.portal-alert'); alert.hidden = false; alert.textContent = 'Could not refresh your bookings. Your loaded details are kept. Check your connection and tap Refresh.'; }
    } finally { this.refreshing = false; if (refreshButton?.isConnected) refreshButton.disabled = false; }
  }
  updateBadge() {
    const total = this.rows.filter(ongoing).reduce((sum, row) => sum + (Number(row.customer_unread_count) || 0), 0);
    const badge = this.root.querySelector('.chat-badge'); badge.hidden = !total; badge.textContent = total > 99 ? '99+' : String(total);
    this.root.querySelector('.activity-dot').hidden = !total;
  }
  bookingRow(row) {
    const service = SERVICE_NAMES[row.service] || 'Request', status = bookingStatus(row);
    return `<button type="button" class="booking-row" data-open-chat="${e(row.id)}"><span class="request-symbol ${e(row.service)}">${icon(row.service === 'angkas' ? 'pin' : 'chat')}</span><span class="booking-row-copy"><strong>${e(service)}<small>#${e(row.id.slice(0, 8).toUpperCase())}</small></strong><span>${e(row.last_message_preview || status)}</span><small>${e(dateLabel(row.created_at))}${accepted(row) ? ` · ${e(row.rider_name || 'Your rider')}` : ''}</small></span><span class="booking-row-end"><span class="p-status ${row.request_outcome === 'cancelled' ? 'cancelled' : ''}">${e(status)}</span>${row.customer_unread_count ? `<b class="unread-count">${Math.min(99, row.customer_unread_count)}</b>` : '<span aria-hidden="true">↗</span>'}</span></button>`;
  }
  renderHome() {
    if (this.stopped) return;
    const active = this.rows.filter(ongoing), hour = new Date().getHours(), greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const notice = this.notice;
    this.root.querySelector('[data-view="home"]').innerHTML = `<div class="page-heading"><div><p class="p-eyebrow">A LITTLE LESS RUNNING AROUND.</p><h1>${greeting},<br class="mobile-break"> ${e(this.profile.first_name || 'there')}<span class="heading-dot">.</span></h1><p>Where can we take a little off your day?</p></div><span class="local-label"><i></i> Made for your day.</span></div>${notice?.is_enabled && ['customer', 'both'].includes(notice.target_app ?? 'both') && !this.noticeDismissed ? `<aside class="service-notice"><div>${icon('bell')}<p><strong>${e(notice.title)}</strong><span>${e(notice.message)}</span></p></div><button type="button" class="p-icon-button" data-action="dismiss-notice" aria-label="Dismiss notice">×</button></aside>` : ''}<section class="home-editorial"><div><p class="p-eyebrow">YOUR NEXT STOP, A RIDE AWAY.</p><h2>Go a little further.<br><em>Do a little less.</em></h2><p>A ride across town. A parcel to send.<br>Shopping brought to your door.</p><button type="button" class="editorial-link" data-book="angkas">Let’s get you there ${icon('arrow')}</button></div><img src="assets/delivery-editorial-small.webp" width="560" height="700" alt="A blue LahuzGo scooter ready for everyday rides and errands"></section><div class="section-heading"><h2>What can we help with?</h2><span>Choose your everyday.</span></div><div class="service-grid">${services.map((service, i) => `<button type="button" class="service-card ${service.className}" data-book="${service.id}"><div class="service-photo"><img src="assets/${service.photo}" alt="" width="640" height="400"><span class="service-number">0${i + 1}</span><span class="service-arrow">${icon('arrow')}</span></div><div class="service-copy"><small>${service.kicker}</small><h3>${service.title}</h3><p>${service.text}</p></div></button>`).join('')}</div><section class="ongoing-section"><div class="section-heading"><h2>Your ongoing requests${active.length ? ` <span class="section-count">${active.length}</span>` : ''}</h2><button type="button" class="p-link" data-tab="chat">View chat ${icon('arrow')}</button></div><div class="bookings-card">${active.length ? active.map(row => this.bookingRow(row)).join('') : `<div class="quiet-state">${icon(this.ready ? 'check' : 'refresh')}<p><strong>${this.ready ? 'A little room for your next plan.' : 'Getting your bookings ready…'}</strong><span>${this.ready ? 'Your active rides and errands will appear here.' : 'Your app and website use the same customer account.'}</span></p></div>`}</div></section><div class="home-bottom-links"><button type="button" data-action="history">${icon('clock')}<p><strong>Request history</strong><span>Your previous rides and errands</span></p>${icon('arrow')}</button><button type="button" data-action="help">${icon('help')}<p><strong>Here to help</strong><span>A hand when you need one</span></p>${icon('arrow')}</button></div>`;
  }
  renderChat() {
    if (this.stopped) return;
    this.conversationSignature = null;
    this.root.querySelector('[data-view="chat"]').innerHTML = `<div class="page-heading compact"><div><p class="p-eyebrow">A MESSAGE AWAY.</p><h1>Your conversations<span class="heading-dot">.</span></h1><p>Stay in touch, from pickup to your next stop.</p></div></div><div class="chat-workspace ${this.selectedId ? 'chat-selected' : ''}"><aside class="conversation-sidebar"><div class="conversation-filters" role="group" aria-label="Filter conversations"><button type="button" data-filter="ongoing" class="${this.filter === 'ongoing' ? 'active' : ''}">Ongoing</button><button type="button" data-filter="history" class="${this.filter === 'history' ? 'active' : ''}">History</button></div><label class="history-date" ${this.filter === 'history' ? '' : 'hidden'}>History date<input type="date" name="historyDate" value="${e(this.historyDate)}"></label><div class="conversation-list" aria-label="Your conversations"></div></aside><section class="chat-detail" aria-label="Conversation"><div class="chat-placeholder">${icon('chat')}<h2>A little help,<br>a message away.</h2><p>Choose a conversation to see your rider,<br>booking updates and messages.</p></div></section></div>`;
    this.root.querySelector('[name="historyDate"]').addEventListener('change', event => { this.historyDate = event.target.value; this.renderList(); });
    this.renderList();
  }
  renderList() {
    const list = this.root.querySelector('.conversation-list'); if (!list) return;
    const rows = this.rows.filter(row => this.filter === 'history' ? history(row) : ongoing(row)).filter(row => !this.historyDate || this.filter !== 'history' || philippineDay(row.created_at) === this.historyDate);
    list.innerHTML = rows.length ? rows.map(row => `<button type="button" class="conversation-item ${row.id === this.selectedId ? 'selected' : ''}" data-open-chat="${e(row.id)}"><span class="request-symbol ${e(row.service)}">${icon(row.service === 'angkas' ? 'pin' : 'chat')}</span><p><strong>${e(SERVICE_NAMES[row.service] || 'Request')}<time>${e(time(row.last_message_at || row.created_at))}</time></strong><span>${e(row.last_message_preview || bookingStatus(row))}</span><small>${e(bookingStatus(row))}</small></p>${row.customer_unread_count ? `<b class="unread-count">${Math.min(99, row.customer_unread_count)}</b>` : ''}</button>`).join('') : `<div class="inbox-empty">${icon('chat')}<strong>${this.filter === 'history' ? 'No bookings for this date.' : 'You’re all caught up.'}</strong><p>${this.filter === 'history' ? 'Completed and cancelled bookings appear here.' : 'Start a ride or errand from Home.'}</p></div>`;
  }
  async openChat(id) {
    this.selectedId = id; this.epoch++; this.filter = this.rows.find(row => row.id === id)?.request_outcome ? 'history' : 'ongoing';
    this.navigate('chat', false); this.renderChat(); this.root.querySelector('.chat-workspace').classList.add('chat-selected');
    window.scrollTo({ top: 0, behavior: 'instant' }); this.boundResize();
    this.root.querySelector('.chat-detail').innerHTML = `<div class="chat-placeholder">${icon('refresh')}<p>Opening your conversation…</p></div>`;
    await this.refreshChat(true);
  }
  async refreshChat(initial = false) {
    if (!this.selectedId || this.chatLoading || this.stopped) return;
    const id = this.selectedId, epoch = this.epoch; this.chatLoading = true;
    try {
      const [row, messages] = await Promise.all([this.data.conversation(id), this.data.messages(id)]);
      if (this.stopped || id !== this.selectedId || epoch !== this.epoch) return;
      if (!row) throw new Error('This conversation is not available to your account.');
      const index = this.rows.findIndex(value => value.id === id); if (index < 0) this.rows.unshift(row); else this.rows[index] = row;
      const saved = new Map((this.messages.get(id) || []).map(message => [message.id, message])); for (const message of messages) saved.set(message.id, message);
      this.messages.set(id, [...saved.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)));
      this.hasOlder = messages.length === 60;
      this.renderConversation(initial);
      if (this.tab === 'chat' && !document.hidden && row.customer_unread_count > 0) {
        try { await this.data.read(id); row.customer_unread_count = 0; } catch { /* Keep the unread badge until the server acknowledges it. */ }
      }
      this.updateBadge(); this.renderList();
    } catch (error) {
      if (id === this.selectedId && epoch === this.epoch) {
        if (this.messages.has(id)) this.toast('Could not refresh messages. Your loaded chat is kept.');
        else this.root.querySelector('.chat-detail').innerHTML = `<div class="chat-placeholder">${icon('chat')}<p>${e(portalError(error))}</p><button type="button" class="p-button secondary" data-action="retry-chat">Try again</button><button type="button" class="p-link" data-action="inbox">Back to conversations</button></div>`;
      }
    } finally { this.chatLoading = false; if (id !== this.selectedId && !this.stopped) this.refreshChat(true); }
  }
  renderChatStatus() {
    const container = this.root.querySelector('.chat-status-content'); if (!container || !this.current) return;
    container.innerHTML = this.statusContent(this.current);
  }
  statusContent(row) {
    const waiting = ongoing(row) && !accepted(row), stage = searchStage(row.created_at);
    return `<div class="chat-status-label"><i></i><strong>${e(bookingStatus(row))}</strong>${Number.isInteger(row.delivery_fee_cents) ? `<span>${pesos(row.delivery_fee_cents)}</span>` : ''}</div>${waiting ? `<p>${e(stage.message)}</p>${stage.canCancel && row.cancellation_status !== 'requested' ? '<button type="button" class="p-link danger-text" data-action="cancel-booking">Cancel booking</button>' : ''}` : accepted(row) && ongoing(row) ? `<p>${e(row.rider_name || 'Your rider')}${row.cancellation_status === 'requested' ? ' · Cancellation under review' : ' · Connected to your booking'}</p>` : history(row) ? `<p>${row.request_outcome === 'completed' ? 'Your booking is complete. Your messages are saved here.' : 'This booking is closed and saved in History.'}</p>` : ''}`;
  }
  renderConversation(initial = false) {
    if (this.stopped) return;
    const row = this.current; if (!row) return;
    const signature = JSON.stringify([row, this.messages.get(row.id), this.pending.get(row.id)?.id, this.pending.get(row.id)?.failed, this.hasOlder]);
    if (!initial && signature === this.conversationSignature && this.root.querySelector('.chat-composer')) { this.renderChatStatus(); return; }
    this.conversationSignature = signature;
    const detail = this.root.querySelector('.chat-detail'), previousScroll = detail.querySelector('.message-list'), nearEnd = !previousScroll || previousScroll.scrollHeight - previousScroll.scrollTop - previousScroll.clientHeight < 100;
    const oldScroll = previousScroll?.scrollTop ?? 0;
    const focused = detail.querySelector('[name="message"]') === document.activeElement, selection = focused ? document.activeElement.selectionStart : null;
    const savedDraft = this.drafts.get(row.id) || '';
    const closed = row.status === 'closed', pending = this.pending.get(row.id);
    detail.innerHTML = `<header class="chat-header"><button type="button" class="p-icon-button inbox-back" data-action="inbox" aria-label="Back to conversations">${icon('back')}</button><span class="request-symbol ${e(row.service)}">${icon('chat')}</span><p><strong>${e(SERVICE_NAMES[row.service] || 'Request')} chat</strong><small>#${e(row.id.slice(0, 8).toUpperCase())} · ${e(dateLabel(row.created_at))}</small></p><button type="button" class="p-button secondary small" data-action="booking-details">Status ${icon('arrow')}</button></header><div class="chat-status-content">${this.statusContent(row)}</div><div class="message-list" role="log" aria-label="Messages" aria-live="polite">${this.hasOlder ? '<button type="button" class="p-link older-messages" data-action="older">Load older messages</button>' : ''}${(this.messages.get(row.id) || []).map(message => this.messageHTML(message, row)).join('')}${!(this.messages.get(row.id) || []).length ? `<div class="messages-empty">${icon('chat')}<strong>A little help, a message away.</strong><p>Share any extra instructions here.</p></div>` : ''}${pending ? `<div class="message-bubble mine pending"><p>${e(pending.body || pending.file?.name)}</p><small>${pending.failed ? 'Not sent' : 'Sending…'}</small>${pending.failed ? '<button type="button" class="p-link" data-action="retry-message">Try again</button>' : ''}</div>` : ''}</div>${!closed && row.delivery_fee_quoted_at && !row.fee_accepted_at && Number.isInteger(row.delivery_fee_cents) ? `<div class="chat-action-card"><p>Your delivery fee is <strong>${pesos(row.delivery_fee_cents)}</strong>.</p><button type="button" class="p-button primary" data-action="accept-fee">Accept fee</button></div>` : ''}${!closed && row.delivery_proof_submitted_at && row.service !== 'angkas' && row.delivery_review_status !== 'pending_review' ? `<div class="chat-action-card"><p>Review your delivery proof. Confirm only if you received your items.</p><button type="button" class="p-button primary" data-action="confirm-delivery">Confirm receipt</button></div>` : ''}${row.request_outcome === 'completed' ? '<div class="chat-action-card"><p>How was your experience?</p><button type="button" class="p-button secondary" data-action="rate">Rate your rider</button></div>' : ''}<form class="chat-composer"><input type="file" id="chat-file" accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime" hidden ${closed || pending ? 'disabled' : ''}><input type="file" id="chat-camera" accept="image/jpeg,image/png,image/webp" capture="environment" hidden ${closed || pending ? 'disabled' : ''}><div class="composer-tools" role="group" aria-label="Photo and media options"><button type="button" class="p-icon-button" data-action="camera" aria-label="Take a photo" title="Take a photo" ${closed || pending ? 'disabled' : ''}>${icon('camera')}</button><button type="button" class="p-icon-button" data-action="attach" aria-label="Attach a photo or video" title="Attach a photo or video" ${closed || pending ? 'disabled' : ''}>${icon('attach')}</button></div><label class="p-sr" for="chat-message">Message to your rider</label><textarea name="message" id="chat-message" rows="1" maxlength="5000" placeholder="${closed ? 'Conversation closed' : 'Write a message…'}" ${closed || pending ? 'disabled' : ''}>${e(savedDraft)}</textarea><button type="submit" class="composer-send" aria-label="Send message" ${closed || pending ? 'disabled' : ''}>${icon('send')}</button></form>`;
    const input = detail.querySelector('[name="message"]');
    input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && !matchMedia('(pointer:coarse)').matches) { event.preventDefault(); input.form.requestSubmit(); } });
    for (const selector of ['#chat-file', '#chat-camera']) detail.querySelector(selector).addEventListener('change', event => {
      const file = event.target.files?.[0]; event.target.value = '';
      this.attach(file, { conversationId: row.id, fromCamera: selector === '#chat-camera' });
    });
    const list = detail.querySelector('.message-list'); list.scrollTop = initial || nearEnd ? list.scrollHeight : oldScroll;
    if (focused && !input.disabled) { input.focus({ preventScroll: true }); input.setSelectionRange(selection, selection); }
    for (const message of this.messages.get(row.id) || []) if (message.attachment_path) this.loadMedia(message, row.id);
  }
  messageHTML(message, row) {
    const mine = message.sender_id === this.profile.id, proof = (message.body || '').startsWith('[DELIVERY_PROOF]');
    const body = proof ? (message.body || '').replace(/^\[DELIVERY_PROOF\]\s*/, '') : message.body;
    return `<article class="message-bubble ${mine ? 'mine' : 'theirs'}" data-message-id="${e(message.id)}">${proof ? '<small class="proof-label">DELIVERY PROOF</small>' : ''}${message.attachment_path ? `<div class="message-media" data-media="${e(message.id)}"><button type="button" class="p-link" data-load-media="${e(message.id)}">Load ${message.attachment_mime?.startsWith('video/') ? 'video' : 'photo'}</button></div>` : ''}${body ? `<p>${e(body)}</p>` : ''}<small>${e(time(message.created_at))}${mine ? ` · ${row.rider_last_read_at && Date.parse(row.rider_last_read_at) >= Date.parse(message.created_at) ? 'Seen' : 'Sent'}` : ''}</small></article>`;
  }
  async loadMedia(message, conversationId) {
    if (this.selectedId !== conversationId) return;
    let entry = this.mediaUrls.get(message.id);
    if (!entry || entry.expires <= Date.now()) {
      if (entry?.loading) return;
      this.mediaUrls.set(message.id, { loading: true });
      try { entry = { url: await this.data.media(message.attachment_path), expires: Date.now() + 240_000 }; this.mediaUrls.set(message.id, entry); }
      catch { this.mediaUrls.delete(message.id); return; }
    }
    if (this.selectedId !== conversationId || !entry.url) return;
    let url; try { url = new URL(entry.url); } catch { return; }
    if (!['https:', 'blob:'].includes(url.protocol) && !(this.data.demo && url.origin === location.origin)) return;
    const node = [...this.root.querySelectorAll('[data-media]')].find(node => node.dataset.media === message.id); if (!node) return;
    const atBottom = node.closest('.message-list')?.scrollHeight - node.closest('.message-list')?.scrollTop - node.closest('.message-list')?.clientHeight < 100;
    const media = document.createElement(message.attachment_mime?.startsWith('video/') ? 'video' : 'img'); media.src = entry.url;
    if (media.tagName === 'VIDEO') { media.controls = true; media.playsInline = true; media.preload = 'metadata'; } else { media.alt = 'Chat attachment'; media.loading = 'lazy'; }
    media.addEventListener('error', () => { this.mediaUrls.delete(message.id); node.innerHTML = `<button class="p-link" type="button" data-load-media="${e(message.id)}">Retry attachment</button>`; }, { once: true });
    media.addEventListener('load', () => { if (atBottom) { const list = node.closest('.message-list'); if (list) list.scrollTop = list.scrollHeight; } }, { once: true });
    node.replaceChildren(media);
  }
  async sendMessage(pending) {
    const id = this.selectedId, row = this.current; if (this.stopped || !id || !row || row.status === 'closed') return;
    const message = pending || this.pending.get(id) || { id: crypto.randomUUID(), body: (this.drafts.get(id) || '').trim() };
    if (!message.body && !message.file) return;
    if (message.sending) return;
    message.sending = true; message.failed = false; this.pending.set(id, message); this.renderConversation();
    try {
      if (message.file) await this.data.sendAttachment(message.id, id, message.body, message.file); else await this.data.send(message.id, id, message.body);
      this.pending.delete(id); this.drafts.delete(id);
      if (id === this.selectedId) await this.refreshChat(); this.scheduleRefresh();
    } catch (error) { message.failed = true; this.toast(portalError(error)); }
    finally { message.sending = false; if (id === this.selectedId && !this.stopped) this.renderConversation(); }
  }
  chooseAttachment(fromCamera = false) {
    if (this.stopped || !this.current || this.current.status === 'closed' || this.pending.has(this.selectedId)) return;
    const input = this.root.querySelector(fromCamera ? '#chat-camera' : '#chat-file');
    if (input && !input.disabled) { input.value = ''; input.click(); }
  }
  async capturePhoto() {
    const conversationId = this.selectedId;
    const available = () => !this.stopped && conversationId === this.selectedId && this.current && this.current.status !== 'closed' && !this.pending.has(conversationId);
    if (!available() || this.cameraController) return;
    const controller = new AbortController(); this.cameraController = controller;
    try {
      const photo = await takePhoto({ signal: controller.signal, nativeCapture: () => { if (available()) this.chooseAttachment(true); } });
      if (photo && available()) await this.attach(photo, { conversationId, fromCamera: true });
    } catch { if (available()) this.toast('The camera could not open. Please try again.'); }
    finally { if (this.cameraController === controller) this.cameraController = null; }
  }
  async attach(file, { conversationId = this.selectedId, fromCamera = false } = {}) {
    const available = () => !this.stopped && conversationId === this.selectedId && this.current && this.current.status !== 'closed' && !this.pending.has(conversationId);
    if (!file || !available()) return;
    if (file.size <= 0 || file.size > 25 * 1024 * 1024) { this.toast('Choose a photo or video smaller than 25 MB.'); return; }
    let media;
    try { media = detectMediaType(new Uint8Array(await file.slice(0, 64).arrayBuffer())); }
    catch { if (available()) this.toast('This photo could not be opened. Please take it again.'); return; }
    if (!available()) return;
    if (!media || (fromCamera && !media.mime.startsWith('image/'))) { this.toast(fromCamera ? 'Please take the photo again or attach a JPG, PNG or WebP image.' : 'Choose a JPG, PNG, WebP, GIF, MP4 or MOV file.'); return; }
    const photo = media.mime.startsWith('image/'), preview = URL.createObjectURL(file);
    const dialog = modal(photo ? 'Preview photo' : 'Preview video', `<div class="attachment-preview">${photo ? '<img alt="Photo ready to send">' : '<video controls playsinline preload="metadata"></video>'}</div><p class="p-muted attachment-file-note">${e(file.name)} · ${(file.size / 1024 / 1024).toFixed(1)} MB</p><p>This ${photo ? 'photo' : 'video'} will be shared in this booking’s chat when you tap Send.</p><p class="attachment-error p-error" role="alert" hidden></p><div class="dialog-actions ${fromCamera ? 'camera-actions' : ''}"><button type="button" class="p-button secondary" data-no>Keep editing</button>${fromCamera ? '<button type="button" class="p-button secondary" data-retake>Retake photo</button>' : ''}<button type="button" class="p-button primary" data-yes>Send ${photo ? 'photo' : 'video'}</button></div>`);
    dialog.addEventListener('close', () => URL.revokeObjectURL(preview), { once: true });
    const image = dialog.querySelector(photo ? 'img' : 'video');
    image.addEventListener('error', () => {
      dialog.querySelector('.attachment-error').hidden = false;
      dialog.querySelector('.attachment-error').textContent = 'This file could not be previewed. Take another photo or choose a different file.';
      dialog.querySelector('[data-yes]').disabled = true;
    }, { once: true });
    image.src = preview;
    dialog.querySelector('[data-no]').addEventListener('click', () => dialog.close());
    dialog.querySelector('[data-retake]')?.addEventListener('click', () => { dialog.close(); if (available()) this.capturePhoto(); });
    dialog.querySelector('[data-yes]').addEventListener('click', () => {
      dialog.close();
      if (available()) this.sendMessage({ id: crypto.randomUUID(), body: (this.drafts.get(conversationId) || '').trim(), file });
    });
  }
  renderAccount() {
    if (this.stopped) return;
    const target = this.root.querySelector('[data-view="account"]'); if (!target) return;
    target.innerHTML = `<div class="page-heading compact"><div><p class="p-eyebrow">YOUR LITTLE CORNER.</p><h1>Your account<span class="heading-dot">.</span></h1><p>The details that keep your day moving.</p></div></div><div class="account-grid"><section class="profile-card"><div class="profile-cover"></div><span class="p-avatar profile-avatar">${e(initials(this.profile))}</span><h2>${e(name(this.profile))}</h2><p class="verified-label">${icon('check')} Verified customer</p><dl><div><dt>Mobile number</dt><dd>${e(this.profile.phone || 'Not provided')}</dd></div><div><dt>Email address</dt><dd>${e(this.profile.contact_email || 'Not provided')}</dd></div></dl><p class="p-note">Your customer account is shared with the LahuzGo app.</p></section><div class="account-options"><section class="saved-card"><div class="section-heading"><h2>${icon('pin')} Saved addresses</h2><button type="button" class="p-link" data-action="add-address">＋ Add new</button></div><p class="p-muted">Your familiar places, ready for your next booking.</p>${this.addressError ? `<p class="p-error">${e(this.addressError)}</p><button type="button" class="p-link" data-action="refresh">Try again</button>` : ''}<div class="saved-addresses">${this.addresses.length ? this.addresses.map(address => `<div class="saved-address"><span class="address-symbol">${icon('pin')}</span><p><strong>${e(address.label)}</strong><span>${e(address.address)}</span>${address.landmark ? `<small>${e(address.landmark)}</small>` : ''}</p><button type="button" class="p-link" data-edit-address="${e(address.id)}">Edit</button></div>`).join('') : `<div class="quiet-address"><strong>Make your next stop easier.</strong><p>Save home, work or a place you visit often.</p><button type="button" class="p-button secondary" data-action="add-address">Save your first address ${icon('arrow')}</button></div>`}</div></section><button type="button" class="account-help" data-action="help">${icon('help')}<p><strong>Here to help</strong><span>Questions, a little guidance, or a hand with a booking.</span></p>${icon('arrow')}</button><div class="account-signout"><p>See you on your next stop.</p><button type="button" class="p-button secondary" data-action="signout">${icon('logout')}Sign out</button></div><div class="account-policies"><a href="privacy-policy.html" target="_blank" rel="noopener">Privacy</a><span>·</span><a href="terms-and-conditions.html" target="_blank" rel="noopener">Terms</a></div></div></div>`;
  }
  async editAddress(id = null) {
    let saved = id ? { ...this.addresses.find(address => address.id === id) } : { id: crypto.randomUUID(), label: '', address: '', landmark: '' };
    const dialog = modal(id ? 'Edit saved address' : 'A familiar place, saved.', `<form class="address-form"><label class="p-field">Label<input name="label" value="${e(saved.label)}" placeholder="e.g. Home or Work" maxlength="80" required></label><label class="p-field">Address<input name="address" value="${e(saved.address)}" maxlength="1000" required placeholder="Your full address"></label><label class="p-field">Landmark <span class="optional">Optional</span><input name="landmark" value="${e(saved.landmark)}" maxlength="1000" placeholder="e.g. Beside the bakery"></label><button type="button" class="address-pin-button p-button secondary">${icon('pin')}<span>${validPin(saved) ? 'Check your map pin' : 'Choose a map pin'}</span>${icon('arrow')}</button><p class="address-error p-error" role="alert" hidden></p><div class="dialog-actions">${id ? '<button type="button" class="p-button danger-outline" data-delete-address>Delete address</button>' : ''}<button type="submit" class="p-button primary">Save address</button></div></form>`);
    dialog.querySelector('.address-pin-button').addEventListener('click', async () => {
      const pin = await pinPicker({ title: 'Pin this saved address', initial: saved, controls: this.controls, demo: this.data.demo }); if (!pin || !dialog.isConnected) return;
      saved = { ...saved, ...pin }; if (!dialog.querySelector('[name="address"]').value) dialog.querySelector('[name="address"]').value = pinName(pin);
      dialog.querySelector('.address-pin-button span').textContent = 'Map pin selected';
    });
    dialog.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault(); const form = event.currentTarget, values = new FormData(form), button = form.querySelector('[type="submit"]'); button.disabled = true;
      try { await this.data.saveAddress({ ...saved, label: values.get('label'), address: values.get('address'), landmark: values.get('landmark') }); if (this.stopped) return; this.addresses = await this.data.addresses(); if (this.stopped) return; this.addressError = null; dialog.close(); this.renderAccount(); this.toast('Address saved.'); }
      catch (error) { const box = form.querySelector('.address-error'); box.hidden = false; box.textContent = portalError(error); }
      finally { if (button.isConnected) button.disabled = false; }
    });
    dialog.querySelector('[data-delete-address]')?.addEventListener('click', async event => {
      const button = event.currentTarget;
      if (!await this.confirm('Delete this saved address?', 'This removes the saved place from your account in both the app and website.', 'Delete address')) return;
      if (this.stopped) return;
      button.disabled = true;
      try { await this.data.deleteAddress(saved.id); this.addresses = this.addresses.filter(address => address.id !== saved.id); dialog.close(); this.renderAccount(); this.toast('Address removed.'); }
      catch (error) { this.toast(portalError(error)); if (button.isConnected) button.disabled = false; }
    });
  }
  help() {
    modal('Here to help.', `<p class="help-intro">A little guidance for your next ride or errand.</p><div class="help-questions"><details open><summary>How do I book a Pa-angkas ride?</summary><p>Choose Pa-angkas on Home. Pin your pickup and destination, add optional instructions, then review the fare and submit. Your rider and updates will appear in Chat when someone accepts.</p></details><details><summary>How do Padala and Pabili work?</summary><p>Use Padala for items already paid for and ready for pickup. Use Pabili when you need your rider to buy items. Choose locations, add contacts and item details, then review the delivery fee. Item costs are separate.</p></details><details><summary>No rider has accepted yet. What can I do?</summary><p>Your booking stays open while we look for a rider. After 20 minutes, Chat shows an option to keep waiting or cancel. If no rider accepts within 2 hours, the server closes the booking and saves it in History.</p></details><details><summary>Can I use my account in the app too?</summary><p>Yes. Your profile, saved addresses, bookings and messages use the same customer account. You can stay signed in on the app and website together.</p></details><details><summary>Why can’t I use my current location?</summary><p>Turn on your phone’s Location Services and allow location access for this website in your browser settings. You can always search or pin the exact location on the map instead.</p></details></div><div class="help-contact"><strong>Need a hand with something else?</strong><a class="p-button primary" href="mailto:atonlopez55@gmail.com?subject=LahuzGo%20customer%20help">Email LahuzGo ${icon('arrow')}</a><a class="p-link" href="tel:+639198065457">Call 0919 806 5457</a></div>`);
  }
  activity() {
    const rows = [...this.rows].sort((a, b) => (b.last_message_at || b.created_at).localeCompare(a.last_message_at || a.created_at)).slice(0, 20);
    const dialog = modal('Your updates.', `<p class="p-muted">Booking updates and messages, in one place.</p><section class="notification-access"><div><strong>Device notifications</strong><p>Get alerts for new messages and booking updates while LahuzGo is open in your browser.</p><p class="notification-permission p-note" role="status">Checking browser support…</p></div><button type="button" class="p-button secondary" data-enable-notifications>Enable notifications</button></section><div class="activity-list">${rows.length ? rows.map(row => this.bookingRow(row)).join('') : '<div class="quiet-state"><p>No updates yet. Your next booking starts on Home.</p></div>'}</div>`, { wide: true });
    const permissionLabel = async () => {
      const state = await permissionState('notifications'); if (!dialog.isConnected) return;
      const labels = { granted: 'Allowed by your browser. Manage access in your browser’s site settings.', denied: 'Blocked in your browser. Open Settings to allow notifications.', default: 'Off until you choose to allow notifications.', 'home-screen': 'On iPhone, add LahuzGo to your Home Screen first.', unsupported: 'This browser does not support device notifications.', insecure: 'A secure connection is needed for notifications.' };
      dialog.querySelector('.notification-permission').textContent = labels[state] || 'Choose whether to allow device notifications.';
      dialog.querySelector('[data-enable-notifications]').textContent = state === 'granted' ? 'Check notifications' : state === 'denied' ? 'How to allow' : state === 'home-screen' ? 'How to enable' : 'Enable notifications';
    };
    permissionLabel();
    dialog.querySelector('[data-enable-notifications]').addEventListener('click', async event => {
      const button = event.currentTarget; button.disabled = true;
      const enabled = await enableNotifications(); if (this.stopped) return;
      if (enabled) this.toast('Notifications enabled. Alerts arrive while LahuzGo is open in your browser.');
      if (button.isConnected) { button.disabled = false; permissionLabel(); }
    });
    dialog.addEventListener('click', event => { const button = event.target.closest('[data-open-chat]'); if (button) { dialog.close(); this.openChat(button.dataset.openChat); } });
  }
  confirm(title, text, label = 'Confirm') {
    return new Promise(resolve => {
      let confirmed = false;
      const dialog = modal(title, `<p>${e(text)}</p><div class="dialog-actions"><button type="button" class="p-button secondary" data-no>Go back</button><button type="button" class="p-button primary" data-yes>${e(label)}</button></div>`);
      dialog.querySelector('[data-no]').addEventListener('click', () => dialog.close());
      dialog.querySelector('[data-yes]').addEventListener('click', () => { confirmed = true; dialog.close(); });
      dialog.addEventListener('close', () => resolve(confirmed), { once: true });
    });
  }
  async details() {
    const row = this.current; if (!row) return;
    let payload;
    try { payload = this.detailCache.get(row.id) || await this.data.details(row.id); if (payload) this.detailCache.set(row.id, payload); }
    catch { this.toast('Could not load the booking details. Please try again.'); return; }
    if (this.stopped || this.selectedId !== row.id) return;
    if (!payload) { this.toast('No booking details are available.'); return; }
    const points = [...(payload.pickups || []), payload.destination].filter(validPin);
    const riderFresh = accepted(row) && ongoing(row) && Date.now() - Date.parse(row.rider_location_updated_at) <= 120_000 && Number.isFinite(row.rider_latitude) && Number.isFinite(row.rider_longitude);
    const dialog = modal(`${SERVICE_NAMES[row.service] || 'Booking'} status`, `<div class="details-status">${this.statusContent(row)}</div><div class="tracking-map" aria-label="Pickup, destination and available rider location"></div><p class="p-note">${riderFresh ? 'Your rider’s recent location is shown on the map.' : accepted(row) && ongoing(row) ? 'Waiting for a fresh rider location. Your pickup and destination are shown.' : 'Your pickup and destination are shown on the map.'}</p><div class="review-route">${points.map((pin, i) => `<div><span class="location-dot ${i === points.length - 1 ? 'red' : ''}">${i === points.length - 1 ? 'D' : i + 1}</span><p><small>${i === points.length - 1 ? 'DESTINATION' : 'PICKUP'}</small><strong>${e(pin.landmark || pinName(pin))}</strong>${pin.items ? `<span>${e(pin.items)}</span>` : ''}${pin.notes ? `<span>${e(pin.notes)}</span>` : ''}</p></div>`).join('')}</div>${payload.instructions ? `<div class="review-note"><small>PASSENGER INSTRUCTIONS</small><p>${e(payload.instructions)}</p></div>` : ''}${accepted(row) ? `<div class="rider-contact"><span class="p-avatar">${e((row.rider_name || 'R')[0])}</span><p><strong>${e(row.rider_name || 'Your rider')}</strong><small>Your assigned rider</small></p>${/^[+\d]{10,14}$/.test(row.rider_phone || '') ? `<a class="p-button secondary small" href="tel:${e(row.rider_phone)}">Call rider</a>` : ''}</div>` : ''}`, { wide: true });
    dialog.querySelector('[data-action="cancel-booking"]')?.addEventListener('click', () => { dialog.close(); this.cancelBooking(); });
    let cleanup; dialog.addEventListener('close', () => cleanup?.(), { once: true });
    try { cleanup = await trackingMap(dialog.querySelector('.tracking-map'), points, riderFresh ? { latitude: row.rider_latitude, longitude: row.rider_longitude } : null); if (!dialog.isConnected) cleanup?.(); }
    catch { const map = dialog.querySelector('.tracking-map'); if (map) map.textContent = 'The map is unavailable. Your location details are listed below.'; }
  }
  async cancelBooking() {
    const row = this.current;
    if (!row || !ongoing(row) || accepted(row) || !searchStage(row.created_at).canCancel) return;
    if (!await this.confirm('Cancel booking?', 'Your booking will be cancelled and moved to History.', 'Cancel booking')) return;
    try { await this.data.cancel(row); await this.refreshChat(); this.scheduleRefresh(); this.toast('Booking cancelled.'); }
    catch (error) { this.toast(portalError(error)); this.refreshChat(); }
  }
  async rate(confirmDelivery = false) {
    const row = this.current; if (!row) return;
    if (!confirmDelivery) {
      try { const rating = await this.data.rating(row.id); if (rating) { this.toast(`You rated this booking ${rating} out of 5. Thank you!`); return; } }
      catch { this.toast('Could not check your rating. Try again.'); return; }
    }
    const dialog = modal(confirmDelivery ? 'Received your delivery?' : 'How was your rider?', `<p>${confirmDelivery ? 'Confirm only if you received your items. Add a rating for your rider.' : 'A little feedback helps us make the next trip better.'}</p><form class="rating-form"><fieldset><legend>Rate your experience</legend><div class="rating-options">${[1, 2, 3, 4, 5].map(n => `<label><input type="radio" name="rating" value="${n}" required><span>${n} ★</span></label>`).join('')}</div></fieldset><p class="rating-error p-error" role="alert" hidden></p><button type="submit" class="p-button primary">${confirmDelivery ? 'Confirm receipt & rate' : 'Submit rating'}</button></form>`);
    dialog.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault(); const button = event.currentTarget.querySelector('[type="submit"]'), rating = Number(new FormData(event.currentTarget).get('rating')); button.disabled = true;
      try { if (confirmDelivery) await this.data.confirm(row, rating); else await this.data.rate(row, rating); dialog.close(); this.toast(confirmDelivery ? 'Delivery confirmed. Thank you!' : 'Thank you for your rating!'); this.refreshChat(); this.scheduleRefresh(); }
      catch (error) { const box = dialog.querySelector('.rating-error'); box.hidden = false; box.textContent = portalError(error); button.disabled = false; }
    });
  }
  async click(event) {
    const button = event.target.closest('button,a'); if (!button || !this.root.contains(button)) return;
    if (button.dataset.tab) { this.navigate(button.dataset.tab); return; }
    if (button.dataset.book) {
      if (!this.ready) { this.toast('Wait for your current bookings to load, then try again.'); return; }
      if (this.rows.filter(ongoing).length >= 2) { this.toast('You already have 2 ongoing requests. Finish or cancel one before booking.'); this.navigate('chat'); return; }
      new BookingWizard({ service: button.dataset.book, data: this.data, addresses: this.addresses, controls: this.controls, onBooked: async id => { await this.openChat(id); this.scheduleRefresh(); this.toast('Request submitted. We’re looking for a rider.'); } }); return;
    }
    if (button.dataset.openChat) { this.openChat(button.dataset.openChat); return; }
    if (button.dataset.filter) { this.filter = button.dataset.filter; this.renderChat(); if (this.selectedId) this.renderConversation(); return; }
    if (button.dataset.editAddress) { this.editAddress(button.dataset.editAddress); return; }
    if (button.dataset.loadMedia) { const message = this.messages.get(this.selectedId)?.find(message => message.id === button.dataset.loadMedia); if (message) this.loadMedia(message, this.selectedId); return; }
    switch (button.dataset.action) {
      case 'help': this.help(); break;
      case 'activity': this.activity(); break;
      case 'refresh': await this.refresh(true); break;
      case 'dismiss-notice': this.noticeDismissed = true; this.renderHome(); break;
      case 'history': this.filter = 'history'; this.selectedId = null; this.epoch++; this.renderChat(); this.navigate('chat'); break;
      case 'inbox': this.selectedId = null; this.epoch++; this.renderChat(); break;
      case 'retry-chat': this.refreshChat(true); break;
      case 'booking-details': this.details(); break;
      case 'cancel-booking': this.cancelBooking(); break;
      case 'attach': this.chooseAttachment(); break;
      case 'camera': this.capturePhoto(); break;
      case 'retry-message': this.sendMessage(); break;
      case 'add-address': this.editAddress(); break;
      case 'signout':
        if (!await this.confirm('Sign out of this browser?', 'Your customer app and other signed-in devices will stay signed in.', 'Sign out')) return;
        button.disabled = true; try { await this.onSignOut(); } catch (error) { this.toast(portalError(error)); if (button.isConnected) button.disabled = false; } break;
      case 'accept-fee':
        if (!this.current || !await this.confirm('Accept this delivery fee?', `Your delivery fee is ${pesos(this.current.delivery_fee_cents)}.`, 'Accept fee')) return;
        button.disabled = true; try { await this.data.acceptFee(this.current); await this.refreshChat(); } catch (error) { this.toast(portalError(error)); } finally { if (button.isConnected) button.disabled = false; } break;
      case 'confirm-delivery': this.rate(true); break;
      case 'rate': this.rate(); break;
      case 'older': {
        button.disabled = true; const id = this.selectedId, oldest = this.messages.get(id)?.[0]?.created_at;
        try { const rows = await this.data.messages(id, oldest); if (id !== this.selectedId) return; const all = new Map([...rows, ...(this.messages.get(id) || [])].map(row => [row.id, row])); this.messages.set(id, [...all.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))); this.hasOlder = rows.length === 60; this.renderConversation(); }
        catch { this.toast('Could not load older messages. Please try again.'); if (button.isConnected) button.disabled = false; } break;
      }
    }
  }
  submitForm(event) { if (event.target.matches('.chat-composer')) { event.preventDefault(); this.sendMessage(); } }
}
