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
  const messages = {
    pending: {
      label: 'Pending approval', title: 'Request received.',
      copy: 'Your email is registered. Our team still needs to add it to the Google Play tester list.',
      note: 'One request per email. You do not need to register again while waiting.',
    },
    already_pending: {
      label: 'Pending approval', title: 'Already registered.',
      copy: 'This email already has a request waiting for our team. No new request was created.',
      note: 'Please wait for your email to be added to the tester list. Submitting it again will not move it ahead.',
    },
    already_added: {
      label: 'Added to tester list', title: 'You are already on the list.',
      copy: 'Our team has marked this email as added in Play Console. You do not need to register again.',
      note: 'Open the Google Play test below using this same account. If access is not available yet, allow time for Google Play to update.',
    },
  };
  function showStatus(status) {
    const message = messages[status];
    success.dataset.state = status;
    document.getElementById('tester-result-label').textContent = message.label;
    document.getElementById('tester-result-title').textContent = message.title;
    document.getElementById('tester-result-copy').textContent = message.copy;
    document.getElementById('tester-result-note').textContent = message.note;
    document.getElementById('tester-wait-step').hidden = status === 'already_added';
    document.getElementById('tester-next-steps').hidden = status === 'already_pending';
    form.hidden = true;
    success.hidden = false;
    success.focus({ preventScroll: true });
    success.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }
  document.getElementById('tester-another-email').addEventListener('click', () => {
    success.hidden = true;
    form.hidden = false;
    form.reset();
    error.hidden = true;
    email.focus({ preventScroll: true });
    section.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  });
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
      if (response.status === 409 && ['already_pending', 'already_added'].includes(result.status)) {
        showStatus(result.status);
        return;
      }
      if (!response.ok || result.accepted !== true) throw new Error(result.error || 'We could not save your request. Please try again.');
      showStatus('pending');
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
