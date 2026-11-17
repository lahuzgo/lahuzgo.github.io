import { CustomerAccess, CustomerAccessError, BACKEND_URL, PUBLISHABLE_KEY, AUTH_STORAGE_KEY,
  accessMessage, isConnectionError, normalizePhone, validGmail, passwordRequirements, customerApiFetch,
  pendingGoogleSignIn, rememberBrowserSession, SESSION_PREFERENCE_KEY, DEVICE_STORAGE_KEY } from './customer-auth.js?v=sms-login-20261118';
import { CustomerRecovery } from './customer-recovery.js?v=sms-login-20261118';

const $ = id => document.getElementById(id);
const panels = ['checking', 'login', 'register', 'approval', 'account', 'retry', 'recovery', 'recovery-success'];
let access, client, activeStorage, portal, recovery, busy = false, stage = 'checking', registrationStep = 'phone', recoveryStep = 0;
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
function createAccess(remember) {
  if (!globalThis.supabase?.createClient) throw new CustomerAccessError('The sign-in service could not load. Please refresh this page.');
  const local = storageReady(localStorage), temporary = storageReady(sessionStorage);
  temporary.setItem(SESSION_PREFERENCE_KEY, remember ? 'local' : 'session');
  activeStorage = remember ? local : temporary;
  client ??= globalThis.supabase.createClient(BACKEND_URL, PUBLISHABLE_KEY, {
    auth: { storageKey: AUTH_STORAGE_KEY, storage: authStorage, persistSession: true,
      autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce' },
    global: { fetch: customerApiFetch(globalThis.fetch.bind(globalThis)), headers: { 'X-Client-Info': 'lahuzgo-customer-web/1.0' } },
  });
  // Temporary logins keep their own installation identity per tab. A second
  // tab's sign-in must not rebind this tab's device record to another session.
  if (!remember && temporary.getItem(AUTH_STORAGE_KEY) && !temporary.getItem(DEVICE_STORAGE_KEY)
    && local.getItem(DEVICE_STORAGE_KEY)) temporary.setItem(DEVICE_STORAGE_KEY, local.getItem(DEVICE_STORAGE_KEY));
  access = new CustomerAccess(client, { deviceStorage: remember ? local : temporary, registrationStorage: temporary,
    authStorage, userAgent: navigator.userAgent });
  recovery ??= new CustomerRecovery(client);
}
function setStage(next, { focus = true } = {}) {
  if (next !== 'account' && portal) {
    portal.stop(); portal = null; document.body.classList.remove('portal-active');
    document.querySelector('.skip').href = '#access';
  }
  stage = next;
  for (const panel of panels) $(`${panel}-panel`).hidden = panel !== next;
  document.title = `${next === 'recovery' || next === 'recovery-success' ? 'Reset your password' : next === 'register' ? 'Create customer account' : next === 'account' ? 'Your customer account' : 'Customer login'} — LahuzGo`;
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
  if (recovery) {
    const seconds = Math.max(0, Math.ceil((recovery.resendAt - Date.now()) / 1000));
    $('recovery-resend').disabled = busy || seconds > 0;
    $('recovery-resend').textContent = seconds ? `Resend code in ${seconds}s` : 'Resend code';
  }
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
    if (portal) portal.updateProfile(profile);
    else {
      setStage('account', { focus: false });
      const { CustomerPortal } = await import('./customer-portal.js?v=preview-20261117');
      portal = new CustomerPortal({ root: $('customer-portal'), client, profile, onSignOut: async () => {
        await access.signOut(); setStage('login'); emptyError(); history.replaceState(null, '', 'login.html');
      } });
      document.body.classList.add('portal-active'); document.querySelector('.skip').href = '#customer-home';
      await portal.start();
    }
  } else if (state.state === 'approval') {
    const first = stage !== 'approval';
    setStage('approval', { focus: first });
    if (first) {
      $('approval-code-form').hidden = true;
      $('approval-sms').hidden = true;
      $('approval-options-note').textContent = 'Preparing your SMS verification…';
      try {
        if (access.challenge) showLoginCode(access.challenge.destination);
        else await sendApproval();
      } catch (error) {
        $('approval-options-note').textContent = 'We couldn’t send your SMS code. Try again below.';
        $('approval-sms').hidden = false;
        showError(error);
      }
    }
  } else if (state.state === 'register-details') {
    $('verified-phone-label').textContent = `${prettyPhone(state.phone)} · verified`;
    setRegisterStep('details');
  } else if (state.state === 'retry') {
    if (portal) portal.connection('offline'); else setStage('retry');
  }
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
  createAccess(false);
  $('register-code').value = ''; $('register-password').value = ''; $('confirm-password').value = '';
  if (register) setRegisterStep('phone'); else setStage('login');
})));
$('login-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!checkPhoneInput($('login-phone')) || !$('login-form').reportValidity()) return;
  run(async () => {
    createAccess($('remember-me').checked);
    const result = await access.signIn($('login-phone').value, $('login-password').value);
    $('login-password').value = ''; await applyState(result);
  });
});
function showRecoveryStep(step) {
  recoveryStep = step;
  const titles = ['A little help getting back in.', 'Check your Gmail.', 'A fresh start.'];
  const notes = ['Enter the Gmail address registered to your LahuzGo account. We’ll send a 6-digit code to help you reset your password.', 'If this Gmail is registered to a customer account, we’ve sent a 6-digit code. Check your inbox and spam folder. The code expires in 10 minutes.', 'Choose a strong new LahuzGo password. This will also work in your customer app. Your Google password stays the same.'];
  $('recovery-title').textContent = titles[step]; $('recovery-intro').textContent = notes[step];
  $('recovery-step-label').textContent = `STEP ${step + 1} OF 3`;
  for (const [i, part] of ['email','code','password'].entries()) $(`recovery-${part}-form`).hidden = i !== step;
  for (const [i, mark] of [...document.querySelectorAll('[data-recovery-step]')].entries()) mark.classList.toggle('is-active',i <= step);
  setStage('recovery');
}
function clearRecoveryInputs() { for (const id of ['recovery-code','recovery-password','recovery-confirm']) $(id).value = ''; }
$('forgot-password').addEventListener('click', () => {
  if (busy) return;
  recovery.clear(); clearRecoveryInputs(); $('recovery-email').value = ''; emptyError(); showRecoveryStep(0);
});
for (const id of ['recovery-cancel','recovery-success-login']) $(id).addEventListener('click', () => {
  recovery.clear(); clearRecoveryInputs(); emptyError(); setStage('login');
});
$('recovery-change-email').addEventListener('click', () => { recovery.clear(); clearRecoveryInputs(); emptyError(); showRecoveryStep(0); });
$('recovery-email-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!validGmail($('recovery-email').value.trim())) { $('recovery-email').setCustomValidity('Enter your registered Gmail address.'); $('recovery-email').reportValidity(); return; }
  run(async () => { if (await recovery.start($('recovery-email').value)) { clearRecoveryInputs(); $('recovery-destination').textContent = recovery.email; showRecoveryStep(1); } });
});
$('recovery-resend').addEventListener('click', () => run(async () => { if (await recovery.start(recovery.email,{resend:true})) { $('recovery-code').value = ''; $('recovery-feedback').textContent = 'If this Gmail is registered, a new code has been sent. Use the latest code.'; } }));
$('recovery-code-form').addEventListener('submit', event => {
  event.preventDefault(); if (!$('recovery-code-form').reportValidity()) return;
  run(async () => { if (await recovery.verify($('recovery-code').value.trim())) { $('recovery-code').value = ''; showRecoveryStep(2); } });
});
$('recovery-password').addEventListener('input', () => {
  for (const [key, met] of Object.entries(passwordRequirements($('recovery-password').value))) document.querySelector(`[data-recovery-requirement="${key}"]`).classList.toggle('is-met',met);
});
$('recovery-password-form').addEventListener('submit', event => {
  event.preventDefault(); if (!$('recovery-password-form').reportValidity()) return;
  run(async () => { if (await recovery.finish($('recovery-password').value,$('recovery-confirm').value)) { clearRecoveryInputs(); $('login-password').value = ''; setStage('recovery-success'); } });
});
$('google-sign-in').addEventListener('click', () => run(async () => {
  createAccess($('remember-me').checked);
  const destination = await access.startGoogleSignIn($('remember-me').checked);
  location.assign(destination);
}));
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
$('approval-sms').addEventListener('click', () => run(() => sendApproval()));
function showLoginCode(destination) {
  $('approval-sms').hidden = true;
  $('approval-code-form').hidden = false; $('approval-code').value = '';
  $('approval-code-destination').textContent = `Code sent to ${destination ?? 'your registered mobile number'}.`;
  $('approval-options-note').textContent = 'Enter the latest SMS code to open your account.';
}
async function sendApproval() {
  const data = await access.sendApprovalCode('sms');
  showLoginCode(data.destination);
}
$('approval-code-form').addEventListener('submit', event => {
  event.preventDefault(); if (!$('approval-code-form').reportValidity()) return;
  run(async () => applyState(await access.verifyApprovalCode($('approval-code').value.trim())));
});
$('approval-resend').addEventListener('click', () => run(() => sendApproval()));
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
  const params = new URL(location.href).searchParams;
  const fragment = new URLSearchParams(location.hash.slice(1));
  const code = params.get('code'), flowId = params.get('sb_flow_id');
  const providerError = params.get('error') ?? fragment.get('error');
  const googleIntent = pendingGoogleSignIn(sessionStorage);
  const remember = rememberBrowserSession(localStorage, sessionStorage, googleIntent);
  $('remember-me').checked = remember;
  createAccess(remember);
  // Remove callback codes/errors before further network requests or navigation.
  if (code || providerError || fragment.has('access_token')) history.replaceState(null, '', 'login.html');
  if (fragment.has('access_token')) {
    access.clearGoogleIntent();
    throw new CustomerAccessError('Please choose Continue with Google to start a secure sign-in.');
  }
  if (providerError) {
    access.clearGoogleIntent();
    throw new CustomerAccessError(providerError === 'access_denied'
      ? 'Google sign-in was cancelled. Please try again.' : 'Could not finish Google sign-in. Please try again.');
  }
  if (code) await applyState(await access.finishGoogleSignIn(code, flowId));
  else { access.clearGoogleIntent(); await applyState(await access.restore()); }
} catch (error) { setStage('login', { focus: false }); showError(error); }
