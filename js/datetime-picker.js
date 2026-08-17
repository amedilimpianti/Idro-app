// ==========================================================================
// datetime-picker.js — modali disegnati ad hoc per la selezione di data,
// orario e durata prevista di un intervento. Sostituiscono gli input nativi
// <input type="date"> / <input type="time"> (il cui aspetto varia da
// dispositivo a dispositivo) con un'esperienza coerente su tutta l'app,
// e mostrano sempre la data nel formato richiesto gg/mm/aaaa.
// ==========================================================================

const IT_MONTHS = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];
const IT_WEEKDAYS_SHORT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

/** Apre il modale calendario e restituisce una Promise<string|null> con la
 * data scelta in formato ISO (aaaa-mm-gg), oppure null se annullato. */
function openDatePickerModal(initialIso) {
  return new Promise((resolve) => {
    const base = initialIso ? new Date(initialIso + "T00:00:00") : new Date();
    let viewYear = base.getFullYear();
    let viewMonth = base.getMonth();
    let selectedIso = initialIso || null;

    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal picker-modal" role="dialog" aria-modal="true" aria-label="Seleziona data">
        <div class="picker-header">
          <button type="button" class="picker-nav-btn" data-nav="prev" aria-label="Mese precedente">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <div class="picker-title" id="picker-month-label"></div>
          <button type="button" class="picker-nav-btn" data-nav="next" aria-label="Mese successivo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>
        <div class="picker-weekdays">${IT_WEEKDAYS_SHORT.map((w) => `<span>${w}</span>`).join("")}</div>
        <div class="picker-days" id="picker-days"></div>
        <div class="modal-actions">
          <button class="btn btn-secondary" data-action="today">Oggi</button>
          <button class="btn btn-secondary" data-action="cancel">Annulla</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add("open"));

    const monthLabel = backdrop.querySelector("#picker-month-label");
    const daysGrid = backdrop.querySelector("#picker-days");

    function renderMonth() {
      monthLabel.textContent = `${IT_MONTHS[viewMonth]} ${viewYear}`;
      const firstOfMonth = new Date(viewYear, viewMonth, 1);
      // Lunedì = 0 ... Domenica = 6
      const leadingBlanks = (firstOfMonth.getDay() + 6) % 7;
      const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
      const todayIso = isoToday();

      let cells = "";
      for (let i = 0; i < leadingBlanks; i++) cells += `<span class="picker-day is-blank"></span>`;
      for (let day = 1; day <= daysInMonth; day++) {
        const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const classes = ["picker-day"];
        if (iso === todayIso) classes.push("is-today");
        if (iso === selectedIso) classes.push("is-selected");
        cells += `<button type="button" class="${classes.join(" ")}" data-iso="${iso}">${day}</button>`;
      }
      daysGrid.innerHTML = cells;

      daysGrid.querySelectorAll(".picker-day[data-iso]").forEach((btn) => {
        btn.addEventListener("click", () => {
          selectedIso = btn.getAttribute("data-iso");
          close(selectedIso);
        });
      });
    }

    backdrop.querySelector('[data-nav="prev"]').addEventListener("click", () => {
      viewMonth -= 1;
      if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
      renderMonth();
    });
    backdrop.querySelector('[data-nav="next"]').addEventListener("click", () => {
      viewMonth += 1;
      if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
      renderMonth();
    });
    backdrop.querySelector('[data-action="today"]').addEventListener("click", () => {
      const t = isoToday();
      const [y, m] = t.split("-").map(Number);
      viewYear = y; viewMonth = m - 1;
      selectedIso = t;
      renderMonth();
    });

    const close = (result) => {
      backdrop.classList.remove("open");
      setTimeout(() => backdrop.remove(), 200);
      resolve(result);
    };
    backdrop.querySelector('[data-action="cancel"]').addEventListener("click", () => close(null));
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close(null);
    });

    renderMonth();
  });
}

/** Apre il modale orario e restituisce una Promise<string|null> con
 * l'orario scelto in formato "HH:MM", oppure null se annullato. */
