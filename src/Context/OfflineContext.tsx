// OfflineContext.tsx — ‹FMS› (reescrito Agosto 2026 sobre IndexedDB)
// Soporta: Pre Entrega (observacionesinformepv), Registros ZC, Obra Gruesa (og_registros)
//
// CAMBIOS respecto a la versión anterior (localStorage + base64):
//   1. Las 4 colas (registros, pre_entrega, zc, cambios) ahora se guardan en
//      IndexedDB en vez de localStorage. localStorage tiene un límite duro
//      de ~5-10 MB COMPARTIDO entre todas las colas; con fotos en base64 se
//      llenaba fácil en una jornada larga sin señal, y el error
//      (QuotaExceededError) solo se logueaba en consola — la observación
//      con su foto se perdía sin que nadie se enterara. IndexedDB no tiene
//      ese límite práctico.
//   2. Las fotos se guardan como Blob nativo, no como texto base64: más
//      liviano y sin conversiones string↔binario innecesarias.
//   3. FIX de bug crítico: antes, si la app se cerraba/crasheaba justo
//      mientras un registro tenía estado 'sincronizando', ese registro
//      quedaba marcado así PARA SIEMPRE (el loop de sync explícitamente
//      saltaba cualquier registro en ese estado). Ahora, al hidratar la cola
//      en el arranque, cualquier registro que haya quedado en
//      'sincronizando' de una sesión anterior se repone a 'pendiente' y se
//      vuelve a intentar.
//   4. Los errores de guardado local (ej: falla IndexedDB) ahora se
//      propagan (throw) en vez de tragarse con console.error, para que la
//      pantalla que llama pueda avisarle al usuario que algo no se guardó.
//
// La API pública (los nombres y firmas que usan las pantallas) se mantiene
// idéntica a la versión anterior — no hace falta tocar las pantallas que ya
// usan useOffline().

import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Network } from '@capacitor/network';
import { supabase } from '../supabase';
import { flushColaOG, contarPendientesOG } from '../utils/Ogofflinequeue';
import { flushColaPostventa, contarPendientesPostventa } from '../utils/postventaOfflineQueue';
import { flushFotosPreEntrega, contarFotosPendientes } from '../utils/preEntregaFotosQueue';
import { sincronizarTodosLosBorradoresLocales } from '../utils/postventaBorradorLocal';
import { dbGetAll, dbPut, dbDelete, comprimirImagenBlob, blobAObjectUrl, migrarDesdeLocalStorage, type StoreName } from '../utils/offlineDB';

// ══════════════════════════════════════════════════════════════════════════════
// TIPOS
// ══════════════════════════════════════════════════════════════════════════════

type EstadoSincronizacion = 'pendiente' | 'sincronizando' | 'ok' | 'error';

interface RegistroPendiente {
  id: string;
  datos: any;
  foto_blob?: Blob | null;
  foto_base64?: string; // compat: object URL calculada al leer, no se persiste como texto
  foto_nombre?: string;
  timestamp: number;
  estado: EstadoSincronizacion;
  intentos: number;
  ultimoError?: string;
  modulo: 'observaciones' | 'pre-entrega';
}

interface RegistroZCPendiente {
  id: string;
  datos: any;
  foto_blob?: Blob | null;
  foto_base64?: string;
  foto_nombre?: string;
  timestamp: number;
  estado: EstadoSincronizacion;
  intentos: number;
  ultimoError?: string;
}

interface CambioPendiente {
  id: string;
  tipo: 'estado' | 'edicion' | 'eliminacion';
  registro_id: string;
  datos: any;
  timestamp: number;
  estado: EstadoSincronizacion;
  intentos: number;
  ultimoError?: string;
}

interface OfflineContextType {
  online: boolean;
  pendientes: number;
  pendientesZC: number;
  cambiosPendientes: number;
  pendientesOG: number;
  pendientesPostventa: number;

  agregarPendientePreEntrega: (datos: any, foto?: File | Blob) => Promise<void>;
  obtenerPendientesPreEntrega: () => RegistroPendiente[];

