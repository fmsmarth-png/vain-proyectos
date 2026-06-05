import {
  IonContent, IonPage, IonHeader, IonToolbar,
  IonTitle, IonSpinner, IonModal, IonMenuButton
} from '@ionic/react';
import { useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { supabase } from '../supabase';
import { useTheme } from '../Context/ThemeContext';
import { useOffline } from '../Context/OfflineContext';
import { cache } from '../Context/CacheContext';
import useAppFocus from '../hooks/useAppFocus';

const Inspeccion: React.FC = () => {
  const history = useHistory();
  const { theme } = useTheme();
  const { online, pendientes } = useOffline();
  const dark = theme === 'dark';

  const bg          = dark ? '#000000' : '#f0f4f8';
  const card        = dark ? '#0e0e0e'  : '#ffffff';
  const border      = dark ? '#1e1e1e'  : '#e2e8f0';
  const textPrimary   = dark ? '#f9fafb' : '#0f172a';
  const textSecondary = dark ? '#6b7280' : '#64748b';
  const textMuted     = dark ? '#444444' : '#94a3b8';
  const toolbar       = dark ? '#000000' : '#1e3a5f';
  const inputBg       = dark ? '#111111' : '#ffffff';
  const inputBorder   = dark ? '#1e1e1e' : '#cbd5e1';

  const [proyectos, setProyectos]         = useState<any[]>([]);
  const [torres, setTorres]               = useState<any[]>([]);
  const [deptos, setDeptos]               = useState<any[]>([]);
  const [resumen, setResumen]             = useState<any[]>([]);
  const [proyectoId, setProyectoId]       = useState('');
  const [torreId, setTorreId]             = useState('');
  const [deptoId, setDeptoId]             = useState('');
  const [proyectoSel, setProyectoSel]     = useState<any>(null);
  const [torreSel, setTorreSel]           = useState<any>(null);
  const [deptoSel, setDeptoSel]           = useState<any>(null);
  const [loading, setLoading]             = useState(true);
  const [modalTorre, setModalTorre]       = useState(false);
  const [torreModal, setTorreModal]       = useState<any>(null);
  const [deptosModal, setDeptosModal]     = useState<any[]>([]);
  const [ultimoDepto, setUltimoDepto]     = useState<any>(null);
  const [cargandoModal, setCargandoModal] = useState(false);

  useEffect(() => { cargar(); }, []);
  useAppFocus(() => { cargar(); });

  useEffect(() => {
    if (proyectoId) { cargarTorres(proyectoId); setTorreId(''); setDeptoId(''); setProyectoSel(proyectos.find(p => p.id === proyectoId)); }
  }, [proyectoId]);

  useEffect(() => {
    if (torreId) { cargarDeptos(torreId); setDeptoId(''); setTorreSel(torres.find(t => t.id === torreId)); }
  }, [torreId]);

  useEffect(() => {
    if (deptoId) setDeptoSel(deptos.find(d => d.id === deptoId));
  }, [deptoId]);

  useEffect(() => {
    if (proyectoId) cargarResumen(proyectoId);
  }, [proyectoId, torres]);

  useEffect(() => {
    if (!proyectoId || !online) return;
    const channel = supabase.channel(`resumen_${proyectoId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registros' }, () => { cargarResumen(proyectoId); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [proyectoId, online]);

  const cargar = async () => {
    setLoading(true);
    const proyCache = cache.getProyectos().filter((p: any) => p.estado === 'activo');
    setProyectos(proyCache);
    setUltimoDepto(cache.getUltimoDepto());
    if (online) {
      try {
        const { data: { user } } = await Promise.race([supabase.auth.getUser(), new Promise<any>((_, reject) => setTimeout(() => reject('timeout'), 4000))]);
        if (!user) { setLoading(false); return; }
        const { data: perfil } = await supabase.from('usuarios').select('rol').eq('id', user.id).single();
        let proy;
        if (perfil?.rol === 'administrador') {
          const { data } = await supabase.from('proyectos').select('*').eq('estado', 'activo').order('nombre'); proy = data;
        } else {
          const { data: asignados } = await supabase.from('usuario_proyectos').select('proyecto_id').eq('usuario_id', user.id);
          const ids = asignados?.map(a => a.proyecto_id) ?? [];
          const { data } = await supabase.from('proyectos').select('*').eq('estado', 'activo').in('id', ids).order('nombre'); proy = data;
        }
        if (proy) { setProyectos(proy); cache.setProyectos(proy); }
        const { data: ultimoReg } = await supabase.from('registros')
          .select('departamento_id, departamentos(numero, id_obra), torres(nombre, frente), proyectos(nombre)')
          .eq('creado_por', user.id).order('creado_en', { ascending: false }).limit(1).single();
        if (ultimoReg) { setUltimoDepto(ultimoReg); cache.setUltimoDepto(ultimoReg); }
      } catch {}
    }
    setLoading(false);
  };

  const cargarTorres = async (pId: string) => {
    const cached = cache.getTorres(pId); if (cached.length > 0) setTorres(cached);
    if (online) { try { const { data } = await supabase.from('torres').select('*').eq('proyecto_id', pId).order('nombre'); if (data) { setTorres(data); cache.setTorres(pId, data); } } catch {} }
  };

  const cargarDeptos = async (tId: string) => {
    const cached = cache.getDeptos(tId); if (cached.length > 0) setDeptos(cached);
    if (online) { try { const { data } = await supabase.from('departamentos').select('*').eq('torre_id', tId).order('numero'); if (data) { setDeptos(data); cache.setDeptos(tId, data); } } catch {} }
  };

  const cargarResumen = async (pId: string) => {
    const torresCache = cache.getTorres(pId);
    if (torresCache.length > 0) { setResumen(torresCache.map((t: any) => ({ ...t, inspeccionados: 0, total: cache.getDeptos(t.id).length }))); }
    if (!online) return;
    try {
      const { data: torresData } = await supabase.from('torres').select('*, departamentos(id)').eq('proyecto_id', pId).order('nombre');
      if (!torresData) return;
      const resumenData = await Promise.all(torresData.map(async (t: any) => {
        const deptoIds = t.departamentos?.map((d: any) => d.id) ?? [];
        if (deptoIds.length === 0) return { ...t, inspeccionados: 0, total: 0 };
        const { data: regs } = await supabase.from('registros').select('departamento_id').in('departamento_id', deptoIds);
        const inspeccionados = new Set(regs?.map(r => r.departamento_id) ?? []).size;
        return { ...t, inspeccionados, total: deptoIds.length };
      }));
      setResumen(resumenData);
    } catch {}
  };

  const abrirModalTorre = async (torre: any) => {
    setTorreModal(torre); setDeptosModal([]); setCargandoModal(true); setModalTorre(true);
    let deptosData: any[] = cache.getDeptos(torre.id);
    if (deptosData.length > 0) { setDeptosModal(deptosData.map(d => ({ ...d, tieneRegistros: false }))); setCargandoModal(false); }
    if (online) {
      try { const { data } = await supabase.from('departamentos').select('*').eq('torre_id', torre.id).order('numero'); if (data) { deptosData = data; cache.setDeptos(torre.id, data); } } catch {}
      try {
        const deptoIds = deptosData.map(d => d.id);
        const { data: regs } = await supabase.from('registros').select('departamento_id').in('departamento_id', deptoIds);
        const conRegistros = new Set(regs?.map(r => r.departamento_id) ?? []);
        setDeptosModal(deptosData.map(d => ({ ...d, tieneRegistros: conRegistros.has(d.id) })));
      } catch { setDeptosModal(deptosData.map(d => ({ ...d, tieneRegistros: false }))); }
    } else { setDeptosModal(deptosData.map(d => ({ ...d, tieneRegistros: false }))); }
    setCargandoModal(false);
  };

  const iniciarInspeccion = (depto?: any) => {
    const dSel = depto ?? deptoSel;
    const tSel = depto ? torreModal : torreSel;
    if (!dSel || !tSel || !proyectoSel) return;
    history.push('/inspeccion/depto', { depto: dSel, torre: tSel, proyecto: proyectoSel });
  };
const irAZonaComun = () => {
  if (!torreSel || !proyectoSel) return;
  history.push('/zonas-comunes', { torre: torreSel, proyecto: proyectoSel });
};

const irAZonaComunDesdeModal = () => {
  setModalTorre(false);
  setTimeout(() => {
    history.push('/zonas-comunes', { torre: torreModal, proyecto: proyectoSel });
  }, 300);
};
  const selectStyle = { width: '100%', height: 44, borderRadius: 10, padding: '0 12px', background: inputBg, border: `0.5px solid ${inputBorder}`, color: textPrimary, fontSize: 14, boxSizing: 'border-box' as any, marginBottom: 12 };
  const labelStyle  = { fontSize: 9, color: textMuted, display: 'block', marginBottom: 6, textTransform: 'uppercase' as any, letterSpacing: '1.5px', fontWeight: 600 };

  const sepLine = dark
    ? 'linear-gradient(90deg, transparent, #1e1e1e, transparent)'
    : 'linear-gradient(90deg, transparent, #e2e8f0, transparent)';

  if (loading && !cache.hayDatos()) return (
    <IonPage id="main-content">
      <IonContent style={{ '--background': bg }}>
        <div style={{ textAlign: 'center', marginTop: 100 }}><IonSpinner name="crescent" /></div>
      </IonContent>
    </IonPage>
  );

  return (
    <IonPage id="main-content">
      <IonHeader>
        <IonToolbar style={{ '--background': toolbar, '--color': '#f9fafb', '--border-color': 'transparent' }}>
          <IonMenuButton slot="start" style={{ '--color': dark ? '#555' : 'rgba(255,255,255,0.7)' }} />
          <IonTitle style={{ fontSize: 16, fontWeight: 600 }}>Registrar Observaciones</IonTitle>
          <div slot="end" style={{ paddingRight: 14 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: online ? '#4ade80' : '#fbbf24' }} />
          </div>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': bg }}>
        <div style={{ padding: 16 }}>

          {/* Último depto */}
          {ultimoDepto && (
            <div style={{ background: dark ? 'linear-gradient(135deg, #0e0e0e 0%, #161616 100%)' : '#fff', borderRadius: 16, padding: 16, marginBottom: 20, border: `0.5px solid ${border}`, display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: dark ? 'linear-gradient(135deg, #1a1a1a, #222)' : '#eff6ff', border: dark ? '0.5px solid #2a2a2a' : '0.5px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>📍</div>
              <div>
                <div style={{ fontSize: 9, color: dark ? '#60a5fa' : '#2563eb', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600 }}>
                  Último departamento revisado
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: textPrimary }}>
                  {ultimoDepto.proyectos?.nombre} · Torre {ultimoDepto.torres?.nombre} · Depto {ultimoDepto.departamentos?.numero}
                </div>
                <div style={{ fontSize: 11, color: textMuted, marginTop: 2 }}>
                  {ultimoDepto.departamentos?.id_obra}
                </div>
              </div>
            </div>
          )}

          {/* Sin conexión */}
          {!online && (
            <div style={{ background: 'rgba(251,191,36,0.06)', border: '0.5px solid rgba(251,191,36,0.2)', borderRadius: 12, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#fbbf24', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#fbbf24' }}>Sin conexión — usando datos guardados{pendientes > 0 ? ` · ${pendientes} en cola` : ''}</span>
            </div>
          )}

          {/* Seleccionar */}
          <div style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600, marginBottom: 12 }}>Seleccionar departamento</div>
          <div style={{ height: '0.5px', background: sepLine, marginBottom: 16 }} />

          <div style={{ background: dark ? 'linear-gradient(135deg, #0e0e0e 0%, #141414 100%)' : '#fff', borderRadius: 16, padding: 16, marginBottom: 20, border: `0.5px solid ${border}` }}>
            <label style={labelStyle}>proyecto</label>
            <select value={proyectoId} onChange={e => setProyectoId(e.target.value)} style={selectStyle}>
              <option value="">Seleccionar proyecto...</option>
              {proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>

            <label style={labelStyle}>torre</label>
            <select value={torreId} onChange={e => setTorreId(e.target.value)} style={{ ...selectStyle, opacity: !proyectoId ? 0.3 : 1 }} disabled={!proyectoId}>
              <option value="">Seleccionar torre...</option>
              {torres.map(t => <option key={t.id} value={t.id}>Torre {t.nombre}{t.frente ? ` (${t.frente})` : ''}</option>)}
            </select>

            <label style={labelStyle}>departamento</label>
<select value={deptoId} onChange={e => setDeptoId(e.target.value)} style={{ ...selectStyle, opacity: !torreId ? 0.3 : 1, marginBottom: 16 }} disabled={!torreId}>
  <option value="">Seleccionar departamento...</option>
  {torreId && <option value="__ZC__">🏢 Zona Común</option>}
  {deptos.map(d => <option key={d.id} value={d.id}>{d.numero}{d.id_obra ? ` · ${d.id_obra}` : ''}</option>)}
</select>

<button onClick={() => deptoId === '__ZC__' ? irAZonaComun() : iniciarInspeccion()} disabled={!deptoId} style={{
              width: '100%', height: 48, borderRadius: 12,
              background: deptoId
                ? (dark ? 'linear-gradient(135deg, #1a1a1a, #2a2a2a)' : 'linear-gradient(135deg, #1e3a5f, #2563eb)')
                : 'transparent',
              border: deptoId ? 'none' : `0.5px solid ${border}`,
              color: deptoId ? '#fff' : textMuted,
              fontSize: 14, fontWeight: 600, cursor: deptoId ? 'pointer' : 'not-allowed'
            }}>
              {!deptoId
  ? 'Selecciona un departamento'
  : deptoId === '__ZC__'
    ? `🏢 Zona Común Torre ${torreSel?.nombre}`
    : `▶ Torre ${torreSel?.nombre} · Depto ${deptoSel?.numero}`}
            </button>
          </div>

          {/* Resumen por torre */}
          {resumen.length > 0 && (
            <>
              <div style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600, marginBottom: 12 }}>Resumen por torre</div>
              <div style={{ height: '0.5px', background: sepLine, marginBottom: 16 }} />

              {resumen.map((t: any) => {
                const pct = t.total > 0 ? (t.inspeccionados / t.total) * 100 : 0;
                return (
                  <div key={t.id} style={{ background: dark ? 'linear-gradient(135deg, #0e0e0e 0%, #181818 100%)' : '#fff', borderRadius: 16, padding: 16, marginBottom: 10, border: `0.5px solid ${border}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: dark ? 'linear-gradient(135deg, #1a1a1a, #222)' : 'linear-gradient(135deg, #1e3a5f, #2563eb)', border: dark ? '0.5px solid #2a2a2a' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: dark ? '#666' : '#fff' }}>{t.nombre}</div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: textPrimary }}>Torre {t.nombre}{t.frente ? ` (${t.frente})` : ''}</div>
                          <div style={{ fontSize: 11, color: textMuted, marginTop: 2 }}>{t.inspeccionados}/{t.total} deptos</div>
                        </div>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: pct === 100 ? (dark ? '#4ade80' : '#15803d') : textMuted }}>
                        {Math.round(pct)}%
                      </span>
                    </div>
                    <div style={{ height: 3, background: dark ? '#111' : '#f1f5f9', borderRadius: 2, marginBottom: 12 }}>
                      <div style={{ height: 3, borderRadius: 2, background: pct === 100 ? (dark ? '#4ade80' : '#22c55e') : (dark ? 'linear-gradient(90deg, #333, #555)' : 'linear-gradient(90deg, #bfdbfe, #2563eb)'), width: `${pct}%`, transition: 'width 0.4s ease' }} />
                    </div>
                    <button onClick={() => abrirModalTorre(t)} style={{ background: 'none', border: 'none', color: dark ? '#555' : '#2563eb', fontSize: 12, cursor: 'pointer', padding: 0, fontWeight: 500 }}>
                      ver deptos →
                    </button>
                  </div>
                );
              })}
            </>
          )}

          {pendientes > 0 && (
            <div style={{ background: 'rgba(251,191,36,0.06)', borderRadius: 12, padding: '10px 14px', border: '0.5px solid rgba(251,191,36,0.15)', display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#fbbf24' }} />
              <span style={{ fontSize: 12, color: '#fbbf24' }}>{pendientes} registro(s) pendientes de sincronizar</span>
            </div>
          )}

          <div style={{ height: 40 }} />
        </div>

        {/* Modal deptos */}
        <IonModal isOpen={modalTorre} onDidDismiss={() => setModalTorre(false)} initialBreakpoint={0.85} breakpoints={[0, 0.85, 1]}>
          <div style={{ padding: 24, background: card, height: '100%', overflowY: 'auto' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: textPrimary, marginBottom: 4 }}>
              Torre {torreModal?.nombre}{torreModal?.frente ? ` (${torreModal.frente})` : ''}
            </div>
            <div style={{ fontSize: 12, color: textSecondary, marginBottom: 8 }}>Toca un departamento para iniciar inspección</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: dark ? '#4ade80' : '#22c55e' }} />
                <span style={{ fontSize: 11, color: textSecondary }}>Con registros</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: border }} />
                <span style={{ fontSize: 11, color: textSecondary }}>Sin registros</span>
              </div>
            </div>

            {cargandoModal ? (
  <div style={{ textAlign: 'center', marginTop: 40 }}><IonSpinner name="crescent" /></div>
) : deptosModal.length === 0 ? (
  <div style={{ textAlign: 'center', marginTop: 40, color: textMuted, fontSize: 13 }}>Sin departamentos registrados</div>
) : (
  <>
    <button
      onClick={irAZonaComunDesdeModal}
      style={{
        width: '100%', height: 42, borderRadius: 12, marginBottom: 16,
        background: dark ? 'rgba(96,165,250,0.06)' : '#eff6ff',
        border: dark ? '0.5px solid rgba(96,165,250,0.2)' : '0.5px solid #bfdbfe',
        color: dark ? '#60a5fa' : '#1d4ed8',
        fontSize: 13, fontWeight: 600, cursor: 'pointer',
      }}>
      🏢 Ir a Zona Común de esta torre
    </button>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {deptosModal.map((d: any) => (
        <button key={d.id} onClick={() => { setModalTorre(false); setTimeout(() => iniciarInspeccion(d), 300); }} style={{
          background: d.tieneRegistros
            ? (dark ? 'linear-gradient(135deg, #0a1a0e, #111)' : '#f0fdf4')
            : (dark ? 'linear-gradient(135deg, #111, #161616)' : '#f8fafc'),
          border: `0.5px solid ${d.tieneRegistros ? (dark ? 'rgba(74,222,128,0.25)' : '#bbf7d0') : border}`,
          borderRadius: 12, padding: '10px 14px', cursor: 'pointer', textAlign: 'center', minWidth: 72
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: d.tieneRegistros ? (dark ? '#4ade80' : '#15803d') : textPrimary }}>{d.numero}</div>
          <div style={{ fontSize: 10, color: d.tieneRegistros ? (dark ? '#4ade80' : '#15803d') : textMuted, marginTop: 2 }}>{d.id_obra}</div>
          {d.tieneRegistros && <div style={{ fontSize: 10, color: dark ? '#4ade80' : '#15803d', marginTop: 3 }}>✓</div>}
        </button>
      ))}
    </div>
  </>
)}

<button onClick={() => setModalTorre(false)} style={{ width: '100%', height: 44, borderRadius: 12, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 14, marginTop: 24, cursor: 'pointer' }}>Cerrar</button>
          </div>
        </IonModal>

      </IonContent>
    </IonPage>
  );
};

export default Inspeccion;