function openTimePickerModal(initialTime) {
  return new Promise((resolve) => {
    let [h, m] = (initialTime || "08:00").split(":").map(Number);
    if (Number.isNaN(h)) h = 8;
    if (Number.isNaN(m)) m = 0;
    // Arrotonda i minuti iniziali al multiplo di 5 più vicino per la griglia.
    m = Math.round(m / 5) * 5 % 60;

    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal picker-modal" role="dialog" aria-modal="true" aria-label="Seleziona orario">
        <h3>Orario di inizio</h3>
        <div class="time-picker-preview" id="time-preview">--:--</div>
        <div class="time-picker-columns">
          <div class="time-picker-col">
            <div class="time-picker-col-label">Ore</div>
            <div class="time-picker-list" id="time-hours"></div>
          </div>
          <div class="time-picker-col">
            <div class="time-picker-col-label">Minuti</div>
            <div class="time-picker-list" id="time-minutes"></div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" data-action="cancel">Annulla</button>
          <button class="btn btn-primary" data-action="confirm">Conferma</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add("open"));

    const hoursList = backdrop.querySelector("#time-hours");
    const minutesList = backdrop.querySelector("#time-minutes");
    const preview = backdrop.querySelector("#time-preview");

    function updatePreview() {
      preview.textContent = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }

    hoursList.innerHTML = Array.from({ length: 24 }, (_, i) => i)
      .map((hh) => `<button type="button" class="time-picker-item ${hh === h ? "is-selected" : ""}" data-hour="${hh}">${String(hh).padStart(2, "0")}</button>`)
      .join("");
    minutesList.innerHTML = Array.from({ length: 12 }, (_, i) => i * 5)
      .map((mm) => `<button type="button" class="time-picker-item ${mm === m ? "is-selected" : ""}" data-minute="${mm}">${String(mm).padStart(2, "0")}</button>`)
      .join("");

    hoursList.querySelectorAll("[data-hour]").forEach((btn) => {
      btn.addEventListener("click", () => {
        h = Number(btn.getAttribute("data-hour"));
        hoursList.querySelectorAll(".time-picker-item").forEach((b) => b.classList.toggle("is-selected", b === btn));
        updatePreview();
      });
    });
    minutesList.querySelectorAll("[data-minute]").forEach((btn) => {
      btn.addEventListener("click", () => {
        m = Number(btn.getAttribute("data-minute"));
        minutesList.querySelectorAll(".time-picker-item").forEach((b) => b.classList.toggle("is-selected", b === btn));
        updatePreview();
      });
    });

    updatePreview();
    requestAnimationFrame(() => {
      const selHour = hoursList.querySelector(".is-selected");
      const selMin = minutesList.querySelector(".is-selected");
      if (selHour) selHour.scrollIntoView({ block: "center" });
      if (selMin) selMin.scrollIntoView({ block: "center" });
    });

    const close = (result) => {
      backdrop.classList.remove("open");
      setTimeout(() => backdrop.remove(), 200);
      resolve(result);
    };
    backdrop.querySelector('[data-action="cancel"]').addEventListener("click", () => close(null));
    backdrop.querySelector('[data-action="confirm"]').addEventListener("click", () => {
      close(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    });
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close(null);
    });
  });
}

/** Apre un piccolo modale per inserire una durata personalizzata (in
 * minuti) quando nessuno dei preset rapidi è adatto. */
function openCustomDurationModal(initialMinutes) {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-label="Durata personalizzata">
        <h3>Durata personalizzata</h3>
        <p>Indica la durata prevista dell'intervento in minuti.</p>
        <div class="field" style="margin: 14px 0 0;">
          <label for="custom-duration-input">Minuti</label>
          <input type="number" id="custom-duration-input" min="15" step="15" value="${initialMinutes || 60}" />
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" data-action="cancel">Annulla</button>
          <button class="btn btn-primary" data-action="confirm">Conferma</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add("open"));
    const input = backdrop.querySelector("#custom-duration-input");

    const close = (result) => {
      backdrop.classList.remove("open");
      setTimeout(() => backdrop.remove(), 200);
      resolve(result);
    };
    backdrop.querySelector('[data-action="cancel"]').addEventListener("click", () => close(null));
    backdrop.querySelector('[data-action="confirm"]').addEventListener("click", () => {
      const val = Number(input.value);
      close(val > 0 ? val : null);
    });
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close(null);
    });
    setTimeout(() => input.focus(), 260);
  });
}

const DURATION_PRESETS = [30, 60, 90, 120, 180, 240];

