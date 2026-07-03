// OfflineContext.tsx
import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Network } from '@capacitor/network';
import { supabase } from '../supabase';
import { flushColaOG, contarPendientesOG } from '../utils/Ogofflinequeue'; // ← FMS offline OG

interface RegistroPendiente {
  id: string;
  datos: any;
  foto_base64?: string;
  foto_nombre?: string;
  timestamp: number;
}

interface RegistroZCPendiente {
  id: string;
  datos: any;
  foto_base64?: string;
  foto_nombre?: string;
  timestamp: number;
}

interface CambioPendiente {
  id: string;
  tipo: 'estado' | 'edicion' | 'eliminacion';
  registro_id: string;
  datos: any;
  timestamp: number;
}

interface OfflineContextType {
  online: boolean;
  pendientes: number;
  pendientesZC: number;
  cambiosPendientes: number;
  pendientesOG: number; // ← FMS offline OG
  agregarPendiente: (datos: any, foto?: File) => Promise<void>;
  agregarPendienteZC: (datos: any, foto?: File) => Promise<void>;
  agregarCambioPendiente: (tipo: 'estado' | 'edicion' | 'eliminacion', registro_id: string, datos: any) => void;
  obtenerPendientesZC: () => RegistroZCPendiente[];
}

const OfflineContext = createContext<OfflineContextType>({
  online: true,
  pendientes: 0,
  pendientesZC: 0,
  cambiosPendientes: 0,
  pendientesOG: 0, // ← FMS offline OG
  agregarPendiente: async () => {},
  agregarPendienteZC: async () => {},
  agregarCambioPendiente: () => {},
  obtenerPendientesZC: () => [],
});

const STORAGE_KEY         = 'registros_pendientes';
const STORAGE_KEY_ZC      = 'registros_zc_pendientes';
const CAMBIOS_STORAGE_KEY = 'cambios_pendientes';

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

const comprimirImagen = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1200;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
        else                { width = Math.round(width * MAX / height);  height = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Error cargando imagen')); };
    img.src = url;
  });
};

