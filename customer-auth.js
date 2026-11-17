export const BACKEND_URL = 'https://hthasqnrljdwbcfjtsbp.supabase.co';
export const PUBLISHABLE_KEY = 'sb_publishable_cgM-8bA4NXIyqSyE8YzP7A_Z5ydNuhl';
export const AUTH_STORAGE_KEY = 'lahuzgo.customer.auth.v1';
export const DEVICE_STORAGE_KEY = 'lahuzgo.customer.browser.v1';
export const REGISTRATION_STORAGE_KEY = 'lahuzgo.customer.registration.v1';
export const RESEND_MS = 300_000;

export class CustomerAccessError extends Error {
  constructor(message, code = 'access_error') { super(message); this.name = 'CustomerAccessError'; this.code = code; }
}
export function normalizePhone(input) {
  const value = String(input ?? '').replace(/[\s()-]/g, '');
  if (/^09\d{9}$/.test(value)) return '+63' + value.slice(1);
  if (/^9\d{9}$/.test(value)) return '+63' + value;
  if (/^\+?639\d{9}$/.test(value)) return value.startsWith('+') ? value : '+' + value;
  return null;
}
export function passwordRequirements(value) {
  return { length: [...value].length >= 8, upper: /[A-Z]/.test(value), lower: /[a-z]/.test(value),
    number: /[0-9]/.test(value), special: /[!@#$%^&*(),.?":{}|<>_+\-=\[\];\/\\`~]/.test(value) };
}
export function validGmail(value) { return /^[a-zA-Z0-9]+(?:\.[a-zA-Z0-9]+)*@gmail\.com$/i.test(value); }
export function accessMessage(error) {
  if (error instanceof CustomerAccessError) return error.message;
  const code = error?.code ?? error?.error;
  if (code === 'invalid_credentials') return 'Incorrect mobile number or password. Please try again.';
  if (code === 'phone_not_confirmed') return 'Please verify your mobile number before signing in.';
  if (['over_sms_send_rate_limit', 'over_request_rate_limit', 'rate_limited'].includes(code) || error?.status === 429)
    return 'Too many attempts. Please wait a few minutes and try again.';
  if (['otp_expired', 'invalid_or_expired'].includes(code)) return 'That code is invalid or expired. Request a new code and use the latest one.';
  if (code === 'send_failed') return 'The code could not be sent right now. Please try again.';
  if (['email_exists', 'phone_exists', 'user_already_exists', '23505'].includes(code))
    return 'That mobile number or Gmail is already linked to an account. Please sign in or use different details.';
  return 'We couldn’t complete that request. Check your connection and try again.';
}
export function isConnectionError(error) {
  return error?.name === 'AbortError' || error instanceof TypeError || error?.name === 'AuthRetryableFetchError'
    || Number(error?.status) >= 500;
}
export function timedFetch(fetcher, timeout = 20_000) {
  return async (input, options = {}) => {
    const controller = new AbortController();
    const relay = () => controller.abort(options.signal?.reason);
    if (options.signal?.aborted) relay(); else options.signal?.addEventListener('abort', relay, { once: true });
    const timer = setTimeout(() => controller.abort(), timeout);
    try { return await fetcher(input, { ...options, signal: controller.signal }); }
    finally { clearTimeout(timer); options.signal?.removeEventListener('abort', relay); }
  };
}
function resultValue(result) { if (result?.error) throw result.error; return result?.data; }
function readJSON(storage, key) { try { return JSON.parse(storage.getItem(key) ?? 'null'); } catch { return null; } }

export class CustomerAccess {
  constructor(client, { deviceStorage, registrationStorage, authStorage, crypto = globalThis.crypto, userAgent = '', now = () => Date.now() }) {
    this.client = client; this.deviceStorage = deviceStorage; this.registrationStorage = registrationStorage;
    this.crypto = crypto; this.userAgent = userAgent; this.now = now; this.authStorage = authStorage;
    this.profile = null; this.user = null; this.alertId = null; this.challenge = null;
    this.registration = readJSON(registrationStorage, REGISTRATION_STORAGE_KEY);
  }
  credentials(create = true) {
    const saved = readJSON(this.deviceStorage, DEVICE_STORAGE_KEY);
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved?.key ?? '')
      && /^[0-9a-f]{64}$/.test(saved?.secret ?? '')) return saved;
    if (!create) return null;
    const bytes = this.crypto.getRandomValues(new Uint8Array(32));
    const value = { key: this.crypto.randomUUID(), secret: [...bytes].map(n => n.toString(16).padStart(2, '0')).join('') };
    try { this.deviceStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify(value)); }
    catch { throw new CustomerAccessError('Please allow browser storage to sign in securely.'); }
    return value;
  }
  async profileFromServer({ cancelDeletion = false } = {}) {
    const auth = resultValue(await this.client.auth.getUser());
    const user = auth?.user;
    if (!user?.id || !user.phone_confirmed_at) throw new CustomerAccessError('Please verify your mobile number and sign in again.', 'access_denied');
    const role = resultValue(await this.client.from('user_roles').select('role').eq('user_id', user.id)
      .eq('role', 'customer').eq('is_active', true).maybeSingle());
    if (!role) throw new CustomerAccessError('This account does not have active customer access.', 'access_denied');
    const profile = resultValue(await this.client.from('profiles')
      .select('id,registration_status,first_name,last_name,phone,contact_email').eq('id', user.id).maybeSingle());
    if (profile?.id !== user.id || profile.registration_status !== 'active')
      throw new CustomerAccessError('Please complete your customer registration first.', 'access_denied');
    if (cancelDeletion) resultValue(await this.client.rpc('cancel_account_deletion'));
    this.user = user; this.profile = profile;
    return profile;
  }
  async signIn(phone, password) {
    const normalized = normalizePhone(phone);
    if (!normalized) throw new CustomerAccessError('Enter a valid Philippine mobile number.');
    if (!password) throw new CustomerAccessError('Enter your password.');
    this.credentials();
    this.registration = null;
    try { this.registrationStorage.removeItem(REGISTRATION_STORAGE_KEY); } catch { /* Registration intent is never an authorization grant. */ }
    this.alertId = null;
    try {
      const auth = resultValue(await this.client.auth.signInWithPassword({ phone: normalized, password }));
      if (!auth?.session) throw new CustomerAccessError('Could not sign in. Please try again.');
      await this.profileFromServer({ cancelDeletion: true });
      return await this.registerDevice();
    } catch (error) { await this.clearSession(); throw error; }
  }
  async registerDevice() {
    const credential = this.credentials();
    const browser = /Edg\//.test(this.userAgent) ? 'Edge' : /CriOS|Chrome\//.test(this.userAgent) ? 'Chrome'
      : /Firefox|FxiOS/.test(this.userAgent) ? 'Firefox' : /Safari\//.test(this.userAgent) ? 'Safari' : 'Browser';
    const device = /iPhone|iPad/.test(this.userAgent) ? 'iPhone / iPad' : /Android/.test(this.userAgent) ? 'Android' : 'computer';
    this.alertId = resultValue(await this.client.rpc('register_customer_device_login', {
      p_installation_key: credential.key, p_installation_secret: credential.secret,
      p_device_label: `${browser} on ${device}`, p_platform: 'web', p_os_version: null,
      p_login_location: null, p_device_fingerprint: null,
    }));
    if (typeof this.alertId !== 'string' || !this.alertId) throw new CustomerAccessError('Could not verify this browser. Please try again.');
    return this.checkApproval();
  }
  async checkApproval() {
    if (!this.alertId || !this.user?.id) throw new CustomerAccessError('Please sign in again.', 'access_denied');
    const alert = resultValue(await this.client.from('customer_login_alerts')
      .select('id,status,approval_required').eq('id', this.alertId).eq('user_id', this.user.id)
      .eq('actor_installation_key', this.credentials().key).maybeSingle());
    if (alert?.status === 'trusted') {
      await this.profileFromServer(); await this.touchDevice();
      return { state: 'ready', profile: this.profile };
    }
    if (alert?.status === 'pending' && typeof alert.approval_required === 'boolean') return { state: 'approval' };
    await this.clearSession();
    throw new CustomerAccessError('This sign-in was cancelled or declined. Please sign in again.', 'access_denied');
  }
  async touchDevice() {
    const credential = this.credentials(false);
    if (!credential) throw new CustomerAccessError('Please sign in on this browser again.', 'access_denied');
    const touched = resultValue(await this.client.rpc('touch_current_customer_device_installation', {
      p_installation_key: credential.key, p_device_fingerprint: null,
    }));
    if (touched !== true) throw new CustomerAccessError('This browser is no longer approved. Please sign in again.', 'access_denied');
  }
  async restore() {
    const session = resultValue(await this.client.auth.getSession())?.session;
    if (!session) return { state: 'login' };
    try {
      if (this.registration?.phone) {
        await this.ensureClaimable(this.registration.phone);
        return { state: 'register-details', phone: this.registration.phone };
      }
      await this.profileFromServer();
      const credential = this.credentials(false);
      if (!credential) throw new CustomerAccessError('Please sign in on this browser again.', 'access_denied');
      const device = resultValue(await this.client.from('customer_device_installations')
        .select('revoked_at,signed_out_at').eq('user_id', this.user.id).eq('installation_key', credential.key).maybeSingle());
      if (!device || device.revoked_at || device.signed_out_at)
        throw new CustomerAccessError('This browser has been signed out. Please sign in again.', 'access_denied');
      const alert = resultValue(await this.client.from('customer_login_alerts').select('id,status,approval_required')
        .eq('user_id', this.user.id).eq('actor_installation_key', credential.key)
        .order('login_at', { ascending: false }).order('created_at', { ascending: false }).limit(1).maybeSingle());
      this.alertId = alert?.id ?? null;
      return await this.checkApproval();
    } catch (error) {
      if (isConnectionError(error)) return { state: 'retry' };
      await this.clearSession(); throw error;
    }
  }
  async ensureClaimable(phone) {
    const user = resultValue(await this.client.auth.getUser())?.user;
    if (!user?.phone_confirmed_at || normalizePhone(user.phone) !== phone)
      throw new CustomerAccessError('Please verify your mobile number again.', 'access_denied');
    const claimable = resultValue(await this.client.rpc('registration_phone_claimable'));
    if (claimable !== true) {
      await this.clearSession();
      throw new CustomerAccessError('This number is already registered. Please sign in instead.', 'access_denied');
    }
    return user;
  }
  async sendRegistrationCode(phone, { resend = false } = {}) {
    const normalized = normalizePhone(phone);
    if (!normalized) throw new CustomerAccessError('Enter a valid Philippine mobile number.');
    if (resend && this.registration?.phone === normalized && this.now() < this.registration.resendAt)
      throw new CustomerAccessError('Please wait before requesting another code.');
    this.credentials();
    resultValue(await this.client.auth.signInWithOtp({ phone: normalized, options: { shouldCreateUser: true } }));
    this.registration = { phone: normalized, resendAt: this.now() + RESEND_MS };
    this.registrationStorage.setItem(REGISTRATION_STORAGE_KEY, JSON.stringify(this.registration));
    return this.registration;
  }
  async verifyRegistrationCode(code) {
    const phone = this.registration?.phone;
    if (!phone || !/^\d{6}$/.test(code)) throw new CustomerAccessError('Enter the latest 6-digit verification code.');
    const response = resultValue(await this.client.auth.verifyOtp({ phone, token: code, type: 'sms' }));
    if (!response?.session) throw new CustomerAccessError('Could not verify your mobile number. Please try again.');
    await this.ensureClaimable(phone);
    return { state: 'register-details', phone };
  }
  async gmailAvailable(email) {
    if (!validGmail(email)) return false;
    const available = resultValue(await this.client.rpc('registration_gmail_available', { p_email: email.trim().toLowerCase() }));
    if (typeof available !== 'boolean') throw new CustomerAccessError('Could not check this Gmail. Please try again.');
    return available;
  }
  async completeRegistration({ first, last, gmail, password, confirmation, terms }) {
    if (!terms) throw new CustomerAccessError('Please agree to the Terms & Conditions before creating your account.');
    if (!first.trim() || !last.trim() || first.trim().length > 80 || last.trim().length > 80)
      throw new CustomerAccessError('Enter your first and last name.');
    const email = gmail.trim().toLowerCase();
    if (!validGmail(email)) throw new CustomerAccessError('Enter a valid Gmail address.');
    if (!Object.values(passwordRequirements(password)).every(Boolean))
      throw new CustomerAccessError('Your password must meet all five requirements below.');
    if (password !== confirmation) throw new CustomerAccessError('Your passwords do not match.');
    const phone = this.registration?.phone;
    if (!phone) throw new CustomerAccessError('Please verify your mobile number again.');
    await this.ensureClaimable(phone);
    if (!await this.gmailAvailable(email)) throw new CustomerAccessError('This Gmail is already linked to another account. Please use a different Gmail.');
    resultValue(await this.client.auth.updateUser({ email, password, data: {
      first_name: first.trim(), last_name: last.trim(), contact_email: email, registration_complete: true,
    } }));
    this.registration = null;
    try { this.registrationStorage.removeItem(REGISTRATION_STORAGE_KEY); } catch { /* No passwords are stored here. */ }
    await this.profileFromServer({ cancelDeletion: true });
    return this.registerDevice();
  }
  async verificationAction(body) {
    const response = await this.client.functions.invoke('customer-device-auth', { body: {
      ...body, alert_id: this.alertId, installation_key: this.credentials().key,
    } });
    if (response.error) {
      let details;
      try { details = await response.error.context?.json(); } catch { /* Only known error codes are shown. */ }
      throw new CustomerAccessError(accessMessage({ error: details?.error, status: response.error.status }));
    }
    const data = response.data;
    if (data?.ok !== true) throw new CustomerAccessError(accessMessage({ error: data?.error }));
    return data;
  }
  async verificationOptions() { return this.verificationAction({ action: 'options' }); }
  async sendApprovalCode(channel) {
    if (!['sms', 'email'].includes(channel)) throw new CustomerAccessError('Choose a verification method.');
    const data = await this.verificationAction({ action: 'start', channel });
    if (typeof data.challenge_id !== 'string' || !data.challenge_id) throw new CustomerAccessError('Could not send a verification code.');
    this.challenge = { id: data.challenge_id, channel, resendAt: this.now() + RESEND_MS };
    return data;
  }
  async verifyApprovalCode(code) {
    if (!this.challenge || !/^\d{6}$/.test(code)) throw new CustomerAccessError('Enter the 6-digit verification code.');
    await this.verificationAction({ action: 'verify', challenge_id: this.challenge.id, code });
    return this.checkApproval();
  }
  async clearSession() {
    try { await this.client.auth.signOut({ scope: 'local' }); } catch { /* Never report a failed login as accepted. */ }
    for (const key of [AUTH_STORAGE_KEY, AUTH_STORAGE_KEY + '-user', AUTH_STORAGE_KEY + '-code-verifier']) {
      try { this.authStorage?.removeItem(key); } catch { /* The browser may have disabled storage. */ }
    }
    this.user = null; this.profile = null; this.alertId = null; this.challenge = null;
  }
  async signOut() {
    try {
      const credential = this.credentials(false);
      if (credential && this.alertId) {
        await this.client.rpc('resolve_customer_login_alert', { p_alert_id: this.alertId, p_status: 'cancelled' });
        await this.client.rpc('mark_current_customer_device_signed_out', { p_installation_key: credential.key });
      }
    } catch { /* Local sign-out must still complete when the connection is lost. */ }
    finally {
      this.registration = null;
      try { this.registrationStorage.removeItem(REGISTRATION_STORAGE_KEY); } catch { /* Local sign-out still completes. */ }
      await this.clearSession();
    }
  }
}
