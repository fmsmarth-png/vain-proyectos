// DashboardOG.tsx  ->  src/pages/
// Panel de Obra Gruesa para el Dashboard.
// Usa el MISMO proyecto principal que el Dashboard (recibido por props),
// no resuelve su propio proyecto.
// Métricas: último depto revisado OG, picados, puntereos, copas, yeso.
// Estética idéntica al dashboard de Terminaciones Finas (mismos tokens dark/light).

import { useEffect, useState } from 'react';
import { IonSpinner } from '@ionic/react';
import { supabase } from '../supabase';

const CIAN = '#06b6d4';

// Colores de chips (mismos que ReporteOG / RevisionOGResumen)
const COLOR_ACCION: Record<string, string> = {
  picado:   '#e24b4a',
  puntereo: '#378add',
  copa:     '#eda100',
  yeso:     '#7f77dd',
};

interface Props {
  proyectoPrincipal: any; // { id, nombre, ... } del Dashboard padre
  dark: boolean;
}

interface UltimoDepto {
  torre_nombre: string;
  torre_frente: string;
  depto_numero: string;
  depto_id_obra: string;
  creado_en: string;
}

interface Conteos {
  picado: number;
  puntereo: number;
  copa: number;
  yeso: number;
  porDefinir: number;
  total: number;
}

function catAccion(accion: string | null): keyof Conteos {
  if (!accion) return 'porDefinir';
  const a = accion.toLowerCase();
  if (a.includes('picado')) return 'picado';
  if (a.includes('puntereo')) return 'puntereo';
  if (a.includes('copa')) return 'copa';
  if (a.includes('yeso')) return 'yeso';
  return 'porDefinir';
}

