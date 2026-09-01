/**
 * VisitasPostVenta — sección para DetalleDepto
 * ------------------------------------------------------------
 * Reemplaza el botón "Post Venta" de la sección Acciones.
 *   • Botón principal → inicia una visita NUEVA
 *   • Tarjetas ámbar  → visitas EN_PROGRESO (retoman el borrador guardado)
 *   • Línea inferior  → cuántas visitas se han completado (historial)
 *
 * Integración en DetalleDepto.tsx:
 *   import VisitasPostVenta from '../components/VisitasPostVenta';
 *   ...reemplazar el <button> de Post Venta por:
 *   <VisitasPostVenta proyecto={proyecto} torre={torre} depto={depto} dark={dark} obsCount={obsPostVenta} />
 *
 * Navega a la MISMA ruta que ya usas: `/post-venta/${depto.id}` con
 * state { depto, torre, proyecto }. PostVenta lee ese contexto y, si hay
 * un id en sessionStorage['postventa_papeleta_id'], reanuda ese borrador.
 */
import { useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { supabase } from '../supabase';
import { eliminarBorradorLocal } from '../utils/postventaBorradorLocal';
import { ClipboardList, Clock, CheckCircle2, Trash2, ChevronDown } from 'lucide-react';

const RESUME_KEY = 'postventa_papeleta_id';    // debe coincidir con PostVenta.tsx
const SESSION_KEY = 'post_venta_depto_state';   // debe coincidir con PostVenta.tsx

interface Visita {
  id: string;
  estado: 'EN_PROGRESO' | 'COMPLETADA';
  sin_papeleta: boolean;
  n_requerimiento: string | null;
  fecha_creacion: string | null;
  fecha_completada: string | null;
  usuario_nombre: string | null;
  obs_total: number;
  obs_resueltas: number;
  con_foto_antes: number;
  con_foto_despues: number;
}

interface Props {
  proyecto: { id: string; nombre?: string; codigo?: string };
  torre: { nombre: string };
  depto: { id: string; numero: string | number };
  dark?: boolean;
  obsCount?: number;        // obs PV ya registradas (para el subtítulo), opcional
  rutaBase?: string;        // por defecto '/post-venta'
  rol?: string;
  /** Cambia cada vez que DetalleDepto vuelve a quedar activa (useIonViewWillEnter).
   *  Al estar en las dependencias del useEffect, fuerza un refetch de la
   *  lista de visitas sin depender del montaje/desmontaje del componente. */
  refreshKey?: number;
}

const fmtFecha = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
};

