// DashboardOG.tsx  ->  src/pages/
// Panel ejecutivo de Obra Gruesa para el Dashboard.
// Usa el MISMO proyecto principal que el Dashboard (recibido por props).
// Orden: Hero → Info Cards → Desglose por reparación → Estado obs → Actividad → Avance general.
// Cada tarjeta funciona como botón hacia la pantalla correspondiente.

import { useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { IonSpinner } from '@ionic/react';
import { supabase } from '../supabase';
import {
  HardHat, MapPin, Hammer, Pickaxe, Drill, BrickWall,
  ClipboardList, HelpCircle, ChevronRight,
  AlertTriangle, CheckCircle2, BarChart3,
} from 'lucide-react';

/* ─── Constantes ──────────────────────────────────────────────────────── */
const CIAN = '#06b6d4';

const COLOR_ACCION: Record<string, string> = {
  picado:   '#e24b4a',
  puntereo: '#378add',
  copa:     '#eda100',
  yeso:     '#7f77dd',
};

// Vista de ReporteVisualOG que corresponde a cada accion
const ACCION_A_VISTA: Record<string, string> = {
  picado:   'albanileria',
  puntereo: 'albanileria',
  copa:     'copa',
  yeso:     'yeso',
};

/* ─── Tipos ───────────────────────────────────────────────────────────── */
interface Props {
  proyectoPrincipal: any; // { id, nombre, direccion, ... } del Dashboard padre
  dark: boolean;
}

interface RepRow {
  id: string;
  departamento_id: string;
  depto: string;        // número visible depto
  id_obra: string;      // "1F1.1"
  torre: string;
  torre_id: string;
  frente: string;       // "F1" — id obra de torre
  accion: string | null;
  estado: string | null; // PENDIENTE | SOLUCIONADO
  creado_en: string;
  solucionado_en: string | null;
}

interface DeptoInfo {
  torre_id: string;
  torre_nombre: string;
  torre_frente: string;
  depto_id: string;       // departamento_id (uuid)
  depto_numero: string;
  depto_id_obra: string;  // "1F1.1"
  plano_version_id: string | null;
}

interface AccionStats {
  picado:   { pendiente: number; solucionado: number; total: number };
  puntereo: { pendiente: number; solucionado: number; total: number };
  copa:     { pendiente: number; solucionado: number; total: number };
  yeso:     { pendiente: number; solucionado: number; total: number };
}

interface ActividadItem {
  depto: DeptoInfo;
  accion: string;
  fecha: string;
}

/* ─── Helpers ─────────────────────────────────────────────────────────── */
function catAccion(accion: string | null): 'picado' | 'puntereo' | 'copa' | 'yeso' | 'porDefinir' {
  if (!accion) return 'porDefinir';
  const a = accion.toLowerCase();
  if (a.includes('picado'))   return 'picado';
  if (a.includes('puntereo')) return 'puntereo';
  if (a.includes('copa'))     return 'copa';
  if (a.includes('yeso'))     return 'yeso';
  return 'porDefinir';
}

function formatFecha(fecha: string) {
  return new Date(fecha).toLocaleString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function formatFechaCorta(fecha: string) {
  const d = new Date(fecha);
  const hoy = new Date();
  const ayer = new Date(); ayer.setDate(ayer.getDate() - 1);
  const mismodia = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (mismodia(d, hoy)) return 'Hoy ' + d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (mismodia(d, ayer)) return 'Ayer ' + d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/* ─── Componente ──────────────────────────────────────────────────────── */
const DashboardOG: React.FC<Props> = ({ proyectoPrincipal, dark }) => {
  const history = useHistory();

  const [cargando, setCargando] = useState(false);
  const [ultimoDepto, setUltimoDepto] = useState<DeptoInfo | null>(null);
  const [ultimoFecha, setUltimoFecha] = useState('');
  const [masPendDepto, setMasPendDepto] = useState<DeptoInfo | null>(null);
  const [masPendCount, setMasPendCount] = useState(0);
  const [stats, setStats] = useState<AccionStats | null>(null);
  const [totalObs, setTotalObs] = useState(0);
  const [totalPend, setTotalPend] = useState(0);
  const [totalSol, setTotalSol] = useState(0);
  const [porDefinir, setPorDefinir] = useState(0);
  const [actividad, setActividad] = useState<ActividadItem[]>([]);
  const [avance, setAvance] = useState<{ conObs: number; total: number } | null>(null);

  // Mapa departamento_id → plano_version_id (para navegación)
  const [deptoPlanoMap, setDeptoPlanoMap] = useState<Record<string, string | null>>({});

  /* ─── Tokens de tema (mismos que Dashboard principal) ─── */
  const card          = dark ? '#16233B'  : '#ffffff';
  const border        = dark ? '#243550'  : '#e2e8f0';
  const textPrimary   = dark ? '#f9fafb'  : '#0f172a';
  const textSecondary = dark ? '#6b7280'  : '#64748b';
  const textMuted     = dark ? '#5D728F'  : '#94a3b8';
  const kpiCardBg     = dark ? 'linear-gradient(135deg, #16233B 0%, #1B2C48 100%)' : '#ffffff';
  const kpiCardBorder = dark ? '#243550'  : '#e2e8f0';
  const kpiSepBorder  = dark ? '#1E2E4A'  : '#f1f5f9';
  const kpiNumColor   = dark ? '#f9fafb'  : '#0f172a';
  const kpiSubColor   = dark ? '#5D728F'  : '#94a3b8';

  // Colores estado
  const pendColor = dark ? '#f59e0b' : '#d97706';
  const solColor  = dark ? '#34d399' : '#10b981';

  /* ─── Carga de datos ────────────────────────────────────── */
  useEffect(() => {
    if (!proyectoPrincipal?.id) return;
    (async () => {
      setCargando(true);
      const proyId = proyectoPrincipal.id;

      // 1) Todas las reparaciones del proyecto
      const { data: repsData } = await supabase
        .from('og_reparaciones')
        .select('id, departamento_id, depto, id_obra, torre, torre_id, frente, accion, estado, creado_en, solucionado_en')
        .eq('proyecto_id', proyId);
      const reps: RepRow[] = (repsData ?? []) as RepRow[];

      // 2) Obtener plano_version_id de cada depto referenciado
      const deptoIds = [...new Set(reps.map(r => r.departamento_id).filter(Boolean))];
      let planoMap: Record<string, string | null> = {};
      if (deptoIds.length > 0) {
        const { data: deptosData } = await supabase
          .from('departamentos')
          .select('id, plano_version_id')
          .in('id', deptoIds);
        (deptosData ?? []).forEach((d: any) => { planoMap[d.id] = d.plano_version_id; });
      }
      setDeptoPlanoMap(planoMap);

      // Helper: construir DeptoInfo desde una fila
      const toDeptoInfo = (r: RepRow): DeptoInfo => ({
        torre_id: r.torre_id,
        torre_nombre: r.torre ?? '',
        torre_frente: r.frente ?? '',
        depto_id: r.departamento_id,
        depto_numero: r.depto ?? '',
        depto_id_obra: r.id_obra ?? '',
        plano_version_id: planoMap[r.departamento_id] ?? null,
      });

      // 3) Último depto revisado (más reciente)
      if (reps.length > 0) {
        const masReciente = reps.reduce((a, b) =>
          new Date(b.creado_en).getTime() > new Date(a.creado_en).getTime() ? b : a
        );
        setUltimoDepto(toDeptoInfo(masReciente));
        setUltimoFecha(masReciente.creado_en);
      } else {
        setUltimoDepto(null);
        setUltimoFecha('');
      }

      // 4) Depto con más pendientes
      const pendPorDepto: Record<string, { count: number; row: RepRow }> = {};
      reps.forEach(r => {
        if (r.estado?.toUpperCase() === 'PENDIENTE') {
          if (!pendPorDepto[r.departamento_id]) pendPorDepto[r.departamento_id] = { count: 0, row: r };
          pendPorDepto[r.departamento_id].count++;
        }
      });
      let maxPend = 0;
      let maxPendRow: RepRow | null = null;
      Object.values(pendPorDepto).forEach(({ count, row }) => {
        if (count > maxPend) { maxPend = count; maxPendRow = row; }
      });
      if (maxPendRow) {
        setMasPendDepto(toDeptoInfo(maxPendRow));
        setMasPendCount(maxPend);
      } else {
        setMasPendDepto(null);
        setMasPendCount(0);
      }

      // 5) Stats por acción (pendiente/solucionado)
      const emptyBucket = () => ({ pendiente: 0, solucionado: 0, total: 0 });
      const s: AccionStats = { picado: emptyBucket(), puntereo: emptyBucket(), copa: emptyBucket(), yeso: emptyBucket() };
      let tPend = 0, tSol = 0, tPorDef = 0;
      reps.forEach(r => {
        const cat = catAccion(r.accion);
        const isPend = r.estado?.toUpperCase() !== 'SOLUCIONADO';
        if (cat !== 'porDefinir') {
          s[cat].total++;
          if (isPend) { s[cat].pendiente++; tPend++; }
          else { s[cat].solucionado++; tSol++; }
        } else {
          tPorDef++;
          if (isPend) tPend++; else tSol++;
        }
      });
      setStats(s);
      setTotalObs(reps.length);
      setTotalPend(tPend);
      setTotalSol(tSol);
      setPorDefinir(tPorDef);

      // 6) Actividad reciente: últimas 5 observaciones marcadas como SOLUCIONADO
      //    Ordenadas por solucionado_en (fecha de solución), no creado_en.
      const solucionadas = reps
        .filter(r => r.estado?.toUpperCase() === 'SOLUCIONADO' && r.solucionado_en)
        .sort((a, b) => new Date(b.solucionado_en!).getTime() - new Date(a.solucionado_en!).getTime());
      const seen = new Set<string>();
      const act: ActividadItem[] = [];
      for (const r of solucionadas) {
        const key = `${r.departamento_id}-${catAccion(r.accion)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const cat = catAccion(r.accion);
        if (cat === 'porDefinir') continue;
        act.push({ depto: toDeptoInfo(r), accion: cat, fecha: r.solucionado_en! });
        if (act.length >= 5) break;
      }
      setActividad(act);

      // 7) Avance: deptos con obs registradas / total deptos del proyecto
      const { data: torresData } = await supabase.from('torres').select('id').eq('proyecto_id', proyId);
      const torreIds = torresData?.map((t: any) => t.id) ?? [];
      if (torreIds.length > 0) {
        const { data: deptosAll } = await supabase.from('departamentos').select('id').in('torre_id', torreIds);
        const totalDeptos = deptosAll?.length ?? 0;
        const deptosConObs = new Set(reps.map(r => r.departamento_id).filter(Boolean)).size;
        setAvance({ conObs: deptosConObs, total: totalDeptos });
      } else {
        setAvance(null);
      }

      setCargando(false);
    })();
  }, [proyectoPrincipal?.id]);

  /* ─── Navegación ────────────────────────────────────────── */
  const irAResumen = (depto: DeptoInfo) => {
    sessionStorage.setItem('og_seleccion', JSON.stringify({
      proyecto: { id: proyectoPrincipal.id, nombre: proyectoPrincipal.nombre },
      torre: { id: depto.torre_id, nombre: depto.torre_frente || depto.torre_nombre },
      depto: {
        id: depto.depto_id,
        numero: depto.depto_numero,
        plano_version_id: depto.plano_version_id,
        id_obra: depto.depto_id_obra,
      },
    }));
    history.push('/revision-og/resumen');
  };

  const irAReporteVisual = (accion: keyof AccionStats) => {
    const vista = ACCION_A_VISTA[accion] || 'general';
    sessionStorage.setItem('og_vista_filtro', JSON.stringify({
      vista,
      proyectoId: proyectoPrincipal.id,
      proyectoNombre: proyectoPrincipal.nombre,
      soloPendientes: true,
    }));
    history.push('/reporte-visual-og');
  };

  /* ─── Render helpers ────────────────────────────────────── */
  const IconAccion: Record<string, any> = {
    picado: Hammer, puntereo: Pickaxe, copa: Drill, yeso: BrickWall,
  };

  const LabelAccion: Record<string, string> = {
    picado: 'Picado', puntereo: 'Puntereo', copa: 'Copa', yeso: 'Yeso',
  };

  /* ─── Guards ────────────────────────────────────────────── */
  if (!proyectoPrincipal) {
    return <div style={{ textAlign: 'center', color: textMuted, fontSize: 13, padding: 32 }}>Sin proyecto principal configurado</div>;
  }
  if (cargando) {
    return <div style={{ textAlign: 'center', padding: 40 }}><IonSpinner name="crescent" /></div>;
  }

  /* ═══ JSX ═══════════════════════════════════════════════════════════════ */
  return (
    <div>
      {/* ── 1. Hero Banner ────────────────────────────────────────────── */}
      <div style={{
        background: dark
          ? 'linear-gradient(135deg, #16233B 0%, #1E2E4A 50%, #16233B 100%)'
          : 'linear-gradient(135deg, #064e3b 0%, #06b6d4 100%)',
        borderRadius: 16, padding: '16px 18px', marginBottom: 20,
        border: dark ? '0.5px solid #2E4468' : 'none',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <HardHat size={13} strokeWidth={2} color={dark ? '#6E86A6' : 'rgba(255,255,255,0.6)'} />
          <span style={{ fontSize: 9, color: dark ? '#6E86A6' : 'rgba(255,255,255,0.5)', letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 600 }}>Obra Gruesa</span>
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', letterSpacing: '-0.5px' }}>{proyectoPrincipal.nombre}</div>
        {proyectoPrincipal.direccion && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: dark ? '#5D728F' : 'rgba(255,255,255,0.4)', marginTop: 4 }}>
            <MapPin size={11} strokeWidth={2} /> {proyectoPrincipal.direccion}
          </div>
        )}
      </div>

      {/* ── 2. Último depto revisado OG ──────────────────────────────── */}
      <div
        onClick={() => ultimoDepto && irAResumen(ultimoDepto)}
        style={{
          background: kpiCardBg, borderRadius: 16, padding: 18,
          border: `0.5px solid ${kpiCardBorder}`, marginBottom: 12,
          cursor: ultimoDepto ? 'pointer' : 'default',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: CIAN }} />
          <span style={{ fontSize: 9, color: CIAN, letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 600 }}>Último depto revisado OG</span>
        </div>
        {ultimoDepto ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: textPrimary, marginBottom: 2 }}>
                Torre {ultimoDepto.torre_nombre} · Depto {ultimoDepto.depto_numero}
              </div>
              <div style={{ fontSize: 11, color: textMuted, marginBottom: 0 }}>
                {ultimoDepto.torre_frente} · {ultimoDepto.depto_id_obra}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: textMuted }}>{formatFecha(ultimoFecha).split(',')[0]}</div>
              <div style={{ fontSize: 11, color: textMuted }}>{formatFecha(ultimoFecha).split(',')[1]}</div>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: textMuted }}>Sin registros OG aún</div>
        )}
      </div>

      {/* ── 2b. Grid KPIs (más obs + avance donut) ───────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
        {/* Más pendientes */}
        <div
          onClick={() => masPendDepto && irAResumen(masPendDepto)}
          style={{
            background: kpiCardBg, borderRadius: 16, padding: 16,
            border: `0.5px solid ${kpiCardBorder}`,
            cursor: masPendDepto ? 'pointer' : 'default',
            position: 'relative', overflow: 'hidden',
          }}
        >
          <div style={{ position: 'absolute', bottom: -10, right: -10, width: 60, height: 60, borderRadius: '50%', background: dark ? 'radial-gradient(circle, rgba(217,119,6,0.12) 0%, transparent 70%)' : '#fffbeb' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: pendColor, letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 600, marginBottom: 14 }}>
                <AlertTriangle size={11} strokeWidth={2.25} /> Más pendientes
              </div>
          <div style={{ fontSize: 40, fontWeight: 800, color: kpiNumColor, lineHeight: 1, marginBottom: 3 }}>{masPendCount || '—'}</div>
          <div style={{ fontSize: 11, color: kpiSubColor }}>obs pendientes</div>
          {masPendDepto && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: `0.5px solid ${kpiSepBorder}` }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: textPrimary }}>Torre {masPendDepto.torre_nombre} · Depto {masPendDepto.depto_numero}</div>
              <div style={{ fontSize: 10, color: kpiSubColor, marginTop: 2 }}>{masPendDepto.torre_frente} · {masPendDepto.depto_id_obra}</div>
            </div>
          )}
        </div>

        {/* Avance donut */}
        <div style={{
          background: kpiCardBg, borderRadius: 16, padding: 16,
          border: `0.5px solid ${kpiCardBorder}`,
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', bottom: -10, right: -10, width: 60, height: 60, borderRadius: '50%', background: dark ? 'radial-gradient(circle, rgba(34,197,94,0.12) 0%, transparent 70%)' : '#f0fdf4' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: solColor, letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 600, marginBottom: 14 }}>
                <BarChart3 size={11} strokeWidth={2.25} /> Avance
              </div>
          {(() => {
            const pctAvance = avance && avance.total > 0 ? Math.round((avance.conObs / avance.total) * 100) : 0;
            const circ = 2 * Math.PI * 26;
            return (
              <>
                <div style={{ position: 'relative', width: 64, height: 64, margin: '0 auto 10px' }}>
                  <svg width="64" height="64" viewBox="0 0 64 64">
                    <circle cx="32" cy="32" r="26" fill="none" stroke={dark ? '#1E2E4A' : '#f1f5f9'} strokeWidth="6" />
                    <circle cx="32" cy="32" r="26" fill="none" stroke={solColor} strokeWidth="6"
                      strokeDasharray={`${(pctAvance / 100) * circ} ${circ}`}
                      strokeLinecap="round" transform="rotate(-90 32 32)" />
                  </svg>
                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: 12, fontWeight: 700, color: kpiNumColor }}>{pctAvance}%</div>
                </div>
                <div style={{ fontSize: 11, color: kpiSubColor, textAlign: 'center' }}>{avance ? `${avance.conObs} / ${avance.total} deptos` : '— deptos'}</div>
              </>
            );
          })()}
        </div>
      </div>

      {/* ── 3. Desglose por reparación (2×2 tiles) ───────────────────── */}
      {stats && totalObs > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, paddingLeft: 2 }}>
            <span style={{ fontSize: 9, color: textMuted, letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 600 }}>Desglose por reparación</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            {(['picado', 'puntereo', 'copa', 'yeso'] as const).map(key => {
              const Icon = IconAccion[key];
              const color = COLOR_ACCION[key];
              const darkAccent = key === 'copa' && dark ? '#b07800' : color;
              const s = stats[key];
              return (
                <div
                  key={key}
                  onClick={() => irAReporteVisual(key)}
                  style={{
                    background: kpiCardBg, borderRadius: 16, padding: 16,
                    border: `0.5px solid ${kpiCardBorder}`, position: 'relative', overflow: 'hidden',
                    cursor: 'pointer', transition: 'transform 0.15s', WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <div style={{
                    position: 'absolute', bottom: -10, right: -10, width: 60, height: 60, borderRadius: '50%',
                    background: dark ? `radial-gradient(circle, ${darkAccent}10 0%, transparent 70%)` : `${color}08`,
                  }} />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, color: dark ? darkAccent : color, letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 600 }}>
                      <Icon size={13} strokeWidth={2.25} /> {LabelAccion[key]}
                    </div>
                    <ChevronRight size={13} color={textMuted} style={{ opacity: 0.4 }} />
                  </div>

                  {/* Pendientes: primer plano */}
                  <div style={{ fontSize: 36, fontWeight: 800, color: kpiNumColor, lineHeight: 1, marginBottom: 2 }}>
                    {s.pendiente}
                  </div>
                  <div style={{ fontSize: 10, color: kpiSubColor, fontWeight: 600, marginBottom: 10 }}>pendientes</div>

                  {/* Solucionados: segundo plano */}
                  <div style={{ paddingTop: 10, borderTop: `0.5px solid ${kpiSepBorder}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: textSecondary }}>
                        <span style={{ color: solColor, fontWeight: 600 }}>{s.solucionado}</span> solucionado{s.solucionado !== 1 ? 's' : ''}
                      </span>
                      <span style={{ fontSize: 10, color: kpiSubColor }}>
                        /{s.total}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── 4. Estado de observaciones (indicador, sin nav) ──────────── */}
      {totalObs > 0 && (
        <div style={{
          background: kpiCardBg, borderRadius: 16, padding: '16px 18px', marginBottom: 16,
          border: `0.5px solid ${kpiCardBorder}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
            <span style={{ fontSize: 9, color: textMuted, letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 600 }}>Estado de observaciones</span>
          </div>

          {/* Barra de progreso */}
          <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 12, background: dark ? '#1E2E4A' : '#f1f5f9' }}>
            <div style={{ width: `${Math.round((totalSol / totalObs) * 100)}%`, background: solColor, borderRadius: 4, transition: 'width 0.5s' }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle2 size={14} color={solColor} strokeWidth={2.25} />
              <span style={{ fontSize: 13, color: solColor, fontWeight: 700 }}>{totalSol}</span>
              <span style={{ fontSize: 11, color: textSecondary }}>solucionadas</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={14} color={pendColor} strokeWidth={2.25} />
              <span style={{ fontSize: 13, color: pendColor, fontWeight: 700 }}>{totalPend}</span>
              <span style={{ fontSize: 11, color: textSecondary }}>pendientes</span>
            </div>
          </div>

          {porDefinir > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 10, paddingTop: 10, borderTop: `0.5px solid ${kpiSepBorder}` }}>
              <HelpCircle size={12} color={textMuted} />
              <span style={{ fontSize: 11, color: textMuted }}>{porDefinir} por definir</span>
            </div>
          )}
        </div>
      )}

      {/* ── Separador ─────────────────────────────────────────────────── */}
      {totalObs > 0 && (
        <div style={{ height: '0.5px', background: dark ? 'linear-gradient(90deg, transparent, #243550, transparent)' : 'linear-gradient(90deg, transparent, #e2e8f0, transparent)', marginBottom: 18 }} />
      )}

      {/* ── 5. Actividad reciente (últimas soluciones) ─────────────────── */}
      {actividad.length > 0 && (
        <>
          <div style={{ fontSize: 9, color: textMuted, letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 600, marginBottom: 12 }}>Últimas soluciones</div>
          {actividad.map((item, i) => {
            const Icon = IconAccion[item.accion];
            const color = COLOR_ACCION[item.accion];
            const darkAccent = item.accion === 'copa' && dark ? '#b07800' : color;
            return (
              <div
                key={i}
                onClick={() => irAResumen(item.depto)}
                style={{
                  background: kpiCardBg, borderRadius: 14, padding: '14px 16px', marginBottom: 8,
                  border: `0.5px solid ${kpiCardBorder}`,
                  display: 'flex', alignItems: 'center', gap: 14,
                  cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                }}
              >
                <div style={{
                  width: 42, height: 42, borderRadius: 10, flexShrink: 0,
                  background: dark
                    ? `linear-gradient(135deg, ${darkAccent}12, ${darkAccent}08)`
                    : `${color}08`,
                  border: dark ? `0.5px solid ${darkAccent}20` : `0.5px solid ${color}15`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={18} color={dark ? darkAccent : color} strokeWidth={2} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CheckCircle2 size={11} color={solColor} strokeWidth={2.5} />
                    <span style={{ fontSize: 14, fontWeight: 600, color: textPrimary }}>
                      {item.depto.torre_frente} · {item.depto.depto_id_obra}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: textMuted, marginTop: 2 }}>
                    {LabelAccion[item.accion]} · Torre {item.depto.torre_nombre}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 11, color: textMuted }}>{formatFecha(item.fecha).split(',')[0]}</div>
                  <div style={{ fontSize: 11, color: textMuted }}>{formatFecha(item.fecha).split(',')[1]}</div>
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* ── 6. Resumen total al pie ─────────────────────────────────── */}
      {totalObs > 0 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 4, marginBottom: 20 }}>
          <div style={{ flex: 1, background: dark ? '#16233B' : '#f8fafc', borderRadius: 14, padding: '14px 10px', textAlign: 'center', border: `0.5px solid ${border}` }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6, color: CIAN }}>
              <ClipboardList size={20} strokeWidth={2} />
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: CIAN, lineHeight: 1 }}>{totalObs}</div>
            <div style={{ fontSize: 10, color: textMuted, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Total OG</div>
          </div>
          {porDefinir > 0 && (
            <div style={{ flex: 1, background: dark ? '#16233B' : '#f8fafc', borderRadius: 14, padding: '14px 10px', textAlign: 'center', border: `0.5px solid ${border}` }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6, color: dark ? '#888' : '#94a3b8' }}>
                <HelpCircle size={20} strokeWidth={2} />
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: dark ? '#888' : '#94a3b8', lineHeight: 1 }}>{porDefinir}</div>
              <div style={{ fontSize: 10, color: textMuted, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Por definir</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DashboardOG;
