(function () {
  var form = document.getElementById("educactivo-contact-form");
  if (!form || !(form instanceof HTMLFormElement)) return;

  var statusEl = document.getElementById("educactivo-contact-status");
  var submitBtn = form.querySelector('button[type="submit"]');
  var qEl = document.getElementById("ecf-captcha-q");
  var tokenInput = document.getElementById("ecf-captcha-token");
  var answerInput = document.getElementById("ecf-captcha");

  function loadChallenge() {
    if (!tokenInput || !answerInput || !qEl) return Promise.resolve();

    return fetch("/api/contact", { method: "GET", cache: "no-store" })
      .then(function (r) {
        return r.json().then(function (data) {
          return { ok: r.ok, data: data };
        });
      })
      .then(function (out) {
        if (!out.ok || !out.data || !out.data.ok || !out.data.token) {
          throw new Error(out.data && out.data.error ? out.data.error : "Captcha");
        }
        qEl.textContent = String(out.data.a) + " + " + String(out.data.b);
        tokenInput.value = out.data.token;
        answerInput.value = "";
      });
  }

  loadChallenge().catch(function () {
    if (qEl) qEl.textContent = "…";
    if (statusEl) {
      statusEl.textContent =
        "No se pudo cargar la verificación. Recargá la página o probá más tarde.";
      statusEl.className = "educactivo-form-status educactivo-form-status--err";
    }
    if (submitBtn) submitBtn.disabled = true;
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (statusEl) {
      statusEl.textContent = "";
      statusEl.className = "educactivo-form-status";
    }
    if (submitBtn) submitBtn.disabled = true;

    var fd = new FormData(form);
    var payload = {
      name: String(fd.get("name") || "").trim(),
      phone: String(fd.get("phone") || "").trim(),
      email: String(fd.get("email") || "").trim(),
      institution: String(fd.get("institution") || "").trim(),
      message: String(fd.get("message") || "").trim(),
      company: String(fd.get("company") || "").trim(),
      captcha_token: String(fd.get("captcha_token") || "").trim(),
      captcha_answer: String(fd.get("captcha_answer") || "").trim(),
    };

    fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    })
      .then(function (r) {
        return r.json().then(function (data) {
          return { ok: r.ok, data: data };
        });
      })
      .then(function (result) {
        if (result.ok && result.data && result.data.ok) {
          if (statusEl) {
            statusEl.textContent = "Gracias, tu mensaje fue enviado.";
            statusEl.className = "educactivo-form-status educactivo-form-status--ok";
          }
          form.reset();
          return loadChallenge();
        } else {
          var msg =
            (result.data && result.data.error) ||
            "No se pudo enviar. Probá de nuevo.";
          if (statusEl) {
            statusEl.textContent = msg;
            statusEl.className = "educactivo-form-status educactivo-form-status--err";
          }
          return loadChallenge();
        }
      })
      .catch(function () {
        if (statusEl) {
          statusEl.textContent = "Error de red. Revisá tu conexión.";
          statusEl.className = "educactivo-form-status educactivo-form-status--err";
        }
      })
      .finally(function () {
        if (submitBtn) submitBtn.disabled = false;
      });
  });
})();
