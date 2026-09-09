# Sesion OG Catalogo - Tolerancias Muros

**Fecha:** 2026-09-08
**Proyecto:** App Detalles (Ionic React + Capacitor)
**Backend:** Supabase (`swjmqtnhdtiwopexbezx.supabase.co`)

---

## Contexto

La app de inspecciones OG maneja tolerancias de obra gruesa para muros. La tabla `og_catalogo` almacena las combinaciones de `elemento`, `revision`, `item_revision`, `tolerancia`, `ambiente` y `fase` que definen qué opciones aparecen en cada pantalla de inspección.

Los muros tienen 3 tipos de tolerancia (tabs): **PLANEIDAD**, **CORNISA** y **OTROS**.

---

## Cambios realizados

### 1. CORNISA faltante en MURO TABLERO (Acceso)

Se detectó que 2 elementos de MURO TABLERO en ambiente Acceso no tenían la opción CORNISA disponible.

- `MURO TABLERO TRAMO 1` — Acceso
- `MURO TABLERO TRAMO 2` — Acceso

**Tolerancia insertada:** `PRETUBERANCIA +6MM`, fase `OBRA GRUESA`.

### 2. CORNISA faltante en TABIQUE Dormitorio 1 (Pasillo)

Los elementos TABIQUE Dormitorio 1 tenían CORNISA solo en ambiente "Baño Dormitorio 1" pero no en "Pasillo". Se agregaron:

- `TABIQUE Dormitorio 1 TRAMO 1` — Pasillo
- `TABIQUE Dormitorio 1 TRAMO 2` — Pasillo

### 3. Nueva tolerancia: FALLA NO ESTANDARIZADA

Se agregó una nueva opción de tolerancia bajo **Muros > OTROS** para todos los elementos de muro (119 combinaciones elemento/ambiente):

| Campo | Valor |
|---|---|
| `revision` | MURO |
| `item_revision` | OTROS |
| `tolerancia` | FALLA NO ESTANDARIZADA |
| `fase` | OBRA GRUESA |
| `activo` | true |

### 4. Validacion en codigo (RevisionOGAmbiente.tsx)

Se modificó `src/pages/RevisionOGAmbiente.tsx` para que al seleccionar "FALLA NO ESTANDARIZADA":

- **Foto obligatoria** — no deja guardar sin foto
- **Comentario obligatorio** — no deja guardar sin comentario
- Los labels de FOTO y COMENTARIO cambian a *"(obligatorio)"* en rojo

```typescript
const esFallaNoEstandarizada = tolSel.toUpperCase().includes('FALLA NO ESTANDARIZADA');

if (esFallaNoEstandarizada) {
  if (!fotoBlob) {
    setStatus({ msg: 'Falla no estandarizada requiere foto obligatoria', ok: false });
    return;
  }
  if (!comentario.trim()) {
    setStatus({ msg: 'Falla no estandarizada requiere comentario obligatorio', ok: false });
    return;
  }
}
```

---

## Lecciones y notas tecnicas

### Cache local (Ogcache.ts)

La app cachea `og_catalogo` en localStorage con TTL de 24 horas. Despues de cambios en la base de datos, hay que limpiar manualmente:

```
localStorage.removeItem('og_catalogo_cache');
localStorage.removeItem('og_cache_timestamp');
```

Y recargar la app.

### RLS bloquea INSERTs con anon key

La tabla `og_catalogo` tiene Row Level Security habilitado. Los INSERTs via API con la clave anon fallan con error `42501`. Los cambios de datos deben ejecutarse directamente en el **SQL Editor de Supabase Dashboard**.

### Limite de 1000 filas en Supabase REST

Por defecto Supabase retorna maximo 1000 filas. Si la tabla tiene mas (og_catalogo tiene ~1500+), hay que paginar con `offset` y `limit`, o usar `range` headers.

### Filtrado por ambiente

Las tolerancias de MURO se filtran por `ambiente` en la query de la app. Un elemento puede tener CORNISA en un ambiente pero no en otro — hay que verificar por cada combinacion elemento+ambiente.

### Duplicados por SQL ejecutado dos veces

Si se ejecuta un INSERT dos veces en el SQL Editor, se generan duplicados. Para limpiar se puede usar `ROW_NUMBER()` con window function:

```sql
DELETE FROM og_catalogo
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY elemento, revision, item_revision, tolerancia, ambiente, fase
      ORDER BY id
    ) AS rn
    FROM og_catalogo
    WHERE tolerancia = 'VALOR'
  ) sub
  WHERE rn > 1
);
```

---

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `src/pages/RevisionOGAmbiente.tsx` | Validacion foto+comentario obligatorios para FALLA NO ESTANDARIZADA |

## Estado final verificado

- FALLA NO ESTANDARIZADA: 119 filas, 0 duplicados
- CORNISA MURO TABLERO: 2 filas, 0 duplicados
- Cambio de codigo pendiente de build/deploy

---

#vain #detalles-app #og #supabase #tolerancias
