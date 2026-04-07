// Supabase Edge Function: envía correo vía Resend.
// La API Key se configura en Supabase: Project Settings → Edge Functions → Secrets → RESEND_API_KEY

const RESEND_API = "https://api.resend.com/emails";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }
  const headers = { ...corsHeaders(), "Content-Type": "application/json" };

  try {
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY no configurada en Supabase Secrets" }),
        { status: 500, headers }
      );
    }

    const body = await req.json();
    const { to, subject, html, text, from } = body || {};
    if (!to || !subject) {
      return new Response(
        JSON.stringify({ error: "Faltan 'to' o 'subject'" }),
        { status: 400, headers }
      );
    }

    const toList = Array.isArray(to) ? to : [to];
    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: from || "SSEPI <onboarding@resend.dev>",
        to: toList,
        subject,
        html: html || (text ? undefined : "<p>Sin contenido.</p>"),
        text: text || undefined,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: data.message || data || "Error Resend" }),
        { status: res.status, headers }
      );
    }
    return new Response(JSON.stringify({ id: data.id, ok: true }), { status: 200, headers });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message || String(e) }),
      { status: 500, headers }
    );
  }
});

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}
