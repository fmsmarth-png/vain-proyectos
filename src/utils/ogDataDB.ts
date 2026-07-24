// src/utils/ogDataDB.ts
// ─────────────────────────────────────────────────────────────────────────────
// Caché de DATOS ESTRUCTURALES OG en IndexedDB para modo offline  ‹FMS›
//
// Complementa a ogImageDB.ts (que cachea IMÁGENES). Este módulo guarda los datos
// necesarios para que las PANTALLAS DE SELECCIÓN funcionen sin conexión:
//   proyectos → torres → departamentos
//
// Hasta ahora, sin red, RevisionOG no cargaba nada porque el selector consulta
// Supabase en vivo. Con esto, al tocar "Preparar modo offline" también se
// descargan y guardan estos datos, y el selector los lee desde IndexedDB cuando
// no hay conexión (online-first con fallback a caché).
//
// Patrón idéntico al ya probado en OG:
//   - getSession() nunca getUser() (getUser requiere red)
//   - Paginación en departamentos (Supabase topa a 1000 filas por request)
//   - IndexedDB (Cache API NO funciona en el WebView de Capacitor Android)
//
// IMPORTANTE: ajusta la ruta/nombre del import de supabase si en tu proyecto
// difiere. En src/utils/ogImageDB.ts se importa igual que aquí.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '../supabase';

// ── Tipos (columnas confirmadas por MCP contra la BD real) ───────────────────
export interface ProyectoOffline {
  id: string;
  nombre: string;
  codigo: string | null;
  etapa: string | null;
  linea: string | null;
  direccion: string | null;
  estado: string | null;
}

export interface TorreOffline {
  id: string;
  nombre: string;
  proyecto_id: string;
  frente: string | null;
  pisos: number | null;
}

export interface DeptoOffline {
  id: string;
  numero: number | null;
  id_obra: string | null;
  torre_id: string;
  piso: number | null;
  frente_depto: string | null;
  plano_version_id: string | null;
}

// ── Configuración IndexedDB ──────────────────────────────────────────────────
const DB_NAME = 'vain-og-data';
const DB_VERSION = 1;

const STORE_PROYECTOS = 'proyectos';
const STORE_TORRES = 'torres';
const STORE_DEPTOS = 'departamentos';
const STORE_META = 'meta';

const META_KEY_FECHA = 'fecha_descarga';

export interface ProgresoDatosOG {
  fase: 'proyectos' | 'torres' | 'departamentos' | 'listo';
  actual: number;
  total: number;
}