function formatDurationLabel(minutes) {
  if (minutes % 60 === 0) return `${minutes / 60} ${minutes === 60 ? "ora" : "ore"}`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}` : `${m} min`;
}

/**
 * Collega uno "stack" di chip per la durata prevista dell'intervento
 * (30 min / 1 ora / 1h30 / 2 ore / 3 ore / 4 ore / Altro) a un input
 * nascosto che ne conserva il valore in minuti. Ogni cambiamento
 * scatena un evento "change" sull'input, per restare compatibile con
 * il codice esistente che ascolta quell'evento.
 */
function attachDurationChips({ container, hiddenInput, customBtn }) {
  function renderChips() {
    const current = Number(hiddenInput.value) || 60;
    container.querySelectorAll(".duration-chip[data-minutes]").forEach((chip) => {
      const chipMinutes = Number(chip.getAttribute("data-minutes"));
      chip.classList.toggle("is-selected", chipMinutes === current);
    });
    const isPreset = DURATION_PRESETS.includes(current);
    customBtn.classList.toggle("is-selected", !isPreset);
    customBtn.textContent = isPreset ? "Altro" : `Altro (${formatDurationLabel(current)})`;
  }

  function setMinutes(minutes) {
    hiddenInput.value = String(minutes);
    hiddenInput.dispatchEvent(new Event("change", { bubbles: true }));
    renderChips();
  }

  container.querySelectorAll(".duration-chip[data-minutes]").forEach((chip) => {
    chip.addEventListener("click", () => setMinutes(Number(chip.getAttribute("data-minutes"))));
  });
  customBtn.addEventListener("click", async () => {
    const result = await openCustomDurationModal(Number(hiddenInput.value) || 60);
    if (result) setMinutes(result);
  });

  renderChips();
  return { setMinutes, renderChips };
}

/**
 * Collega un pulsante "trigger" (che mostra la data in gg/mm/aaaa) al
 * modale calendario e a un input nascosto che conserva il valore ISO.
 */
function attachDatePickerField({ trigger, display, hiddenInput, onChange }) {
  function refreshDisplay() {
    display.textContent = hiddenInput.value ? formatDateIt(hiddenInput.value) : "Seleziona data";
    display.classList.toggle("placeholder", !hiddenInput.value);
  }
  trigger.addEventListener("click", async () => {
    const result = await openDatePickerModal(hiddenInput.value || null);
    if (result) {
      hiddenInput.value = result;
      refreshDisplay();
      hiddenInput.dispatchEvent(new Event("change", { bubbles: true }));
      if (onChange) onChange(result);
    }
  });
  refreshDisplay();
  return { refreshDisplay };
}

/**
 * Collega un pulsante "trigger" (che mostra "HH:MM") al modale orario e
 * a un input nascosto che conserva il valore.
 */
function attachTimePickerField({ trigger, display, hiddenInput, onChange }) {
  function refreshDisplay() {
    display.textContent = hiddenInput.value ? hiddenInput.value.slice(0, 5) : "Seleziona ora";
    display.classList.toggle("placeholder", !hiddenInput.value);
  }
  trigger.addEventListener("click", async () => {
    const result = await openTimePickerModal(hiddenInput.value || null);
    if (result) {
      hiddenInput.value = result;
      refreshDisplay();
      hiddenInput.dispatchEvent(new Event("change", { bubbles: true }));
      if (onChange) onChange(result);
    }
  });
  refreshDisplay();
  return { refreshDisplay };
}

/** Apre il modale "Assegna a" con l'elenco degli incaricati disegnato ad hoc
 * (al posto dell'elenco nativo di Android/iOS mostrato da una <select>).
 * Restituisce una Promise<string|undefined>: l'id scelto ("" per "Da
 * assegnare"), oppure undefined se il modale è stato chiuso senza scegliere. */
function openAssigneePickerModal(users, currentId) {
  return new Promise((resolve) => {
    const options = [{ id: "", full_name: "Da assegnare" }, ...(users || [])];

    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal picker-modal" role="dialog" aria-modal="true" aria-label="Assegna a">
        <h3>Assegna a</h3>
        <div class="assignee-picker-list">
          ${options
            .map((u) => {
              const selected = (u.id || "") === (currentId || "");
              const initials = u.id ? getInitials(u.full_name) : "—";
              return `
              <button type="button" class="assignee-picker-item ${selected ? "is-selected" : ""}" data-id="${u.id}">
                <span class="avatar">${initials}</span>
                <span class="assignee-picker-name">${escapeHtml(u.full_name || "Da assegnare")}</span>
                <svg class="assignee-picker-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg>
              </button>`;
            })
            .join("")}
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" data-action="cancel">Chiudi</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add("open"));

    const close = (result) => {
      backdrop.classList.remove("open");
      setTimeout(() => backdrop.remove(), 200);
      resolve(result);
    };
    backdrop.querySelectorAll(".assignee-picker-item").forEach((btn) => {
      btn.addEventListener("click", () => close(btn.getAttribute("data-id")));
    });
    backdrop.querySelector('[data-action="cancel"]').addEventListener("click", () => close(undefined));
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close(undefined);
    });
  });
}

/**
 * Collega un pulsante "trigger" (che mostra il nome dell'incaricato) al
 * modale "Assegna a" e a un input nascosto che conserva l'id scelto.
 * L'elenco utenti va passato via setUsers() quando disponibile (viene
 * caricato in modo asincrono da Supabase).
 */
function attachAssigneePickerField({ trigger, display, hiddenInput }) {
  let users = [];

  function refreshDisplay() {
    const current = users.find((u) => u.id === hiddenInput.value);
    display.textContent = current ? current.full_name || "Utente" : "Da assegnare";
    display.classList.toggle("placeholder", !hiddenInput.value);
  }

  trigger.addEventListener("click", async () => {
    const result = await openAssigneePickerModal(users, hiddenInput.value);
    if (result !== undefined) {
      hiddenInput.value = result;
      refreshDisplay();
      hiddenInput.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });

  refreshDisplay();
  return {
    refreshDisplay,
    setUsers(list) {
      users = list || [];
      refreshDisplay();
    },
  };
}
