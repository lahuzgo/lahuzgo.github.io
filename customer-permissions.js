import { modal } from './customer-dialog.js';
import { escapeHTML as e } from './customer-data.js';

export function notificationSupport(env = globalThis) {
  if (!env.isSecureContext) return 'insecure';
  const ios = /iPad|iPhone|iPod/.test(env.navigator?.userAgent || '') || (env.navigator?.platform === 'MacIntel' && env.navigator?.maxTouchPoints > 1);
  const standalone = env.navigator?.standalone || env.matchMedia?.('(display-mode: standalone)').matches;
  if (ios && !standalone) return 'home-screen';
  return env.Notification && env.navigator?.serviceWorker ? 'supported' : 'unsupported';
}

export async function permissionState(kind, env = globalThis) {
  if (!env.isSecureContext) return 'insecure';
  if (kind === 'notifications') {
    const support = notificationSupport(env);
    return support === 'supported' ? env.Notification.permission : support;
  }
  if (kind === 'camera' && !env.navigator?.mediaDevices?.getUserMedia) return 'native';
  if (kind === 'geolocation' && !env.navigator?.geolocation) return 'unsupported';
  try { return (await env.navigator.permissions.query({ name: kind })).state; }
  catch { return 'prompt'; } // Safari does not expose every permission through query().
}

const settings = 'Open this website’s permissions in your browser’s site settings and allow access. If it is still blocked, check your phone’s app permissions in Settings, then return here and try again.';
export function locationError(error) {
  if (error?.code === 1) return { title: 'Allow location access', message: `${settings} You can also search or pin your pickup on the map.` };
  return { title: 'Check your Location Services', message: 'Turn on Location Services (GPS) in your phone’s Settings, check your connection and try again. You can also search or pin the location on the map.' };
}
export function cameraError(error) {
  if (['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(error?.name)) return { title: 'Allow camera access', message: settings };
  if (['NotFoundError', 'DevicesNotFoundError'].includes(error?.name)) return { title: 'No camera found', message: 'This device does not have an available camera. You can attach an existing photo using the paperclip in Chat.' };
  return { title: 'Camera unavailable', message: 'Close any other app using your camera, check your phone’s camera permissions and try again. You can also attach an existing photo in Chat.' };
}

export function permissionHelp(title, message) {
  const dialog = modal(title, `<p class="permission-copy">${e(message)}</p><div class="dialog-actions"><button type="button" class="p-button primary" data-done>Got it</button></div>`);
  dialog.querySelector('[data-done]').addEventListener('click', () => dialog.close());
  return dialog;
}

// operation() runs directly in the click handler, preserving the browser's user gesture.
function requestFromButton(title, text, label, operation) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const dialog = modal(title, `<p class="permission-copy">${e(text)}</p><p class="p-note">Your browser may show a permission request. You stay in control of access.</p><p class="permission-progress p-muted" role="status" hidden></p><div class="dialog-actions"><button type="button" class="p-button secondary" data-not-now>Not now</button><button type="button" class="p-button primary" data-allow>${e(label)}</button></div>`);
    dialog.querySelector('[data-not-now]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => { if (!settled) { settled = true; resolve(null); } }, { once: true });
    dialog.querySelector('[data-allow]').addEventListener('click', () => {
      const button = dialog.querySelector('[data-allow]'); button.disabled = true;
      const progress = dialog.querySelector('.permission-progress'); progress.hidden = false; progress.textContent = 'Check your browser’s permission request…';
      let task;
      try { task = operation(); } catch (error) { task = Promise.reject(error); }
      Promise.resolve(task).then(value => { if (!settled) { settled = true; dialog.close(); resolve(value); } }, error => { if (!settled) { settled = true; dialog.close(); reject(error); } });
    });
  });
}

