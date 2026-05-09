(function () {
  var form = document.getElementById("educactivo-contact-form");
  if (!form || !(form instanceof HTMLFormElement)) return;

  var statusEl = document.getElementById("educactivo-contact-status");
  var submitBtn = form.querySelector('button[type="submit"]');

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
    };

    fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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
        } else {
          var msg =
            (result.data && result.data.error) ||
            "No se pudo enviar. Probá de nuevo.";
          if (statusEl) {
            statusEl.textContent = msg;
            statusEl.className = "educactivo-form-status educactivo-form-status--err";
          }
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