export const OfflineProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [online, setOnline]                       = useState(true);
  const [pendientes, setPendientes]               = useState(0);
  const [pendientesZC, setPendientesZC]           = useState(0);
  const [cambiosPendientes, setCambiosPendientes] = useState(0);
  const [pendientesOG, setPendientesOG]           = useState(contarPendientesOG()); // ← FMS offline OG
  const sincronizando                             = useRef(false);
  const sincronizandoZC                           = useRef(false);
  const sincronizandoCambios                      = useRef(false);
  const sincronizandoOG                           = useRef(false); // ← FMS offline OG
  const onlineRef                                 = useRef(true);

  useEffect(() => {
    Network.getStatus().then(s => {
      setOnline(s.connected);
      onlineRef.current = s.connected;
    });

    const listenerPromise = Network.addListener('networkStatusChange', s => {
      setOnline(s.connected);
      onlineRef.current = s.connected;
      if (s.connected) {
        sincronizar();
        sincronizarZC();
        sincronizarCambios();
        sincronizarOG(); // ← FMS offline OG
      }
    });

    contarPendientes();
    contarPendientesZC();
    contarCambios();

    const interval = setInterval(() => {
      if (onlineRef.current) {
        sincronizar();
        sincronizarZC();
        sincronizarCambios();
        sincronizarOG(); // ← FMS offline OG
      }
    }, 30000);

    return () => {
      listenerPromise.then(l => l.remove());
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (online) {
      sincronizar();
      sincronizarZC();
      sincronizarCambios();
      sincronizarOG(); // ← FMS offline OG
    }
  }, [online]);

  // ── Cola registros deptos ─────────────────────────────────────────────────

  const contarPendientes = () => setPendientes(obtenerCola().length);

  const obtenerCola = (): RegistroPendiente[] => {
    try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
  };

  const guardarCola = (cola: RegistroPendiente[]) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cola)); setPendientes(cola.length); } catch (e) { console.error('Error guardando cola:', e); }
  };

  const agregarPendiente = async (datos: any, foto?: File) => {
    let foto_base64: string | undefined;
    let foto_nombre: string | undefined;
    if (foto) {
      try { foto_base64 = await comprimirImagen(foto); foto_nombre = foto.name; } catch (e) { console.error('Error comprimiendo foto:', e); }
    }
    const registro: RegistroPendiente = { id: `local_${Date.now()}_${Math.random()}`, datos, foto_base64, foto_nombre, timestamp: Date.now() };
    const cola = obtenerCola();
    cola.push(registro);
    guardarCola(cola);
  };

  const sincronizar = async () => {
    if (sincronizando.current) return;
    const cola = obtenerCola();
    if (cola.length === 0) return;
    sincronizando.current = true;
    const userId = await getUserId();
    if (!userId) { sincronizando.current = false; return; }
    const exitosos: string[] = [];
    for (const reg of cola) {
      try {
        let foto_url = null, foto_antes_url = null;
        if (reg.foto_base64 && reg.foto_nombre) {
          const ext = reg.foto_nombre.split('.').pop();
          const fileName = `${userId}/${Date.now()}_1.${ext}`;
          const blob = await fetch(reg.foto_base64).then(r => r.blob());
          const { error: uploadError } = await supabase.storage.from('fotos-registros').upload(fileName, blob, { contentType: 'image/jpeg' });
          if (!uploadError) { const { data: urlData } = supabase.storage.from('fotos-registros').getPublicUrl(fileName); foto_url = urlData.publicUrl; }
        }
        if ((reg as any).foto_antes_base64 && (reg as any).foto_antes_nombre) {
          const ext = (reg as any).foto_antes_nombre.split('.').pop();
          const fileName = `${userId}/${Date.now()}_antes.${ext}`;
          const blob = await fetch((reg as any).foto_antes_base64).then(r => r.blob());
          const { error: uploadError } = await supabase.storage.from('fotos-registros').upload(fileName, blob, { contentType: 'image/jpeg' });
          if (!uploadError) { const { data: urlData } = supabase.storage.from('fotos-registros').getPublicUrl(fileName); foto_url = urlData.publicUrl; }
        }
        const { error } = await supabase.from('registros').insert({ ...reg.datos, foto_url, foto_antes_url, creado_por: userId });
        if (!error) exitosos.push(reg.id);
        else console.error('Error sincronizando registro:', error.message);
      } catch (e) { console.error('Error en registro:', e); }
    }
    guardarCola(cola.filter(r => !exitosos.includes(r.id)));
    sincronizando.current = false;
  };

  // ── Cola registros ZC ─────────────────────────────────────────────────────

  const contarPendientesZC = () => setPendientesZC(obtenerColaZC().length);

  const obtenerColaZC = (): RegistroZCPendiente[] => {
    try { const raw = localStorage.getItem(STORAGE_KEY_ZC); return raw ? JSON.parse(raw) : []; } catch { return []; }
  };

  const guardarColaZC = (cola: RegistroZCPendiente[]) => {
    try { localStorage.setItem(STORAGE_KEY_ZC, JSON.stringify(cola)); setPendientesZC(cola.length); } catch (e) { console.error('Error guardando cola ZC:', e); }
  };

  const agregarPendienteZC = async (datos: any, foto?: File) => {
    let foto_base64: string | undefined;
    let foto_nombre: string | undefined;
    if (foto) {
      try { foto_base64 = await comprimirImagen(foto); foto_nombre = foto.name; } catch (e) { console.error('Error comprimiendo foto ZC:', e); }
    }
    const registro: RegistroZCPendiente = { id: `zc_local_${Date.now()}_${Math.random()}`, datos, foto_base64, foto_nombre, timestamp: Date.now() };
    const cola = obtenerColaZC();
    cola.push(registro);
    guardarColaZC(cola);
  };

  const sincronizarZC = async () => {
    if (sincronizandoZC.current) return;
    const cola = obtenerColaZC();
    if (cola.length === 0) return;
    sincronizandoZC.current = true;
    const userId = await getUserId();
    if (!userId) { sincronizandoZC.current = false; return; }
    const exitosos: string[] = [];
    for (const reg of cola) {
      try {
        let foto_url = null;
        if (reg.foto_base64 && reg.foto_nombre) {
          const ext = reg.foto_nombre.split('.').pop();
          const fileName = `${userId}/zc_${Date.now()}.${ext}`;
          const blob = await fetch(reg.foto_base64).then(r => r.blob());
          const { error: uploadError } = await supabase.storage.from('fotos-registros').upload(fileName, blob, { contentType: 'image/jpeg' });
          if (!uploadError) { const { data: urlData } = supabase.storage.from('fotos-registros').getPublicUrl(fileName); foto_url = urlData.publicUrl; }
        }
        const { error } = await supabase.from('registros_zonas_comunes').insert({ ...reg.datos, foto_url, creado_por: userId });
        if (!error) exitosos.push(reg.id);
        else console.error('Error sincronizando ZC:', error.message);
      } catch (e) { console.error('Error en registro ZC:', e); }
    }
    guardarColaZC(cola.filter(r => !exitosos.includes(r.id)));
    sincronizandoZC.current = false;
  };

  // ── Cola cambios ──────────────────────────────────────────────────────────

  const contarCambios = () => setCambiosPendientes(obtenerColaCambios().length);

  const obtenerColaCambios = (): CambioPendiente[] => {
    try { const raw = localStorage.getItem(CAMBIOS_STORAGE_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
  };

  const guardarColaCambios = (cola: CambioPendiente[]) => {
    try { localStorage.setItem(CAMBIOS_STORAGE_KEY, JSON.stringify(cola)); setCambiosPendientes(cola.length); } catch (e) { console.error('Error guardando cola cambios:', e); }
  };

  const agregarCambioPendiente = (tipo: 'estado' | 'edicion' | 'eliminacion', registro_id: string, datos: any) => {
    const cola = obtenerColaCambios();
    const idx  = cola.findIndex(c => c.registro_id === registro_id && c.tipo === tipo);
    const cambio: CambioPendiente = { id: `cambio_${Date.now()}_${Math.random()}`, tipo, registro_id, datos, timestamp: Date.now() };
    if (idx >= 0) cola[idx] = cambio;
    else cola.push(cambio);
    guardarColaCambios(cola);
  };

  const sincronizarCambios = async () => {
    if (sincronizandoCambios.current) return;
    const cola = obtenerColaCambios();
    if (cola.length === 0) return;
    sincronizandoCambios.current = true;
    const exitosos: string[] = [];
    for (const cambio of cola) {
      try {
        if (cambio.tipo === 'estado') {
          const { error } = await supabase.from('registros').update({ estado: cambio.datos.estado, comentario_rechazo: cambio.datos.comentario_rechazo ?? null, ...(cambio.datos.estado === 'solucionado' ? { fecha_reparacion: cambio.datos.fecha_reparacion } : {}) }).eq('id', cambio.registro_id);
          if (!error) exitosos.push(cambio.id);
        } else if (cambio.tipo === 'edicion') {
          const { error } = await supabase.from('registros').update({ ambiente_id: cambio.datos.ambiente_id, partida_id: cambio.datos.partida_id, observacion: cambio.datos.observacion, causa: cambio.datos.causa }).eq('id', cambio.registro_id);
          if (!error) exitosos.push(cambio.id);
        } else if (cambio.tipo === 'eliminacion') {
          const { error } = await supabase.from('registros').delete().eq('id', cambio.registro_id);
          if (!error) exitosos.push(cambio.id);
        }
      } catch (e) { console.error('Error sincronizando cambio:', e); }
    }
    guardarColaCambios(cola.filter(c => !exitosos.includes(c.id)));
    sincronizandoCambios.current = false;
  };

  // ── Cola OG ───────────────────────────────────────────────────────────────
  // FMS offline OG — flush delegado a ogOfflineQueue.ts (sube fotos + INSERT)

  const sincronizarOG = async () => {
    if (sincronizandoOG.current) return;
    if (contarPendientesOG() === 0) return;
    sincronizandoOG.current = true;
    try {
      await flushColaOG();
      setPendientesOG(contarPendientesOG());
    } catch (e) {
      console.error('[OfflineContext] Error sincronizando OG:', e);
    } finally {
      sincronizandoOG.current = false;
    }
  };

  return (
    <OfflineContext.Provider value={{
      online, pendientes, pendientesZC, cambiosPendientes,
      pendientesOG, // ← FMS offline OG
      agregarPendiente, agregarPendienteZC, agregarCambioPendiente,
      obtenerPendientesZC: obtenerColaZC,
    }}>
      {children}
    </OfflineContext.Provider>
  );
};

export const useOffline = () => useContext(OfflineContext);
