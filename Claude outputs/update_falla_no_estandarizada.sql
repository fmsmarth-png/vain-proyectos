-- =============================================================================
-- PASO 1: VERIFICAR — Ejecuta esto primero para ver qué filas se van a cambiar
-- =============================================================================
-- Busca observaciones en Muros > OTROS que tengan foto Y comentario,
-- y cuya tolerancia NO sea ya "FALLA NO ESTANDARIZADA"

SELECT
  id,
  elemento,
  ambiente,
  tolerancia,
  LEFT(comentario, 80) AS comentario_preview,
  foto_url IS NOT NULL AS tiene_foto
FROM og_registros
WHERE tipo_revision = 'MURO'
  AND subtipo_cod   = 'OTROS'
  AND foto_url      IS NOT NULL
  AND comentario    IS NOT NULL
  AND TRIM(comentario) <> ''
  AND tolerancia    <> 'FALLA NO ESTANDARIZADA'
ORDER BY id;


-- =============================================================================
-- PASO 2: ACTUALIZAR — Ejecuta esto SOLO después de revisar el resultado del PASO 1
-- =============================================================================
-- Cambia la tolerancia a "FALLA NO ESTANDARIZADA" en las filas identificadas

UPDATE og_registros
SET tolerancia = 'FALLA NO ESTANDARIZADA'
WHERE tipo_revision = 'MURO'
  AND subtipo_cod   = 'OTROS'
  AND foto_url      IS NOT NULL
  AND comentario    IS NOT NULL
  AND TRIM(comentario) <> ''
  AND tolerancia    <> 'FALLA NO ESTANDARIZADA';
