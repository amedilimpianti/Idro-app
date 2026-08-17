// ==========================================================================
// impostazioni.js — pagina Impostazioni: eliminazione singola o massiva
// degli appuntamenti (futuri, passati, o tutti).
// ==========================================================================

document.addEventListener("DOMContentLoaded", async () => {
  const session = await requireSession();
  if (!session) return;

  setActiveNav();
  let profile = await getCurrentProfile();
  mountUserCard(profile);

  // --- Sezione Account: foto profilo e nome -------------------------------
  const avatarInput = document.getElementById("avatar-input");
  const fullnameInput = document.getElementById("account-fullname");
  const saveAccountBtn = document.getElementById("save-account-btn");

  fullnameInput.value = profile?.full_name || "";

  avatarInput.addEventListener("change", async () => {
    const file = avatarInput.files[0];
    if (!file) return;
    try {
      profile = await uploadAvatar(file);
      mountUserCard(profile);
      showToast("Foto profilo aggiornata.", "success");
    } catch (err) {
      showToast(`Errore: ${err.message}`, "error");
    } finally {
      avatarInput.value = "";
    }
  });

  saveAccountBtn.addEventListener("click", async () => {
    const name = fullnameInput.value.trim();
    if (!name) {
      showToast("Inserisci nome e cognome.", "error");
      return;
    }
    try {
      profile = await updateProfileName(name);
      mountUserCard(profile);
      showToast("Dati account aggiornati.", "success");
    } catch (err) {
      showToast(`Errore: ${err.message}`, "error");
    }
  });

  // --- Sicurezza account: email e password ---------------------------------
  const emailInput = document.getElementById("account-email");
  const saveEmailBtn = document.getElementById("save-email-btn");
  const passwordInput = document.getElementById("account-password");
  const passwordConfirmInput = document.getElementById("account-password-confirm");
  const savePasswordBtn = document.getElementById("save-password-btn");

  const { data: { user } } = await window.supabaseClient.auth.getUser();
  if (user) emailInput.value = user.email || "";

  saveEmailBtn.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    if (!email) {
      showToast("Inserisci un'email valida.", "error");
      return;
    }
    try {
      const { error } = await window.supabaseClient.auth.updateUser({ email });
      if (error) throw error;
      showToast("Controlla la nuova casella email per confermare il cambio.", "success");
    } catch (err) {
      showToast(`Errore: ${err.message}`, "error");
    }
  });

  savePasswordBtn.addEventListener("click", async () => {
    const pwd = passwordInput.value;
    const pwd2 = passwordConfirmInput.value;
    if (!pwd || pwd.length < 6) {
      showToast("La password deve contenere almeno 6 caratteri.", "error");
      return;
    }
    if (pwd !== pwd2) {
      showToast("Le due password non coincidono.", "error");
      return;
    }
    try {
      const { error } = await window.supabaseClient.auth.updateUser({ password: pwd });
      if (error) throw error;
      showToast("Password aggiornata.", "success");
      passwordInput.value = "";
      passwordConfirmInput.value = "";
    } catch (err) {
      showToast(`Errore: ${err.message}`, "error");
    }
  });

  const listContainer = document.getElementById("bulk-list-container");
  const showListBtn = document.getElementById("show-list-btn");
  const deleteSelectedBtn = document.getElementById("delete-selected-btn");

  let allAppointments = [];
  let listVisible = false;

  showListBtn.addEventListener("click", async () => {
    listVisible = !listVisible;
    if (listVisible) {
      await loadList();
      listContainer.style.display = "block";
      showListBtn.textContent = "Nascondi elenco";
    } else {
      listContainer.style.display = "none";
      showListBtn.textContent = "Seleziona singolarmente";
    }
  });

  async function loadList() {
    listContainer.innerHTML = `<div class="page-loader"><span class="spinner"></span></div>`;
    try {
      allAppointments = await fetchAppointments({});
      renderList();
    } catch (err) {
      listContainer.innerHTML = `<p>Errore nel caricamento: ${escapeHtml(err.message)}</p>`;
    }
  }

  function renderList() {
    if (!allAppointments.length) {
      listContainer.innerHTML = `<p>Nessun appuntamento presente.</p>`;
      return;
    }
    listContainer.innerHTML = `
      <label class="bulk-row" style="background:var(--surface-2);">
        <input type="checkbox" id="select-all-checkbox" />
        <span class="bulk-client">Seleziona tutti (${allAppointments.length})</span>
      </label>
      <div class="bulk-list">
        ${allAppointments
          .map(
            (a) => `
          <label class="bulk-row">
            <input type="checkbox" class="appt-checkbox" value="${a.id}" />
            <span class="bulk-client">${escapeHtml(a.client_name)} — ${escapeHtml(a.address)}</span>
            <span class="bulk-date">${formatDateIt(a.appointment_date)} · ${formatTime(a.start_time)}</span>
          </label>`
          )
          .join("")}
      </div>
    `;
    document.getElementById("select-all-checkbox").addEventListener("change", (e) => {
      document.querySelectorAll(".appt-checkbox").forEach((cb) => (cb.checked = e.target.checked));
    });
  }

  deleteSelectedBtn.addEventListener("click", async () => {
    const selected = Array.from(document.querySelectorAll(".appt-checkbox:checked")).map((cb) => cb.value);
    if (!selected.length) {
      showToast("Seleziona almeno un appuntamento.", "error");
      return;
    }
    const ok = await confirmModal({
      title: `Eliminare ${selected.length} appuntamenti?`,
      message: "L'operazione non può essere annullata.",
      confirmLabel: "Elimina selezionati",
      danger: true,
    });
    if (!ok) return;
    try {
      const { deleted, total } = await deleteAppointmentsBulk(selected);
      if (deleted < total) {
        showToast(`Eliminati ${deleted} di ${total}: gli altri sono di un altro operatore, solo un admin può rimuoverli.`, "error");
      } else {
        showToast("Appuntamenti eliminati.", "success");
      }
      await loadList();
    } catch (err) {
      showToast(`Errore: ${err.message}`, "error");
    }
  });

  document.getElementById("delete-future-btn").addEventListener("click", async () => {
    const ok = await confirmModal({
      title: "Eliminare tutti gli appuntamenti futuri?",
      message: "Verranno eliminati tutti gli interventi con data odierna o successiva. L'operazione non può essere annullata.",
      confirmLabel: "Elimina futuri",
      danger: true,
    });
    if (!ok) return;
    try {
      const { deleted, total } = await deleteAppointmentsByTimeframe("future");
      if (deleted < total) {
        showToast(`Eliminati ${deleted} di ${total}: gli altri sono di un altro operatore, solo un admin può rimuoverli.`, "error");
      } else {
        showToast("Appuntamenti futuri eliminati.", "success");
      }
      if (listVisible) await loadList();
    } catch (err) {
      showToast(`Errore: ${err.message}`, "error");
    }
  });

  document.getElementById("delete-past-btn").addEventListener("click", async () => {
    const ok = await confirmModal({
      title: "Eliminare tutti gli appuntamenti passati?",
      message: "Verranno eliminati tutti gli interventi con data precedente a oggi. L'operazione non può essere annullata.",
      confirmLabel: "Elimina passati",
      danger: true,
    });
    if (!ok) return;
    try {
      const { deleted, total } = await deleteAppointmentsByTimeframe("past");
      if (deleted < total) {
        showToast(`Eliminati ${deleted} di ${total}: gli altri sono di un altro operatore, solo un admin può rimuoverli.`, "error");
      } else {
        showToast("Appuntamenti passati eliminati.", "success");
      }
      if (listVisible) await loadList();
    } catch (err) {
      showToast(`Errore: ${err.message}`, "error");
    }
  });

  // --- Sezione Gestione utenti (solo admin) --------------------------------
  const ROLE_PRESETS = ["Operaio", "Titolare"];
  const usersSection = document.getElementById("users-section");
  const usersListContainer = document.getElementById("users-list-container");

  if (profile && profile.role === "admin") {
    usersSection.style.display = "";
    loadUsersList();
  }

  async function loadUsersList() {
    usersListContainer.innerHTML = `<div class="page-loader"><span class="spinner"></span></div>`;
    try {
      const users = await fetchAllProfiles();
      renderUsersList(users);
    } catch (err) {
      usersListContainer.innerHTML = `<p>Errore nel caricamento: ${escapeHtml(err.message)}</p>`;
    }
  }

  function renderUsersList(users) {
    if (!users.length) {
      usersListContainer.innerHTML = `<p>Nessun utente registrato.</p>`;
      return;
    }
    usersListContainer.innerHTML = users
      .map((u) => {
        const isPreset = ROLE_PRESETS.includes(u.role);
        return `
        <div class="user-role-row" data-user-id="${u.id}">
          <div class="who">
            <span class="avatar">${avatarInner(u)}</span>
            <span class="name">${escapeHtml(u.full_name || "Utente")}</span>
          </div>
          <div class="user-role-controls">
            <select class="role-select">
              <option value="Operaio" ${u.role === "Operaio" ? "selected" : ""}>Operaio</option>
              <option value="Titolare" ${u.role === "Titolare" ? "selected" : ""}>Titolare</option>
              <option value="__altro__" ${!isPreset ? "selected" : ""}>Altro (libero)</option>
            </select>
            <input type="text" class="role-custom-input" placeholder="Ruolo personalizzato" value="${!isPreset ? escapeHtml(u.role || "") : ""}" style="${!isPreset ? "" : "display:none;"}" />
            <button type="button" class="btn btn-sm btn-secondary role-save-btn">Salva</button>
          </div>
        </div>`;
      })
      .join("");

    usersListContainer.querySelectorAll(".user-role-row").forEach((row) => {
      const select = row.querySelector(".role-select");
      const customInput = row.querySelector(".role-custom-input");
      const saveBtn = row.querySelector(".role-save-btn");
      const userId = row.getAttribute("data-user-id");

      select.addEventListener("change", () => {
        customInput.style.display = select.value === "__altro__" ? "" : "none";
        if (select.value === "__altro__") customInput.focus();
      });

      saveBtn.addEventListener("click", async () => {
        const role = select.value === "__altro__" ? customInput.value.trim() : select.value;
        if (!role) {
          showToast("Inserisci un ruolo valido.", "error");
          return;
        }
        try {
          await adminUpdateUserRole(userId, role);
          showToast("Ruolo aggiornato.", "success");
        } catch (err) {
          showToast(`Errore: ${err.message}`, "error");
        }
      });
    });
  }

  document.getElementById("delete-all-btn").addEventListener("click", async () => {
    const ok = await confirmModalTyped({
      title: "Eliminare TUTTI gli appuntamenti?",
      message: "Questa azione cancella l'intero storico appuntamenti dell'azienda, inclusi allegati collegati. Non può essere annullata.",
      confirmWord: "ELIMINA",
      confirmLabel: "Elimina tutto",
    });
    if (!ok) return;
    try {
      const { deleted, total } = await deleteAllAppointments();
      if (deleted < total) {
        showToast(`Eliminati ${deleted} di ${total}: gli altri sono di un altro operatore, solo un admin può rimuoverli.`, "error");
      } else {
        showToast("Tutti gli appuntamenti sono stati eliminati.", "success");
      }
      if (listVisible) await loadList();
    } catch (err) {
      showToast(`Errore: ${err.message}`, "error");
    }
  });
});
