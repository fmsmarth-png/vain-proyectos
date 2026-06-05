import requests

SUPABASE_URL = "https://swjmqtnhdtiwopexbezx.supabase.co"
SUPABASE_KEY = "sb_secret_rHJs88tXeSfpHaKPJdBPZg_7BeIqHbj"
PROGRAMA_ID = "95fc823b-0b37-4f42-8b5e-3f6f460b6382"

r = requests.get(
    f"{SUPABASE_URL}/rest/v1/programa_actividades?programa_id=eq.{PROGRAMA_ID}&select=actividad,dia_inicio,orden,mapa_dias&limit=100",
    headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }
)
actividades = r.json()
print(f"Actividades cargadas: {len(actividades)}")

def dia_obra_desde(frente_moldaje):
    moldaje = next((a for a in actividades if a["actividad"] == "MOLDAJE MONOLITICO"), None)
    if not moldaje:
        return None
    for dia, frente in moldaje["mapa_dias"].items():
        if frente == frente_moldaje.upper():
            return int(dia)
    return None

def frente_en_dia(nombre_actividad, dia_obra):
    act = next((a for a in actividades if a["actividad"] == nombre_actividad), None)
    if not act:
        return "NO ENCONTRADA"
    return act["mapa_dias"].get(str(dia_obra), "sin datos")

print("\n=== CASO 1: Moldaje en 4F13 ===")
dia = dia_obra_desde("4F13")
print(f"Dia de obra: {dia} (esperado: 174)")
for nombre, esperado in [
    ("FALDON DE TINA", "4F10"),
    ("SEGUNDA MANO DE BAÑO Y COCINA", "2F8"),
    ("ACCESORIOS BAÑO Y KIT CALEFONT", "2F7"),
]:
    r2 = frente_en_dia(nombre, dia)
    ok = "OK" if r2 == esperado else "ERROR"
    print(f"  {ok} {nombre}: {r2} (esperado: {esperado})")

print("\n=== CASO 2: Moldaje en 2F18 ===")
dia = dia_obra_desde("2F18")
print(f"Dia de obra: {dia} (esperado: 184)")
for nombre, esperado in [
    ("FRAGUE CERAMICA DEPTO", "4F12"),
    ("INSTALACIÓN PAPEL MURAL", "1F9"),
    ("CLOSET", "2F7"),
    ("TRAZO MURO", "3F17"),
]:
    r2 = frente_en_dia(nombre, dia)
    ok = "OK" if r2 == esperado else "ERROR"
    print(f"  {ok} {nombre}: {r2} (esperado: {esperado})")