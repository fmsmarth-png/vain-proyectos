import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// FIX seguridad (sep 2026): CORS restringido a orígenes conocidos
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

// Máximo ~7.5 MB decodificado (10 MB en base64)
const MAX_PDF_BASE64_LENGTH = 10_000_000;

function extractTextFromPdf(pdfBase64: string): string {
  const binaryString = atob(pdfBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  let text = "";
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if ((byte >= 32 && byte <= 126) || byte === 10 || byte === 13) {
      text += String.fromCharCode(byte);
    }
  }
  return text;
}

serve(async (req) => {
  const headers = corsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "POST only" }), { 
      status: 405,
      headers: { "Content-Type": "application/json", ...headers },
    });
  }

  try {
    const body = await req.json();
    const { pdfBase64 } = body;

    if (!pdfBase64) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing pdfBase64" }),
        { status: 400, headers: { "Content-Type": "application/json", ...headers } }
      );
    }

    // Validación de tamaño (sep 2026)
    if (typeof pdfBase64 !== 'string' || pdfBase64.length > MAX_PDF_BASE64_LENGTH) {
      return new Response(
        JSON.stringify({ success: false, error: "PDF demasiado grande (máx ~7.5 MB)" }),
        { status: 413, headers: { "Content-Type": "application/json", ...headers } }
      );
    }

    const text = extractTextFromPdf(pdfBase64);

    // Extraer metadatos
    const propMatch = text.match(/Propietario:\s*([^\n]+)/i);
    const propietario = propMatch ? propMatch[1].trim() : "";

    const condMatch = text.match(/Condominio:\s*([^\n]+)/i);
    const condominio = condMatch ? condMatch[1].trim() : "";

    const deptoMatch = text.match(/N[°o]?\s*Departamento:\s*([^\n]+)/i);
    const depto = deptoMatch ? deptoMatch[1].trim() : "";

    const edifMatch = text.match(/Edificio:\s*([^\n]+)/i);
    const torre = edifMatch ? edifMatch[1].trim() : "";

    const fechaMatch = text.match(/Fecha[^:]*:\s*(\d{2}\/\d{2}\/\d{4})/i);
    const fecha = fechaMatch ? fechaMatch[1].trim() : "";

    // Buscar tabla - líneas que empiezan con número + ambiente + descripción
    const observations = [];
    const lines = text.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Buscar líneas que empiezan con 1, 2, 3, etc + texto
      if (/^\d+\s+[A-ZÁÉÍÓÚ]/.test(trimmed)) {
        // Partir por espacio múltiple
        const parts = trimmed.split(/\s{2,}/);
        
        if (parts.length >= 2) {
          // parts[0] = "1 COCINA" o similar
          // parts[1+] = descripción
          
          const firstPart = parts[0].trim();
          const numMatch = firstPart.match(/^\d+/);
          const ambMatch = firstPart.match(/\d+\s+(.+)$/);
          const ambiente = ambMatch ? ambMatch[1].trim() : "";
          
          const descripcion = parts.slice(1).join(' ').trim();
          
          if (ambiente && descripcion && descripcion.length > 5) {
            observations.push({
              condominio,
              torre,
              depto,
              propietario,
              fecha,
              descripcion,
            });
          }
        }
      }
    }

    if (observations.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "No observations extracted",
          // textPreview removido (sep 2026): exponía contenido interno del PDF
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...headers } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        observations,
        count: observations.length
      }),
      { headers: { "Content-Type": "application/json", ...headers } }
    );
  } catch (error) {
    console.error('extract_pdf_observations error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Error procesando el PDF",
      }),
      { status: 500, headers: { "Content-Type": "application/json", ...headers } }
    );
  }
});
