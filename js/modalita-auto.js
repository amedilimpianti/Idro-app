// ==========================================================================
// modalita-auto.js — ricerca vocale/testuale degli appuntamenti e avvio
// rapido della navigazione, pensata per l'uso mentre si è fermi in auto
// prima di partire (attivazione manuale, nessun rilevamento automatico).
// ==========================================================================

document.addEventListener("DOMContentLoaded", async () => {
  const session = await requireSession();
  if (!session) return;

  const micBtn = document.getElementById("mic-btn");
  const micHint = document.getElementById("mic-hint");
  const textForm = document.getElementById("auto-text-form");
  const textInput = document.getElementById("auto-text-input");
  const resultsEl = document.getElementById("auto-results");
  const statusEl = document.getElementById("auto-status");
  const chips = document.querySelectorAll(".auto-chip");

  // --- Riconoscimento vocale (solo Chrome/Android; non disponibile su iOS/Safari) ---
  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;

  if (SpeechRecognitionCtor) {
    recognition = new SpeechRecognitionCtor();
    recognition.lang = "it-IT";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.addEventListener("result", (e) => {
      const transcript = e.results[0][0].transcript;
      textInput.value = transcript;
      runQuery(transcript);
    });
    recognition.addEventListener("end", () => {
      micBtn.classList.remove("listening");
      micHint.textContent = 'Tocca e parla, es. "che appuntamento ho oggi"';
    });
    recognition.addEventListener("error", () => {
      micBtn.classList.remove("listening");
      micHint.textContent = "Non ho capito, riprova oppure scrivi qui sotto.";
    });

    micBtn.addEventListener("click", () => {
      try {
        clearActiveChips();
        micBtn.classList.add("listening");
        micHint.textContent = "Ti ascolto…";
        recognition.start();
      } catch (err) {
        micBtn.classList.remove("listening");
      }
    });
  } else {
    micHint.textContent = "Comando vocale non disponibile su questo dispositivo: usa il campo di testo qui sotto.";
    micBtn.disabled = true;
    micBtn.style.opacity = "0.35";
  }

  function speak(text) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "it-IT";
    window.speechSynthesis.speak(utter);
  }

  function clearActiveChips() {
    chips.forEach((c) => c.classList.remove("active"));
  }

  textForm.addEventListener("submit", (e) => {
    e.preventDefault();
    clearActiveChips();
    const q = textInput.value.trim();
    if (q) runQuery(q);
  });

  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      clearActiveChips();
      chip.classList.add("active");
      textInput.value = "";
      runQuery(chip.getAttribute("data-query"));
    });
  });

  // --- Interpretazione della domanda -------------------------------------
  function normalize(str) {
    return (str || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }
  function tomorrowIso() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  function shortDate(iso) {
    const [, m, d] = iso.split("-");
    return `${d}/${m}`;
  }

  async function runQuery(rawQuery) {
    const q = normalize(rawQuery);
    statusEl.textContent = "Cerco…";
    resultsEl.innerHTML = "";

    try {
      let raw = [];
      let mode = "list";

      if (/\bdoman/.test(q)) {
        raw = await fetchAppointments({ dateFrom: tomorrowIso(), dateTo: tomorrowIso() });
      } else if (/\boggi\b/.test(q)) {
        raw = await fetchAppointments({ dateFrom: todayIso(), dateTo: todayIso() });
      } else if (/prossim|successiv/.test(q)) {
        const nowDate = todayIso();
        const nowTime = new Date().toTimeString().slice(0, 5);
        const upcoming = await fetchAppointments({ dateFrom: nowDate });
        raw = upcoming
          .filter((a) => a.status !== "annullato")
          .filter((a) => a.appointment_date > nowDate || (a.appointment_date === nowDate && a.start_time.slice(0, 5) >= nowTime))
          .slice(0, 1);
        mode = "single";
      } else {
        const timeMatch = q.match(/\balle\s+(\d{1,2})([:.,](\d{2}))?/);
        const upcoming = await fetchAppointments({ dateFrom: todayIso() });
        let filtered = upcoming;

        if (timeMatch) {
          const hh = timeMatch[1].padStart(2, "0");
          filtered = filtered.filter((a) => a.start_time.slice(0, 2) === hh);
        }

        const stopWords = ["che", "appuntamento", "appuntamenti", "ho", "trova", "cerca", "con", "a", "alle", "di", "il", "la", "per", "intervento", "l'intervento", "quando"];
        const tokens = q
          .split(/\s+/)
          .filter((t) => t && !stopWords.includes(t) && !/^\d{1,2}([:.,]\d{2})?$/.test(t));

        if (tokens.length) {
          filtered = filtered.filter((a) => {
            const hay = normalize(`${a.client_name} ${a.address}`);
            return tokens.some((t) => hay.includes(t));
          });
        }
        raw = filtered;
      }

      const active = raw.filter((a) => a.status !== "annullato");
      renderResults(active, mode);
    } catch (err) {
      statusEl.textContent = "";
      resultsEl.innerHTML = `<div class="auto-empty">Errore nella ricerca: ${escapeHtml(err.message)}</div>`;
    }
  }

  function renderResults(appts, mode) {
    if (!appts.length) {
      statusEl.textContent = "";
      resultsEl.innerHTML = `<div class="auto-empty">Nessun appuntamento trovato.</div>`;
      speak("Nessun appuntamento trovato.");
      return;
    }

    const list = mode === "single" ? appts.slice(0, 1) : appts.slice(0, 8);
    statusEl.textContent = `${list.length} appuntament${list.length > 1 ? "i" : "o"} trovat${list.length > 1 ? "i" : "o"}`;

    resultsEl.innerHTML = list
      .map((a) => {
        const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(a.address)}&travelmode=driving`;
        return `
          <div class="auto-result-card">
            <div class="auto-result-time">${formatTime(a.start_time)} · ${shortDate(a.appointment_date)}</div>
            <div class="auto-result-client">${escapeHtml(a.client_name)}</div>
            <div class="auto-result-address">${escapeHtml(a.address)}</div>
            <div class="auto-result-actions">
              <a class="auto-navigate-btn" href="${navUrl}" target="_blank" rel="noopener">Naviga</a>
              ${a.client_phone ? `<a class="auto-call-btn" href="tel:${escapeHtml(a.client_phone)}">Chiama</a>` : ""}
            </div>
          </div>`;
      })
      .join("");

    if (list.length === 1) {
      const a = list[0];
      speak(`Alle ${formatTime(a.start_time)}, da ${a.client_name}, in ${a.address}.`);
    } else {
      speak(`Ho trovato ${list.length} appuntamenti.`);
    }
  }
});