export async function requestLocation(env = globalThis) {
  if (!env.isSecureContext || !env.navigator?.geolocation) {
    const text = 'Current location needs HTTPS or localhost and a browser with location access. You can search or pin on the map instead.';
    permissionHelp('Current location unavailable', text); throw new Error(text);
  }
  try {
    const position = await requestFromButton('Use your current location?', 'Allow LahuzGo to find your pickup. Turn on your phone’s Location Services (GPS) for an accurate pin. Your location is requested only when you use this feature.', 'Continue', () => new Promise((resolve, reject) => {
      env.navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 18_000, maximumAge: 15_000 });
    }));
    if (!position) throw new Error('Location request cancelled. You can search or pin on the map.');
    return { latitude: position.coords.latitude, longitude: position.coords.longitude, address: 'Your current location' };
  } catch (error) {
    if (error?.code) { const help = locationError(error); permissionHelp(help.title, help.message); throw new Error(help.message); }
    throw error;
  }
}

export function stopCamera(stream) { stream?.getTracks().forEach(track => track.stop()); }
export async function cameraStream(env = globalThis) {
  return env.navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1600 }, height: { ideal: 1200 } }, audio: false });
}

export function takePhoto({ nativeCapture, signal, env = globalThis } = {}) {
  if (signal?.aborted) return Promise.resolve(null);
  if (!env.isSecureContext) {
    permissionHelp('Secure connection needed', 'Open LahuzGo using HTTPS or localhost to allow camera access.'); return Promise.resolve(null);
  }
  if (!env.navigator?.mediaDevices?.getUserMedia) {
    return requestFromButton('Take a photo', 'Your phone will open its camera. Allow camera access if your phone asks. You can review the photo before sending it.', 'Open phone camera', () => { nativeCapture?.(); return null; });
  }
  return new Promise(resolve => {
    let stream, closed = false, result = null;
    const dialog = modal('Take a photo', `<div class="camera-explanation"><p class="permission-copy">Use your camera to share a pickup point or extra details with your rider. Your microphone stays off.</p><p class="p-note">Allow camera access when your browser asks. Nothing is sent until you review and send the photo.</p></div><div class="camera-live" hidden><video autoplay muted playsinline aria-label="Camera preview"></video></div><p class="camera-message p-muted" role="status"></p><div class="dialog-actions camera-actions"><button type="button" class="p-button secondary" data-cancel-camera>Cancel</button><button type="button" class="p-button primary" data-enable-camera>Allow camera</button><button type="button" class="p-button primary" data-shutter hidden disabled>Take photo</button></div>`);
    const video = dialog.querySelector('video'), enable = dialog.querySelector('[data-enable-camera]'), shutter = dialog.querySelector('[data-shutter]'), message = dialog.querySelector('.camera-message');
    const close = () => dialog.close();
    const hide = () => { if (document.hidden) close(); };
    const cleanup = () => {
      closed = true; stopCamera(stream); video.srcObject = null;
      signal?.removeEventListener('abort', close); window.removeEventListener('pagehide', close); document.removeEventListener('visibilitychange', hide);
      resolve(result);
    };
    dialog.addEventListener('close', cleanup, { once: true });
    signal?.addEventListener('abort', close, { once: true }); window.addEventListener('pagehide', close, { once: true }); document.addEventListener('visibilitychange', hide);
    dialog.querySelector('[data-cancel-camera]').addEventListener('click', close);
    video.addEventListener('loadeddata', () => { shutter.disabled = !(video.videoWidth && video.videoHeight); message.textContent = 'Check the photo, then tap Take photo.'; });
    enable.addEventListener('click', () => {
      enable.disabled = true; message.textContent = 'Allow camera access in your browser’s request…';
      cameraStream(env).then(async opened => {
        if (closed || signal?.aborted) { stopCamera(opened); return; }
        stream = opened; video.srcObject = opened;
        dialog.querySelector('.camera-explanation').hidden = true; dialog.querySelector('.camera-live').hidden = false; enable.hidden = true; shutter.hidden = false;
        try { await video.play(); if (!closed) shutter.disabled = !(video.videoWidth && video.videoHeight); }
        catch { if (!closed) { close(); permissionHelp('Camera preview unavailable', 'Close any other app using the camera and try again. You can also attach an existing photo.'); } }
      }, error => { if (!closed) { close(); const help = cameraError(error); permissionHelp(help.title, help.message); } });
    });
    shutter.addEventListener('click', () => {
      if (!video.videoWidth || !video.videoHeight || closed) return;
      shutter.disabled = true;
      const scale = Math.min(1, 1920 / Math.max(video.videoWidth, video.videoHeight));
      const canvas = document.createElement('canvas'); canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
      const context = canvas.getContext('2d');
      if (!context) { shutter.disabled = false; message.textContent = 'Could not capture this photo. Please try again.'; return; }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => {
        if (closed) return;
        if (!blob) { shutter.disabled = false; message.textContent = 'Could not capture this photo. Please try again.'; return; }
        result = new File([blob], `lahuzgo-photo-${Date.now()}.jpg`, { type: 'image/jpeg' }); close();
      }, 'image/jpeg', 0.88);
    });
  });
}

