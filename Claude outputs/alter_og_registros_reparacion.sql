-- =============================================================================
-- Agregar columnas de reparación por observación a og_registros
-- =============================================================================
-- Estas columnas permiten guardar la acción de reparación seleccionada
-- directamente en cada observación (usado para FALLA NO ESTANDARIZADA,
-- donde la reparación no viene del catálogo sino que se elige en terreno).

ALTER TABLE og_registros
  ADD COLUMN IF NOT EXISTS accion_reparacion TEXT,
  ADD COLUMN IF NOT EXISTS codigo_reparacion TEXT;

-- Verificar que se crearon
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'og_registros'
  AND column_name IN ('accion_reparacion', 'codigo_reparacion');
