import { SERVICE_NAMES, escapeHTML as e, pesos, deliveryFee, buildDeliveryPayload, portalError, validPin } from './customer-data.js';
import { modal, pinPicker, pinName, MAPBOX_TOKEN, roadRoute } from './customer-map.js';

export class BookingWizard {
  constructor({ service, data, addresses, controls, onBooked }) {
    this.data = data; this.addresses = addresses; this.controls = controls; this.onBooked = onBooked;
    this.draft = { service, pickups: [null], destination: null, instructions: '', recipientMode: 'self', recipient: {}, confirmed: false };
    this.step = 0; this.busy = false; this.cents = null; this.route = null; this.quote = null; this.settings = null; this.requestId = null; this.payload = null;
    this.dialog = modal(`${SERVICE_NAMES[service]} booking`, '<div class="booking-wizard"></div>', { wide: true });
    this.root = this.dialog.querySelector('.booking-wizard');
    this.dialog.addEventListener('cancel', event => { if (this.busy) event.preventDefault(); });
    this.dialog.querySelector('[data-dialog-close]').addEventListener('click', event => { if (this.busy) event.stopImmediatePropagation(); }, { capture: true });
    this.render();
  }
  get angkas() { return this.draft.service === 'angkas'; }
  get finalStep() { return this.angkas ? 2 : 3; }
  render() {
    const names = this.angkas ? ['Your route', 'Instructions', 'Review & book'] : ['Locations', 'Contacts', 'Item details', 'Review & book'];
    this.root.innerHTML = `<ol class="booking-steps" aria-label="Booking progress">${names.map((name, i) => `<li class="${i <= this.step ? 'reached' : ''}" ${i === this.step ? 'aria-current="step"' : ''}><span>${i + 1}</span><small>${e(name)}</small></li>`).join('')}</ol><form class="booking-form"><div class="step-intro"><p class="p-eyebrow">STEP ${this.step + 1} OF ${names.length}</p><h3>${this.step === 0 ? this.angkas ? 'Where are you going?' : 'Where should we go?' : this.step === this.finalStep ? 'Everything look right?' : this.step === 1 ? this.angkas ? 'A note for your rider.' : 'Who should we look for?' : 'What are we picking up?'}</h3><p>${this.step === 0 ? this.angkas ? 'Pin where you’ll meet your rider and where you want to go.' : 'Choose your pickup stops in order, then your destination.' : this.step === this.finalStep ? 'Check the fare, your route and details before you submit.' : this.angkas ? 'Share a landmark or what you’re wearing. This is optional.' : 'A few details help your rider find the right person and items.'}</p></div><div class="wizard-fields">${this.fields()}</div><p class="wizard-error p-error" role="alert" hidden></p><div class="wizard-footer"><button type="button" class="p-button secondary" data-back ${this.step === 0 || this.payload ? 'disabled' : ''}>Back</button><button type="submit" class="p-button primary" ${this.busy ? 'disabled' : ''}>${this.step === this.finalStep ? this.payload ? 'Retry submission' : `Submit ${this.angkas ? 'ride' : 'request'}` : 'Continue'}<span aria-hidden="true">↗</span></button></div></form>`;
    this.root.querySelector('form').addEventListener('submit', event => { event.preventDefault(); this.next(); });
    this.root.querySelector('[data-back]').addEventListener('click', () => { this.capture(); this.step--; this.render(); });
    this.root.querySelectorAll('[data-pickup]').forEach(button => button.addEventListener('click', () => this.choosePin(Number(button.dataset.pickup))));
    this.root.querySelector('[data-destination]')?.addEventListener('click', () => this.choosePin(-1));
    this.root.querySelector('[data-add-stop]')?.addEventListener('click', () => { this.draft.pickups.push(null); this.clearQuote(); this.render(); });
    this.root.querySelectorAll('[data-remove-stop]').forEach(button => button.addEventListener('click', () => { this.draft.pickups.splice(Number(button.dataset.removeStop), 1); this.clearQuote(); this.render(); }));
    this.root.querySelectorAll('input[name="recipientMode"]').forEach(input => input.addEventListener('change', () => { this.capture(); this.render(); }));
    this.root.querySelector('[data-refresh-fare]')?.addEventListener('click', () => this.loadFare());
    this.root.querySelector('h3')?.setAttribute('tabindex', '-1');
  }
  clearQuote() { this.quote = null; this.route = null; this.cents = null; }
  locationCard(pin, index) {
    const destination = index < 0;
    return `<div class="location-choice"><span class="location-dot ${destination ? 'red' : ''}">${destination ? 'D' : index + 1}</span><button type="button" ${destination ? 'data-destination' : `data-pickup="${index}"`}><strong>${destination ? 'Destination' : this.angkas ? 'Pickup location' : `Pickup ${index + 1}`}</strong><span>${e(pin ? pinName(pin) : 'Tap to choose this location')}</span></button>${!destination && index > 0 ? `<button class="p-icon-button" type="button" data-remove-stop="${index}" aria-label="Remove pickup ${index + 1}">×</button>` : '<span aria-hidden="true">↗</span>'}</div>`;
  }
  fields() {
    const d = this.draft;
    if (this.step === 0) return `${d.pickups.map((pin, i) => this.locationCard(pin, i)).join('')}${!this.angkas && d.pickups.length < 5 ? '<button type="button" class="p-link add-stop" data-add-stop>＋ Add another pickup</button>' : ''}<div class="location-connector" aria-hidden="true"></div>${this.locationCard(d.destination, -1)}<p class="p-note">${this.angkas ? 'Use your current location for pickup, or choose an exact pin. Search or pin your destination.' : 'You can use a saved address, your current location, or pin an exact entrance on the map.'}</p>`;
    if (this.angkas && this.step === 1) return `<label class="p-field">Instructions for your rider <span class="optional">Optional</span><textarea name="instructions" rows="4" maxlength="1000" placeholder="e.g. I’m by the main gate, wearing a white shirt.">${e(d.instructions)}</textarea></label><p class="p-note">Keep your instructions short and easy to spot at pickup.</p>`;
    if (!this.angkas && this.step === 1) return `${d.pickups.map((stop, i) => `<fieldset class="pickup-fields"><legend>Pickup ${i + 1} <span>${e(pinName(stop))}</span></legend><label class="p-field">Landmark / store name<input name="landmark-${i}" value="${e(stop.landmark)}" maxlength="1000" placeholder="e.g. Main entrance, beside the pharmacy" required></label><div class="p-field-grid"><label class="p-field">Contact name<input name="name-${i}" value="${e(stop.name)}" maxlength="1000" required autocomplete="off"></label><label class="p-field">Mobile number <span class="optional">Optional</span><input type="tel" name="phone-${i}" value="${e(stop.phone)}" maxlength="24" inputmode="tel" placeholder="09XX XXX XXXX"></label></div></fieldset>`).join('')}<fieldset class="pickup-fields"><legend>Who will receive the ${d.service === 'pabili' ? 'purchase' : 'delivery'}?</legend><div class="recipient-options"><label><input type="radio" name="recipientMode" value="self" ${d.recipientMode === 'self' ? 'checked' : ''}> Myself</label><label><input type="radio" name="recipientMode" value="other" ${d.recipientMode === 'other' ? 'checked' : ''}> Someone else</label></div>${d.recipientMode === 'other' ? `<div class="p-field-grid"><label class="p-field">Recipient name<input name="recipientName" value="${e(d.recipient.name)}" maxlength="1000" required></label><label class="p-field">Recipient mobile number<input type="tel" name="recipientPhone" value="${e(d.recipient.phone)}" maxlength="24" required inputmode="tel"></label></div>` : ''}</fieldset>`;
    if (!this.angkas && this.step === 2) return `${d.pickups.map((stop, i) => `<fieldset class="pickup-fields"><legend>Pickup ${i + 1} <span>${e(pinName(stop))}</span></legend><label class="p-field">${d.service === 'pabili' ? 'Shopping list & quantities' : 'Items & quantities'}<textarea name="items-${i}" maxlength="1000" rows="3" placeholder="${d.service === 'pabili' ? 'e.g. 2 kg rice, 1 carton fresh milk' : 'e.g. One sealed parcel, approximately 1 kg'}" required>${e(stop.items)}</textarea></label><label class="p-field">Instructions <span class="optional">Optional</span><textarea name="notes-${i}" maxlength="1000" rows="2" placeholder="Anything else your rider should know?">${e(stop.notes)}</textarea></label></fieldset>`).join('')}<label class="p-check"><input type="checkbox" name="confirmed" ${d.confirmed ? 'checked' : ''} required><span>${d.service === 'pabili' ? 'I understand my rider will buy these items for me. The item cost is separate from the delivery fee.' : 'I confirm these items have already been paid for and are ready for pickup.'}</span></label>`;
    return `<div class="fare-review"><div><span>${this.angkas ? 'TRIP FARE' : 'DELIVERY FEE'}</span><strong>${pesos(this.cents)}</strong></div><p>${this.route ? `${(this.route.meters / 1000).toFixed(1)} km · About ${Math.max(1, Math.ceil(this.route.seconds / 60))} min travel time` : 'Confirming your fare…'}</p><button class="p-link" type="button" data-refresh-fare ${this.busy || this.payload ? 'disabled' : ''}>Refresh fare</button></div><div class="review-route">${d.pickups.map((stop, i) => `<div><span class="location-dot">${i + 1}</span><p><small>${this.angkas ? 'PICKUP' : `PICKUP ${i + 1}`}</small><strong>${e(pinName(stop))}</strong>${!this.angkas ? `<span>${e(stop.landmark)} · ${e(stop.name)}${stop.phone ? ' · ' + e(stop.phone) : ''}</span><span>${e(stop.items)}${stop.notes ? ' — ' + e(stop.notes) : ''}</span>` : ''}</p></div>`).join('')}<div><span class="location-dot red">D</span><p><small>DESTINATION</small><strong>${e(pinName(d.destination))}</strong>${!this.angkas ? `<span>Recipient: ${d.recipientMode === 'other' ? e(d.recipient.name) + ' · ' + e(d.recipient.phone) : 'You'}</span>` : ''}</p></div></div>${this.angkas && d.instructions ? `<div class="review-note"><small>INSTRUCTIONS FOR YOUR RIDER</small><p>${e(d.instructions)}</p></div>` : ''}<p class="p-note">${this.angkas ? 'Your request will be sent to available riders. We’ll update you when a rider accepts.' : 'The delivery fee excludes item costs. Your rider and updates will appear in Chat.'}</p>`;
  }
  capture() {
    const values = new FormData(this.root.querySelector('form')), d = this.draft;
    if (this.angkas && this.step === 1) d.instructions = String(values.get('instructions') ?? '').trim();
    if (!this.angkas && this.step === 1) {
      d.pickups.forEach((stop, i) => { for (const field of ['landmark', 'name', 'phone']) stop[field] = String(values.get(`${field}-${i}`) ?? '').trim(); });
      d.recipientMode = values.get('recipientMode') || d.recipientMode;
      if (values.has('recipientName')) d.recipient = { name: String(values.get('recipientName')), phone: String(values.get('recipientPhone')) };
    }
    if (!this.angkas && this.step === 2) {
      d.pickups.forEach((stop, i) => { for (const field of ['items', 'notes']) stop[field] = String(values.get(`${field}-${i}`) ?? '').trim(); }); d.confirmed = values.get('confirmed') === 'on';
    }
  }
  error(message) { const box = this.root.querySelector('.wizard-error'); box.hidden = false; box.textContent = message; }
  async choosePin(index) {
    if (this.busy) return;
    const initial = index < 0 ? this.draft.destination : this.draft.pickups[index];
    const allowCurrent = index >= 0 || !this.angkas;
    let pin;
    if (allowCurrent) {
      const options = modal(index < 0 ? 'Choose destination' : 'Choose pickup location', `<p class="p-muted">Use a saved place or choose an exact pin.</p><div class="location-options">${allowCurrent ? '<button type="button" class="location-option" data-method="current"><span>◎</span><p><strong>Use current location</strong><small>Check where you are on the map</small></p><b>↗</b></button>' : ''}<button type="button" class="location-option" data-method="map"><span>⌖</span><p><strong>Search or pin on map</strong><small>Find the right entrance or meeting point</small></p><b>↗</b></button>${this.addresses.map((address, i) => `<button type="button" class="location-option" data-saved="${i}"><span>⌂</span><p><strong>${e(address.label)}</strong><small>${e(address.address)}</small></p><b>↗</b></button>`).join('')}</div>`);
      const choice = await new Promise(resolve => { let selected = null; options.addEventListener('click', event => { const target = event.target.closest('[data-method],[data-saved]'); if (!target) return; selected = target.dataset; options.close(); }); options.addEventListener('close', () => resolve(selected), { once: true }); });
      if (!choice || !this.dialog.isConnected) return;
      if (choice.saved !== undefined) { const saved = this.addresses[Number(choice.saved)]; pin = await pinPicker({ title: 'Check saved location', initial: saved, allowCurrent, controls: this.controls, demo: this.data.demo }); }
      else pin = await pinPicker({ title: index < 0 ? 'Pin your destination' : 'Pin your pickup', initial, allowCurrent, controls: this.controls, demo: this.data.demo, requestCurrent: choice.method === 'current' });
    } else pin = await pinPicker({ title: 'Pin your destination', initial, allowCurrent: false, controls: this.controls, demo: this.data.demo });
    if (!pin || !this.dialog.isConnected) return;
    if (index < 0) this.draft.destination = pin;
    else this.draft.pickups[index] = { landmark: '', name: '', phone: '', items: '', notes: '', ...initial, ...pin };
    this.clearQuote(); this.render();
  }
  async next() {
    if (this.busy) return;
    this.capture();
    if (this.step === 0 && (this.draft.pickups.some(p => !validPin(p)) || !validPin(this.draft.destination))) { this.error('Choose a pin for every pickup and your destination.'); return; }
    if (this.step < this.finalStep) {
      this.step++; this.render(); this.root.querySelector('h3').focus({ preventScroll: true });
      if (this.step === this.finalStep) await this.loadFare();
    } else await this.submit();
  }
  async loadFare() {
    if (this.busy || this.payload) return false;
    this.busy = true; this.render();
    try {
      const d = this.draft;
      if (this.angkas) {
        const quote = await this.data.quote(d.pickups[0], d.destination, MAPBOX_TOKEN);
        if (!quote?.id || !Number.isInteger(quote.fare_cents) || quote.fare_cents < 0 || !(Date.parse(quote.expires_at) > Date.now() + 10_000) || !(quote.route_meters > 0) || !(quote.route_seconds > 0)) throw new Error('The fare could not be confirmed. Please refresh it.');
        this.quote = quote; this.cents = quote.fare_cents; this.route = { meters: quote.route_meters, seconds: quote.route_seconds };
      } else {
        this.route = this.data.demo ? { meters: 2400, seconds: 480 } : await roadRoute([...d.pickups, d.destination]);
        this.settings = await this.data.fees(); this.cents = deliveryFee(this.route.meters, d.pickups.length, this.settings);
      }
      return true;
    } catch (error) { this.cents = null; this.fareError = portalError(error); return false; }
    finally { this.busy = false; if (this.dialog.isConnected) { this.render(); if (this.cents == null) this.error(this.fareError); } }
  }
  async submit() {
    if (!this.payload && this.cents == null) { this.error('Refresh and confirm the fare before submitting.'); return; }
    if (!this.payload) {
      const reviewedFare = this.cents;
      if (this.angkas && Date.parse(this.quote.expires_at) <= Date.now() + 10_000) {
        if (!await this.loadFare()) return;
        if (reviewedFare !== this.cents) { this.error('The fare changed. Review the updated amount, then submit again.'); return; }
      } else if (!this.angkas) {
        this.busy = true; this.render();
        try {
          const settings = await this.data.fees(), nextFare = deliveryFee(this.route.meters, this.draft.pickups.length, settings);
          if (JSON.stringify(settings) !== JSON.stringify(this.settings) || nextFare !== reviewedFare) {
            this.settings = settings; this.cents = nextFare; this.busy = false; this.render(); this.error('Pricing changed. Review the updated fee, then submit again.'); return;
          }
        } catch (error) { this.busy = false; this.render(); this.error(portalError(error)); return; }
        this.busy = false;
      }
      try { this.payload = this.angkas ? { service: 'angkas', quote_id: this.quote.id, instructions: this.draft.instructions } : buildDeliveryPayload(this.draft, this.cents); }
      catch (error) { this.error(portalError(error)); return; }
      this.requestId ??= crypto.randomUUID();
    }
    this.busy = true; this.render();
    try {
      const id = await this.data.submit(this.requestId, this.payload);
      if (typeof id !== 'string' || !id) throw new Error('Could not confirm your request. Retry using the same booking.');
      this.dialog.close(); await this.onBooked(id);
    } catch (error) {
      if (['22023', '42501', 'SG002', 'SG003', 'SG004'].includes(error.code)) { this.payload = null; this.requestId = null; if (['SG003', 'SG004'].includes(error.code)) this.cents = null; }
      this.busy = false;
      if (this.dialog.isConnected) { this.render(); this.error(portalError(error)); }
    } finally { this.busy = false; }
  }
}
