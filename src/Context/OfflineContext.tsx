// OfflineContext.tsx — VERSIÓN REFORZADA (FMS Agosto 2026)
// Soporta: Pre Entrega (observacionesinformepv), Registros ZC, Obra Gruesa (og_registros)
// Fixes: Base64→Blob correcto, Reintentos + backoff exponencial, Estado por registro

import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Network } from '@capacitor/network';
import { supabase } from '../supabase';
import { flushColaOG, contarPendientesOG } from '../utils/Ogofflinequeue';

// ══════════════════════════════════════════════════════════════════════════════
// TIPOS
// ══════════════════════════════════════════════════════════════════════════════

type EstadoSincronizacion = 'pendiente' | 'sincronizando' | 'ok' | 'error';

interface RegistroPendiente {
  id: string;
  datos: any;
  foto_base64?: string;
  foto_nombre?: string;
  timestamp: number;
  estado: EstadoSincronizacion;
  intentos: number;
  ultimoError?: string;
  modulo: 'observaciones' | 'pre-entrega'; // Distinguir tablas
}

interface RegistroZCPendiente {
  id: string;
  datos: any;
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
  
  // Pre Entrega (observacionesinformepv)
  agregarPendientePreEntrega: (datos: any, foto?: File | Blob) => Promise<void>;
  obtenerPendientesPreEntrega: () => RegistroPendiente[];
  
  // Registros Zona Común
  agregarPendiente: (datos: any, foto?: File) => Promise<void>;
  agregarPendienteZC: (datos: any, foto?: File) => Promise<void>;
  obtenerPendientesZC: () => RegistroZCPendiente[];
  
  // Cambios
  agregarCambioPendiente: (tipo: 'estado' | 'edicion' | 'eliminacion', registro_id: string, datos: any) => void;
  
  // Sincronización manual
  sincronizarAhora: () => Promise<void>;
}

const OfflineContext = createContext<OfflineContextType>({
  online: true,
  pendientes: 0,
  pendientesZC: 0,
  cambiosPendientes: 0,
  pendientesOG: 0,
  agregarPendientePreEntrega: async () => {},
  obtenerPendientesPreEntrega: () => [],
  agregarPendiente: async () => {},
  agregarPendienteZC: async () => {},
  obtenerPendientesZC: () => [],
  agregarCambioPendiente: () => {},
  sincronizarAhora: async () => {},
});

// ══════════════════════════════════════════════════════════════════════════════
// STORAGE KEYS
// ══════════════════════════════════════════════════════════════════════════════

const STORAGE_KEY_REGISTROS = 'registros_pendientes'; // Zona Común
const STORAGE_KEY_PRE_ENTREGA = 'pre_entrega_pendientes'; // Pre Entrega
const STORAGE_KEY_ZC = 'registros_zc_pendientes';
const CAMBIOS_STORAGE_KEY = 'cambios_pendientes';

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
 * Convierte data URL (base64) a Blob correctamente
 * Maneja tanto "data:image/jpeg;base64,..." como URLs normales
 */
const dataUrlToBlob = (dataUrl: string): Blob => {
  const parts = dataUrl.split(',');
  const header = parts[0];
  const data = parts[1];
  
  // Extraer MIME type de "data:image/jpeg;base64" → "image/jpeg"
  const mimeMatch = header.match(/:(.*?);/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  
  // Decodificar base64 a bytes
  const bstr = atob(data);
  const n = bstr.length;
  const u8arr = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    u8arr[i] = bstr.charCodeAt(i);
  }
  
  return new Blob([u8arr], { type: mimeType });
};

const comprimirImagen = (file: File | Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1200;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
        else { width = Math.round(width * MAX / height); height = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Error cargando imagen')); };
    img.src = url;
  });
};

/**
 * Reintentos con backoff exponencial: 1s, 2s, 4s, 8s, 16s (max 5 intentos)
 */
const calcularDelayReintento = (intentos: number): number => {
  return Math.min(1000 * Math.pow(2, intentos), 16000);
};

