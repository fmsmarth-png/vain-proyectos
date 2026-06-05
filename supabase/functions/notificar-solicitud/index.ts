// @ts-nocheck
Deno.serve(async (req) => {
  try {
    const { record } = await req.json()

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 're_gxPJsyHc_QEzeMXzqRGkY8f5quqKi7orn',
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
              <tr><td style="padding: 8px; color: #666;">👤 Nombre</td><td style="padding: 8px;"><strong>${record.nombre}</strong></td></tr>
              <tr style="background:#f9f9f9"><td style="padding: 8px; color: #666;">📧 Correo</td><td style="padding: 8px;">${record.email}</td></tr>
              <tr><td style="padding: 8px; color: #666;">💼 Cargo</td><td style="padding: 8px;">${record.rol?.replace('_', ' ')}</td></tr>
              <tr style="background:#f9f9f9"><td style="padding: 8px; color: #666;">🏗️ Proyecto</td><td style="padding: 8px;">${record.proyecto_solicitado ?? 'No especificado'}</td></tr>
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
    console.log('Resend response:', JSON.stringify(data))

    return new Response(JSON.stringify({ ok: true, data }), { status: 200 })
  } catch (e) {
    console.error('Error:', e.message)
    return new Response(JSON.stringify({ error: e.message }), { status: 500 })
  }
})