// ==========================================================================
// feedback.js — feedback aptico (vibrazione) e sonoro leggero per le
// interazioni principali dell'app. I suoni sono generati al volo (nessun
// file audio da caricare) e tutto è silenzioso/innocuo se il dispositivo o
// il browser non supporta vibrazione o Web Audio.
// ==========================================================================

const Feedback = (() => {
  let audioCtx = null;

  function getAudioCtx() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }
    return audioCtx;
  }

  function vibrate(pattern) {
    if (navigator.vibrate) {
      try {
        navigator.vibrate(pattern);
      } catch (err) {
        /* dispositivo senza supporto: nessun problema */
      }
    }
  }

  function tone({ freq = 440, duration = 90, type = "sine", gain = 0.05, delay = 0 }) {
    const ctx = getAudioCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    const startAt = ctx.currentTime + delay;
    gainNode.gain.setValueAtTime(0, startAt);
    gainNode.gain.linearRampToValueAtTime(gain, startAt + 0.012);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + duration / 1000);

    osc.start(startAt);
    osc.stop(startAt + duration / 1000 + 0.03);
  }

  return {
    /** Tocco leggero: pulsanti, link, voci di navigazione. Solo vibrazione, niente suono. */
    tap() {
      vibrate(8);
    },
    /** Operazione riuscita: salvataggio, creazione, eliminazione confermata. */
    success() {
      vibrate([12, 40, 12]);
      tone({ freq: 520, duration: 90, gain: 0.05 });
      tone({ freq: 780, duration: 130, gain: 0.05, delay: 0.08 });
    },
    /** Errore o operazione fallita. */
    error() {
      vibrate([25, 60, 25]);
      tone({ freq: 220, duration: 170, type: "square", gain: 0.04 });
    },
    /** Avviso: apertura di un modale di conferma per un'azione delicata/distruttiva. */
    warning() {
      vibrate(18);
      tone({ freq: 340, duration: 110, gain: 0.045 });
    },
  };
})();

// Feedback tattile leggero su ogni interazione con elementi cliccabili
// principali: una vibrazione molto breve, senza suono (per non essere
// invadente ad ogni singolo tocco dell'interfaccia).
document.addEventListener(
  "click",
  (e) => {
    const target = e.target.closest(
      "button, .btn, a.nav-link, .bottom-nav a, .auto-chip, .auto-mic-btn, .settings-accordion summary, .filter-toggle-btn, [data-scope]"
    );
    if (target && !target.disabled) Feedback.tap();
  },
  { passive: true }
);
