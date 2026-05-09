function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** @param {{ request: Request; env: { RESEND_API_KEY?: string; CONTACT_FROM?: string; CONTACT_TO?: string } }} context */
export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.RESEND_API_KEY || !env.CONTACT_FROM || !env.CONTACT_TO) {
    return Response.json(
      { ok: false, error: "Falta configuración del servidor (Resend)." },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  if (body.company) {
    return Response.json({ ok: true }, { status: 200 });
  }

  const name = String(body.name || "").trim();
  const phone = String(body.phone || "").trim();
  const email = String(body.email || "").trim();
  const institution = String(body.institution || "").trim();
  const message = String(body.message || "").trim();

  if (!name || !phone || !email || !institution || !message) {
    return Response.json(
      { ok: false, error: "Completá todos los campos obligatorios." },
      { status: 400 }
    );
  }

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailOk) {
    return Response.json({ ok: false, error: "El correo electrónico no es válido." }, { status: 400 });
  }

  const html = `
    <h1>Mensaje desde educactivo.com.ar</h1>
    <p><strong>Nombre:</strong> ${escapeHtml(name)}</p>
    <p><strong>Teléfono:</strong> ${escapeHtml(phone)}</p>
    <p><strong>Correo:</strong> ${escapeHtml(email)}</p>
    <p><strong>Institución:</strong> ${escapeHtml(institution)}</p>
    <p><strong>Mensaje:</strong></p>
    <pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(message)}</pre>
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.CONTACT_FROM,
      to: [env.CONTACT_TO],
      reply_to: email,
      subject: `Contacto web — ${name}`,
      html,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Resend error", res.status, errText);
    return Response.json(
      { ok: false, error: "No se pudo enviar el mensaje. Probá más tarde." },
      { status: 502 }
    );
  }

  return Response.json({ ok: true });
}
