import { escapeHTML as e } from './customer-data.js';

export function modal(title, content, { wide = false } = {}) {
  const previous = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.className = `portal-dialog${wide ? ' wide' : ''}`;
  dialog.setAttribute('aria-labelledby', `dialog-${crypto.randomUUID()}`);
  const titleId = dialog.getAttribute('aria-labelledby');
  dialog.innerHTML = `<div class="dialog-heading"><h2 id="${titleId}">${e(title)}</h2><button type="button" class="p-icon-button" data-dialog-close aria-label="Close dialog">×</button></div><div class="dialog-body">${content}</div>`;
  document.body.append(dialog);
  dialog.querySelector('[data-dialog-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { dialog.remove(); if (previous?.isConnected) previous.focus({ preventScroll: true }); }, { once: true });
  dialog.showModal();
  return dialog;
}
