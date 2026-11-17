import { CustomerAccess, CustomerAccessError, BACKEND_URL, PUBLISHABLE_KEY, AUTH_STORAGE_KEY,
  accessMessage, isConnectionError, normalizePhone, validGmail, passwordRequirements, timedFetch } from './customer-auth.js';

const $ = id => document.getElementById(id);
const panels = ['checking', 'login', 'register', 'approval', 'account', 'retry'];
let access, client, activeStorage, busy = false, stage = 'checking', registrationStep = 'phone';
let pollTimer, emailTimer, emailSequence = 0, lastHelpTrigger;
const authStorage = {
  getItem: key => activeStorage.getItem(key),
  setItem: (key, value) => activeStorage.setItem(key, value),
  removeItem: key => activeStorage.removeItem(key),
};
const help = $('help-dialog');
const prettyPhone = value => {
  const p = normalizePhone(value);
  return p ? `+63 ${p.slice(3, 6)} ${p.slice(6, 9)} ${p.slice(9)}` : value;
};
const emptyError = () => { $('page-error').hidden = true; $('page-error').textContent = ''; };
function showError(error) { $('page-error').textContent = accessMessage(error); $('page-error').hidden = false; }
function storageReady(storage) {
  const probe = 'lahuzgo.storage.check'; storage.setItem(probe, '1'); storage.removeItem(probe); return storage;
}
function createAccess(remember, { clearOther = false } = {}) {
  if (!globalThis.supabase?.createClient) throw new CustomerAccessError('The sign-in service could not load. Please refresh this page.');
  const local = storageReady(localStorage), temporary = storageReady(sessionStorage);
  activeStorage = remember ? local : temporary;
  if (clearOther) {
    const other = remember ? temporary : local;
    for (const key of [AUTH_STORAGE_KEY, AUTH_STORAGE_KEY + '-user', AUTH_STORAGE_KEY + '-code-verifier']) other.removeItem(key);
  }
  client ??= globalThis.supabase.createClient(BACKEND_URL, PUBLISHABLE_KEY, {
    auth: { storageKey: AUTH_STORAGE_KEY, storage: authStorage, persistSession: true,
      autoRefreshToken: true, detectSessionInUrl: false },
    global: { fetch: timedFetch(globalThis.fetch.bind(globalThis)), headers: { 'X-Client-Info': 'lahuzgo-customer-web/1.0' } },
  });
  access = new CustomerAccess(client, { deviceStorage: local, registrationStorage: temporary,
    authStorage, userAgent: navigator.userAgent });
}
function setStage(next, { focus = true } = {}) {
  stage = next;
  for (const panel of panels) $(`${panel}-panel`).hidden = panel !== next;
  document.title = `${next === 'register' ? 'Create customer account' : next === 'account' ? 'Your customer account' : 'Customer login'} — LahuzGo`;
  if (next !== 'approval') { clearInterval(pollTimer); pollTimer = null; }
  if (focus) $(`${next}-title`)?.focus({ preventScroll: true });
  updateCooldowns();
}
function setRegisterStep(step) {
  registrationStep = step;
  const current = ['phone', 'code', 'details'].indexOf(step);
  const titles = ['Make yourself at home.', 'Check your messages.', 'A few details, then you’re in.'];
  const descriptions = ['Start with your mobile number. We’ll send a code to verify it’s yours.',
    'Enter the latest code sent to your mobile number.', 'Add your name, Gmail and a password for your next sign-in.'];
  $('register-title').textContent = titles[current]; $('register-intro').textContent = descriptions[current];
  $('register-step').textContent = `STEP ${current + 1} OF 3`;
  for (const part of ['phone', 'code', 'details']) {
    $(`register-${part}-form`).hidden = part !== step;
    document.querySelector(`[data-step="${part}"]`).classList.toggle('is-active', ['phone', 'code', 'details'].indexOf(part) <= current);
  }
  setStage('register');
}
function updateCooldowns() {
  for (const [id, at] of [['register-resend', access?.registration?.resendAt], ['approval-resend', access?.challenge?.resendAt]]) {
    const seconds = Math.max(0, Math.ceil(((at ?? 0) - Date.now()) / 1000));
    $(id).disabled = busy || seconds > 0;
    $(id).textContent = seconds ? `Resend code in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : 'Resend code';
  }
}
function setBusy(value) {
  busy = value;
  document.querySelectorAll('.access-content form').forEach(form => form.setAttribute('aria-busy', String(value)));
  document.querySelectorAll('.access-content button, .access-content input').forEach(control => control.disabled = value);
  document.querySelectorAll('form .primary-button').forEach(button => {
    const label = button.querySelector('span');
    button.dataset.originalLabel ??= label.textContent;
    label.textContent = value && !button.closest('[hidden]') ? 'Please wait…' : button.dataset.originalLabel;
    button.classList.toggle('is-busy', value && !button.closest('[hidden]'));
  });
  updateCooldowns();
}
async function run(action) {
  if (busy) return;
  emptyError(); setBusy(true);
  try { await action(); }
  catch (error) {
    if (error?.code === 'access_denied') {
      await access?.clearSession(); setStage('login');
    }
    showError(error);
  } finally { setBusy(false); }
}
async function applyState(state) {
  if (state.state === 'ready') {
    const profile = state.profile;
    $('account-name').textContent = [profile.first_name, profile.last_name].filter(Boolean).join(' ');
    $('account-phone').textContent = prettyPhone(profile.phone || access.user.phone);
    $('account-email').textContent = profile.contact_email || 'Not provided';
    $('login-password').value = ''; $('register-password').value = ''; $('confirm-password').value = '';
    setStage('account');
  } else if (state.state === 'approval') {
    const first = stage !== 'approval';
    setStage('approval', { focus: first });
    if (first) {
      $('approval-code-form').hidden = true;
      $('approval-options-note').textContent = 'Checking available verification methods…';
      try {
        const options = await access.verificationOptions();
        $('approval-sms').hidden = options.sms_available !== true;
        $('approval-email').hidden = options.email_available !== true;
        $('approval-sms').textContent = options.phone ? `Text ${options.phone}` : 'Text me a code';
        $('approval-email').textContent = options.email ? `Email ${options.email}` : 'Email me a code';
        $('approval-options-note').textContent = options.sms_available || options.email_available
          ? 'Choose where to receive a verification code.' : 'Approve this sign-in on your other device. If you need help, contact LahuzGo.';
      } catch { $('approval-options-note').textContent = 'You can still approve this sign-in on your other device, or check again shortly.'; }
      pollTimer = setInterval(pollApproval, 5000);
    }
  } else if (state.state === 'register-details') {
    $('verified-phone-label').textContent = `${prettyPhone(state.phone)} · verified`;
    setRegisterStep('details');
  } else if (state.state === 'retry') setStage('retry');
  else {
    const requested = new URL(location.href).searchParams.get('mode');
    if (requested === 'register') {
      if (access.registration?.phone) {
        $('register-phone').value = access.registration.phone;
        $('register-code-destination').textContent = `Sent to ${prettyPhone(access.registration.phone)}.`;
        setRegisterStep('code');
      } else setRegisterStep('phone');
    } else setStage('login');
  }
}
async function pollApproval() {
  if (stage !== 'approval' || busy || document.hidden) return;
  setBusy(true);
  try {
    const state = await access.checkApproval();
    if (state.state === 'ready') { emptyError(); await applyState(state); }
  } catch (error) {
    if (error?.code === 'access_denied') { setStage('login'); showError(error); }
  } finally { setBusy(false); }
}
function checkPhoneInput(input) {
  input.setCustomValidity(normalizePhone(input.value) ? '' : 'Enter a valid Philippine mobile number.');
  return input.reportValidity();
}
document.querySelectorAll('input').forEach(input => input.addEventListener('input', () => input.setCustomValidity('')));
document.querySelectorAll('[data-password]').forEach(button => button.addEventListener('click', () => {
  const input = $(button.dataset.password), show = input.type === 'password';
  input.type = show ? 'text' : 'password'; button.setAttribute('aria-pressed', String(show));
  button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
}));
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => run(async () => {
  await access.signOut(); emptyError(); emailSequence++;
  const register = button.dataset.mode === 'register';
  history.replaceState(null, '', register ? 'login.html?mode=register' : 'login.html');
  createAccess(false, { clearOther: true });
  $('register-code').value = ''; $('register-password').value = ''; $('confirm-password').value = '';
  if (register) setRegisterStep('phone'); else setStage('login');
})));
$('login-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!checkPhoneInput($('login-phone')) || !$('login-form').reportValidity()) return;
  run(async () => {
    createAccess($('remember-me').checked, { clearOther: true });
    const result = await access.signIn($('login-phone').value, $('login-password').value);
    $('login-password').value = ''; await applyState(result);
  });
});
$('register-phone-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!checkPhoneInput($('register-phone')) || !$('register-phone-form').reportValidity()) return;
  run(async () => {
    await access.sendRegistrationCode($('register-phone').value);
    $('register-code-destination').textContent = `Sent to ${prettyPhone(access.registration.phone)}.`;
    $('register-code').value = ''; setRegisterStep('code');
  });
});
$('register-resend').addEventListener('click', () => run(async () => {
  await access.sendRegistrationCode(access.registration.phone, { resend: true }); $('register-code').value = '';
}));
$('register-change-phone').addEventListener('click', () => run(async () => { await access.signOut(); setRegisterStep('phone'); }));
$('register-code-form').addEventListener('submit', event => {
  event.preventDefault(); if (!$('register-code-form').reportValidity()) return;
  run(async () => { await applyState(await access.verifyRegistrationCode($('register-code').value.trim())); $('register-code').value = ''; });
});
$('register-password').addEventListener('input', () => {
  for (const [key, met] of Object.entries(passwordRequirements($('register-password').value)))
    document.querySelector(`[data-requirement="${key}"]`).classList.toggle('is-met', met);
});
$('register-gmail').addEventListener('input', () => {
  clearTimeout(emailTimer); const sequence = ++emailSequence;
  const email = $('register-gmail').value.trim().toLowerCase();
  $('gmail-feedback').className = 'field-hint';
  $('gmail-feedback').textContent = 'Used for account updates and recovery.';
  if (!validGmail(email)) return;
  $('gmail-feedback').textContent = 'Checking Gmail availability…';
  emailTimer = setTimeout(async () => {
    try {
      const available = await access.gmailAvailable(email);
      if (sequence !== emailSequence || stage !== 'register' || registrationStep !== 'details') return;
      $('gmail-feedback').textContent = available ? 'Gmail is available.' : 'This Gmail is already linked to another account.';
      $('gmail-feedback').className = available ? 'field-hint is-success' : 'field-hint is-error';
    } catch {
      if (sequence === emailSequence) $('gmail-feedback').textContent = 'We’ll check availability when you continue.';
    }
  }, 500);
});
$('register-details-form').addEventListener('submit', event => {
  event.preventDefault(); if (!$('register-details-form').reportValidity()) return;
  const password = $('register-password').value;
  if (!Object.values(passwordRequirements(password)).every(Boolean)) {
    $('register-password').setCustomValidity('Meet all five password requirements.'); $('register-password').reportValidity(); return;
  }
  if ($('confirm-password').value !== password) {
    $('confirm-password').setCustomValidity('Passwords do not match.'); $('confirm-password').reportValidity(); return;
  }
  if (!validGmail($('register-gmail').value.trim())) {
    $('register-gmail').setCustomValidity('Enter a valid Gmail address.'); $('register-gmail').reportValidity(); return;
  }
  clearTimeout(emailTimer); emailSequence++;
  run(async () => applyState(await access.completeRegistration({ first: $('first-name').value, last: $('last-name').value,
    gmail: $('register-gmail').value, password, confirmation: $('confirm-password').value, terms: $('terms-consent').checked })));
});
for (const channel of ['sms', 'email']) $(`approval-${channel}`).addEventListener('click', () => run(() => sendApproval(channel)));
async function sendApproval(channel) {
  const data = await access.sendApprovalCode(channel);
  $('approval-code-form').hidden = false; $('approval-code').value = '';
  $('approval-code-destination').textContent = `Code sent to ${data.destination ?? 'your verified contact'}.`;
}
$('approval-code-form').addEventListener('submit', event => {
  event.preventDefault(); if (!$('approval-code-form').reportValidity()) return;
  run(async () => applyState(await access.verifyApprovalCode($('approval-code').value.trim())));
});
$('approval-resend').addEventListener('click', () => run(() => sendApproval(access.challenge.channel)));
$('approval-check').addEventListener('click', () => run(async () => {
  const state = await access.checkApproval();
  if (state.state === 'approval') $('approval-options-note').textContent = 'Still waiting for approval. Open LahuzGo on your other device or use a verification code.';
  await applyState(state);
}));
for (const id of ['approval-cancel', 'sign-out']) $(id).addEventListener('click', () => run(async () => {
  await access.signOut(); setStage('login'); emptyError(); history.replaceState(null, '', 'login.html');
}));
$('retry-session').addEventListener('click', () => run(async () => { setStage('checking'); await applyState(await access.restore()); }));
document.querySelectorAll('.help-trigger').forEach(trigger => trigger.addEventListener('click', () => {
  lastHelpTrigger = trigger; help.showModal();
}));
$('help-close').addEventListener('click', () => help.close());
help.addEventListener('close', () => lastHelpTrigger?.focus());
setInterval(updateCooldowns, 1000);
setInterval(async () => {
  if (stage !== 'account' || busy || document.hidden) return;
  setBusy(true);
  try { await applyState(await access.restore()); }
  catch (error) { if (!isConnectionError(error)) { setStage('login'); showError(error); } }
  finally { setBusy(false); }
}, 30_000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { updateCooldowns(); pollApproval(); } });
$('copyright-year').textContent = String(new Date().getFullYear());
try {
  const remember = Boolean(localStorage.getItem(AUTH_STORAGE_KEY)); $('remember-me').checked = remember;
  createAccess(remember); await applyState(await access.restore());
} catch (error) { setStage('login', { focus: false }); showError(error); }
