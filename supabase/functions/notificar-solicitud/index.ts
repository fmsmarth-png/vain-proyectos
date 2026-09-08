// @ts-nocheck
// ============================================================================
// FIX seguridad (sep 2026):
//   1. API key de Resend movida a Supabase secrets (ya NO está en código)
//      → Ejecutar: supabase secrets set RESEND_API_KEY=re_TU_NUEVA_KEY
//   2. HTML escaping para evitar XSS en emails
//   3. CORS restringido a orígenes conocidos
// ============================================================================

const ALLOWED_ORIGINS = [
  'https://swjmqtnhdtiwopexbezx.supabase.co',
  'capacitor://localhost',
  'http://localhost',
];

function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, authorization, x-client-info, apikey',
  };
}

/** Escapa HTML para evitar inyección XSS en el email */
const esc = (s: string | null | undefined): string =>
  (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }

  try {
    const RESEND_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_KEY) {
      throw new Error('RESEND_API_KEY no configurada en secrets');
    }

    const { record } = await req.json()

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'VAIN Detalles <onboarding@resend.dev>',
        to: ['fmsmarth@gmail.com'],
        subject: '🔔 Nueva solicitud de acceso — VAIN Detalles',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
            <h2 style="color: #1e3a5f;">Nueva solicitud de acceso</h2>
            <p>Un usuario ha solicitado acceso a <strong>VAIN Detalles</strong>:</p>
            <table style="width:100%; border-collapse: collapse; margin-top: 16px;">
              <tr><td style="padding: 8px; color: #666;">👤 Nombre</td><td style="padding: 8px;"><strong>${esc(record.nombre)}</strong></td></tr>
              <tr style="background:#f9f9f9"><td style="padding: 8px; color: #666;">📧 Correo</td><td style="padding: 8px;">${esc(record.email)}</td></tr>
              <tr><td style="padding: 8px; color: #666;">💼 Cargo</td><td style="padding: 8px;">${esc(record.rol?.replace('_', ' '))}</td></tr>
              <tr style="background:#f9f9f9"><td style="padding: 8px; color: #666;">🏗️ Proyecto</td><td style="padding: 8px;">${esc(record.proyecto_solicitado) || 'No especificado'}</td></tr>
            </table>
            <p style="margin-top: 24px; color: #666; font-size: 13px;">
              Entra a la app → Admin → Usuarios para aprobar o rechazar la solicitud.
            </p>
            <div style="margin-top: 8px; font-size: 11px; color: #aaa;">&lt;FMS&gt; · VAIN Detalles</div>
          </div>
        `
      })
    })

    const data = await res.json()

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    })
  } catch (e) {
    console.error('Error:', e.message)
    return new Response(JSON.stringify({ error: 'Error interno' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    })
  }
})