import { createContext, useEffect } from 'react';
import { supabase } from '../supabase';
import { useOffline } from '../Context/OfflineContext';

const KEYS = {
  usuario:    'cache_usuario',
  proyectos:  'cache_proyectos',
  torres:     'cache_torres',
  deptos:     'cache_deptos',
  ambientes:  'cache_ambientes',
  partidas:   'cache_partidas',
  ultimoDepto:'cache_ultimo_depto',
  registros:  'cache_registros',
};

const guardar = (key: string, data: any) => {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
};
const leer = (key: string) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};

export const cache = {
  getUsuario:     ()            => leer(KEYS.usuario),
  getProyectos:   ()            => leer(KEYS.proyectos) ?? [],
  getTorres:      (pId: string) => (leer(KEYS.torres)  ?? {})[pId] ?? [],
  getDeptos:      (tId: string) => (leer(KEYS.deptos)  ?? {})[tId] ?? [],
  getAmbientes:   ()            => leer(KEYS.ambientes) ?? [],
  getPartidas:    ()            => leer(KEYS.partidas)  ?? [],
  getUltimoDepto: ()            => leer(KEYS.ultimoDepto),
  getRegistros:   (deptoId: string) => (leer(KEYS.registros) ?? {})[deptoId] ?? [],

  setUsuario:     (data: any)   => guardar(KEYS.usuario, data),
  setProyectos:   (data: any)   => guardar(KEYS.proyectos, data),
  setAmbientes:   (data: any)   => guardar(KEYS.ambientes, data),
  setPartidas:    (data: any)   => guardar(KEYS.partidas, data),
  setUltimoDepto: (data: any)   => guardar(KEYS.ultimoDepto, data),

  setTorres: (pId: string, data: any) => {
    const all = leer(KEYS.torres) ?? {};
    all[pId] = data;
    guardar(KEYS.torres, all);
  },
  setDeptos: (tId: string, data: any) => {
    const all = leer(KEYS.deptos) ?? {};
    all[tId] = data;
    guardar(KEYS.deptos, all);
  },
  setRegistros: (deptoId: string, data: any) => {
    const all = leer(KEYS.registros) ?? {};
    all[deptoId] = data;
    guardar(KEYS.registros, all);
  },

  hayDatos: () => {
    const u = leer(KEYS.usuario);
    const p = leer(KEYS.proyectos);
    return !!(u && p && Array.isArray(p) && p.length > 0);
  },
};

export const sincronizarCache = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: perfil } = await supabase
      .from('usuarios').select('*').eq('id', user.id).single();
    if (perfil) {
      cache.setUsuario(perfil);
      localStorage.setItem('detalles_user_id', user.id);
    }

    const [amb, part] = await Promise.all([
      supabase.from('ambientes').select('*').order('nombre'),
      supabase.from('partidas').select('*').order('nombre'),
    ]);
    if (amb.data)  cache.setAmbientes(amb.data);
    if (part.data) cache.setPartidas(part.data);

    let proyectos: any[] = [];
    if (perfil?.rol === 'administrador') {
      const { data } = await supabase.from('proyectos').select('*').order('nombre');
      proyectos = data ?? [];
    } else {
      const { data: asignados } = await supabase
        .from('usuario_proyectos').select('proyecto_id').eq('usuario_id', user.id);
      const ids = asignados?.map(a => a.proyecto_id) ?? [];
      if (ids.length > 0) {
        const { data } = await supabase.from('proyectos').select('*').in('id', ids).order('nombre');
        proyectos = data ?? [];
      }
    }
    cache.setProyectos(proyectos);

    await Promise.all(proyectos.map(async (p) => {
      const { data: torres } = await supabase
        .from('torres').select('*').eq('proyecto_id', p.id).order('nombre');
      if (!torres) return;
      cache.setTorres(p.id, torres);

      await Promise.all(torres.map(async (t) => {
        const { data: deptos } = await supabase
          .from('departamentos').select('*').eq('torre_id', t.id).order('numero');
        if (deptos) cache.setDeptos(t.id, deptos);
      }));
    }));

    // Cachear último depto inspeccionado (solo roles que crean registros)
    const rolesConRegistros = ['jefe_terreno', 'prof_terminaciones', 'administrador', 'staff'];
    if (rolesConRegistros.includes(perfil?.rol ?? '')) {
      const { data: ultimoReg } = await supabase
        .from('registros')
        .select(`departamento_id, departamentos(numero, id_obra), torres(nombre, frente), proyectos(nombre)`)
        .eq('creado_por', user.id)
        .order('creado_en', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (ultimoReg) cache.setUltimoDepto(ultimoReg);
    }

    console.log('✅ Cache completo sincronizado');
  } catch (e) {
    console.log('⚠️ Sin internet — usando cache local');
  }
};

const CacheContext = createContext({});

export const CacheProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { online } = useOffline();

  useEffect(() => {
    if (online) sincronizarCache();
  }, [online]);

  return <CacheContext.Provider value={{}}>{children}</CacheContext.Provider>;
};