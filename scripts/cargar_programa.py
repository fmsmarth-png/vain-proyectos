import requests

SUPABASE_URL = "https://swjmqtnhdtiwopexbezx.supabase.co"
SUPABASE_KEY = "sb_secret_rHJs88tXeSfpHaKPJdBPZg_7BeIqHbj"

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

# 1. Crear programa base
r = requests.post(
    f"{SUPABASE_URL}/rest/v1/programas_obra",
    headers=headers,
    json={
        "nombre": "Programa Base VAIN v1",
        "descripcion": "Programa general obra gruesa y terminaciones",
        "activo": True
    }
)
programa_id = r.json()[0]["id"]
print(f"Programa creado: {programa_id}")

# 2. Actividades
actividades = [
    # OG PRIMEROS PISOS
    {"actividad": "TRAZO FUNDACIÓN", "cuadrilla": "TRAZO", "tipo_secuencia": "OG PRIMEROS PISOS", "dia_inicio": 101, "orden": 1},
    {"actividad": "EXCAVACIÓN FUNDACIÓN", "cuadrilla": "OP. RETRO", "tipo_secuencia": "OG PRIMEROS PISOS", "dia_inicio": 101, "orden": 2},
    {"actividad": "INSTALACION DE VIGAS FUNDACIÓN", "cuadrilla": "FIERRO", "tipo_secuencia": "OG PRIMEROS PISOS", "dia_inicio": 103, "orden": 3},
    {"actividad": "HORMIGON VIGA FUNDACIÓN", "cuadrilla": "INSTALACION DE HORMIGON", "tipo_secuencia": "OG PRIMEROS PISOS", "dia_inicio": 104, "orden": 4},
    {"actividad": "INSTALACIÓN FIERRO PRIMEROS PISOS", "cuadrilla": "FIERRO", "tipo_secuencia": "OG PRIMEROS PISOS", "dia_inicio": 105, "orden": 5},
    {"actividad": "FIERRO LOSA FUNDACIÓN", "cuadrilla": "FIERRO", "tipo_secuencia": "OG PRIMEROS PISOS", "dia_inicio": 105, "orden": 6},
    {"actividad": "INSTALACIONES ELECTRICTICAS Y DE TELECIMUNICACIONES EN RADIER", "cuadrilla": "ELECTRICIDAD OBRA GRUESA", "tipo_secuencia": "OG PRIMEROS PISOS", "dia_inicio": 105, "orden": 7},
    {"actividad": "INSTALACIONES SANITARIAS EN LOSA FUNDACION", "cuadrilla": "GÁSFITER OG", "tipo_secuencia": "OG PRIMEROS PISOS", "dia_inicio": 105, "orden": 8},
    {"actividad": "HORMIGÓN LOSA DE FUNDACIÓN", "cuadrilla": "INSTALACION DE HORMIGON", "tipo_secuencia": "OG PRIMEROS PISOS", "dia_inicio": 106, "orden": 9},
    # OG PISO TIPO
    {"actividad": "TRAZO MURO", "cuadrilla": "TRAZO", "tipo_secuencia": "OG PISO TIPO", "dia_inicio": 112, "orden": 10},
    {"actividad": "INSTALACIONES ELECTRICAS Y DE TELECOMUNICACIONES EN MURO", "cuadrilla": "ELECTRICIDAD OBRA GRUESA", "tipo_secuencia": "OG PISO TIPO", "dia_inicio": 113, "orden": 11},
    {"actividad": "INSTALACIONES DE AGUA EN MURO", "cuadrilla": "GÁSFITER OG", "tipo_secuencia": "OG PISO TIPO", "dia_inicio": 113, "orden": 12},
    {"actividad": "MOLDAJE MONOLITICO", "cuadrilla": "MOLDAJE Y DESCIMBRE MONOLÍTICO", "tipo_secuencia": "OG PISO TIPO", "dia_inicio": 114, "orden": 13},
    {"actividad": "HORMIGÓN MURO Y TABIQUE", "cuadrilla": "INSTALACION DE HORMIGON", "tipo_secuencia": "OG PISO TIPO", "dia_inicio": 115, "orden": 14},
    {"actividad": "FIERRO LOSA", "cuadrilla": "FIERRO", "tipo_secuencia": "OG PISO TIPO", "dia_inicio": 115, "orden": 15},
    {"actividad": "INSTALACIONES ELECTRICAS Y DE TELECOMUNICACIONES EN LOSA", "cuadrilla": "ELECTRICIDAD OBRA GRUESA", "tipo_secuencia": "OG PISO TIPO", "dia_inicio": 115, "orden": 16},
    {"actividad": "INSTALACIONES ELECTRICAS Y DE TELECOMUNICACIONES EN LOSA TAPA", "cuadrilla": "ELECTRICIDAD OBRA GRUESA", "tipo_secuencia": "OG PISO TIPO", "dia_inicio": 115, "orden": 17},
    {"actividad": "INSTALACIONES DE AGUA EN LOSA", "cuadrilla": "GÁSFITER OG", "tipo_secuencia": "OG PISO TIPO", "dia_inicio": 115, "orden": 18},
    {"actividad": "INSTALACIONES DE GAS EN LOSA", "cuadrilla": "GAS OBRA GRUESA", "tipo_secuencia": "OG PISO TIPO", "dia_inicio": 115, "orden": 19},
    {"actividad": "HORMIGÓN LOSA", "cuadrilla": "INSTALACION DE HORMIGON", "tipo_secuencia": "OG PISO TIPO", "dia_inicio": 115, "orden": 20},
    {"actividad": "FIERRO MURO TIPO", "cuadrilla": "FIERRO", "tipo_secuencia": "OG PISO TIPO", "dia_inicio": 116, "orden": 21},
    {"actividad": "DESCIMBRE MOLDAJE MONOLITICO", "cuadrilla": "MOLDAJE Y DESCIMBRE MONOLÍTICO", "tipo_secuencia": "OG PISO TIPO", "dia_inicio": 116, "orden": 22},
    {"actividad": "TRATAMIENTO EN UNION DE PANELES", "cuadrilla": "MOLDAJE Y DESCIMBRE MONOLÍTICO", "tipo_secuencia": "OG PISO TIPO", "dia_inicio": 117, "orden": 23},
    {"actividad": "RETAPE BARRAS MOLDAJE MONOLÍTICO", "cuadrilla": "ALBAÑILERIA OBRA GRUESA", "tipo_secuencia": "OG PISO TIPO", "dia_inicio": 119, "orden": 24},
    {"actividad": "RASGO INFERIOR DE VENTANAS", "cuadrilla": "ALBAÑILERIA OBRA GRUESA", "tipo_secuencia": "OG PISO TIPO", "dia_inicio": 119, "orden": 25},
    {"actividad": "FABRICACIÓN DE PASO DE BARCO", "cuadrilla": "ALBAÑILERIA OBRA GRUESA", "tipo_secuencia": "OG PISO TIPO", "dia_inicio": 127, "orden": 26},
    # TECHUMBRE
    {"actividad": "TECHUMBRE", "cuadrilla": "TECHUMBRE", "tipo_secuencia": "TECHUMBRE", "dia_inicio": 130, "orden": 27},
    {"actividad": "MEMBRANA", "cuadrilla": "TECHUMBRE", "tipo_secuencia": "TECHUMBRE", "dia_inicio": 134, "orden": 28},
    # TERM. GRUESAS HORIZONTAL
    {"actividad": "TRASLADO DE MARCOS Y VENTANAS", "cuadrilla": "LIMPIEZA Y TRASLADO", "tipo_secuencia": "TERM. GRUESAS HORIZONTAL", "dia_inicio": 120, "orden": 29},
    {"actividad": "BARANDA TERRAZA", "cuadrilla": "CARP. METALICA", "tipo_secuencia": "TERM. GRUESAS HORIZONTAL", "dia_inicio": 121, "orden": 30},
    {"actividad": "INSTALACIÓN DE BARANDA TERRAZA", "cuadrilla": "CARP. METALICA", "tipo_secuencia": "TERM. GRUESAS HORIZONTAL", "dia_inicio": 122, "orden": 31},
    # TERM. GRUESAS VERTICAL
    {"actividad": "ALCANTARILLADO DE DESARGA PARA SHAFT Y ZÓCALO", "cuadrilla": "GASFITER TERMINACIONES", "tipo_secuencia": "TERM. GRUESAS VERTICAL", "dia_inicio": 124, "orden": 32},
    {"actividad": "SACAR CHICOTE DE GAS", "cuadrilla": "GAS TERMINACIONES", "tipo_secuencia": "TERM. GRUESAS VERTICAL", "dia_inicio": 125, "orden": 33},
    {"actividad": "INSTALACION MARCOS Y VENTANAS", "cuadrilla": "INSTALACION VENTANAS PVC", "tipo_secuencia": "TERM. GRUESAS VERTICAL", "dia_inicio": 126, "orden": 34},
    {"actividad": "ALBAÑILERIA TERRAZA", "cuadrilla": "ALBAÑILERIA TERMINACIONES", "tipo_secuencia": "TERM. GRUESAS VERTICAL", "dia_inicio": 127, "orden": 35},
    {"actividad": "TABIQUE DEPTO", "cuadrilla": "CARP. TABIQUE", "tipo_secuencia": "TERM. GRUESAS VERTICAL", "dia_inicio": 128, "orden": 36},
    {"actividad": "HUINCHAS DEPTO", "cuadrilla": "YESO Y HUINCHAS", "tipo_secuencia": "TERM. GRUESAS VERTICAL", "dia_inicio": 130, "orden": 37},
    {"actividad": "YESO Y HUINCHAS DEPTO", "cuadrilla": "YESO Y HUINCHAS", "tipo_secuencia": "TERM. GRUESAS VERTICAL", "dia_inicio": 130, "orden": 38},
    {"actividad": "IMPERMEABILIZACION DE NICHO DE TINA", "cuadrilla": "ALBAÑILERIA TERMINACIONES", "tipo_secuencia": "TERM. GRUESAS VERTICAL", "dia_inicio": 131, "orden": 39},
    {"actividad": "INSTALACION DE TINA", "cuadrilla": "GASFITER TERMINACIONES", "tipo_secuencia": "TERM. GRUESAS VERTICAL", "dia_inicio": 132, "orden": 40},
    {"actividad": "PRUEBAS DE AGUA Y DE TINA", "cuadrilla": "GASFITER TERMINACIONES", "tipo_secuencia": "TERM. GRUESAS VERTICAL", "dia_inicio": 133, "orden": 41},
    {"actividad": "MARCOS Y PUERTAS", "cuadrilla": "CARP. TERMINACIONES", "tipo_secuencia": "TERM. GRUESAS VERTICAL", "dia_inicio": 134, "orden": 42},
    {"actividad": "GUARDAPOLVOS", "cuadrilla": "CARP. TERMINACIONES", "tipo_secuencia": "TERM. GRUESAS VERTICAL", "dia_inicio": 135, "orden": 43},
    {"actividad": "INSTALACION CORNISA Y CORTAGOTERA", "cuadrilla": "CARP. TERMINACIONES", "tipo_secuencia": "TERM. GRUESAS VERTICAL", "dia_inicio": 135, "orden": 44},
    {"actividad": "ALAMBRAR CANALIZACIONES ELECTRICAS", "cuadrilla": "ELECTRICIDAD OBRA GRUESA", "tipo_secuencia": "TERM. GRUESAS VERTICAL", "dia_inicio": 135, "orden": 45},
    {"actividad": "FALDON DE TINA", "cuadrilla": "CARP. TERMINACIONES", "tipo_secuencia": "TERM. GRUESAS VERTICAL", "dia_inicio": 135, "orden": 46},
    {"actividad": "CERAMICA DEPTO", "cuadrilla": "CERAMICA Y FRAGUE", "tipo_secuencia": "TERM. GRUESAS VERTICAL", "dia_inicio": 136, "orden": 47},
    {"actividad": "FRAGUE CERAMICA DEPTO", "cuadrilla": "CERAMICA Y FRAGUE", "tipo_secuencia": "TERM. GRUESAS VERTICAL", "dia_inicio": 137, "orden": 48},
    # TERM. FINAS
    {"actividad": "PASTA DEPTO LOSA", "cuadrilla": "PASTA Y LOSALIN", "tipo_secuencia": "TERM. FINAS", "dia_inicio": 138, "orden": 49},
    {"actividad": "RECORRIDO SOBRE CORNISA", "cuadrilla": "PASTA Y LOSALIN", "tipo_secuencia": "TERM. FINAS", "dia_inicio": 138, "orden": 50},
    {"actividad": "LOSALIN DEPTO", "cuadrilla": "PASTA Y LOSALIN", "tipo_secuencia": "TERM. FINAS", "dia_inicio": 139, "orden": 51},
    {"actividad": "AGUA YESO Y HUINCHAS MEJORADO BAÑO Y COCINA", "cuadrilla": "PINTURA BAÑO Y COCINA", "tipo_secuencia": "TERM. FINAS", "dia_inicio": 139, "orden": 52},
    {"actividad": "PRIMERA MANO BAÑO Y COCINA", "cuadrilla": "PINTURA BAÑO Y COCINA", "tipo_secuencia": "TERM. FINAS", "dia_inicio": 140, "orden": 53},
    {"actividad": "INSTALACION DE ARTEFACTOS ELECTRICOS", "cuadrilla": "ELECTRICIDAD TERMINACIONES", "tipo_secuencia": "TERM. FINAS", "dia_inicio": 141, "orden": 54},
    {"actividad": "LIMPIEZA ANTES DE RETAPE DE PISO", "cuadrilla": "ALBAÑILERIA TERMINACIONES", "tipo_secuencia": "TERM. FINAS", "dia_inicio": 142, "orden": 55},
    {"actividad": "LIJADO Y ENCOLADO", "cuadrilla": "PINTURA MADERA Y ENCOLADO", "tipo_secuencia": "TERM. FINAS", "dia_inicio": 143, "orden": 56},
    {"actividad": "PINTURA DE MADERA, CORNISA Y ENCOLADO", "cuadrilla": "PINTURA MADERA Y ENCOLADO", "tipo_secuencia": "TERM. FINAS", "dia_inicio": 144, "orden": 57},
    {"actividad": "LEVANTAR BASTON DE GAS", "cuadrilla": "GAS TERMINACIONES", "tipo_secuencia": "TERM. FINAS", "dia_inicio": 144, "orden": 58},
    {"actividad": "INSTALACION MUEBLES COCINA", "cuadrilla": "CARP. ACCESORIOS Y PAV. SECOS", "tipo_secuencia": "TERM. FINAS", "dia_inicio": 145, "orden": 59},
    {"actividad": "ARTEFACTOS DE BAÑO Y LAVAPLATOS DE COCINA", "cuadrilla": "GASFITER TERMINACIONES", "tipo_secuencia": "TERM. FINAS", "dia_inicio": 146, "orden": 60},
    {"actividad": "SEGUNDA MANO DE BAÑO Y COCINA", "cuadrilla": "PINTURA BAÑO Y COCINA", "tipo_secuencia": "TERM. FINAS", "dia_inicio": 147, "orden": 61},
    {"actividad": "INSTALACION CALEFONT", "cuadrilla": "GAS TERMINACIONES", "tipo_secuencia": "TERM. FINAS", "dia_inicio": 148, "orden": 62},
    {"actividad": "INSTALACION COMBINACION TINA Y PORTA CHALLA", "cuadrilla": "GASFITER TERMINACIONES", "tipo_secuencia": "TERM. FINAS", "dia_inicio": 148, "orden": 63},
    {"actividad": "ACCESORIOS BAÑO Y KIT CALEFONT", "cuadrilla": "CARP. ACCESORIOS Y PAV. SECOS", "tipo_secuencia": "TERM. FINAS", "dia_inicio": 148, "orden": 64},
    {"actividad": "ASEO DEPARTAMENTO", "cuadrilla": "ASEO", "tipo_secuencia": "TERM. FINAS", "dia_inicio": 150, "orden": 65},
    {"actividad": "INSTALACIÓN PAPEL MURAL", "cuadrilla": "PAPEL MURAL", "tipo_secuencia": "TERM. FINAS", "dia_inicio": 152, "orden": 66},
    {"actividad": "INSTALACION TAPAS ELECTRICAS", "cuadrilla": "ELECTRICIDAD TERMINACIONES", "tipo_secuencia": "TERM. FINAS", "dia_inicio": 153, "orden": 67},
    {"actividad": "CELOSIAS E INSTALACION EXTRACTOR", "cuadrilla": "CARP. ACCESORIOS Y PAV. SECOS", "tipo_secuencia": "TERM. FINAS", "dia_inicio": 153, "orden": 68},
    {"actividad": "SELLOS EN BAÑO Y COCINA", "cuadrilla": "CARP. ACCESORIOS Y PAV. SECOS", "tipo_secuencia": "TERM. FINAS", "dia_inicio": 154, "orden": 69},
    {"actividad": "CONEXIÓN DE EXTRACTORES", "cuadrilla": "ELECTRICIDAD TERMINACIONES", "tipo_secuencia": "TERM. FINAS", "dia_inicio": 154, "orden": 70},
    {"actividad": "ALAMBRADO E INSTALACION DE CITOFONO", "cuadrilla": "CITOFONIA", "tipo_secuencia": "TERM. FINAS", "dia_inicio": 154, "orden": 71},
    {"actividad": "SEGUNDAS MANOS BARANDA TERRAZA", "cuadrilla": "PINTURA TERMINACIONES", "tipo_secuencia": "TERM. FINAS", "dia_inicio": 155, "orden": 72},
    {"actividad": "TRASLADO ALFOMBRA", "cuadrilla": "LIMPIEZA Y TRASLADO", "tipo_secuencia": "TERM. FINAS", "dia_inicio": 156, "orden": 73},
    {"actividad": "INSTALACIÓN CUBREJUNTA Y JUNQUILLOS", "cuadrilla": "CARP. ACCESORIOS Y PAV. SECOS", "tipo_secuencia": "TERM. FINAS", "dia_inicio": 157, "orden": 74},
    {"actividad": "CLOSET", "cuadrilla": "MUEBLES", "tipo_secuencia": "TERM. FINAS", "dia_inicio": 158, "orden": 75},
    {"actividad": "SEGUNDA MANO MADERA", "cuadrilla": "PINTURA MADERA Y ENCOLADO", "tipo_secuencia": "TERM. FINAS", "dia_inicio": 160, "orden": 76},
    {"actividad": "ASEO CLOSET Y FINAL", "cuadrilla": "ASEO", "tipo_secuencia": "TERM. FINAS", "dia_inicio": 161, "orden": 77},
    {"actividad": "TAPAS WC, CUELLO CISNE, CUELLO DUCHA, NUMERO DPTO", "cuadrilla": "CARP. ACCESORIOS Y PAV. SECOS", "tipo_secuencia": "TERM. FINAS", "dia_inicio": 161, "orden": 78},
]

# Agregar programa_id a cada actividad
for a in actividades:
    a["programa_id"] = programa_id
    a["activo"] = True

# Insertar en lotes de 20
batch_size = 20
for i in range(0, len(actividades), batch_size):
    batch = actividades[i:i+batch_size]
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/programa_actividades",
        headers=headers,
        json=batch
    )
    if r.status_code in (200, 201):
        print(f"Lote {i//batch_size + 1} insertado OK ({len(batch)} actividades)")
    else:
        print(f"Error en lote {i//batch_size + 1}: {r.text}")

print("Listo.")