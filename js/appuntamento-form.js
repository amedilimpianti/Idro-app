// ==========================================================================
// appuntamento-form.js — logica del form di creazione/modifica intervento
// (appuntamento.html). Gestisce anche il pannello "awareness della giornata".
// ==========================================================================

document.addEventListener("DOMContentLoaded", async () => {
  const session = await requireSession();
  if (!session) return;

  setActiveNav();
  const profile = await getCurrentProfile();
  mountUserCard(profile);

  const params = new URLSearchParams(window.location.search);
  const editId = params.get("id");
  const isEdit = Boolean(editId);

  document.getElementById("form-title").textContent = isEdit ? "Modifica intervento" : "Nuovo intervento";
  document.getElementById("form-sub").textContent = isEdit
    ? "Aggiorna i dettagli dell'intervento pianificato."
    : "Registra un nuovo appuntamento per la squadra.";
  const mobilePageTitle = document.getElementById("mobile-page-title");
  if (mobilePageTitle) mobilePageTitle.textContent = isEdit ? "Modifica intervento" : "Nuovo intervento";

  const form = document.getElementById("appt-form");
  const dateInput = document.getElementById("appointment_date");
  const timeInput = document.getElementById("start_time");
  const durationInput = document.getElementById("duration_minutes");
  const staffCountEl = document.getElementById("staff_count");
  const dayPanelBody = document.getElementById("day-panel-body");
  const dayPanelCount = document.getElementById("day-panel-count");
  const conflictBanner = document.getElementById("conflict-banner");
  const submitBtn = document.getElementById("submit-btn");
  const deleteBtn = document.getElementById("delete-btn");

  let staffCount = 1;

  // --------------------------------------------------------------------
  // Stepper mobile: 3 passaggi (Cliente → Pianificazione → Note). Su
  // schermi più larghi le regole CSS mostrano tutti i passaggi assieme e
  // i controlli di navigazione restano nascosti.
  // --------------------------------------------------------------------
  const TOTAL_STEPS = 3;
  let currentStep = 1;
  const formSteps = document.querySelectorAll(".form-step");
  const stepLabels = document.querySelectorAll(".step-label");
  const stepProgressBar = document.getElementById("stepper-progress-bar");
  const stepPrevBtn = document.getElementById("step-prev-btn");
  const stepNextBtn = document.getElementById("step-next-btn");

  function isMobileViewport() {
    return window.matchMedia("(max-width: 760px)").matches;
  }

  function updateStepUI() {
    formSteps.forEach((el) => {
      el.classList.toggle("active-step", Number(el.getAttribute("data-step")) === currentStep);
    });
    stepLabels.forEach((el) => {
      el.classList.toggle("active", Number(el.getAttribute("data-step-label")) <= currentStep);
    });
    if (stepProgressBar) stepProgressBar.style.width = `${(currentStep / TOTAL_STEPS) * 100}%`;
    if (stepPrevBtn) stepPrevBtn.style.visibility = currentStep === 1 ? "hidden" : "visible";
    if (stepNextBtn) stepNextBtn.style.display = currentStep === TOTAL_STEPS ? "none" : "inline-flex";
    if (isMobileViewport()) {
      submitBtn.style.display = currentStep === TOTAL_STEPS ? "inline-flex" : "none";
    } else {
      submitBtn.style.display = "";
    }
  }

  function validateCurrentStep() {
    let valid = true;
    document.querySelectorAll(`.form-step[data-step="${currentStep}"]`).forEach((stepEl) => {
      stepEl.querySelectorAll("input[required], select[required], textarea[required]").forEach((inp) => {
        if (!inp.checkValidity()) {
          inp.reportValidity();
          valid = false;
        }
      });
    });
    return valid;
  }

  if (stepNextBtn) {
    stepNextBtn.addEventListener("click", () => {
      if (!validateCurrentStep()) return;
      currentStep = Math.min(TOTAL_STEPS, currentStep + 1);
      updateStepUI();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }
  if (stepPrevBtn) {
    stepPrevBtn.addEventListener("click", () => {
      currentStep = Math.max(1, currentStep - 1);
      updateStepUI();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }
  window.addEventListener("resize", debounce(updateStepUI, 200));
  updateStepUI();

  if (!isEdit) dateInput.value = new Date().toISOString().slice(0, 10);

  document.getElementById("staff-minus").addEventListener("click", () => setStaffCount(staffCount - 1));
  document.getElementById("staff-plus").addEventListener("click", () => setStaffCount(staffCount + 1));
  function setStaffCount(n) {
    staffCount = Math.max(1, Math.min(12, n));
    staffCountEl.textContent = staffCount;
  }

  // --------------------------------------------------------------------
  // Awareness della giornata: mostra gli altri interventi già fissati per
  // la data selezionata e segnala eventuali sovrapposizioni orarie.
  // --------------------------------------------------------------------
  async function refreshDayPanel() {
    const dateStr = dateInput.value;
    if (!dateStr) return;
    dayPanelBody.innerHTML = `<div class="page-loader"><span class="spinner"></span></div>`;
    try {
      const dayAppointments = await fetchAppointmentsForDate(dateStr, { excludeId: editId });
      dayPanelCount.textContent = `${dayAppointments.length} interventi`;

      let conflictIds = [];
      if (timeInput.value && durationInput.value) {
        const conflicts = findConflicts(dayAppointments, {
          startTime: timeInput.value,
          durationMinutes: Number(durationInput.value),
        });
        conflictIds = conflicts.map((c) => c.id);
        conflictBanner.style.display = conflicts.length ? "flex" : "none";
        if (conflicts.length) {
          conflictBanner.querySelector("span").textContent =
            conflicts.length === 1
              ? `Attenzione: sovrapposizione con l'intervento da ${escapeHtml(conflicts[0].client_name)}.`
              : `Attenzione: sovrapposizione con ${conflicts.length} interventi già fissati.`;
        }
      } else {
        conflictBanner.style.display = "none";
      }

      renderDayTimeline(dayPanelBody, dayAppointments, { conflictIds });
    } catch (err) {
      dayPanelBody.innerHTML = `<div class="day-empty">Impossibile caricare gli impegni della giornata.</div>`;
    }
  }

  [dateInput, timeInput, durationInput].forEach((el) => el.addEventListener("change", refreshDayPanel));
  timeInput.addEventListener("input", debounce(refreshDayPanel, 300));

  function debounce(fn, ms) {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  }

  // --------------------------------------------------------------------
  // Bozza automatica: solo per un nuovo intervento (non in modifica), per
  // recuperare i dati se l'operatore viene interrotto mentre è in cantiere.
  // --------------------------------------------------------------------
  const DRAFT_KEY = "idro_draft_appuntamento";
  const draftBanner = document.getElementById("draft-banner");
  const draftDiscardBtn = document.getElementById("draft-discard-btn");
  const draftRestoreBtn = document.getElementById("draft-restore-btn");

  function collectDraft() {
    return {
      client_name: document.getElementById("client_name").value,
      client_phone: document.getElementById("client_phone").value,
      address: document.getElementById("address").value,
      appointment_date: dateInput.value,
      start_time: timeInput.value,
      duration_minutes: durationInput.value,
      staff_required: staffCount,
      notes: document.getElementById("notes").value,
    };
  }

  function saveDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(collectDraft()));
    } catch (err) {
      /* storage non disponibile: nessun blocco dell'app */
    }
  }

  function clearDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch (err) {
      /* ignora */
    }
  }

  function applyDraft(draft) {
    document.getElementById("client_name").value = draft.client_name || "";
    document.getElementById("client_phone").value = draft.client_phone || "";
    document.getElementById("address").value = draft.address || "";
    if (draft.appointment_date) dateInput.value = draft.appointment_date;
    if (draft.start_time) timeInput.value = draft.start_time;
    if (draft.duration_minutes) durationInput.value = draft.duration_minutes;
    setStaffCount(Number(draft.staff_required) || 1);
    document.getElementById("notes").value = draft.notes || "";
  }

  if (!isEdit) {
    const rawDraft = localStorage.getItem(DRAFT_KEY);
    if (rawDraft) {
      try {
        const draft = JSON.parse(rawDraft);
        if (draft && (draft.client_name || draft.address)) {
          draftBanner.style.display = "flex";
        }
      } catch (err) {
        clearDraft();
      }
    }
    form.addEventListener("input", debounce(saveDraft, 500));
  }

  draftDiscardBtn.addEventListener("click", () => {
    clearDraft();
    draftBanner.style.display = "none";
  });

  draftRestoreBtn.addEventListener("click", () => {
    const rawDraft = localStorage.getItem(DRAFT_KEY);
    if (rawDraft) {
      try {
        applyDraft(JSON.parse(rawDraft));
        refreshDayPanel();
      } catch (err) {
        /* ignora bozza non valida */
      }
    }
    draftBanner.style.display = "none";
  });

  if (isEdit) {
    try {
      const appt = await fetchAppointmentById(editId);
      document.getElementById("client_name").value = appt.client_name || "";
      document.getElementById("client_phone").value = appt.client_phone || "";
      document.getElementById("address").value = appt.address || "";
      dateInput.value = appt.appointment_date;
      timeInput.value = appt.start_time.slice(0, 5);
      durationInput.value = appt.duration_minutes;
      document.getElementById("status").value = appt.status;
      document.getElementById("notes").value = appt.notes || "";
      setStaffCount(appt.staff_required);
      deleteBtn.style.display = "inline-flex";
    } catch (err) {
      showToast("Impossibile caricare l'intervento.", "error");
    }
  } else {
    document.getElementById("status-field").style.display = "none";
  }

  refreshDayPanel();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span>';

    const payload = {
      client_name: document.getElementById("client_name").value.trim(),
      client_phone: document.getElementById("client_phone").value.trim() || null,
      address: document.getElementById("address").value.trim(),
      appointment_date: dateInput.value,
      start_time: timeInput.value,
      duration_minutes: Number(durationInput.value),
      staff_required: staffCount,
      notes: document.getElementById("notes").value.trim() || null,
    };
    if (isEdit) payload.status = document.getElementById("status").value;

    try {
      const saved = isEdit ? await updateAppointment(editId, payload) : await createAppointment(payload);
      if (!isEdit) clearDraft();
      showToast(isEdit ? "Intervento aggiornato." : "Intervento creato.", "success");
      window.location.href = `dettaglio.html?id=${saved.id}`;
    } catch (err) {
      showToast(`Errore: ${err.message}`, "error");
      submitBtn.disabled = false;
      submitBtn.textContent = isEdit ? "Salva modifiche" : "Crea intervento";
    }
  });

  if (isEdit) {
    deleteBtn.addEventListener("click", async () => {
      const ok = await confirmModal({
        title: "Eliminare l'intervento?",
        message: "L'operazione non può essere annullata.",
        confirmLabel: "Elimina",
        danger: true,
      });
      if (!ok) return;
      try {
        await deleteAppointment(editId);
        showToast("Intervento eliminato.", "success");
        window.location.href = "dashboard.html";
      } catch (err) {
        showToast(`Errore: ${err.message}`, "error");
      }
    });
  }
});
