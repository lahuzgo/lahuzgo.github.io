import { normalizePhone } from './customer-auth.js';

export const SERVICE_NAMES = { angkas: 'Pa-angkas', deliver: 'Padala', pabili: 'Pabili', support: 'Support' };
export const CONVERSATION_COLUMNS = 'id,customer_id,support_id,rider_id,status,service,created_at,request_outcome,delivery_fee_cents,delivery_fee_quoted_at,fee_accepted_at,picked_up_at,on_the_way_at,delivered_at,workflow_version,rider_name,rider_phone,last_message_preview,last_message_at,customer_unread_count,rider_assignment_status,rider_latitude,rider_longitude,rider_location_updated_at,cancellation_status,cancellation_reason,pickup_statuses,rider_last_read_at,delivery_proof_submitted_at,delivery_confirmation_due_at,delivery_review_status';
export const ongoing = row => ['waiting', 'active'].includes(row.status) && row.request_outcome == null;
export const accepted = row => Boolean(row.rider_id) && row.rider_assignment_status === 'accepted';
export const history = row => row.status === 'closed' && ['completed', 'cancelled'].includes(row.request_outcome);
export const pesos = cents => Number.isFinite(cents) ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100) : '—';
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function philippineDay(value) {
  const date = new Date(value); if (!Number.isFinite(+date)) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function searchStage(createdAt, now = Date.now()) {
  const minutes = (now - Date.parse(createdAt)) / 60_000;
  if (minutes >= 20) return { title: 'No rider has accepted yet', message: 'You can keep waiting, or cancel and try again later.', canCancel: true };
  if (minutes >= 10) return { title: 'Still looking for a rider', message: 'We’re still looking for a rider. We’ll update you when someone accepts.', canCancel: false };
  return { title: 'Waiting for a rider', message: 'We’re looking for a rider for your request. We’ll update you when someone accepts.', canCancel: false };
}
export function bookingStatus(row, now = Date.now()) {
  if (row.request_outcome === 'completed') return row.service === 'angkas' ? 'Trip completed' : 'Completed';
  if (row.request_outcome === 'cancelled') return row.cancellation_reason === 'no_rider_accepted_within_2_hours' ? 'Closed — no rider found' : 'Cancelled';
  if (row.status === 'closed') return 'Conversation closed';
  if (row.service === 'support') return row.support_id ? 'Support joined' : 'Waiting for support';
  if (!accepted(row)) return searchStage(row.created_at, now).title;
  if (row.delivery_review_status === 'pending_review') return 'Under review';
  if (row.delivery_proof_submitted_at) return 'Confirm your delivery';
  if (row.on_the_way_at) return row.service === 'angkas' ? 'On the way to your destination' : 'On the way to you';
  if (row.picked_up_at) return row.service === 'angkas' ? 'Passenger on board' : row.service === 'pabili' ? 'Items purchased' : 'Items picked up';
  return row.service === 'angkas' ? 'Your rider is on the way to pickup' : 'Rider assigned';
}
export function deliveryFee(meters, stores, settings) {
  if (!Number.isFinite(meters) || meters <= 0) throw new Error('Confirm a road route before continuing.');
  for (const key of ['base_fee_cents', 'base_distance_meters', 'succeeding_km_fee_cents', 'succeeding_distance_meters', 'additional_store_fee_cents']) {
    if (!Number.isInteger(settings?.[key]) || settings[key] < 0 || settings[key] > 1_000_000) throw new Error('Delivery pricing is unavailable. Please try again.');
  }
  if (settings.base_distance_meters < 100 || settings.succeeding_distance_meters < 100) throw new Error('Delivery pricing is unavailable.');
  const intervals = Math.ceil(Math.max(0, Math.ceil(meters) - settings.base_distance_meters) / settings.succeeding_distance_meters);
  return settings.base_fee_cents + intervals * settings.succeeding_km_fee_cents + Math.max(0, stores - 1) * settings.additional_store_fee_cents;
}
export function validPin(pin) { return Boolean(pin) && Number.isFinite(pin.latitude) && Math.abs(pin.latitude) <= 90 && Number.isFinite(pin.longitude) && Math.abs(pin.longitude) <= 180; }
export function buildDeliveryPayload(draft, cents) {
  if (!['deliver', 'pabili'].includes(draft.service) || !validPin(draft.destination) || !Array.isArray(draft.pickups) || !draft.pickups.length || draft.pickups.length > 5) throw new Error('Choose your pickup and destination pins.');
  const pickups = draft.pickups.map(stop => {
    if (!validPin(stop)) throw new Error('Choose a pin for every pickup.');
    for (const key of ['landmark', 'name', 'items']) if (!String(stop[key] ?? '').trim() || String(stop[key]).trim().length > 1000) throw new Error('Complete the landmark, contact name and item details for every pickup.');
    const phone = String(stop.phone ?? '').trim();
    if (String(stop.notes ?? '').trim().length > 1000) throw new Error('Keep each pickup instruction within 1,000 characters.');
    if (phone && !normalizePhone(phone)) throw new Error('Check the pickup mobile number.');
    return { latitude: stop.latitude, longitude: stop.longitude, landmark: stop.landmark.trim(), name: stop.name.trim(), phone: phone ? normalizePhone(phone) : '', items: stop.items.trim(), quantity: '', notes: String(stop.notes ?? '').trim() };
  });
  if (!Number.isInteger(cents) || cents < 0 || cents > 10_000_000) throw new Error('Confirm the delivery fee first.');
  if (!draft.confirmed) throw new Error(draft.service === 'pabili' ? 'Confirm that your rider will buy the items for you.' : 'Confirm that your items have already been paid for.');
  const payload = { service: draft.service, paid: draft.service === 'deliver', pickups, destination: { latitude: draft.destination.latitude, longitude: draft.destination.longitude }, recipient_mode: draft.recipientMode === 'other' ? 'other' : 'self', estimated_delivery_fee_cents: cents };
  if (draft.service === 'pabili') payload.shopping_confirmed = true;
  if (payload.recipient_mode === 'other') {
    if (!String(draft.recipient?.name ?? '').trim() || !normalizePhone(draft.recipient?.phone)) throw new Error('Enter the recipient’s name and mobile number.');
    payload.recipient = { name: draft.recipient.name.trim(), phone: normalizePhone(draft.recipient.phone) };
  }
  return payload;
}
export function portalError(error) {
  const codes = { SG002: 'You already have 2 ongoing requests. Finish or cancel one before booking.', SG003: 'The fare changed or expired. Refresh it and review the new amount.', SG004: 'Pa-angkas fares are not available yet. Please try again later.', SG005: 'Please wait a little before requesting another fare.', '42501': 'This action is unavailable. Refresh your account and try again.' };
  if (codes[error?.code]) return codes[error.code];
  if (error?.name === 'AbortError' || error instanceof TypeError || Number(error?.status) >= 500) return 'Connection interrupted. Your details are kept. Please try again.';
  return error instanceof Error && !error.code && error.name !== 'FunctionsHttpError' ? error.message : 'Could not complete that request. Refresh and try again.';
}
export function unwrap(result) { if (result?.error) throw result.error; return result?.data; }
export class CustomerPortalData {
  constructor(client, owner) { this.client = client; this.owner = owner; this.demo = client.isDemo === true; }
  async requests() { return unwrap(await this.client.from('conversations').select(CONVERSATION_COLUMNS).eq('customer_id', this.owner).order('created_at', { ascending: false }).limit(100)); }
  async conversation(id) { return unwrap(await this.client.from('conversations').select(CONVERSATION_COLUMNS).eq('customer_id', this.owner).eq('id', id).maybeSingle()); }
  async messages(id, before = null) {
    let query = this.client.from('chat_messages').select('id,conversation_id,sender_id,body,created_at,attachment_path,attachment_mime,attachment_bytes').eq('conversation_id', id).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(60);
    if (before) query = query.lt('created_at', before);
    return unwrap(await query);
  }
  async details(id) { return unwrap(await this.client.from('delivery_requests').select('payload').eq('customer_id', this.owner).eq('id', id).maybeSingle())?.payload; }
  async addresses() { return unwrap(await this.client.from('saved_addresses').select('id,label,address,landmark,latitude,longitude,created_at').eq('user_id', this.owner).order('created_at', { ascending: false })); }
  async saveAddress(row) {
    if (!row.label?.trim() || !row.address?.trim() || !validPin(row)) throw new Error('Add a label, address and map pin.');
    unwrap(await this.client.from('saved_addresses').upsert({ id: row.id, user_id: this.owner, label: row.label.trim(), address: row.address.trim(), landmark: (row.landmark ?? '').trim(), latitude: row.latitude, longitude: row.longitude }));
  }
  async deleteAddress(id) { unwrap(await this.client.from('saved_addresses').delete().eq('id', id).eq('user_id', this.owner)); }
  async fees() { return unwrap(await this.client.from('delivery_fee_settings').select('base_fee_cents,base_distance_meters,succeeding_km_fee_cents,succeeding_distance_meters,additional_store_fee_cents').eq('id', true).single()); }
  async mapControls() { return unwrap(await this.client.from('app_map_controls').select('place_search_enabled,address_lookup_enabled,route_preview_enabled').eq('target_app', 'customer').maybeSingle()); }
  async notice() { return unwrap(await this.client.from('app_service_notice').select('customer_notice').eq('singleton', true).maybeSingle())?.customer_notice; }
  async quote(pickup, destination, mapboxToken) { return unwrap(await this.client.functions.invoke('angkas-quote', { body: { pickup: { latitude: pickup.latitude, longitude: pickup.longitude }, destination: { latitude: destination.latitude, longitude: destination.longitude }, mapboxToken } })); }
  async submit(id, payload) { return unwrap(await this.client.rpc(payload.service === 'angkas' ? 'submit_angkas_request' : 'submit_delivery_request', { p_request_id: id, p_payload: payload })); }
  async send(id, conversationId, body) {
    if (!body.trim() || body.trim().length > 5000) throw new Error('Write a message with up to 5,000 characters.');
    unwrap(await this.client.rpc('send_chat_message', { p_id: id, p_conversation_id: conversationId, p_body: body.trim() }));
  }
  async sendAttachment(id, conversationId, body, file) {
    if (file.size <= 0 || file.size > 25 * 1024 * 1024) throw new Error('Choose a photo or video smaller than 25 MB.');
    const media = detectMediaType(new Uint8Array(await file.slice(0, 64).arrayBuffer()));
    if (!media) throw new Error('Choose a JPG, PNG, WebP, GIF, MP4 or MOV file.');
    const path = `${conversationId}/${this.owner}/${id}.${media.extension}`;
    const uploaded = await this.client.storage.from('chat-media').upload(path, file, { contentType: media.mime, upsert: false, cacheControl: '300' });
    if (uploaded.error && !['409', 409].includes(uploaded.error.statusCode)) throw uploaded.error;
    unwrap(await this.client.rpc('send_chat_attachment', { p_id: id, p_conversation_id: conversationId, p_body: body.trim(), p_path: path, p_mime: media.mime, p_bytes: file.size }));
  }
  async media(path) { return unwrap(await this.client.storage.from('chat-media').createSignedUrl(path, 300))?.signedUrl; }
  async read(id) { unwrap(await this.client.rpc('mark_customer_conversation_read', { p_id: id })); }
  async cancel(row) { return unwrap(await this.client.rpc('cancel_customer_request', { p_id: row.id, p_version: row.workflow_version })); }
  async acceptFee(row) { return unwrap(await this.client.rpc('delivery_command', { p_id: row.id, p_action: 'accept_fee', p_version: row.workflow_version, p_fee: row.delivery_fee_cents })); }
  async confirm(row, rating) { return unwrap(await this.client.rpc('confirm_delivery_with_rating', { p_id: row.id, p_version: row.workflow_version, p_rating: rating })); }
  async rate(row, rating) {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error('Choose a rating from 1 to 5.');
    const result = await this.client.from('delivery_ratings').insert({ conversation_id: row.id, customer_id: this.owner, rider_id: row.rider_id, rating });
    if (result.error?.code !== '23505') unwrap(result);
  }
  async rating(id) { return unwrap(await this.client.from('delivery_ratings').select('rating').eq('customer_id', this.owner).eq('conversation_id', id).maybeSingle())?.rating; }
  watch(onRequests, onMessage, onStatus) {
    const channel = this.client.channel(`customer-web-${this.owner}-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `customer_id=eq.${this.owner}` }, onRequests)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, onMessage)
      .subscribe(onStatus);
    return () => this.client.removeChannel(channel);
  }
}

export function detectMediaType(bytes) {
  const starts = values => values.every((value, i) => bytes[i] === value);
  const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end));
  if (starts([255, 216, 255])) return { mime: 'image/jpeg', extension: 'jpg' };
  if (starts([137, 80, 78, 71, 13, 10, 26, 10])) return { mime: 'image/png', extension: 'png' };
  if (['GIF87a', 'GIF89a'].includes(ascii(0, 6))) return { mime: 'image/gif', extension: 'gif' };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return { mime: 'image/webp', extension: 'webp' };
  if (bytes.length >= 12 && ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12);
    if (brand === 'qt  ') return { mime: 'video/quicktime', extension: 'mov' };
    if (['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'M4V ', 'MSNV', '3gp4', '3gp5', '3gp6'].includes(brand)) return { mime: 'video/mp4', extension: 'mp4' };
  }
  return null;
}