// ══════════════════════════════════════════════════════════════════════════════
// PROVIDER
// ══════════════════════════════════════════════════════════════════════════════

export const OfflineProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [online, setOnline] = useState(true);
  const [pendientes, setPendientes] = useState(0);
  const [pendientesZC, setPendientesZC] = useState(0);
  const [cambiosPendientes, setCambiosPendientes] = useState(0);
  const [pendientesOG, setPendientesOG] = useState(contarPendientesOG());
  
  const sincronizandoRef = useRef(false);
  const onlineRef = useRef(true);

  // ──────────────────────────────────────────────────────────────────────────
  // LIFECYCLE: Detectar cambios de conexión
  // ──────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    Network.getStatus().then(s => {
      setOnline(s.connected);
      onlineRef.current = s.connected;
      if (s.connected) {
        sincronizarTodo();
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

    contarPendientes();
    contarPendientesZC();
    contarCambios();

    // Reintentar cada 30s si sigue habiendo pendientes
    const interval = setInterval(() => {
      if (onlineRef.current && (pendientes > 0 || pendientesZC > 0 || cambiosPendientes > 0)) {
        console.log('[OfflineContext] Reintentando sincronización automática...');
        sincronizarTodo();
      }
    }, 30000);

    return () => {
      listenerPromise.then(l => l.remove());
      clearInterval(interval);
    };
  }, []);

  // ──────────────────────────────────────────────────────────────────────────
  // COLA: Registros Zona Común (observaciones)
  // ──────────────────────────────────────────────────────────────────────────

  const contarPendientes = () => setPendientes(obtenerCola().length);

  const obtenerCola = (): RegistroPendiente[] => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_REGISTROS);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('[OfflineContext] Error leyendo cola registros:', e);
      return [];
    }
  };

  const guardarCola = (cola: RegistroPendiente[]) => {
    try {
      localStorage.setItem(STORAGE_KEY_REGISTROS, JSON.stringify(cola));
      setPendientes(cola.length);
    } catch (e) {
      console.error('[OfflineContext] Error guardando cola registros:', e);
    }
  };

  const agregarPendiente = async (datos: any, foto?: File) => {
    let foto_base64: string | undefined;
    let foto_nombre: string | undefined;
    if (foto) {
      try {
        foto_base64 = await comprimirImagen(foto);
        foto_nombre = foto.name;
      } catch (e) {
        console.error('[OfflineContext] Error comprimiendo foto:', e);
      }
    }
    // 🔑 UUID de fila para insert idempotente en reintentos (ver Pre Entrega).
    const obsId = (crypto as any)?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const registro: RegistroPendiente = {
      id: `obs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      datos: { ...datos, id: obsId },
      foto_base64,
      foto_nombre,
      timestamp: Date.now(),
      estado: 'pendiente',
      intentos: 0,
      modulo: 'observaciones',
    };
    const cola = obtenerCola();
    cola.push(registro);
    guardarCola(cola);
    console.log('[OfflineContext] Observación agregada a cola:', registro.id);
  };

  // ──────────────────────────────────────────────────────────────────────────
  // COLA: Pre Entrega (observacionesinformepv)
  // ──────────────────────────────────────────────────────────────────────────

  const obtenerColaPreEntrega = (): RegistroPendiente[] => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_PRE_ENTREGA);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('[OfflineContext] Error leyendo cola Pre Entrega:', e);
      return [];
    }
  };

  const guardarColaPreEntrega = (cola: RegistroPendiente[]) => {
    try {
      localStorage.setItem(STORAGE_KEY_PRE_ENTREGA, JSON.stringify(cola));
      // FIX: reflejar el tamaño real de la cola. Antes hacía prev+1, pero
      // esta función también se llama dentro del loop de sync, así que el
      // contador se inflaba en cada guardado en vez de mostrar los pendientes.
      setPendientes(cola.length);
    } catch (e) {
      console.error('[OfflineContext] Error guardando cola Pre Entrega:', e);
    }
  };

  const agregarPendientePreEntrega = async (datos: any, foto?: File | Blob) => {
    let foto_base64: string | undefined;
    let foto_nombre: string | undefined;
    if (foto) {
      try {
        foto_base64 = await comprimirImagen(foto);
        foto_nombre = foto instanceof File ? foto.name : 'foto.jpg';
      } catch (e) {
        console.error('[OfflineContext] Error comprimiendo foto Pre Entrega:', e);
      }
    }
    // 🔑 UUID determinístico para la FILA de la BD (distinto del id de cola).
    // Viaja DENTRO de datos y se reusa en cada reintento → el upsert lo ignora
    // si ya se insertó, evitando duplicados por respuesta perdida (timeout/señal).
    const obsId = (crypto as any)?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const registro: RegistroPendiente = {
      id: `pv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      datos: { ...datos, id: obsId },
      foto_base64,
      foto_nombre,
      timestamp: Date.now(),
      estado: 'pendiente',
      intentos: 0,
      modulo: 'pre-entrega',
    };
    const cola = obtenerColaPreEntrega();
    cola.push(registro);
    guardarColaPreEntrega(cola);
    console.log('[OfflineContext] Pre Entrega agregada a cola:', registro.id);
  };

  const obtenerPendientesPreEntrega = (): RegistroPendiente[] => {
    return obtenerColaPreEntrega();
  };

  // ──────────────────────────────────────────────────────────────────────────
  // SINCRONIZACIÓN: Registros Zona Común
  // ──────────────────────────────────────────────────────────────────────────

  const sincronizarRegistros = async (userId: string) => {
    const cola = obtenerCola();
    if (cola.length === 0) return;

    console.log(`[OfflineContext] Sincronizando ${cola.length} registros ZC...`);

    for (let i = 0; i < cola.length; i++) {
      const reg = cola[i];
      if (reg.estado === 'sincronizando') continue; // Ya se está sincronizando

      reg.estado = 'sincronizando';
      guardarCola(cola);

      try {
        let foto_url = null;
        if (reg.foto_base64 && reg.foto_nombre) {
          try {
            const blob = dataUrlToBlob(reg.foto_base64);
            const ext = reg.foto_nombre.split('.').pop() || 'jpg';
            const fileName = `${userId}/registros/${Date.now()}_${Math.random().toString(36).substr(2, 5)}.${ext}`;

            const { error: uploadError } = await supabase.storage
              .from('fotos-registros')
              .upload(fileName, blob, { contentType: blob.type });

            if (!uploadError) {
              const { data: urlData } = supabase.storage
                .from('fotos-registros')
                .getPublicUrl(fileName);
              foto_url = urlData.publicUrl;
              console.log('[OfflineContext] Foto subida:', fileName);
            } else {
              console.warn('[OfflineContext] Error subiendo foto:', uploadError.message);
              // Continuar sin foto si falla
            }
          } catch (e: any) {
            console.warn('[OfflineContext] Error procesando foto:', e.message);
            // No bloquear si falla la foto
          }
        }

        // upsert idempotente por id (evita duplicar si el reintento reenvía
        // una fila cuya respuesta se perdió).
        const { error } = await supabase
          .from('registros')
          .upsert([{ ...reg.datos, foto_url, creado_por: userId }], { onConflict: 'id', ignoreDuplicates: true });

        if (error) throw new Error(error.message);

        reg.estado = 'ok';
        reg.ultimoError = undefined;
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
      }

      guardarCola(cola);
    }

    // Eliminar completados
    const nuevaCola = cola.filter(r => r.estado !== 'ok');
    guardarCola(nuevaCola);
  };

  // ──────────────────────────────────────────────────────────────────────────
  // SINCRONIZACIÓN: Pre Entrega (observacionesinformepv)
  // ──────────────────────────────────────────────────────────────────────────

  const sincronizarPreEntrega = async (userId: string) => {
    const cola = obtenerColaPreEntrega();
    if (cola.length === 0) return;

    console.log(`[OfflineContext] Sincronizando ${cola.length} observaciones Pre Entrega...`);

    for (let i = 0; i < cola.length; i++) {
      const reg = cola[i];
      if (reg.estado === 'sincronizando') continue;

      reg.estado = 'sincronizando';
      guardarColaPreEntrega(cola);

      try {
        let foto_url = null;
        if (reg.foto_base64 && reg.foto_nombre) {
          try {
            const blob = dataUrlToBlob(reg.foto_base64);
            const ext = reg.foto_nombre.split('.').pop() || 'jpg';
            const fileName = `${userId}/pre-entrega/${Date.now()}_${Math.random().toString(36).substr(2, 5)}.${ext}`;

            const { error: uploadError } = await supabase.storage
              .from('observaciones')
              .upload(fileName, blob, { contentType: blob.type });

            if (!uploadError) {
              const { data: urlData } = supabase.storage
                .from('observaciones')
                .getPublicUrl(fileName);
              foto_url = urlData.publicUrl;
              console.log('[OfflineContext] Foto Pre Entrega subida:', fileName);
            } else {
              console.warn('[OfflineContext] Error subiendo foto Pre Entrega:', uploadError.message);
            }
          } catch (e: any) {
            console.warn('[OfflineContext] Error procesando foto Pre Entrega:', e.message);
          }
        }

        const datosConFoto = { ...reg.datos };
        if (foto_url) datosConFoto.foto_url = foto_url;

        // upsert idempotente: si el id ya se insertó en un intento cuya respuesta
        // se perdió, la BD lo ignora en vez de duplicar. Dos obs legítimas
        // distintas (ids distintos) sí conviven.
        const { error } = await supabase
          .from('observacionesinformepv')
          .upsert([datosConFoto], { onConflict: 'id', ignoreDuplicates: true });

        if (error) throw new Error(error.message);

        reg.estado = 'ok';
        reg.ultimoError = undefined;
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
      }

      guardarColaPreEntrega(cola);
    }

    // Eliminar completados
    const nuevaCola = cola.filter(r => r.estado !== 'ok');
    guardarColaPreEntrega(nuevaCola);
  };

  // ──────────────────────────────────────────────────────────────────────────
  // COLA: Zona Común ZC (dejando original para compatibilidad)
  // ──────────────────────────────────────────────────────────────────────────

  const contarPendientesZC = () => setPendientesZC(obtenerColaZC().length);

  const obtenerColaZC = (): RegistroZCPendiente[] => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_ZC);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('[OfflineContext] Error leyendo cola ZC:', e);
      return [];
    }
  };

  const guardarColaZC = (cola: RegistroZCPendiente[]) => {
    try {
      localStorage.setItem(STORAGE_KEY_ZC, JSON.stringify(cola));
      setPendientesZC(cola.length);
    } catch (e) {
      console.error('[OfflineContext] Error guardando cola ZC:', e);
    }
  };

  const agregarPendienteZC = async (datos: any, foto?: File) => {
    let foto_base64: string | undefined;
    let foto_nombre: string | undefined;
    if (foto) {
      try {
        foto_base64 = await comprimirImagen(foto);
        foto_nombre = foto.name;
      } catch (e) {
        console.error('[OfflineContext] Error comprimiendo foto ZC:', e);
      }
    }
    // 🔑 UUID de fila para insert idempotente en reintentos (ver Pre Entrega).
    const obsId = (crypto as any)?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const registro: RegistroZCPendiente = {
      id: `zc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      datos: { ...datos, id: obsId },
      foto_base64,
      foto_nombre,
      timestamp: Date.now(),
      estado: 'pendiente',
      intentos: 0,
    };
    const cola = obtenerColaZC();
    cola.push(registro);
    guardarColaZC(cola);
    console.log('[OfflineContext] Zona Común agregada a cola:', registro.id);
  };

  const obtenerPendientesZC = (): RegistroZCPendiente[] => {
    return obtenerColaZC();
  };

  const sincronizarZC = async (userId: string) => {
    const cola = obtenerColaZC();
    if (cola.length === 0) return;

    console.log(`[OfflineContext] Sincronizando ${cola.length} registros ZC...`);

    for (let i = 0; i < cola.length; i++) {
      const reg = cola[i];
      if (reg.estado === 'sincronizando') continue;

      reg.estado = 'sincronizando';
      guardarColaZC(cola);

      try {
        let foto_url = null;
        if (reg.foto_base64 && reg.foto_nombre) {
          try {
            const blob = dataUrlToBlob(reg.foto_base64);
            const ext = reg.foto_nombre.split('.').pop() || 'jpg';
            const fileName = `${userId}/zc/${Date.now()}_${Math.random().toString(36).substr(2, 5)}.${ext}`;

            const { error: uploadError } = await supabase.storage
              .from('fotos-registros')
              .upload(fileName, blob, { contentType: blob.type });

            if (!uploadError) {
              const { data: urlData } = supabase.storage
                .from('fotos-registros')
                .getPublicUrl(fileName);
              foto_url = urlData.publicUrl;
            } else {
              console.warn('[OfflineContext] Error subiendo foto ZC:', uploadError.message);
            }
          } catch (e: any) {
            console.warn('[OfflineContext] Error procesando foto ZC:', e.message);
          }
        }

        // upsert idempotente por id (evita duplicar si el reintento reenvía
        // una fila cuya respuesta se perdió).
        const { error } = await supabase
          .from('registros_zonas_comunes')
          .upsert([{ ...reg.datos, foto_url, creado_por: userId }], { onConflict: 'id', ignoreDuplicates: true });

        if (error) throw new Error(error.message);

        reg.estado = 'ok';
        reg.ultimoError = undefined;
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
      }

      guardarColaZC(cola);
    }

    const nuevaCola = cola.filter(r => r.estado !== 'ok');
    guardarColaZC(nuevaCola);
  };

  // ──────────────────────────────────────────────────────────────────────────
  // COLA: Cambios (estado, edición, eliminación)
  // ──────────────────────────────────────────────────────────────────────────

  const contarCambios = () => setCambiosPendientes(obtenerColaCambios().length);

  const obtenerColaCambios = (): CambioPendiente[] => {
    try {
      const raw = localStorage.getItem(CAMBIOS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('[OfflineContext] Error leyendo cambios:', e);
      return [];
    }
  };

  const guardarColaCambios = (cola: CambioPendiente[]) => {
    try {
      localStorage.setItem(CAMBIOS_STORAGE_KEY, JSON.stringify(cola));
      setCambiosPendientes(cola.length);
    } catch (e) {
      console.error('[OfflineContext] Error guardando cambios:', e);
    }
  };

  const agregarCambioPendiente = (tipo: 'estado' | 'edicion' | 'eliminacion', registro_id: string, datos: any) => {
    const cola = obtenerColaCambios();
    const idx = cola.findIndex(c => c.registro_id === registro_id && c.tipo === tipo);
    const cambio: CambioPendiente = {
      id: `cambio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      tipo,
      registro_id,
      datos,
      timestamp: Date.now(),
      estado: 'pendiente',
      intentos: 0,
    };
    if (idx >= 0) cola[idx] = cambio;
    else cola.push(cambio);
    guardarColaCambios(cola);
    console.log('[OfflineContext] Cambio agregado a cola:', cambio.id);
  };

  const sincronizarCambios = async () => {
    const cola = obtenerColaCambios();
    if (cola.length === 0) return;

    console.log(`[OfflineContext] Sincronizando ${cola.length} cambios...`);

    for (let i = 0; i < cola.length; i++) {
      const cambio = cola[i];
      if (cambio.estado === 'sincronizando') continue;

      cambio.estado = 'sincronizando';
      guardarColaCambios(cola);

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

        cambio.estado = 'ok';
        cambio.ultimoError = undefined;
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
      }

      guardarColaCambios(cola);
    }

    const nuevaCola = cola.filter(c => c.estado !== 'ok');
    guardarColaCambios(nuevaCola);
  };

  // ──────────────────────────────────────────────────────────────────────────
  // OBRA GRUESA (delegado a ogOfflinequeue)
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
      ]);

      // Recargar contadores
      contarPendientes();
      contarPendientesZC();
      contarCambios();

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