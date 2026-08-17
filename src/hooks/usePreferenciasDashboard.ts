// usePreferenciasDashboard.ts  ->  src/hooks/
// Preferencia del Dashboard por usuario, en 3 capas:
//   1) localStorage: pinta al instante (offline-friendly, patrón espejo)
//   2) Supabase usuario_preferencias: fuente de verdad (getSession + maybeSingle)
//   3) fallback = primera área permitida
//
// NO importa PermisosContext: recibe las áreas permitidas como parámetro, así el
// Dashboard decide el gating con la regla que quieras (rol, tienePermiso, etc.).
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabase';   // <- tu cliente real (mismo que usa Dashboard)

export type AreaDashboard = 'general' | 'og' | 'pre-e' | 'pv' | 'vo';

const LS_KEY = 'vain_pref_dashboard';

interface PrefState {
  area: AreaDashboard;
  config: Record<string, any>; // { orden_og: string[], ... }
}

function leerLocal(): PrefState | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function escribirLocal(p: PrefState) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch { /* noop */ }
}

export function usePreferenciasDashboard(areasPermitidas: AreaDashboard[]) {
  const areaFallback: AreaDashboard = areasPermitidas[0] ?? 'general';

  const local = leerLocal();
  const [area, setAreaState] = useState<AreaDashboard>(
    local && areasPermitidas.includes(local.area) ? local.area : areaFallback
  );
  const [config, setConfig] = useState<Record<string, any>>(local?.config ?? {});
  const montado = useRef(false);

  // Fuente de verdad: Supabase (reconcilia con lo pintado desde localStorage).
  useEffect(() => {
    montado.current = true;
    (async () => {
      const { data: sesion } = await supabase.auth.getSession(); // getSession, no getUser (offline)
      const email = sesion?.session?.user?.email?.toLowerCase();
      if (!email) return;

      const { data, error } = await supabase
        .from('usuario_preferencias')
        .select('area_dashboard, config')
        .eq('usuario_email', email)
        .maybeSingle(); // maybeSingle, no single (evita 406 sin filas)

      if (!montado.current || error || !data) return;

      const remota = (data.area_dashboard as AreaDashboard) ?? areaFallback;
      const areaValida = areasPermitidas.includes(remota) ? remota : areaFallback;
      const cfg = data.config ?? {};
      setAreaState(areaValida);
      setConfig(cfg);
      escribirLocal({ area: areaValida, config: cfg });
    })();
    return () => { montado.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Upsert idempotente por PK (usuario_email).
  const persistir = useCallback(async (next: PrefState) => {
    escribirLocal(next); // espejo local inmediato
    const { data: sesion } = await supabase.auth.getSession();
    const email = sesion?.session?.user?.email?.toLowerCase();
    if (!email) return;
    const { error } = await supabase
      .from('usuario_preferencias')
      .upsert(
        { usuario_email: email, area_dashboard: next.area, config: next.config, actualizado_en: new Date().toISOString() },
        { onConflict: 'usuario_email' }
      );
    // NUNCA silenciar el error de un UPDATE (patrón RLS de fallo silencioso).
    if (error) console.error('[prefs] no se pudo guardar la preferencia:', error.message);
  }, []);

  const setArea = useCallback((a: AreaDashboard) => {
    setAreaState(a);
    persistir({ area: a, config });
  }, [config, persistir]);

  // Guarda el orden de tarjetas de un área bajo config['orden_<area>'].
  const setOrdenTarjetas = useCallback((areaKey: AreaDashboard, ordenList: string[]) => {
    const next = { ...config, [`orden_${areaKey}`]: ordenList };
    setConfig(next);
    persistir({ area, config: next });
  }, [area, config, persistir]);

  return { area, setArea, config, setOrdenTarjetas };
}