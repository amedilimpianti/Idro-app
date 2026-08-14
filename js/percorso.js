// ==========================================================================
// percorso.js — controller della pagina "Ottimizza itinerario" (percorso.html)
// ==========================================================================

// Coordinate di default della sede aziendale, usate come punto di partenza
// dell'itinerario. Sostituisci con le coordinate reali della tua sede,
// oppure lascia che l'utente le imposti dal campo indirizzo qui sotto.
const SEDE_DEFAULT = { lat: 45.4642, lng: 9.19 }; // Milano, esempio

document.addEventListener("DOMContentLoaded", async () => {
  const session = await requireSession();
  if (!session) return;

  setActiveNav();
  const profile = await getCurrentProfile();
  mountUserCard(profile);

  const params = new URLSearchParams(window.location.search);
  const dateInput = document.getElementById("route-date");
  const originInput = document.getElementById("origin-address");
  const calcBtn = document.getElementById("calc-route");
  const stopListEl = document.getElementById("stop-list");
  const summaryEl = document.getElementById("route-summary");
  const statusEl = document.getElementById("route-status");

  dateInput.value = params.get("date") || new Date().toISOString().slice(0, 10);

  let map = null;

  async function run() {
    const dateStr = dateInput.value;
    stopListEl.innerHTML = "";
    summaryEl.innerHTML = "";
    calcBtn.disabled = true;
    calcBtn.innerHTML = '<span class="spinner"></span> Calcolo…';

    try {
      statusEl.textContent = "Recupero interventi del giorno…";
      const appointments = await fetchAppointmentsForDate(dateStr);
      if (!appointments.length) {
        statusEl.textContent = "Nessun intervento pianificato per questa data.";
        document.getElementById("route-map").innerHTML = `<div class="empty-state" style="padding-top:80px;"><h3>Nessuna tappa da instradare</h3></div>`;
        return;
      }

      statusEl.textContent = `Geocodifica ${appointments.length} indirizzi…`;
      const withCoords = await ensureCoordinates(appointments, {
        onProgress: ({ appt, failed }) => {
          statusEl.textContent = failed
            ? `Indirizzo non geocodificabile: ${appt.address}`
            : `Geocodificato: ${appt.client_name}`;
        },
      });

      if (!withCoords.length) {
        statusEl.textContent = "Nessun indirizzo valido da instradare.";
        return;
      }

      let origin = SEDE_DEFAULT;
      if (originInput.value.trim()) {
        statusEl.textContent = "Localizzazione punto di partenza…";
        origin = await geocodeAddress(originInput.value.trim());
      }

      statusEl.textContent = "Calcolo del percorso ottimale…";
      const result = await optimizeRoute(origin, withCoords);

      renderStops(origin, result);
      renderSummary(result);
      map = renderRouteMap("route-map", origin, result.orderedStops, result.geometry);

      statusEl.textContent = `Itinerario calcolato per ${result.orderedStops.length} interventi.`;
    } catch (err) {
      console.error(err);
      statusEl.textContent = `Errore: ${err.message}`;
      showToast(err.message, "error");
    } finally {
      calcBtn.disabled = false;
      calcBtn.textContent = "Calcola itinerario ottimale";
    }
  }

  function renderStops(origin, result) {
    const legs = result.legs || [];
    let html = `
      <div class="stop-item origin">
        <div class="stop-index">S</div>
        <div>
          <div class="stop-client">Punto di partenza</div>
          <div class="stop-addr">${escapeHtml(originInput.value.trim() || "Sede aziendale")}</div>
        </div>
      </div>`;

    result.orderedStops.forEach((stop, i) => {
      const leg = legs[i];
      html += `
        <div class="stop-item">
          <div class="stop-index">${i + 1}</div>
          <div>
            <div class="stop-client">${escapeHtml(stop.client_name)}</div>
            <div class="stop-addr">${escapeHtml(stop.address)}</div>
            <div class="stop-addr mono" style="margin-top:2px;">Ore ${formatTime(stop.start_time)} · ${stop.staff_required} persona/e</div>
            ${leg ? `<div class="stop-leg">→ ${formatDistance(leg.distance)} · ${formatDuration(leg.duration)}</div>` : ""}
          </div>
        </div>`;
    });

    stopListEl.innerHTML = html;
  }

  function renderSummary(result) {
    summaryEl.innerHTML = `
      <div class="item"><div class="num">${formatDistance(result.distanceMeters)}</div><div class="lbl">Distanza totale</div></div>
      <div class="item"><div class="num">${formatDuration(result.durationSeconds)}</div><div class="lbl">Tempo di guida stimato</div></div>
      <div class="item"><div class="num">${result.orderedStops.length}</div><div class="lbl">Interventi instradati</div></div>
    `;
  }

  calcBtn.addEventListener("click", run);
  dateInput.addEventListener("change", () => {
    statusEl.textContent = "Premi \u201cCalcola itinerario ottimale\u201d per aggiornare.";
  });
});
