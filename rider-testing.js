(() => {
  'use strict';
  const dialog = document.getElementById('rider-modal');
  const open = document.querySelector('[data-rider-signup-open]');
  const section = document.getElementById('rider-signup');
  const form = document.getElementById('rider-signup-form');
  const email = document.getElementById('tester-email');
  const submit = form?.querySelector('button[type="submit"]');
  const error = document.getElementById('tester-error');
  const success = document.getElementById('tester-success');
  let busy = false;
  if (!dialog || !open || !form) return;
  open.addEventListener('click', () => {
    dialog.classList.add('is-signing-up');
    open.hidden = true;
    section.hidden = false;
    email.focus({ preventScroll: true });
    section.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !form.reportValidity()) return;
    busy = true;
    error.hidden = true;
    submit.disabled = true;
    submit.textContent = 'Sending request…';
    form.setAttribute('aria-busy', 'true');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('https://hthasqnrljdwbcfjtsbp.supabase.co/functions/v1/rider-test-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0aGFzcW5ybGpkd2JjZmp0c2JwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0NDQyNTYsImV4cCI6MjEwNDAyMDI1Nn0.7Jjlc52fc_eMF8l3eFwFmrGdfclKWTSJqfJ4Cdpp5fU', Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0aGFzcW5ybGpkd2JjZmp0c2JwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0NDQyNTYsImV4cCI6MjEwNDAyMDI1Nn0.7Jjlc52fc_eMF8l3eFwFmrGdfclKWTSJqfJ4Cdpp5fU' },
        body: JSON.stringify({
          email: email.value.trim(),
          consent: document.getElementById('tester-consent').checked,
          website: document.getElementById('tester-website').value,
        }),
        signal: controller.signal,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.accepted !== true) throw new Error(result.error || 'We could not save your request. Please try again.');
      form.hidden = true;
      success.hidden = false;
      success.focus({ preventScroll: true });
      success.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    } catch (cause) {
      error.textContent = cause.name === 'AbortError' || cause instanceof TypeError
        ? 'Connection interrupted. Please try again. Sending the same email again will not create a duplicate request.'
        : cause.message;
      error.hidden = false;
    } finally {
      clearTimeout(timeout);
      busy = false;
      submit.disabled = false;
      submit.textContent = 'Request test access';
      form.removeAttribute('aria-busy');
    }
  });
})();
