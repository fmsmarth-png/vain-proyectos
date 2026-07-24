import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, authorization, x-client-info, apikey',
};

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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "POST only" }), { 
      status: 405,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  try {
    const body = await req.json();
    const { pdfBase64 } = body;

    if (!pdfBase64) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing pdfBase64" }),
        { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
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
          textPreview: text.substring(0, 2000)
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        observations,
        count: observations.length
      }),
      { headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }
});
