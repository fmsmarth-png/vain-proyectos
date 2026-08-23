#!/usr/bin/env bash
set -euo pipefail
SRC_DIR="${1:-src}"
if [ ! -d "$SRC_DIR" ]; then
  echo "No existe la carpeta '$SRC_DIR'."
  exit 1
fi
BACKUP_DIR=".backup-recolor"
mkdir -p "$BACKUP_DIR"
echo "Buscando archivos .tsx en '$SRC_DIR'..."
FILES=$(grep -rl --include="*.tsx" -E "#000000|#0e0e0e|#141414|#181818|#1a1a1a|#1e1e1e|#2a2a2a|#161616|'#111'|'#000'|'#111111'" "$SRC_DIR" || true)
if [ -z "$FILES" ]; then
  echo "No se encontraron colores negros que convertir."
  exit 0
fi
echo "Archivos a modificar:"
echo "$FILES" | sed 's/^/   - /'
echo ""
for f in $FILES; do
  mkdir -p "$BACKUP_DIR/$(dirname "$f")"
  cp "$f" "$BACKUP_DIR/$f"
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
  sed -i \
    -e "s/#111\b/#16233B/g" \
    -e "s/#222\b/#26395C/g" \
    -e "s/#444\b/#5D728F/g" \
    -e "s/#555\b/#6E86A6/g" \
    -e "s/#666\b/#6E86A6/g" \
    -e "s/#777\b/#8296B0/g" \
    -e "s/#000\b/#0B1220/g" \
    "$f"
  sed -i \
    -e 's/#1f1a0a/rgba(217,119,6,0.12)/g' \
    -e 's/#0a1a0e/rgba(34,197,94,0.12)/g' \
    "$f"
  echo "   OK $f"
done
for f in $FILES; do
  sed -i -E "s/(toolbar[^=]*= *dark *\? *)'#0B1220'/\1'#0E1728'/g" "$f"
done
echo ""
echo "Listo. Respaldo en '$BACKUP_DIR/'."
