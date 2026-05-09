function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** @param {{ RESEND_API_KEY?: string; CAPTCHA_SECRET?: string }} env */
function captchaSecret(env) {
  return (env.CAPTCHA_SECRET || env.RESEND_API_KEY || "").trim();
}

function b64urlFromBytes(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bytesFromB64url(s) {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacSha256B64url(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return b64urlFromBytes(new Uint8Array(sig));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

/**
 * GET → { ok, a, b, token } para mostrar suma en el formulario.
 * @param {{ request: Request; env: { RESEND_API_KEY?: string; CAPTCHA_SECRET?: string } }} context
 */
export async function onRequestGet(context) {
  const secret = captchaSecret(context.env);
  if (!secret) {
    return Response.json(
      { ok: false, error: "Falta secreto para el captcha (configurá CAPTCHA_SECRET o RESEND_API_KEY)." },
      { status: 500 }
    );
  }

  const a = 2 + Math.floor(Math.random() * 11);
  const b = 2 + Math.floor(Math.random() * 11);
  const exp = Math.floor(Date.now() / 1000) + 600;
  const payload = JSON.stringify({ a, b, exp });
  const sig = await hmacSha256B64url(secret, payload);
  const token = b64urlFromBytes(new TextEncoder().encode(payload)) + "." + sig;

  return new Response(JSON.stringify({ ok: true, a, b, token }), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  });
}

/**
 * @param {{ request: Request; env: { RESEND_API_KEY?: string; CONTACT_FROM?: string; CONTACT_TO?: string; CAPTCHA_SECRET?: string } }} context
 */
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

  const secret = captchaSecret(env);
  const captchaToken = String(body.captcha_token || "").trim();
  const captchaAnswer = String(body.captcha_answer || "").trim();

  if (!secret || !captchaToken || captchaAnswer === "") {
    return Response.json(
      { ok: false, error: "Completá la verificación (suma) y volvé a intentar." },
      { status: 400 }
    );
  }

  const dot = captchaToken.indexOf(".");
  if (dot < 1) {
    return Response.json({ ok: false, error: "Verificación inválida. Recargá la página." }, { status: 400 });
  }

  const payloadB64 = captchaToken.slice(0, dot);
  const sigGot = captchaToken.slice(dot + 1);
  let inner;
  try {
    inner = new TextDecoder().decode(bytesFromB64url(payloadB64));
  } catch {
    return Response.json({ ok: false, error: "Verificación inválida. Recargá la página." }, { status: 400 });
  }

  const sigWant = await hmacSha256B64url(secret, inner);
  if (!timingSafeEqual(sigGot, sigWant)) {
    return Response.json({ ok: false, error: "Verificación inválida. Recargá la página." }, { status: 400 });
  }

  let payloadObj;
  try {
    payloadObj = JSON.parse(inner);
  } catch {
    return Response.json({ ok: false, error: "Verificación inválida." }, { status: 400 });
  }

  const { a, b, exp } = payloadObj;
  if (
    typeof a !== "number" ||
    typeof b !== "number" ||
    typeof exp !== "number" ||
    !Number.isFinite(a) ||
    !Number.isFinite(b) ||
    !Number.isFinite(exp)
  ) {
    return Response.json({ ok: false, error: "Verificación inválida." }, { status: 400 });
  }

  if (Math.floor(Date.now() / 1000) > exp) {
    return Response.json(
      { ok: false, error: "La verificación expiró. Recargá la página e intentá de nuevo." },
      { status: 400 }
    );
  }

  const want = a + b;
  const got = parseInt(captchaAnswer, 10);
  if (!Number.isFinite(got) || got !== want) {
    return Response.json({ ok: false, error: "La suma no es correcta." }, { status: 400 });
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
