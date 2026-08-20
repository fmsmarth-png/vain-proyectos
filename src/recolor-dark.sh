#!/usr/bin/env bash
#
# recolor-dark.sh
# Convierte el modo oscuro "negro" al nuevo modo oscuro "navy azul" en TODAS
# las páginas/componentes .tsx del proyecto, dejando el tema CLARO intacto.
#
# Uso:
#   1) Copia este archivo a la raíz de tu proyecto (junto a package.json).
#   2) Ejecuta:  bash recolor-dark.sh
#   3) Revisa los cambios con:  git diff   (¡commitea antes por si acaso!)
#
# Seguridad: hace una copia de respaldo de cada archivo modificado en la
# carpeta .backup-recolor/ antes de tocarlo.

set -euo pipefail

# Carpeta donde están tus componentes/páginas. Ajusta si tu código no está en src/
SRC_DIR="${1:-src}"

if [ ! -d "$SRC_DIR" ]; then
  echo "❌ No existe la carpeta '$SRC_DIR'. Pásala como argumento: bash recolor-dark.sh ruta/a/src"
  exit 1
fi

BACKUP_DIR=".backup-recolor"
mkdir -p "$BACKUP_DIR"

echo "🔍 Buscando archivos .tsx en '$SRC_DIR'..."
FILES=$(grep -rl --include="*.tsx" -E "#000000|#0e0e0e|#141414|#181818|#1a1a1a|#1e1e1e|#2a2a2a|#161616|'#111'|'#000'|'#111111'" "$SRC_DIR" || true)

if [ -z "$FILES" ]; then
  echo "✅ No se encontraron colores negros que convertir. ¿Ya estaba aplicado?"
  exit 0
fi

echo "📝 Archivos a modificar:"
echo "$FILES" | sed 's/^/   - /'
echo ""

for f in $FILES; do
  # respaldo preservando la ruta relativa
  mkdir -p "$BACKUP_DIR/$(dirname "$f")"
  cp "$f" "$BACKUP_DIR/$f"

  # --- Mapeo negro -> navy (6 dígitos primero para evitar solapamientos) ---
  sed -i \
    -e 's/#000000/#0B1220/g' \
    -e 's/#0e0e0e/#16233B/g' \
    -e 's/#0E0E0E/#16233B/g' \
    -e 's/#141414/#1B2C48/g' \
    -e 's/#181818/#1B2C48/g' \
    -e 's/#161616/#1E2E4A/g' \
    -e 's/#1a1a1a/#1E2E4A/g' \
    -e 's/#1A1A1A/#1E2E4A/g' \
    -e 's/#1e1e1e/#243550/g' \
    -e 's/#1E1E1E/#243550/g' \
    -e 's/#2a2a2a/#2E4468/g' \
    -e 's/#2A2A2A/#2E4468/g' \
    -e 's/#111111/#1B2C48/g' \
    -e 's/#444444/#5D728F/g' \
    "$f"

  # --- Formas cortas de 3 dígitos (usan \b para no romper hexes largos) ---
  sed -i \
    -e "s/#111\b/#16233B/g" \
    -e "s/#222\b/#26395C/g" \
    -e "s/#444\b/#5D728F/g" \
    -e "s/#555\b/#6E86A6/g" \
    -e "s/#666\b/#6E86A6/g" \
    -e "s/#777\b/#8296B0/g" \
    -e "s/#000\b/#0B1220/g" \
    "$f"

  # --- Glows radiales casi-negros -> tintes suaves (evita "puntos negros") ---
  # ámbar apagado y verde apagado que se veían como manchas sobre navy
  sed -i \
    -e 's/#1f1a0a/rgba(217,119,6,0.12)/g' \
    -e 's/#0a1a0e/rgba(34,197,94,0.12)/g' \
    "$f"

  echo "   ✓ $f"
done

# El toolbar suele quedar igual que el fondo (#0B1220). Lo elevamos un pelo
# para que se despegue, SOLO cuando aparece como valor de 'toolbar'.
for f in $FILES; do
  sed -i -E "s/(toolbar[^=]*= *dark *\? *)'#0B1220'/\1'#0E1728'/g" "$f"
done

echo ""
echo "✅ Listo. Respaldo en '$BACKUP_DIR/'."
echo "👉 Revisa con:  git diff"
echo "↩️  Si algo se ve mal, restaura con:  cp -r $BACKUP_DIR/$SRC_DIR/* $SRC_DIR/"
