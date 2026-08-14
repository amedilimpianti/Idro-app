// ==========================================================================
// auth.js — logica della pagina di login / registrazione (index.html)
// ==========================================================================

document.addEventListener("DOMContentLoaded", async () => {
  // Se l'utente ha già una sessione valida, salta direttamente alla dashboard.
  const { data } = await window.supabaseClient.auth.getSession();
  if (data.session) {
    window.location.href = "dashboard.html";
    return;
  }

  const form = document.getElementById("auth-form");
  const errorBox = document.getElementById("auth-error");
  const submitBtn = document.getElementById("auth-submit");
  const toggleBtn = document.getElementById("auth-toggle-btn");
  const toggleLabel = document.getElementById("auth-toggle-label");
  const nameField = document.getElementById("field-fullname");
  const formTitle = document.getElementById("auth-title");
  const formSub = document.getElementById("auth-sub");

  let mode = "login"; // "login" | "signup"

  function setMode(next) {
    mode = next;
    errorBox.style.display = "none";
    if (mode === "signup") {
      nameField.style.display = "block";
      formTitle.textContent = "Crea il tuo account";
      formSub.textContent = "Registra un nuovo operatore o addetto alla segreteria.";
      submitBtn.textContent = "Crea account";
      toggleLabel.textContent = "Hai già un account?";
      toggleBtn.textContent = "Accedi";
    } else {
      nameField.style.display = "none";
      formTitle.textContent = "Bentornato";
      formSub.textContent = "Accedi per gestire gli interventi di oggi.";
      submitBtn.textContent = "Accedi";
      toggleLabel.textContent = "Non hai un account?";
      toggleBtn.textContent = "Registrati";
    }
  }

  toggleBtn.addEventListener("click", () => setMode(mode === "login" ? "signup" : "login"));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorBox.style.display = "none";

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const fullName = document.getElementById("fullname").value.trim();

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span>';

    try {
      if (mode === "signup") {
        if (!fullName) throw new Error("Inserisci nome e cognome.");
        const { data: signupData, error } = await window.supabaseClient.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) throw error;

        // Crea la riga profilo collegata (in aggiunta al trigger SQL, come
        // rete di sicurezza lato client se il trigger non fosse attivo).
        if (signupData.user) {
          await window.supabaseClient.from("profiles").upsert({
            id: signupData.user.id,
            full_name: fullName,
            role: "operatore",
          });
        }

        if (!signupData.session) {
          showToast("Account creato. Controlla la mail per confermare l'accesso.", "success");
          setMode("login");
          submitBtn.disabled = false;
          submitBtn.textContent = "Accedi";
          return;
        }
      } else {
        const { error } = await window.supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }

      window.location.href = "dashboard.html";
    } catch (err) {
      errorBox.textContent = translateAuthError(err.message);
      errorBox.style.display = "block";
      submitBtn.disabled = false;
      submitBtn.textContent = mode === "signup" ? "Crea account" : "Accedi";
    }
  });

  function translateAuthError(msg) {
    if (!msg) return "Si è verificato un errore. Riprova.";
    if (msg.includes("Invalid login credentials")) return "Email o password non corrette.";
    if (msg.includes("User already registered")) return "Esiste già un account con questa email.";
    if (msg.includes("Password should be")) return "La password deve contenere almeno 6 caratteri.";
    return msg;
  }
});