const VisitasPostVenta: React.FC<Props> = ({
  proyecto, torre, depto, dark = false, obsCount = 0, rutaBase = '/post-venta', rol, refreshKey,
}) => {
  const history = useHistory();
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [historialAbierto, setHistorialAbierto] = useState(false);
  const esMaestro = rol === 'maestro_postventa';

  const textMuted = dark ? '#6b7280' : '#94a3b8';
  const border = dark ? '#243550' : '#e2e8f0';
  const card = dark ? '#16233B' : '#ffffff';

  const cargar = async () => {
    try {
      const { data } = await supabase
        .from('v_postventa_visitas')
        .select('id, estado, sin_papeleta, n_requerimiento, fecha_creacion, fecha_completada, usuario_nombre, obs_total, obs_resueltas, con_foto_antes, con_foto_despues')
        .eq('proyecto_id', proyecto.id)
        .eq('depto_numero', String(depto.numero))
        .order('fecha_creacion', { ascending: false });
      setVisitas((data ?? []) as Visita[]);
    } catch {
      setVisitas([]);
    }
  };

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [proyecto.id, depto.numero, refreshKey]);

  // Guarda el contexto del depto (igual que hoy) y navega a la ruta de siempre.
  const abrir = (papeletaId?: string) => {
    // Quita el foco del botón antes de la transición de Ionic: evita el warning
    // "Blocked aria-hidden on an element because its descendant retained focus".
    (document.activeElement as HTMLElement | null)?.blur();
    const ctx = { depto, torre, proyecto };
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(ctx)); } catch {}
    if (papeletaId) {
      try { sessionStorage.setItem(RESUME_KEY, papeletaId); } catch {}   // -> reanuda
    } else {
      try { sessionStorage.removeItem(RESUME_KEY); } catch {}            // -> visita nueva
    }
    history.push(`${rutaBase}/${depto.id}`, ctx);
  };

  // Solo se ofrece para EN_PROGRESO (ver el botón más abajo) — una visita
  // COMPLETADA no se puede borrar desde acá.
  //
  // OJO: Supabase/PostgREST NO devuelve error cuando RLS bloquea las filas
  // de un DELETE — el .delete() responde éxito (error: null) habiendo
  // borrado CERO filas. Por eso cada delete de acá encadena .select('id')
  // y se revisa explícitamente cuántas filas volvieron: si no coincide con
  // lo esperado, se trata como error real (antes esto fallaba en silencio:
  // "éxito" en pantalla pero la visita seguía intacta en la base).
  //
  // postventa_obs_borrador.papeleta_id -> postventa_papeletas.id tiene
  // ON DELETE CASCADE, así que basta con borrar la papeleta: las
  // observaciones hijas se eliminan solas a nivel de base de datos.
  const eliminarVisita = async (v: Visita) => {
    if (esMaestro) return;
    const confirmado = window.confirm(
      'Esta visita en progreso se va a eliminar junto con sus observaciones y fotos cargadas hasta ahora. Esta acción no se puede deshacer.\n\n¿Continuar?'
    );
    if (!confirmado) return;

    setBorrando(v.id);
    try {
      // Se registra la lápida ANTES de borrar: así, si el ciclo de
      // sincronización de OTRO dispositivo corre justo en este instante
      // (ventana de carrera), ya encuentra el aviso y no resucita la visita.
      const { error: errTumba } = await supabase
        .from('postventa_papeletas_eliminadas')
        .insert({ id: v.id });
      if (errTumba) throw errTumba;

      const { data: filasBorradas, error: errPap } = await supabase
        .from('postventa_papeletas')
        .delete()
        .eq('id', v.id)
        .select('id');
      if (errPap) throw errPap;

      if (!filasBorradas || filasBorradas.length === 0) {
        // No se borró nada de verdad (RLS lo bloqueó en silencio) — se
        // retira la lápida para no dejar esta visita marcada como
        // "eliminada" cuando en realidad sigue intacta en la base.
        try { await supabase.from('postventa_papeletas_eliminadas').delete().eq('id', v.id); } catch {}
        throw new Error(
          `No tienes permiso para eliminar esta visita (0 filas afectadas al borrar papeleta ${v.id}). ` +
          'Revisa que tu usuario tenga asignado este proyecto, o pide a un administrador que la elimine.'
        );
      }

      // Limpiar el borrador LOCAL — sin esto, el sistema local-first de
      // PostVenta.tsx resucita la visita en la próxima sincronización.
      try { await eliminarBorradorLocal(v.id); } catch {}

      // Si esta era justo la que quedó marcada para reanudar, se limpia —
      // si no, PostVenta.tsx intentaría reabrir un borrador que ya no existe.
      try {
        if (sessionStorage.getItem(RESUME_KEY) === v.id) sessionStorage.removeItem(RESUME_KEY);
      } catch {}

      await cargar();
    } catch (e) {
      console.error('Error eliminando visita:', e);
      const msg = e instanceof Error ? e.message : 'No se pudo eliminar la visita. Revisa tu conexión e intenta de nuevo.';
      alert(msg);
    }
    setBorrando(null);
  };

  const enProgreso = visitas.filter(v => v.estado === 'EN_PROGRESO');
  const completadas = visitas.filter(v => v.estado === 'COMPLETADA');

  const subtitulo =
    enProgreso.length > 0
      ? `${enProgreso.length} visita${enProgreso.length > 1 ? 's' : ''} en progreso · continuar abajo`
      : obsCount > 0
        ? `Cargar papeleta · ${obsCount} obs registradas`
        : 'Cargar papeleta del cliente';

  return (
    <>
      {/* Boton principal - inicia visita nueva (mismo estilo que Pre Entrega / Revision) */}
      <button
        onClick={() => abrir()}
        style={{
          width: '100%', height: 56, borderRadius: 12,
          background: card, border: `0.5px solid ${border}`,
          color: dark ? '#4ade80' : '#15803d',
          fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingLeft: 16, paddingRight: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ClipboardList size={20} strokeWidth={1.5} />
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Post Venta</div>
            <div style={{ fontSize: 10, color: textMuted }}>{subtitulo}</div>
          </div>
        </div>
        <span style={{ fontSize: 18 }}>›</span>
      </button>

      {/* Visitas en progreso - reanudables, con opción de eliminar */}
      {enProgreso.map(v => {
        const estaBorrando = borrando === v.id;
        return (
          <div
            key={v.id}
            onClick={() => !estaBorrando && abrir(v.id)}
            style={{
              width: '100%', borderRadius: 12, padding: '12px 16px', marginBottom: 10,
              cursor: estaBorrando ? 'default' : 'pointer',
              background: dark ? 'rgba(251,191,36,0.06)' : '#fffbeb',
              border: `0.5px solid ${dark ? 'rgba(251,191,36,0.3)' : '#fde68a'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              opacity: estaBorrando ? 0.5 : 1,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <Clock size={20} strokeWidth={1.5} style={{ color: dark ? '#fbbf24' : '#92400e', flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: dark ? '#fbbf24' : '#92400e' }}>
                  Continuar visita en progreso
                </div>
                <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>
                  {v.sin_papeleta ? 'Sin papeleta' : `Req. ${v.n_requerimiento || '—'}`}
                  {' · '}{v.obs_resueltas}/{v.obs_total} obs
                  {' · '}📷 {v.con_foto_antes}/{v.con_foto_despues}
                </div>
                <div style={{ fontSize: 10, color: textMuted, marginTop: 1 }}>
                  Iniciada {fmtFecha(v.fecha_creacion)}{v.usuario_nombre ? ` · ${v.usuario_nombre}` : ''}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {!esMaestro && (
                <button
                  onClick={(e) => { e.stopPropagation(); if (!estaBorrando) eliminarVisita(v); }}
                  disabled={estaBorrando}
                  title="Eliminar visita en progreso"
                  style={{
                    background: 'transparent', border: 'none', padding: 6,
                    cursor: estaBorrando ? 'default' : 'pointer',
                    color: dark ? '#f87171' : '#b91c1c',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Trash2 size={16} strokeWidth={1.5} />
                </button>
              )}
              <span style={{ fontSize: 18, color: dark ? '#fbbf24' : '#92400e' }}>›</span>
            </div>
          </div>
        );
      })}

      {/* Historial de visitas completadas — colapsado por defecto, al final
          de la página. Antes esto era solo una línea de texto con el
          conteo; ahora queda la lista real (fecha, requerimiento, obs) para
          poder consultarla, aunque sigue siendo de solo lectura: no hay
          forma de reabrir ni editar una visita ya completada desde acá. */}
      {completadas.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <button
            onClick={() => setHistorialAbierto(v => !v)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: '2px 4px 10px', fontSize: 11, color: textMuted,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle2 size={14} strokeWidth={1.5} style={{ color: dark ? '#4ade80' : '#15803d' }} />
              {completadas.length} visita{completadas.length > 1 ? 's' : ''} completada{completadas.length > 1 ? 's' : ''}
              {completadas[0]?.fecha_completada ? ` · última ${fmtFecha(completadas[0].fecha_completada)}` : ''}
            </span>
            <ChevronDown
              size={14} strokeWidth={1.5}
              style={{ transform: historialAbierto ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
            />
          </button>

          {historialAbierto && completadas.map(v => (
            <div
              key={v.id}
              onClick={() => abrir(v.id)}
              style={{
                borderRadius: 10, padding: '10px 14px', marginBottom: 8, cursor: 'pointer',
                background: dark ? 'rgba(74,222,128,0.05)' : '#f0fdf4',
                border: `0.5px solid ${dark ? 'rgba(74,222,128,0.2)' : '#bbf7d0'}`,
                display: 'flex', alignItems: 'center', gap: 12,
              }}
            >
              <CheckCircle2 size={18} strokeWidth={1.5} style={{ color: dark ? '#4ade80' : '#15803d', flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: dark ? '#4ade80' : '#15803d' }}>
                  {v.sin_papeleta ? 'Sin papeleta' : `Req. ${v.n_requerimiento || '—'}`}
                </div>
                <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>
                  {v.obs_resueltas}/{v.obs_total} obs · 📷 {v.con_foto_antes}/{v.con_foto_despues}
                </div>
                <div style={{ fontSize: 10, color: textMuted, marginTop: 1 }}>
                  Completada {fmtFecha(v.fecha_completada)}{v.usuario_nombre ? ` · ${v.usuario_nombre}` : ''}
                </div>
              </div>
              <span style={{ fontSize: 16, color: dark ? '#4ade80' : '#15803d', flexShrink: 0 }}>›</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

export default VisitasPostVenta;