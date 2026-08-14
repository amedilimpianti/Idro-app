// ==========================================================================
// route-optimizer.js — motore di ottimizzazione itinerario ("Smart Routing")
//
// Usa due API pubbliche e gratuite:
//  1. Nominatim (OpenStreetMap) per geocodificare gli indirizzi testuali
//     in coordinate lat/lng — usato solo se un appuntamento non ha ancora
//     latitude/longitude salvate.
//  2. OSRM (Open Source Routing Machine, server demo pubblico) — servizio
//     "trip", che risolve un problema del commesso viaggiatore approssimato:
//     dato un insieme di tappe, restituisce l'ordine ottimale e la geometria
//     del percorso stradale reale, minimizzando i km totali.
//
// Per un uso in produzione ad alto volume si consiglia di ospitare una
// propria istanza OSRM oppure passare a Mapbox Optimization API /
// Google Routes API (endpoint sostituibili qui sotto senza toccare il resto
// dell'app).
// ==========================================================================

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const OSRM_TRIP_URL = "https://router.project-osrm.org/trip/v1/driving";

/**
 * Geocodifica un indirizzo testuale in { lat, lng }.
 * Rispetta la policy d'uso di Nominatim (max 1 richiesta/sec, User-Agent).
 */
async function geocodeAddress(address) {
  const url = `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(address)}`;
  const res = await fetch(url, { headers: { "Accept-Language": "it" } });
  if (!res.ok) throw new Error("Geocodifica non riuscita.");
  const results = await res.json();
  if (!results.length) throw new Error(`Indirizzo non trovato: ${address}`);
  return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
}

/**
 * Garantisce che ogni appuntamento passato abbia lat/lng, geocodificando
 * quelli mancanti (in sequenza, per rispettare il rate-limit di Nominatim)
 * e salvando il risultato su Supabase per non richiederlo di nuovo.
 */
async function ensureCoordinates(appointments, { onProgress } = {}) {
  const out = [];
  for (const appt of appointments) {
    if (appt.latitude && appt.longitude) {
      out.push(appt);
      continue;
    }
    try {
      const { lat, lng } = await geocodeAddress(appt.address);
      appt.latitude = lat;
      appt.longitude = lng;
      await window.supabaseClient
        .from("appointments")
        .update({ latitude: lat, longitude: lng })
        .eq("id", appt.id);
      out.push(appt);
    } catch (err) {
      console.warn("Geocodifica fallita per", appt.address, err);
      onProgress?.({ appt, failed: true });
      continue; // esclude dal routing gli indirizzi non geocodificabili
    }
    onProgress?.({ appt, failed: false });
    await new Promise((r) => setTimeout(r, 1100)); // rate limit Nominatim
  }
  return out;
}

/**
 * Calcola l'itinerario ottimale tra un punto di partenza (es. sede aziendale
 * o posizione corrente) e un elenco di appuntamenti dello stesso giorno.
 * Restituisce le tappe riordinate + geometria del percorso + distanza/tempo totali.
 */
async function optimizeRoute(origin, appointments) {
  if (!appointments.length) throw new Error("Nessun appuntamento da instradare.");

  const coordsList = [origin, ...appointments.map((a) => ({ lat: a.latitude, lng: a.longitude }))];
  const coordsStr = coordsList.map((c) => `${c.lng},${c.lat}`).join(";");

  const url = `${OSRM_TRIP_URL}/${coordsStr}?source=first&roundtrip=false&geometries=geojson&overview=full`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Servizio di instradamento non disponibile.");
  const data = await res.json();

  if (data.code !== "Ok") throw new Error(data.message || "Impossibile calcolare il percorso.");

  const trip = data.trips[0];

  // `waypoints` mappa ogni coordinata di input al suo indice nell'ordine
  // ottimizzato (waypoint_index). L'indice 0 è sempre l'origine.
  const orderedStops = data.waypoints
    .map((wp, inputIndex) => ({ wp, inputIndex }))
    .filter(({ inputIndex }) => inputIndex !== 0)
    .sort((a, b) => a.wp.waypoint_index - b.wp.waypoint_index)
    .map(({ inputIndex }) => appointments[inputIndex - 1]);

  return {
    orderedStops,
    geometry: trip.geometry, // GeoJSON LineString per disegnare il percorso
    distanceMeters: trip.distance,
    durationSeconds: trip.duration,
    legs: trip.legs, // distanza/durata tra ogni coppia di tappe consecutive
  };
}

/**
 * Inizializza una mappa Leaflet nel container indicato e disegna marker +
 * percorso ottimizzato. Richiede che Leaflet (CSS+JS) sia caricato in pagina.
 */
function renderRouteMap(containerId, origin, orderedStops, geometry) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  const map = L.map(containerId, { zoomControl: true });
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 19,
  }).addTo(map);

  const copperIcon = (label, isOrigin) =>
    L.divIcon({
      className: "",
      html: `<div style="
        width:30px;height:30px;border-radius:50%;
        background:${isOrigin ? "#8A5730" : "linear-gradient(180deg,#E19A63,#C97C48)"};
        display:flex;align-items:center;justify-content:center;
        font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700;
        color:#1A1006;border:2px solid #0E161D;box-shadow:0 2px 8px rgba(0,0,0,0.4);
      ">${label}</div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });

  const bounds = [];

  L.marker([origin.lat, origin.lng], { icon: copperIcon("S", true) })
    .addTo(map)
    .bindPopup("Sede / punto di partenza");
  bounds.push([origin.lat, origin.lng]);

  orderedStops.forEach((stop, i) => {
    L.marker([stop.latitude, stop.longitude], { icon: copperIcon(i + 1, false) })
      .addTo(map)
      .bindPopup(`<b>${i + 1}. ${stop.client_name}</b><br>${stop.address}`);
    bounds.push([stop.latitude, stop.longitude]);
  });

  if (geometry) {
    const latlngs = geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    L.polyline(latlngs, { color: "#5B9BC7", weight: 4, opacity: 0.85 }).addTo(map);
  }

  map.fitBounds(bounds, { padding: [40, 40] });
  return map;
}

function formatDistance(meters) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function formatDuration(seconds) {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} h ${mins % 60} min`;
}
