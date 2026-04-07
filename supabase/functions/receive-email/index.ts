// Supabase Edge Function: webhook para Resend Inbound (correos recibidos).
// Resend envía POST con type "email.received" y data.email_id; obtenemos el contenido y lo guardamos.
// Secrets: RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const RESEND_API = "https://api.resend.com";

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors() });
  }
  const headers = { ...cors(), "Content-Type": "application/json" };

  try {
    const payload = await req.json();
    const eventType = payload?.type;
    const data = payload?.data;

    if (eventType !== "email.received" || !data?.email_id) {
      return new Response(
        JSON.stringify({ error: "Evento no válido o falta email_id" }),
        { status: 400, headers }
      );
    }

    const apiKey = Deno.env.get("RESEND_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!apiKey || !supabaseUrl || !serviceKey) {
      return new Response(
        JSON.stringify({ error: "Faltan RESEND_API_KEY, SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY" }),
        { status: 500, headers }
      );
    }

    // Obtener contenido del correo desde Resend
    const res = await fetch(`${RESEND_API}/emails/receiving/${data.email_id}`, {
      headers: { "Authorization": `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      const err = await res.text();
      return new Response(
        JSON.stringify({ error: "Resend get email failed: " + err }),
        { status: 502, headers }
      );
    }
    const email = await res.json();

    const fromEmail = typeof email.from === "string" ? email.from : email.from?.email || "";
    const toEmail = Array.isArray(email.to) ? email.to : [email.to].filter(Boolean);
    const subject = email.subject || "(sin asunto)";
    const bodyText = email.text || null;
    const bodyHtml = email.html || null;

    // Insertar en Supabase (inbound_emails)
    const insertRes = await fetch(`${supabaseUrl}/rest/v1/inbound_emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": serviceKey,
        "Authorization": `Bearer ${serviceKey}`,
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({
        resend_email_id: data.email_id,
        from_email: fromEmail,
        to_email: toEmail,
        subject,
        body_text: bodyText,
        body_html: bodyHtml,
        received_at: email.created_at || new Date().toISOString(),
      }),
    });

    if (!insertRes.ok) {
      const errText = await insertRes.text();
      return new Response(
        JSON.stringify({ error: "Supabase insert failed: " + errText }),
        { status: 502, headers }
      );
    }

    return new Response(JSON.stringify({ ok: true, id: data.email_id }), { status: 200, headers });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message || String(e) }),
      { status: 500, headers }
    );
  }
});
