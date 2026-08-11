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
import { ClipboardList, Clock, CheckCircle2 } from 'lucide-react';

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
}

const fmtFecha = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
};

const VisitasPostVenta: React.FC<Props> = ({
  proyecto, torre, depto, dark = false, obsCount = 0, rutaBase = '/post-venta',
}) => {
  const history = useHistory();
  const [visitas, setVisitas] = useState<Visita[]>([]);

  const textMuted = dark ? '#6b7280' : '#94a3b8';
  const border = dark ? '#1e1e1e' : '#e2e8f0';
  const card = dark ? '#0e0e0e' : '#ffffff';

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

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [proyecto.id, depto.numero]);

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

      {/* Visitas en progreso - reanudables */}
      {enProgreso.map(v => (
        <button
          key={v.id}
          onClick={() => abrir(v.id)}
          style={{
            width: '100%', borderRadius: 12, padding: '12px 16px', marginBottom: 10, cursor: 'pointer',
            background: dark ? 'rgba(251,191,36,0.06)' : '#fffbeb',
            border: `0.5px solid ${dark ? 'rgba(251,191,36,0.3)' : '#fde68a'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            textAlign: 'left',
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
          <span style={{ fontSize: 18, color: dark ? '#fbbf24' : '#92400e', flexShrink: 0 }}>›</span>
        </button>
      ))}

      {/* Historial (solo referencia, no editable) */}
      {completadas.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 11, color: textMuted, padding: '2px 4px 10px',
        }}>
          <CheckCircle2 size={14} strokeWidth={1.5} style={{ color: dark ? '#4ade80' : '#15803d' }} />
          {completadas.length} visita{completadas.length > 1 ? 's' : ''} completada{completadas.length > 1 ? 's' : ''}
          {completadas[0]?.fecha_completada ? ` · última ${fmtFecha(completadas[0].fecha_completada)}` : ''}
        </div>
      )}
    </>
  );
};

export default VisitasPostVenta;