// ── Apertura de la base ──────────────────────────────────────────────────────
function abrirDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains(STORE_PROYECTOS)) {
        db.createObjectStore(STORE_PROYECTOS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_TORRES)) {
        const s = db.createObjectStore(STORE_TORRES, { keyPath: 'id' });
        s.createIndex('proyecto_id', 'proyecto_id', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_DEPTOS)) {
        const s = db.createObjectStore(STORE_DEPTOS, { keyPath: 'id' });
        s.createIndex('torre_id', 'torre_id', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── Helpers genéricos de IndexedDB ───────────────────────────────────────────
function limpiarStore(db: IDBDatabase, store: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function guardarLote<T>(db: IDBDatabase, store: string, filas: T[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    filas.forEach((f) => os.put(f));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function leerTodo<T>(db: IDBDatabase, store: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve((req.result as T[]) || []);
    req.onerror = () => reject(req.error);
  });
}

function leerPorIndice<T>(
  db: IDBDatabase,
  store: string,
  indexName: string,
  valor: IDBValidKey
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const idx = tx.objectStore(store).index(indexName);
    const req = idx.getAll(valor);
    req.onsuccess = () => resolve((req.result as T[]) || []);
    req.onerror = () => reject(req.error);
  });
}

function guardarMeta(db: IDBDatabase, key: string, value: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readwrite');
    tx.objectStore(STORE_META).put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function leerMeta(db: IDBDatabase, key: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readonly');
    const req = tx.objectStore(STORE_META).get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : null);
    req.onerror = () => reject(req.error);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// DESCARGA — se llama desde "Preparar modo offline" (CON conexión)
//
// `proyectos` = la MISMA lista que muestra el selector de RevisionOG (para que el
// set offline sea idéntico al online). Se le pasa desde el componente del botón.
// El módulo se encarga de traer torres y departamentos de esos proyectos.
// ─────────────────────────────────────────────────────────────────────────────
export async function descargarDatosOG(
  proyectos: ProyectoOffline[],
  onProgress?: (p: ProgresoDatosOG) => void
): Promise<{ proyectos: number; torres: number; departamentos: number }> {
  // getSession en vez de getUser (no requiere red y evita el error offline típico)
  await supabase.auth.getSession();

  const db = await abrirDB();

  // 1) PROYECTOS — se guardan tal cual llegan del selector
  const proyectosLimpios: ProyectoOffline[] = proyectos.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    codigo: p.codigo ?? null,
    etapa: p.etapa ?? null,
    linea: p.linea ?? null,
    direccion: p.direccion ?? null,
    estado: p.estado ?? null,
  }));

  await limpiarStore(db, STORE_PROYECTOS);
  await guardarLote(db, STORE_PROYECTOS, proyectosLimpios);
  onProgress?.({ fase: 'proyectos', actual: proyectosLimpios.length, total: proyectosLimpios.length });

  const proyectoIds = proyectosLimpios.map((p) => p.id);
  if (proyectoIds.length === 0) {
    await guardarMeta(db, META_KEY_FECHA, new Date().toISOString());
    db.close();
    return { proyectos: 0, torres: 0, departamentos: 0 };
  }

  // 2) TORRES de esos proyectos
  const { data: torresData, error: errTorres } = await supabase
    .from('torres')
    .select('id, nombre, proyecto_id, frente, pisos')
    .in('proyecto_id', proyectoIds)
    .order('nombre', { ascending: true });

  if (errTorres) throw errTorres;

  const torres: TorreOffline[] = (torresData || []) as TorreOffline[];
  await limpiarStore(db, STORE_TORRES);
  await guardarLote(db, STORE_TORRES, torres);
  onProgress?.({ fase: 'torres', actual: torres.length, total: torres.length });

  const torreIds = torres.map((t) => t.id);

  // 3) DEPARTAMENTOS de esas torres — CON PAGINACIÓN (Supabase topa a 1000/req)
  await limpiarStore(db, STORE_DEPTOS);
  let totalDeptos = 0;

  if (torreIds.length > 0) {
    const PAGINA = 1000;
    let desde = 0;
    let seguir = true;

    while (seguir) {
      const { data: deptosData, error: errDeptos } = await supabase
        .from('departamentos')
        .select('id, numero, id_obra, torre_id, piso, frente_depto, plano_version_id')
        .in('torre_id', torreIds)
        .order('numero', { ascending: true })
        .range(desde, desde + PAGINA - 1);

      if (errDeptos) throw errDeptos;

      const lote: DeptoOffline[] = (deptosData || []) as DeptoOffline[];
      if (lote.length > 0) {
        await guardarLote(db, STORE_DEPTOS, lote);
        totalDeptos += lote.length;
        onProgress?.({ fase: 'departamentos', actual: totalDeptos, total: totalDeptos });
      }

      seguir = lote.length === PAGINA;
      desde += PAGINA;
    }
  }

  await guardarMeta(db, META_KEY_FECHA, new Date().toISOString());
  onProgress?.({ fase: 'listo', actual: totalDeptos, total: totalDeptos });

  db.close();
  return { proyectos: proyectosLimpios.length, torres: torres.length, departamentos: totalDeptos };
}

// ─────────────────────────────────────────────────────────────────────────────
// GETTERS — se usan en RevisionOG cuando no hay red (o como fallback)
// ─────────────────────────────────────────────────────────────────────────────
export async function getProyectosDB(): Promise<ProyectoOffline[]> {
  const db = await abrirDB();
  const filas = await leerTodo<ProyectoOffline>(db, STORE_PROYECTOS);
  db.close();
  // Orden estable por nombre
  return filas.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
}

export async function getTorresDB(proyectoId: string): Promise<TorreOffline[]> {
  const db = await abrirDB();
  const filas = await leerPorIndice<TorreOffline>(db, STORE_TORRES, 'proyecto_id', proyectoId);
  db.close();
  return filas.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
}

export async function getDeptosDB(torreId: string): Promise<DeptoOffline[]> {
  const db = await abrirDB();
  const filas = await leerPorIndice<DeptoOffline>(db, STORE_DEPTOS, 'torre_id', torreId);
  db.close();
  return filas.sort((a, b) => (a.numero ?? 0) - (b.numero ?? 0));
}

// ─────────────────────────────────────────────────────────────────────────────
// ESTADO — para mostrar en la card de "Preparar modo offline"
// ─────────────────────────────────────────────────────────────────────────────
export async function contarDatosDescargados(): Promise<{
  proyectos: number;
  torres: number;
  departamentos: number;
}> {
  const db = await abrirDB();
  const contar = (store: string) =>
    new Promise<number>((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

  const [proyectos, torres, departamentos] = await Promise.all([
    contar(STORE_PROYECTOS),
    contar(STORE_TORRES),
    contar(STORE_DEPTOS),
  ]);
  db.close();
  return { proyectos, torres, departamentos };
}

export async function fechaDescargaDatos(): Promise<string | null> {
  const db = await abrirDB();
  const fecha = await leerMeta(db, META_KEY_FECHA);
  db.close();
  return fecha;
}

export async function limpiarDatosOG(): Promise<void> {
  const db = await abrirDB();
  await Promise.all([
    limpiarStore(db, STORE_PROYECTOS),
    limpiarStore(db, STORE_TORRES),
    limpiarStore(db, STORE_DEPTOS),
    limpiarStore(db, STORE_META),
  ]);
  db.close();
}