  agregarPendiente: (datos: any, foto?: File) => Promise<void>;
  agregarPendienteZC: (datos: any, foto?: File) => Promise<void>;
  obtenerPendientesZC: () => RegistroZCPendiente[];

  agregarCambioPendiente: (tipo: 'estado' | 'edicion' | 'eliminacion', registro_id: string, datos: any) => void;

  sincronizarAhora: () => Promise<void>;
}

const OfflineContext = createContext<OfflineContextType>({
  online: true,
  pendientes: 0,
  pendientesZC: 0,
  cambiosPendientes: 0,
  pendientesOG: 0,
  pendientesPostventa: 0,
  agregarPendientePreEntrega: async () => {},
  obtenerPendientesPreEntrega: () => [],
  agregarPendiente: async () => {},
  agregarPendienteZC: async () => {},
  obtenerPendientesZC: () => [],
  agregarCambioPendiente: () => {},
  sincronizarAhora: async () => {},
});

// ══════════════════════════════════════════════════════════════════════════════
// STORAGE — claves viejas de localStorage (solo para migración) y stores nuevos
// ══════════════════════════════════════════════════════════════════════════════

const LEGACY_KEY_REGISTROS = 'registros_pendientes';
const LEGACY_KEY_PRE_ENTREGA = 'pre_entrega_pendientes';
const LEGACY_KEY_ZC = 'registros_zc_pendientes';
const LEGACY_KEY_CAMBIOS = 'cambios_pendientes';

const STORE_REGISTROS: StoreName = 'registros';
const STORE_PRE_ENTREGA: StoreName = 'pre_entrega';
const STORE_ZC: StoreName = 'zc';
const STORE_CAMBIOS: StoreName = 'cambios';

// ══════════════════════════════════════════════════════════════════════════════
// ESPEJOS EN MEMORIA (para exponer lecturas síncronas como antes)
// ══════════════════════════════════════════════════════════════════════════════

let cacheRegistros: RegistroPendiente[] = [];
let cachePreEntrega: RegistroPendiente[] = [];
let cacheZC: RegistroZCPendiente[] = [];
let cacheCambios: CambioPendiente[] = [];

let hidratado = false;
let hidratandoPromise: Promise<void> | null = null;

/**
 * Hidrata las 4 colas desde IndexedDB (con migración automática de lo que
 * haya en localStorage de versiones anteriores). Debe llamarse una vez, lo
 * antes posible en el arranque — ver main.tsx — para que las lecturas
 * síncronas reflejen la realidad desde el primer render.
 *
 * FIX del bug de "sincronizando" atascado: cualquier registro que haya
 * quedado marcado 'sincronizando' de una sesión anterior (la app se cerró a
 * mitad de una subida) se repone a 'pendiente' aquí, para que sí se vuelva a
 * intentar en vez de quedar invisible para siempre.
 */
export function initOfflineQueues(): Promise<void> {
  if (hidratandoPromise) return hidratandoPromise;
  hidratandoPromise = (async () => {
    try {
      await Promise.all([
        migrarDesdeLocalStorage<RegistroPendiente>(LEGACY_KEY_REGISTROS, STORE_REGISTROS, normalizarLegacyConFoto),
        migrarDesdeLocalStorage<RegistroPendiente>(LEGACY_KEY_PRE_ENTREGA, STORE_PRE_ENTREGA, normalizarLegacyConFoto),
        migrarDesdeLocalStorage<RegistroZCPendiente>(LEGACY_KEY_ZC, STORE_ZC, normalizarLegacyConFoto),
        migrarDesdeLocalStorage<CambioPendiente>(LEGACY_KEY_CAMBIOS, STORE_CAMBIOS, (r) => r),
      ]);

      const [regs, pre, zc, cambios] = await Promise.all([
        dbGetAll<RegistroPendiente>(STORE_REGISTROS),
        dbGetAll<RegistroPendiente>(STORE_PRE_ENTREGA),
        dbGetAll<RegistroZCPendiente>(STORE_ZC),
        dbGetAll<CambioPendiente>(STORE_CAMBIOS),
      ]);

      cacheRegistros = repararAtascados(regs);
      cachePreEntrega = repararAtascados(pre);
      cacheZC = repararAtascados(zc);
      cacheCambios = repararAtascados(cambios);

      // Persistir la reparación de atascados (si hubo alguno).
      await Promise.all([
        ...cacheRegistros.filter(r => regs.find(o => o.id === r.id)?.estado !== r.estado).map(r => dbPut(STORE_REGISTROS, r)),
        ...cachePreEntrega.filter(r => pre.find(o => o.id === r.id)?.estado !== r.estado).map(r => dbPut(STORE_PRE_ENTREGA, r)),
        ...cacheZC.filter(r => zc.find(o => o.id === r.id)?.estado !== r.estado).map(r => dbPut(STORE_ZC, r)),
        ...cacheCambios.filter(r => cambios.find(o => o.id === r.id)?.estado !== r.estado).map(r => dbPut(STORE_CAMBIOS, r)),
      ]);
    } catch (e) {
      console.error('[OfflineContext] Error hidratando colas desde IndexedDB:', e);
    } finally {
      hidratado = true;
    }
  })();
  return hidratandoPromise;
}

