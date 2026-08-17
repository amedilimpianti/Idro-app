// ==========================================================================
// allegati.js — gestione di foto (prima/dopo) e documenti (fatture, ecc.)
// allegati a un intervento, tramite Supabase Storage. Include un modale
// fotocamera per scattare foto direttamente dal browser.
// ==========================================================================

const ALLEGATI_BUCKET = "allegati-interventi";

const CATEGORIE_ALLEGATI = {
  prima: { label: "Foto prima" },
  dopo: { label: "Foto dopo" },
  documento: { label: "Documenti" },
};

/** Carica un File su Supabase Storage sotto l'appuntamento indicato e
 * restituisce il descrittore da salvare in appointments.allegati (jsonb). */
async function caricaAllegato({ appointmentId, categoria, file }) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${appointmentId}/${categoria}/${Date.now()}-${safeName || `foto.${ext}`}`;

  const { error: uploadError } = await window.supabaseClient.storage
    .from(ALLEGATI_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type || "application/octet-stream" });
  if (uploadError) throw uploadError;

  const { data: publicUrlData } = window.supabaseClient.storage.from(ALLEGATI_BUCKET).getPublicUrl(path);

  return {
    id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    categoria,
    nome: file.name,
    path,
    url: publicUrlData.publicUrl,
    tipo: file.type || "",
    caricato_il: new Date().toISOString(),
  };
}

/** Rimuove un allegato sia dallo storage che dall'array passato (ritorna il nuovo array). */
async function rimuoviAllegato(allegati, allegatoId) {
  const target = allegati.find((a) => a.id === allegatoId);
  if (!target) return allegati;
  await window.supabaseClient.storage.from(ALLEGATI_BUCKET).remove([target.path]);
  return allegati.filter((a) => a.id !== allegatoId);
}

function isImmagine(allegato) {
  return (allegato.tipo || "").startsWith("image/");
}

const DOC_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>`;

/** Renderizza la griglia di anteprime per una categoria di allegati. */
function renderAttachGrid(container, allegati, categoria, { readOnly = false } = {}) {
  const items = allegati.filter((a) => a.categoria === categoria);
  if (!items.length) {
    container.innerHTML = `<div class="attach-empty">Nessun file in questa categoria.</div>`;
    return;
  }
  container.innerHTML = `<div class="attach-grid">${items
    .map(
      (a) => `
      <div class="attach-thumb" data-id="${a.id}">
        ${
          isImmagine(a)
            ? `<a href="${a.url}" target="_blank" rel="noopener"><img src="${a.url}" alt="${escapeHtml(a.nome)}" loading="lazy" /></a>`
            : `<a href="${a.url}" target="_blank" rel="noopener" class="doc-icon">${DOC_ICON_SVG}<span>${escapeHtml(a.nome)}</span></a>`
        }
        ${readOnly ? "" : `<button type="button" class="remove-attach" data-remove="${a.id}" title="Rimuovi">✕</button>`}
      </div>`
    )
    .join("")}</div>`;
}

// ---------------------------------------------------------------------------
// Modale fotocamera: apre lo stream video, permette di scattare e restituisce
// un File (JPEG) tramite Promise, oppure null se annullato.
// ---------------------------------------------------------------------------
function openCameraModal() {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal camera-modal" role="dialog" aria-modal="true">
        <h3>Scatta foto</h3>
        <div class="camera-video-wrap">
          <video autoplay playsinline muted></video>
          <canvas style="display:none;"></canvas>
        </div>
        <div class="camera-controls">
          <button type="button" class="btn btn-secondary" data-action="cancel">Annulla</button>
          <button type="button" class="camera-shutter" data-action="shutter" title="Scatta"></button>
          <button type="button" class="btn btn-primary" data-action="switch" title="Cambia fotocamera">↺</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add("open"));

    const video = backdrop.querySelector("video");
    const canvas = backdrop.querySelector("canvas");
    let stream = null;
    let facingMode = "environment";

    async function startStream() {
      stopStream();
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode }, audio: false });
        video.srcObject = stream;
      } catch (err) {
        backdrop.querySelector(".camera-video-wrap").innerHTML = `<div class="camera-error">Impossibile accedere alla fotocamera.<br>Verifica i permessi del browser, oppure carica una foto dal dispositivo.</div>`;
      }
    }
    function stopStream() {
      if (stream) stream.getTracks().forEach((t) => t.stop());
    }

    function close(result) {
      stopStream();
      backdrop.classList.remove("open");
      setTimeout(() => backdrop.remove(), 200);
      resolve(result);
    }

    backdrop.querySelector('[data-action="cancel"]').addEventListener("click", () => close(null));
    backdrop.querySelector('[data-action="switch"]').addEventListener("click", () => {
      facingMode = facingMode === "environment" ? "user" : "environment";
      startStream();
    });
    backdrop.querySelector('[data-action="shutter"]').addEventListener("click", () => {
      if (!video.videoWidth) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d").drawImage(video, 0, 0);
      canvas.toBlob(
        (blob) => {
          if (!blob) return close(null);
          const file = new File([blob], `foto-${Date.now()}.jpg`, { type: "image/jpeg" });
          close(file);
        },
        "image/jpeg",
        0.9
      );
    });
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close(null);
    });

    startStream();
  });
}
