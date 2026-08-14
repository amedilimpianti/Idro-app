// ==========================================================================
// appuntamenti.js — accesso ai dati per la tabella `appointments`.
// Usato da dashboard.html, appuntamento.html, dettaglio.html, percorso.html
// ==========================================================================

const SELECT_WITH_CREATOR = `*, profiles:created_by ( id, full_name, role )`;

/** Recupera gli appuntamenti in un intervallo di date, ordinati per orario. */
async function fetchAppointments({ dateFrom, dateTo, status, search } = {}) {
  let query = window.supabaseClient
    .from("appointments")
    .select(SELECT_WITH_CREATOR)
    .order("appointment_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (dateFrom) query = query.gte("appointment_date", dateFrom);
  if (dateTo) query = query.lte("appointment_date", dateTo);
  if (status) query = query.eq("status", status);
  if (search) query = query.or(`client_name.ilike.%${search}%,address.ilike.%${search}%`);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/** Tutti gli appuntamenti (non annullati) di una singola data — usato per
 * il pannello "awareness della giornata" e per il motore di instradamento. */
async function fetchAppointmentsForDate(dateStr, { excludeId = null } = {}) {
  let query = window.supabaseClient
    .from("appointments")
    .select(SELECT_WITH_CREATOR)
    .eq("appointment_date", dateStr)
    .neq("status", "annullato")
    .order("start_time", { ascending: true });

  if (excludeId) query = query.neq("id", excludeId);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function fetchAppointmentById(id) {
  const { data, error } = await window.supabaseClient
    .from("appointments")
    .select(SELECT_WITH_CREATOR)
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

async function createAppointment(payload) {
  const { data: { user } } = await window.supabaseClient.auth.getUser();
  const { data, error } = await window.supabaseClient
    .from("appointments")
    .insert({ ...payload, created_by: user.id })
    .select(SELECT_WITH_CREATOR)
    .single();
  if (error) throw error;
  return data;
}

async function updateAppointment(id, payload) {
  const { data, error } = await window.supabaseClient
    .from("appointments")
    .update(payload)
    .eq("id", id)
    .select(SELECT_WITH_CREATOR)
    .single();
  if (error) throw error;
  return data;
}

async function deleteAppointment(id) {
  const { error } = await window.supabaseClient.from("appointments").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Determina se un nuovo intervento (data/ora/durata) va in conflitto con
 * altri interventi già fissati nello stesso giorno. Un conflitto è definito
 * come sovrapposizione temporale degli intervalli [inizio, inizio+durata).
 */
function findConflicts(dateAppointments, { startTime, durationMinutes }) {
  const toRange = (time, duration) => {
    const [h, m] = time.split(":").map(Number);
    const start = h * 60 + m;
    return [start, start + duration];
  };
  const [newStart, newEnd] = toRange(startTime, durationMinutes);

  return dateAppointments.filter((appt) => {
    const [s, e] = toRange(appt.start_time.slice(0, 5), appt.duration_minutes);
    return newStart < e && s < newEnd;
  });
}

/** Renderizza la mini-timeline degli impegni del giorno dentro un contenitore. */
function renderDayTimeline(container, dateAppointments, { conflictIds = [] } = {}) {
  if (!dateAppointments.length) {
    container.innerHTML = `<div class="day-empty">Nessun altro intervento fissato per questa data.</div>`;
    return;
  }

  container.innerHTML = `<div class="timeline">${dateAppointments
    .map((a) => {
      const isConflict = conflictIds.includes(a.id);
      const end = addMinutes(a.start_time.slice(0, 5), a.duration_minutes);
      return `
        <div class="timeline-item ${isConflict ? "is-conflict" : ""}">
          <div class="t-time">${formatTime(a.start_time)} – ${end}</div>
          <div class="t-client">${escapeHtml(a.client_name)}</div>
          <div class="t-addr">${escapeHtml(a.address)}</div>
          <div class="t-staff">${a.staff_required} persona/e · ${a.profiles?.full_name || "—"}</div>
        </div>`;
    })
    .join("")}</div>`;
}