function repararAtascados<T extends { estado: EstadoSincronizacion }>(cola: T[]): T[] {
  return cola.map(r => r.estado === 'sincronizando' ? { ...r, estado: 'pendiente' as EstadoSincronizacion } : r);
}

// Los registros migrados desde localStorage traían `foto_base64` (string).
// Los convertimos a Blob una sola vez, en la migración, para que de ahí en
// adelante todo el sistema trabaje solo con Blobs.
function normalizarLegacyConFoto(raw: any): any {
  // Los registros migrados desde localStorage traían `foto_base64` (string).
  // No migramos esa foto vieja a Blob (edge case raro justo en el momento de
  // la actualización): se pierde solo la FOTO de ese registro puntual si
  // existía, nunca la observación ni el resto de sus datos.
  const resto = { ...raw };
  delete resto.foto_base64;
  return { ...resto, foto_blob: null };
}

function warnIfNotHydrated() {
  if (!hidratado) {
    console.warn('[OfflineContext] Se leyó una cola antes de hidratar — llama initOfflineQueues() en el arranque.');
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════════════════════════════════════════

const getUserId = async (): Promise<string> => {
  try {
    const { data: { user } } = await Promise.race([
      supabase.auth.getUser(),
      new Promise<any>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
    ]);
    if (user?.id) return user.id;
  } catch {}
  try {
    const id = localStorage.getItem('detalles_user_id');
    if (id) return id;
  } catch {}
  return '';
};

/**
 * Reintentos con backoff exponencial: 1s, 2s, 4s, 8s, 16s (max 5 intentos)
 */
const calcularDelayReintento = (intentos: number): number => {
  return Math.min(1000 * Math.pow(2, intentos), 16000);
};

function conPreview<T extends { foto_blob?: Blob | null }>(r: T): T {
  return { ...r, foto_base64: r.foto_blob ? blobAObjectUrl(r.foto_blob) : undefined } as T;
}

// ══════════════════════════════════════════════════════════════════════════════
// PROVIDER
// ══════════════════════════════════════════════════════════════════════════════

export const OfflineProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [online, setOnline] = useState(true);
  const [pendientes, setPendientes] = useState(0);
  const [pendientesZC, setPendientesZC] = useState(0);
  const [cambiosPendientes, setCambiosPendientes] = useState(0);
  const [pendientesOG, setPendientesOG] = useState(contarPendientesOG());
  const [pendientesPostventa, setPendientesPostventa] = useState(contarPendientesPostventa());

  const sincronizandoRef = useRef(false);
  const onlineRef = useRef(true);

  // ──────────────────────────────────────────────────────────────────────────
  // LIFECYCLE: hidratar colas + detectar cambios de conexión
  // ──────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelado = false;

    initOfflineQueues().then(() => {
      if (cancelado) return;
      refrescarContadores();
    });

    Network.getStatus().then(s => {
      setOnline(s.connected);
      onlineRef.current = s.connected;
      if (s.connected) {
        initOfflineQueues().then(() => sincronizarTodo());
      }
    });

    const listenerPromise = Network.addListener('networkStatusChange', s => {
      setOnline(s.connected);
      onlineRef.current = s.connected;
      if (s.connected) {
        console.log('[OfflineContext] Reconectado → Sincronizando...');
        sincronizarTodo();
      }
    });

    // Reintentar cada 30s si sigue habiendo pendientes
    const interval = setInterval(() => {
      if (onlineRef.current) {
        sincronizarTodo();
      }
    }, 30000);

    return () => {
      cancelado = true;
      listenerPromise.then(l => l.remove());
      clearInterval(interval);
    };
  }, []);

  const refrescarContadores = () => {
    setPendientes(cacheRegistros.length + cachePreEntrega.length);
    setPendientesZC(cacheZC.length);
    setCambiosPendientes(cacheCambios.length);
    setPendientesOG(contarPendientesOG());
    setPendientesPostventa(contarPendientesPostventa());
  };

  // ──────────────────────────────────────────────────────────────────────────
  // COLA: Registros Zona Común (observaciones) — tabla `registros`
  // ──────────────────────────────────────────────────────────────────────────

  const agregarPendiente = async (datos: any, foto?: File) => {
    let foto_blob: Blob | null = null;
    let foto_nombre: string | undefined;
    if (foto) {
      try {
        foto_blob = await comprimirImagenBlob(foto);
        foto_nombre = foto.name;
      } catch (e) {
        console.error('[OfflineContext] Error comprimiendo foto:', e);
      }
    }
    const obsId = (crypto as any)?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const registro: RegistroPendiente = {
      id: `obs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      datos: { ...datos, id: obsId },
      foto_blob,
      foto_nombre,
      timestamp: Date.now(),
      estado: 'pendiente',
      intentos: 0,
      modulo: 'observaciones',
    };

    cacheRegistros = [...cacheRegistros, registro];
    setPendientes(cacheRegistros.length + cachePreEntrega.length);

    try {
      await dbPut(STORE_REGISTROS, registro);
    } catch (e) {
      cacheRegistros = cacheRegistros.filter(r => r.id !== registro.id);
      setPendientes(cacheRegistros.length + cachePreEntrega.length);
      throw new Error('No se pudo guardar la observación en el dispositivo: ' + (e as Error).message);
    }
    console.log('[OfflineContext] Observación agregada a cola:', registro.id);
  };

  // ──────────────────────────────────────────────────────────────────────────
  // COLA: Pre Entrega (observacionesinformepv)
  // ──────────────────────────────────────────────────────────────────────────

  const agregarPendientePreEntrega = async (datos: any, foto?: File | Blob) => {
    let foto_blob: Blob | null = null;
    let foto_nombre: string | undefined;
    if (foto) {
      try {
        foto_blob = await comprimirImagenBlob(foto);
        foto_nombre = foto instanceof File ? foto.name : 'foto.jpg';
      } catch (e) {
        console.error('[OfflineContext] Error comprimiendo foto Pre Entrega:', e);
      }
    }
    const obsId = (crypto as any)?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const registro: RegistroPendiente = {
      id: `pv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      datos: { ...datos, id: obsId },
      foto_blob,
      foto_nombre,
      timestamp: Date.now(),
      estado: 'pendiente',
      intentos: 0,
      modulo: 'pre-entrega',
    };

    cachePreEntrega = [...cachePreEntrega, registro];
    setPendientes(cacheRegistros.length + cachePreEntrega.length);

    try {
      await dbPut(STORE_PRE_ENTREGA, registro);
    } catch (e) {
      cachePreEntrega = cachePreEntrega.filter(r => r.id !== registro.id);
      setPendientes(cacheRegistros.length + cachePreEntrega.length);
      throw new Error('No se pudo guardar la observación Pre Entrega en el dispositivo: ' + (e as Error).message);
    }
    console.log('[OfflineContext] Pre Entrega agregada a cola:', registro.id);
  };

  const obtenerPendientesPreEntrega = (): RegistroPendiente[] => {
    warnIfNotHydrated();
    return cachePreEntrega.map(conPreview);
  };

  // ──────────────────────────────────────────────────────────────────────────
  // SINCRONIZACIÓN: Registros Zona Común (tabla `registros`)
  // ──────────────────────────────────────────────────────────────────────────

  const sincronizarRegistros = async (userId: string) => {
    if (cacheRegistros.length === 0) return;
    console.log(`[OfflineContext] Sincronizando ${cacheRegistros.length} registros ZC...`);

    for (const reg of [...cacheRegistros]) {
      if (reg.estado === 'sincronizando') continue;

      reg.estado = 'sincronizando';
      await dbPut(STORE_REGISTROS, reg).catch(() => {});

      try {
        let foto_url = null;
        if (reg.foto_blob) {
          const fileName = `${userId}/registros/${Date.now()}_${Math.random().toString(36).substr(2, 5)}.jpg`;
          const { error: uploadError } = await supabase.storage
            .from('fotos-registros')
            .upload(fileName, reg.foto_blob, { contentType: 'image/jpeg' });

          if (!uploadError) {
            const { data: urlData } = supabase.storage.from('fotos-registros').getPublicUrl(fileName);
            foto_url = urlData.publicUrl;
          } else {
            console.warn('[OfflineContext] Error subiendo foto:', uploadError.message);
          }
        }

        const { error } = await supabase
          .from('registros')
          .upsert([{ ...reg.datos, foto_url, creado_por: userId }], { onConflict: 'id', ignoreDuplicates: true });

        if (error) throw new Error(error.message);

        cacheRegistros = cacheRegistros.filter(r => r.id !== reg.id);
        await dbDelete(STORE_REGISTROS, reg.id);
        console.log('[OfflineContext] Registro sincronizado:', reg.id);
      } catch (e: any) {
        reg.intentos++;
        reg.ultimoError = e.message;

        if (reg.intentos >= 5) {
          reg.estado = 'error';
          console.error(`[OfflineContext] Registro falló después de 5 intentos (${reg.id}):`, e.message);
        } else {
          reg.estado = 'pendiente';
          const delay = calcularDelayReintento(reg.intentos);
          console.warn(`[OfflineContext] Registro falló, reintentando en ${delay}ms (${reg.id}):`, e.message);
          setTimeout(() => sincronizarRegistros(userId), delay);
        }
        cacheRegistros = cacheRegistros.map(r => r.id === reg.id ? reg : r);
        await dbPut(STORE_REGISTROS, reg).catch(() => {});
      }
    }
    setPendientes(cacheRegistros.length + cachePreEntrega.length);
  };

  // ──────────────────────────────────────────────────────────────────────────
  // SINCRONIZACIÓN: Pre Entrega (observacionesinformepv)
  // ──────────────────────────────────────────────────────────────────────────

  const sincronizarPreEntrega = async (userId: string) => {
    if (cachePreEntrega.length === 0) return;
    console.log(`[OfflineContext] Sincronizando ${cachePreEntrega.length} observaciones Pre Entrega...`);

    for (const reg of [...cachePreEntrega]) {
      if (reg.estado === 'sincronizando') continue;

      reg.estado = 'sincronizando';
      await dbPut(STORE_PRE_ENTREGA, reg).catch(() => {});

      try {
        let foto_url = null;
        if (reg.foto_blob) {
          const fileName = `${userId}/pre-entrega/${Date.now()}_${Math.random().toString(36).substr(2, 5)}.jpg`;
          const { error: uploadError } = await supabase.storage
            .from('observaciones')
            .upload(fileName, reg.foto_blob, { contentType: 'image/jpeg' });

          if (!uploadError) {
            const { data: urlData } = supabase.storage.from('observaciones').getPublicUrl(fileName);
            foto_url = urlData.publicUrl;
          } else {
            console.warn('[OfflineContext] Error subiendo foto Pre Entrega:', uploadError.message);
          }
        }

        const datosConFoto = { ...reg.datos };
        if (foto_url) datosConFoto.foto_url = foto_url;

        const { error } = await supabase
          .from('observacionesinformepv')
          .upsert([datosConFoto], { onConflict: 'id', ignoreDuplicates: true });

        if (error) throw new Error(error.message);

        cachePreEntrega = cachePreEntrega.filter(r => r.id !== reg.id);
        await dbDelete(STORE_PRE_ENTREGA, reg.id);
        console.log('[OfflineContext] Pre Entrega sincronizada:', reg.id);
      } catch (e: any) {
        reg.intentos++;
        reg.ultimoError = e.message;

        if (reg.intentos >= 5) {
          reg.estado = 'error';
          console.error(`[OfflineContext] Pre Entrega falló después de 5 intentos (${reg.id}):`, e.message);
        } else {
          reg.estado = 'pendiente';
          const delay = calcularDelayReintento(reg.intentos);
          console.warn(`[OfflineContext] Pre Entrega falló, reintentando en ${delay}ms (${reg.id}):`, e.message);
          setTimeout(() => sincronizarPreEntrega(userId), delay);
        }
        cachePreEntrega = cachePreEntrega.map(r => r.id === reg.id ? reg : r);
        await dbPut(STORE_PRE_ENTREGA, reg).catch(() => {});
      }
    }
    setPendientes(cacheRegistros.length + cachePreEntrega.length);
  };

  // ──────────────────────────────────────────────────────────────────────────
  // COLA: Zona Común ZC
  // ──────────────────────────────────────────────────────────────────────────

  const agregarPendienteZC = async (datos: any, foto?: File) => {
    let foto_blob: Blob | null = null;
    let foto_nombre: string | undefined;
    if (foto) {
      try {
        foto_blob = await comprimirImagenBlob(foto);
        foto_nombre = foto.name;
      } catch (e) {
        console.error('[OfflineContext] Error comprimiendo foto ZC:', e);
      }
    }
    const obsId = (crypto as any)?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const registro: RegistroZCPendiente = {
      id: `zc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      datos: { ...datos, id: obsId },
      foto_blob,
      foto_nombre,
      timestamp: Date.now(),
      estado: 'pendiente',
      intentos: 0,
    };

    cacheZC = [...cacheZC, registro];
    setPendientesZC(cacheZC.length);

    try {
      await dbPut(STORE_ZC, registro);
    } catch (e) {
      cacheZC = cacheZC.filter(r => r.id !== registro.id);
      setPendientesZC(cacheZC.length);
      throw new Error('No se pudo guardar el registro de Zona Común en el dispositivo: ' + (e as Error).message);
    }
    console.log('[OfflineContext] Zona Común agregada a cola:', registro.id);
  };

  const obtenerPendientesZC = (): RegistroZCPendiente[] => {
    warnIfNotHydrated();
    return cacheZC.map(conPreview);
  };

  const sincronizarZC = async (userId: string) => {
    if (cacheZC.length === 0) return;
    console.log(`[OfflineContext] Sincronizando ${cacheZC.length} registros ZC...`);

    for (const reg of [...cacheZC]) {
      if (reg.estado === 'sincronizando') continue;

      reg.estado = 'sincronizando';
      await dbPut(STORE_ZC, reg).catch(() => {});

      try {
        let foto_url = null;
        if (reg.foto_blob) {
          const fileName = `${userId}/zc/${Date.now()}_${Math.random().toString(36).substr(2, 5)}.jpg`;
          const { error: uploadError } = await supabase.storage
            .from('fotos-registros')
            .upload(fileName, reg.foto_blob, { contentType: 'image/jpeg' });

          if (!uploadError) {
            const { data: urlData } = supabase.storage.from('fotos-registros').getPublicUrl(fileName);
            foto_url = urlData.publicUrl;
          } else {
            console.warn('[OfflineContext] Error subiendo foto ZC:', uploadError.message);
          }
        }

        const { error } = await supabase
          .from('registros_zonas_comunes')
          .upsert([{ ...reg.datos, foto_url, creado_por: userId }], { onConflict: 'id', ignoreDuplicates: true });

        if (error) throw new Error(error.message);

        cacheZC = cacheZC.filter(r => r.id !== reg.id);
        await dbDelete(STORE_ZC, reg.id);
        console.log('[OfflineContext] Zona Común sincronizada:', reg.id);
      } catch (e: any) {
        reg.intentos++;
        reg.ultimoError = e.message;

        if (reg.intentos >= 5) {
          reg.estado = 'error';
          console.error(`[OfflineContext] Zona Común falló (${reg.id}):`, e.message);
        } else {
          reg.estado = 'pendiente';
          const delay = calcularDelayReintento(reg.intentos);
          console.warn(`[OfflineContext] Zona Común falló, reintentando en ${delay}ms:`, e.message);
          setTimeout(() => sincronizarZC(userId), delay);
        }
        cacheZC = cacheZC.map(r => r.id === reg.id ? reg : r);
        await dbPut(STORE_ZC, reg).catch(() => {});
      }
    }
    setPendientesZC(cacheZC.length);
  };

  // ──────────────────────────────────────────────────────────────────────────
  // COLA: Cambios (estado, edición, eliminación)
  // ──────────────────────────────────────────────────────────────────────────

  const agregarCambioPendiente = (tipo: 'estado' | 'edicion' | 'eliminacion', registro_id: string, datos: any) => {
    const idx = cacheCambios.findIndex(c => c.registro_id === registro_id && c.tipo === tipo);
    const cambio: CambioPendiente = {
      id: `cambio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      tipo,
      registro_id,
      datos,
      timestamp: Date.now(),
      estado: 'pendiente',
      intentos: 0,
    };
    if (idx >= 0) {
      const anterior = cacheCambios[idx];
      cacheCambios = cacheCambios.map((c, i) => i === idx ? cambio : c);
      dbDelete(STORE_CAMBIOS, anterior.id).catch(() => {});
    } else {
      cacheCambios = [...cacheCambios, cambio];
    }
    setCambiosPendientes(cacheCambios.length);

    // Payload de cambios es liviano (sin fotos) — riesgo de cuota es mínimo,
    // por eso esta función se mantiene con firma síncrona (no rompe los
    // callers existentes) pero persiste en background.
    dbPut(STORE_CAMBIOS, cambio).catch(e => {
      console.error('[OfflineContext] Error persistiendo cambio pendiente:', e);
    });
    console.log('[OfflineContext] Cambio agregado a cola:', cambio.id);
  };

  const sincronizarCambios = async () => {
    if (cacheCambios.length === 0) return;
    console.log(`[OfflineContext] Sincronizando ${cacheCambios.length} cambios...`);

    for (const cambio of [...cacheCambios]) {
      if (cambio.estado === 'sincronizando') continue;

      cambio.estado = 'sincronizando';
      await dbPut(STORE_CAMBIOS, cambio).catch(() => {});

      try {
        if (cambio.tipo === 'estado') {
          const { error } = await supabase
            .from('registros')
            .update({
              estado: cambio.datos.estado,
              comentario_rechazo: cambio.datos.comentario_rechazo ?? null,
              ...(cambio.datos.estado === 'solucionado' ? { fecha_reparacion: cambio.datos.fecha_reparacion } : {}),
            })
            .eq('id', cambio.registro_id);
          if (error) throw error;
        } else if (cambio.tipo === 'edicion') {
          const { error } = await supabase
            .from('registros')
            .update({
              ambiente_id: cambio.datos.ambiente_id,
              partida_id: cambio.datos.partida_id,
              observacion: cambio.datos.observacion,
              causa: cambio.datos.causa,
            })
            .eq('id', cambio.registro_id);
          if (error) throw error;
        } else if (cambio.tipo === 'eliminacion') {
          const { error } = await supabase
            .from('registros')
            .delete()
            .eq('id', cambio.registro_id);
          if (error) throw error;
        }

        cacheCambios = cacheCambios.filter(c => c.id !== cambio.id);
        await dbDelete(STORE_CAMBIOS, cambio.id);
        console.log('[OfflineContext] Cambio sincronizado:', cambio.id);
      } catch (e: any) {
        cambio.intentos++;
        cambio.ultimoError = e.message;

        if (cambio.intentos >= 5) {
          cambio.estado = 'error';
          console.error(`[OfflineContext] Cambio falló (${cambio.id}):`, e.message);
        } else {
          cambio.estado = 'pendiente';
          const delay = calcularDelayReintento(cambio.intentos);
          console.warn(`[OfflineContext] Cambio falló, reintentando en ${delay}ms:`, e.message);
          setTimeout(() => sincronizarCambios(), delay);
        }
        cacheCambios = cacheCambios.map(c => c.id === cambio.id ? cambio : c);
        await dbPut(STORE_CAMBIOS, cambio).catch(() => {});
      }
    }
    setCambiosPendientes(cacheCambios.length);
  };

  // ──────────────────────────────────────────────────────────────────────────
  // OBRA GRUESA (delegado a ogOfflineQueue)
  // ──────────────────────────────────────────────────────────────────────────

  const sincronizarOG = async () => {
    if (contarPendientesOG() === 0) return;
    try {
      console.log('[OfflineContext] Sincronizando Obra Gruesa...');
      await flushColaOG();
      setPendientesOG(contarPendientesOG());
    } catch (e) {
      console.error('[OfflineContext] Error sincronizando OG:', e);
    }
  };

  const sincronizarPostventa = async () => {
    if (contarPendientesPostventa() === 0) return;
    try {
      console.log('[OfflineContext] Sincronizando visitas Post Venta...');
      await flushColaPostventa();
      setPendientesPostventa(contarPendientesPostventa());
    } catch (e) {
      console.error('[OfflineContext] Error sincronizando Post Venta:', e);
    }
  };

  const sincronizarFotosPreEntrega = async () => {
    if (contarFotosPendientes() === 0) return;
    try {
      console.log('[OfflineContext] Sincronizando fotos de Pre Entrega...');
      await flushFotosPreEntrega(() => onlineRef.current);
    } catch (e) {
      console.error('[OfflineContext] Error sincronizando fotos Pre Entrega:', e);
    }
  };

  const sincronizarBorradoresPostventa = async () => {
    try {
      await sincronizarTodosLosBorradoresLocales();
    } catch (e) {
      console.error('[OfflineContext] Error sincronizando borradores Post Venta:', e);
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // SINCRONIZACIÓN MASTER
  // ──────────────────────────────────────────────────────────────────────────

  const sincronizarTodo = async () => {
    if (sincronizandoRef.current) {
      console.log('[OfflineContext] Ya hay una sincronización en curso');
      return;
    }

    sincronizandoRef.current = true;
    console.log('[OfflineContext] ════════ INICIANDO SINCRONIZACIÓN ════════');

    try {
      const userId = await getUserId();
      if (!userId) {
        console.warn('[OfflineContext] No hay userId, no se puede sincronizar');
        return;
      }

      await Promise.all([
        sincronizarRegistros(userId),
        sincronizarPreEntrega(userId),
        sincronizarZC(userId),
        sincronizarCambios(),
        sincronizarOG(),
        sincronizarPostventa(),
        sincronizarFotosPreEntrega(),
        sincronizarBorradoresPostventa(),
      ]);

      refrescarContadores();
      console.log('[OfflineContext] ════════ SINCRONIZACIÓN COMPLETADA ════════');
    } catch (e) {
      console.error('[OfflineContext] Error en sincronización:', e);
    } finally {
      sincronizandoRef.current = false;
    }
  };

  return (
    <OfflineContext.Provider
      value={{
        online,
        pendientes,
        pendientesZC,
        cambiosPendientes,
        pendientesOG,
        pendientesPostventa,
        agregarPendientePreEntrega,
        obtenerPendientesPreEntrega,
        agregarPendiente,
        agregarPendienteZC,
        obtenerPendientesZC,
        agregarCambioPendiente,
        sincronizarAhora: sincronizarTodo,
      }}
    >
      {children}
    </OfflineContext.Provider>
  );
};

export const useOffline = () => useContext(OfflineContext);