export function requestNotificationAccess(env = globalThis) {
  // Keep this call synchronous with an explicit button click. Never call on login.
  return env.Notification.requestPermission();
}

export async function notificationWorker(env = globalThis) {
  const registration = await env.navigator.serviceWorker.register(new URL('./customer-notifications-sw.js', import.meta.url), { scope: new URL('./', import.meta.url).pathname });
  if (registration.active) return registration;
  await new Promise((resolve, reject) => {
    const worker = registration.installing || registration.waiting;
    if (!worker) { reject(new Error('Notifications could not start. Please try again.')); return; }
    const finish = () => { clearTimeout(timer); worker.removeEventListener('statechange', changed); };
    const changed = () => { if (worker.state === 'activated') { finish(); resolve(); } else if (worker.state === 'redundant') { finish(); reject(new Error('Notifications could not start. Please try again.')); } };
    const timer = setTimeout(() => { finish(); reject(new Error('Notifications are taking longer to start. Please try again.')); }, 10_000);
    worker.addEventListener('statechange', changed); changed();
  });
  return registration;
}

export async function enableNotifications(env = globalThis) {
  const support = notificationSupport(env);
  if (support !== 'supported') {
    permissionHelp(support === 'home-screen' ? 'Add LahuzGo to your Home Screen' : 'Browser notifications unavailable', support === 'home-screen'
      ? 'On iPhone or iPad (iOS 16.4 or later), open LahuzGo in Safari, tap Share, then Add to Home Screen. Open it from the Home Screen and enable notifications there. Your updates are always available in Chat.'
      : 'Use a supported browser over HTTPS or localhost. Your booking updates and messages remain available in Chat.');
    return false;
  }
  if (env.Notification.permission === 'denied') { permissionHelp('Allow notifications in Settings', settings + ' Choose Notifications for this website.'); return false; }
  try {
    const permission = env.Notification.permission === 'granted' ? 'granted' : await requestFromButton('Keep up with your booking', 'Allow device notifications for new messages and booking updates while LahuzGo is open in your browser. Message text and location details are not shown in these alerts.', 'Enable notifications', () => requestNotificationAccess(env));
    if (permission !== 'granted') {
      if (permission === 'denied') permissionHelp('Notifications are blocked', settings);
      return false;
    }
    await notificationWorker(env); return true;
  } catch { permissionHelp('Notifications could not start', 'Check your connection and try again. Your booking updates and messages are still available in Chat.'); return false; }
}

export async function showBookingNotification(env = globalThis) {
  if (notificationSupport(env) !== 'supported' || env.Notification.permission !== 'granted') return;
  const registration = await notificationWorker(env);
  return registration.showNotification('LahuzGo update', { body: 'You have a new message or booking update. Open LahuzGo to view it.', icon: new URL('./assets/lahuzgo-launcher-icon.png', import.meta.url).href, tag: 'lahuzgo-customer-update', data: { url: new URL('./login.html', import.meta.url).href } });
}

export function hasNewUpdate(previous, next) {
  if (!previous) return false; // Initial history is not a new device alert.
  const before = new Map(previous.map(row => [row.id, row]));
  return next.some(row => {
    const old = before.get(row.id); if (!old) return Number(row.customer_unread_count) > 0;
    return Number(row.customer_unread_count) > Number(old.customer_unread_count || 0) ||
      ['status', 'request_outcome', 'rider_assignment_status', 'picked_up_at', 'on_the_way_at', 'delivered_at', 'delivery_proof_submitted_at'].some(key => (old[key] ?? null) !== (row[key] ?? null));
  });
}
