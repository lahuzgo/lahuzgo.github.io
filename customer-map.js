import { escapeHTML as e, validPin } from './customer-data.js';
import { modal } from './customer-dialog.js';
import { requestLocation } from './customer-permissions.js';
export { modal } from './customer-dialog.js';

// Existing customer-app public token; no server credentials belong in the browser.
export const MAPBOX_TOKEN = 'pk.eyJ1IjoiYXRvbjU1IiwiYSI6ImNtdGtyZ2kwYzA1dzEyeXB5dWoxbGhxajgifQ.6BSGxDG3niBtMFqe9sOfWA';
export const ORMOC = { latitude: 11.0064, longitude: 124.6075, address: 'Ormoc City, Leyte' };
export const coordinates = pin => `${pin.latitude.toFixed(5)}, ${pin.longitude.toFixed(5)}`;
export const pinName = pin => pin?.address || (validPin(pin) ? coordinates(pin) : 'Choose a location');
export async function jsonFetch(url, options = {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error('The map service is unavailable. Please try again.');
    return await response.json();
  } finally { clearTimeout(timer); }
}
let leafletReady;
export function loadMap() {
  return leafletReady ??= new Promise((resolve, reject) => {
    if (globalThis.L) { resolve(globalThis.L); return; }
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = new URL('./assets/vendor/leaflet-1.9.4.css', import.meta.url); document.head.append(css);
    const script = document.createElement('script'); script.src = new URL('./assets/vendor/leaflet-1.9.4.js', import.meta.url);
    script.onload = () => resolve(globalThis.L); script.onerror = () => { leafletReady = null; reject(new Error('The map could not load. Check your connection and try again.')); };
    document.head.append(script);
  });
}
function addTiles(map, L) {
  L.tileLayer(`https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`, {
    attribution: '© <a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noopener">Mapbox</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>', maxZoom: 19,
  }).addTo(map);
}
export function currentLocation() {
  return requestLocation();
}
export async function roadRoute(points) {
  if (points.length < 2 || points.length > 6 || points.some(p => !validPin(p))) throw new Error('Choose valid locations first.');
  const path = points.map(p => `${p.longitude},${p.latitude}`).join(';');
  for (const profile of ['driving-traffic', 'driving']) {
    try {
      const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/${profile}/${path}`);
      for (const [key, value] of Object.entries({ access_token: MAPBOX_TOKEN, overview: 'full', geometries: 'geojson', steps: 'false', alternatives: 'false', continue_straight: 'false', radiuses: points.map(() => '150').join(';') })) url.searchParams.set(key, value);
      return parseRoadRoute(await jsonFetch(url), points);
    } catch { /* Standard driving is the fallback, as in the customer app. */ }
  }
  throw new Error('No road route could be confirmed. Move your pins closer to an accessible road and try again.');
}
export function parseRoadRoute(body, points) {
  const route = body.routes?.[0], valid = value => Number.isFinite(value) && value >= 0;
  if (body.code !== 'Ok' || !route || !valid(route.distance) || route.distance <= 0 || !valid(route.duration) || route.duration <= 0 || body.waypoints?.length !== points.length || route.legs?.length !== points.length - 1) throw new Error('Incomplete road route.');
  let meters = 0, seconds = 0;
  for (const [i, waypoint] of body.waypoints.entries()) {
    const location = waypoint.location;
    if (!valid(waypoint.distance) || waypoint.distance > 150 || !Array.isArray(location) || !validPin({ latitude: location[1], longitude: location[0] })) throw new Error('The pin is too far from an accessible road.');
    const rad = value => value * Math.PI / 180, dLat = rad(location[1] - points[i].latitude), dLng = rad(location[0] - points[i].longitude);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(points[i].latitude)) * Math.cos(rad(location[1])) * Math.sin(dLng / 2) ** 2;
    if (6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a))) > 151) throw new Error('Road location does not match your pin.');
  }
  for (const leg of route.legs) { if (!valid(leg.distance) || !valid(leg.duration)) throw new Error('Invalid road route.'); meters += leg.distance; seconds += leg.duration; }
  if (Math.abs(meters - route.distance) > 1 || Math.abs(seconds - route.duration) > 1) throw new Error('Route does not include every stop.');
  return { meters: route.distance, seconds: route.duration, geometry: route.geometry };
}
export async function pinPicker({ title = 'Choose a location', initial = null, allowCurrent = true, controls = {}, demo = false, requestCurrent = false }) {
  return new Promise(resolve => {
    let pin = validPin(initial) ? { ...initial } : { ...ORMOC }, map, observer, result = null, change = 0;
    const dialog = modal(title, `<form class="map-search"><label class="p-sr" for="place-search">Search a place or address</label><input id="place-search" placeholder="Search a place or address" type="search" minlength="3" maxlength="180" autocomplete="off"><button class="p-button primary" type="submit">Search</button></form><div class="place-results" role="list"></div><p class="map-message" role="status">Move the map to place your pin at the exact entrance.</p><div class="picker-map-wrap"><div class="picker-map" aria-label="Location map"></div><span class="center-pin" aria-hidden="true"></span></div><div class="pin-details"><strong class="pin-address">${e(pinName(pin))}</strong><span class="pin-coordinates">${e(coordinates(pin))}</span></div><div class="dialog-actions">${allowCurrent ? '<button type="button" class="p-button secondary" data-current-location>Use current location</button>' : ''}<button type="button" class="p-button primary" data-confirm-pin>Confirm location</button></div>`, { wide: true });
    const message = text => { if (dialog.isConnected) dialog.querySelector('.map-message').textContent = text; };
    const paint = () => { dialog.querySelector('.pin-address').textContent = pinName(pin); dialog.querySelector('.pin-coordinates').textContent = coordinates(pin); };
    dialog.addEventListener('close', () => { observer?.disconnect(); map?.remove(); resolve(result); }, { once: true });
    const select = p => { pin = p; paint(); map?.setView([p.latitude, p.longitude], 17); };
    const form = dialog.querySelector('.map-search');
    if (controls.place_search_enabled === false) { form.hidden = true; message('Place search is temporarily off. Move the map to place your pin.'); }
    form.addEventListener('submit', async event => {
      event.preventDefault(); const query = form.querySelector('input').value.trim(); if (query.length < 3) return;
      const version = ++change, button = form.querySelector('button'); button.disabled = true; message('Searching nearby places…');
      try {
        let features;
        if (demo) features = [{ geometry: { coordinates: [124.6074, 11.0081] }, properties: { full_address: query + ', Ormoc City, Leyte' } }];
        else {
          const url = new URL('https://api.mapbox.com/search/geocode/v6/forward');
          const latitudeRange = 15 / 111.32, longitudeRange = 15 / (111.32 * Math.cos(pin.latitude * Math.PI / 180));
          for (const [key, value] of Object.entries({ q: query, country: 'ph', language: 'en', limit: '5', access_token: MAPBOX_TOKEN, proximity: `${pin.longitude},${pin.latitude}`, bbox: `${pin.longitude - longitudeRange},${pin.latitude - latitudeRange},${pin.longitude + longitudeRange},${pin.latitude + latitudeRange}` })) url.searchParams.set(key, value);
          features = (await jsonFetch(url)).features ?? [];
        }
        if (!dialog.isConnected || version !== change) return;
        const results = dialog.querySelector('.place-results'); results.replaceChildren();
        for (const feature of features) {
          const coords = feature.geometry?.coordinates, text = feature.properties?.full_address || [feature.properties?.name, feature.properties?.place_formatted].filter(Boolean).join(', ');
          if (!coords || !validPin({ latitude: coords[1], longitude: coords[0] })) continue;
          const button = document.createElement('button'); button.type = 'button'; button.className = 'place-result'; button.textContent = text;
          button.addEventListener('click', () => { select({ latitude: coords[1], longitude: coords[0], address: text }); results.replaceChildren(); message('Check the pin, then confirm your location.'); }); results.append(button);
        }
        message(features.length ? 'Choose a result, then check the pin.' : 'No places found. Try a fuller address or move the map.');
      } catch (error) { message(error.message); }
      finally { if (dialog.isConnected && version === change) button.disabled = false; }
    });
    dialog.querySelector('[data-current-location]')?.addEventListener('click', async event => {
      const button = event.currentTarget; button.disabled = true; message('Finding your current location…');
      try { select(demo ? { ...ORMOC, address: 'Your current location · Preview' } : await currentLocation()); message('Check the pin, then confirm your pickup.'); }
      catch (error) { message(error.message); }
      finally { if (dialog.isConnected) button.disabled = false; }
    });
    dialog.querySelector('[data-confirm-pin]').addEventListener('click', async event => {
      const button = event.currentTarget; button.disabled = true;
      if (!pin.address && controls.address_lookup_enabled !== false && !demo) {
        try {
          const url = new URL('https://api.mapbox.com/search/geocode/v6/reverse');
          for (const [key, value] of Object.entries({ latitude: pin.latitude, longitude: pin.longitude, access_token: MAPBOX_TOKEN, language: 'en' })) url.searchParams.set(key, value);
          const place = (await jsonFetch(url)).features?.[0]?.properties;
          pin.address = place?.full_address || place?.place_formatted || coordinates(pin);
        } catch { pin.address = coordinates(pin); }
      }
      if (!dialog.isConnected) return;
      result = pin; dialog.close();
    });
    loadMap().then(L => {
      if (!dialog.isConnected) return;
      map = L.map(dialog.querySelector('.picker-map'), { zoomControl: true, scrollWheelZoom: true }).setView([pin.latitude, pin.longitude], 15); addTiles(map, L);
      map.on('moveend', () => { const center = map.getCenter(); if (Math.abs(center.lat - pin.latitude) + Math.abs(center.lng - pin.longitude) < 0.00001) return; pin = { latitude: center.lat, longitude: center.lng, address: '' }; paint(); });
      observer = new ResizeObserver(() => map?.invalidateSize()); observer.observe(dialog.querySelector('.picker-map'));
    }).catch(error => { message(error.message); dialog.querySelector('[data-confirm-pin]').disabled = true; });
    if (requestCurrent && allowCurrent) dialog.querySelector('[data-current-location]').click();
  });
}
export async function trackingMap(container, points, rider) {
  const L = await loadMap(); if (!container.isConnected) return () => {};
  const map = L.map(container, { scrollWheelZoom: false }).setView([ORMOC.latitude, ORMOC.longitude], 14); addTiles(map, L);
  const all = [];
  for (const [index, pin] of points.entries()) if (validPin(pin)) {
    const position = [pin.latitude, pin.longitude]; all.push(position);
    L.marker(position, { icon: L.divIcon({ className: 'trip-map-pin', html: `<span class="${index === points.length - 1 ? 'destination' : ''}">${index === points.length - 1 ? 'D' : index + 1}</span>`, iconSize: [32, 40], iconAnchor: [16, 38] }) }).addTo(map);
  }
  if (validPin(rider)) { const position = [rider.latitude, rider.longitude]; all.push(position); L.marker(position, { icon: L.divIcon({ className: 'trip-map-pin rider', html: '<span>R</span>', iconSize: [32, 40] }) }).addTo(map); }
  if (all.length) map.fitBounds(all, { padding: [35, 35], maxZoom: 16 });
  return () => map.remove();
}