const DashboardOG: React.FC<Props> = ({ proyectoPrincipal, dark }) => {
  const [ultimo, setUltimo] = useState<UltimoDepto | null>(null);
  const [conteos, setConteos] = useState<Conteos | null>(null);
  const [cargando, setCargando] = useState(false);

  // Tokens de tema (mismos que Dashboard principal)
  const card          = dark ? '#0e0e0e'  : '#ffffff';
  const border        = dark ? '#1e1e1e'  : '#e2e8f0';
  const textPrimary   = dark ? '#f9fafb'  : '#0f172a';
  const textSecondary = dark ? '#6b7280'  : '#64748b';
  const textMuted     = dark ? '#444444'  : '#94a3b8';
  const kpiCardBg     = dark ? 'linear-gradient(135deg, #0e0e0e 0%, #181818 100%)' : '#ffffff';
  const kpiCardBorder = dark ? '#1e1e1e'  : '#e2e8f0';
  const kpiSepBorder  = dark ? '#1a1a1a'  : '#f1f5f9';
  const kpiNumColor   = dark ? '#f9fafb'  : '#0f172a';
  const kpiSubColor   = dark ? '#444'     : '#94a3b8';

  useEffect(() => {
    if (!proyectoPrincipal?.id) return;
    (async () => {
      setCargando(true);
      const proyId = proyectoPrincipal.id;

      // Todas las reparaciones del proyecto principal
      const { data } = await supabase
        .from('og_reparaciones')
        .select('id, departamento_id, depto, id_obra, torre, frente, accion, creado_en')
        .eq('proyecto_id', proyId);
      const reps: any[] = data ?? [];

      // Último depto revisado (más reciente)
      if (reps.length > 0) {
        const masReciente = reps.reduce((a, b) =>
          new Date(b.creado_en).getTime() > new Date(a.creado_en).getTime() ? b : a
        );
        setUltimo({
          torre_nombre: masReciente.torre ?? '',
          torre_frente: masReciente.frente ?? '',
          depto_numero: masReciente.depto ?? '',
          depto_id_obra: masReciente.id_obra ?? '',
          creado_en: masReciente.creado_en,
        });
      } else {
        setUltimo(null);
      }

      // Conteos por tipo de reparación
      const c: Conteos = { picado: 0, puntereo: 0, copa: 0, yeso: 0, porDefinir: 0, total: reps.length };
      reps.forEach(r => { c[catAccion(r.accion)]++; });
      setConteos(c);

      setCargando(false);
    })();
  }, [proyectoPrincipal?.id]);

  const formatFecha = (fecha: string) =>
    new Date(fecha).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

  if (!proyectoPrincipal) {
    return <div style={{ textAlign: 'center', color: textMuted, fontSize: 13, padding: 32 }}>Sin proyecto principal configurado</div>;
  }

  if (cargando) {
    return <div style={{ textAlign: 'center', padding: 40 }}><IonSpinner name="crescent" /></div>;
  }

  return (
    <div>
      {/* Banner proyecto (mismo estilo que el banner de Terminaciones Finas) */}
      <div style={{
        background: dark
          ? 'linear-gradient(135deg, #111 0%, #1a1a1a 50%, #111 100%)'
          : 'linear-gradient(135deg, #064e3b 0%, #06b6d4 100%)',
        borderRadius: 16, padding: '16px 18px', marginBottom: 20,
        border: dark ? '0.5px solid #2a2a2a' : 'none',
        position: 'relative', overflow: 'hidden'
      }}>
        <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 12 }}>🏗️</span>
          <span style={{ fontSize: 9, color: dark ? '#555' : 'rgba(255,255,255,0.5)', letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 600 }}>Obra Gruesa</span>
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', letterSpacing: '-0.5px' }}>{proyectoPrincipal.nombre}</div>
        {proyectoPrincipal.direccion && <div style={{ fontSize: 11, color: dark ? '#444' : 'rgba(255,255,255,0.4)', marginTop: 4 }}>📍 {proyectoPrincipal.direccion}</div>}
      </div>

      {/* Último depto revisado OG */}
      <div style={{ background: kpiCardBg, borderRadius: 16, padding: 18, border: `0.5px solid ${kpiCardBorder}`, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: CIAN }} />
          <span style={{ fontSize: 9, color: CIAN, letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 600 }}>Último depto revisado OG</span>
        </div>
        {ultimo ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: textPrimary, marginBottom: 2 }}>
                {ultimo.torre_frente} · {ultimo.depto_id_obra}
              </div>
              <div style={{ fontSize: 11, color: textMuted }}>
                Torre {ultimo.torre_nombre} · Depto {ultimo.depto_numero}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: textMuted }}>{formatFecha(ultimo.creado_en).split(',')[0]}</div>
              <div style={{ fontSize: 11, color: textMuted }}>{formatFecha(ultimo.creado_en).split(',')[1]}</div>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: textMuted }}>Sin registros OG aún</div>
        )}
      </div>

      {/* Grid de conteos por reparación (2×2, misma estética que KPIs del general) */}
      {conteos && conteos.total > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
          {([
            { key: 'picado',   icon: '🔨', label: 'Picado',   color: COLOR_ACCION.picado },
            { key: 'puntereo', icon: '🪚', label: 'Puntereo', color: COLOR_ACCION.puntereo },
            { key: 'copa',     icon: '🥤', label: 'Copa',     color: COLOR_ACCION.copa },
            { key: 'yeso',     icon: '🧱', label: 'Yeso',     color: COLOR_ACCION.yeso },
          ] as const).map(item => (
            <div key={item.key} style={{
              background: kpiCardBg, borderRadius: 16, padding: 16,
              border: `0.5px solid ${kpiCardBorder}`, position: 'relative', overflow: 'hidden'
            }}>
              <div style={{
                position: 'absolute', bottom: -10, right: -10, width: 60, height: 60, borderRadius: '50%',
                background: dark ? `radial-gradient(circle, ${item.color}10 0%, transparent 70%)` : `${item.color}08`
              }} />
              <div style={{ fontSize: 9, color: item.color, letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 600, marginBottom: 14 }}>
                {item.icon} {item.label}
              </div>
              <div style={{ fontSize: 40, fontWeight: 800, color: kpiNumColor, lineHeight: 1, marginBottom: 3 }}>
                {conteos[item.key]}
              </div>
              <div style={{ fontSize: 11, color: kpiSubColor }}>observaciones</div>
              {conteos.total > 0 && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: `0.5px solid ${kpiSepBorder}` }}>
                  <div style={{ fontSize: 11, color: textSecondary }}>
                    {Math.round((conteos[item.key] / conteos.total) * 100)}% del total
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Total + por definir (resumen al pie) */}
      {conteos && (
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, background: dark ? '#111' : '#f8fafc', borderRadius: 14, padding: '14px 10px', textAlign: 'center', border: `0.5px solid ${border}` }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>📋</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: CIAN, lineHeight: 1 }}>{conteos.total}</div>
            <div style={{ fontSize: 10, color: textMuted, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Total OG</div>
          </div>
          {conteos.porDefinir > 0 && (
            <div style={{ flex: 1, background: dark ? '#111' : '#f8fafc', borderRadius: 14, padding: '14px 10px', textAlign: 'center', border: `0.5px solid ${border}` }}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>❓</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: dark ? '#888' : '#94a3b8', lineHeight: 1 }}>{conteos.porDefinir}</div>
              <div style={{ fontSize: 10, color: textMuted, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Por definir</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DashboardOG;