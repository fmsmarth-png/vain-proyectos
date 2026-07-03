// src/pages/LevantamientoCeramicosDetalle.tsx
// Torres colapsables (IonAccordion): los deptos se ocultan hasta tocar la torre.
// Al volver desde el checklist (tras guardar), reabre automáticamente la torre
// correspondiente, hace scroll al depto y lo resalta brevemente.

import { useState, useRef } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import {
  IonContent,
  IonHeader,
  IonBackButton,
  IonButtons,
  IonPage,
  IonToolbar,
  IonTitle,
  IonList,
  IonItem,
  IonLabel,
  IonSpinner,
  IonBadge,
  IonButton,
  IonIcon,
  IonToast,
  IonAccordion,
  IonAccordionGroup,
  useIonViewWillEnter,
  useIonViewDidEnter,
} from '@ionic/react';
import { downloadOutline } from 'ionicons/icons';
import { supabase } from '../supabase';
import { guardarCacheDeptos, leerCacheDeptos } from '../utils/ceramicosOffline';
import { exportarExcelCeramicos } from '../utils/excelCeramicos';

interface Proyecto {
  id: string;
  nombre: string;
  direccion: string;
}

interface Torre {
  id: string;
  nombre: string;
}

interface Depto {
  id: string;
  numero: string | number;
  torre_id: string;
  piso: number | null;
}

interface CacheDeptos {
  torres: Torre[];
  deptos: Depto[];
}

const KEY_TORRE_ABIERTA = 'ceramicos_torre_abierta';
const KEY_DEPTO_RESALTADO = 'ceramicos_depto_resaltado';

export default function LevantamientoCeramicosDetalle() {
  const history = useHistory();
  const location = useLocation<{ proyecto?: Proyecto }>();
  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [torres, setTorres] = useState<Torre[]>([]);
  const [deptos, setDeptos] = useState<Depto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [offline, setOffline] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [toast, setToast] = useState('');
  const [torreAbierta, setTorreAbierta] = useState<string | undefined>(undefined);
  const [deptoResaltado, setDeptoResaltado] = useState<string | null>(null);
  const yaCargo = useRef(false);
  const refsDeptos = useRef<Record<string, HTMLIonItemElement | null>>({});

  useIonViewWillEnter(() => {
    const stateProyecto = location.state?.proyecto
      ?? JSON.parse(sessionStorage.getItem('ceramicos_proyecto_actual') || 'null');

    if (!stateProyecto) {
      history.replace('/levantamiento-ceramicos');
      return;
    }

    sessionStorage.setItem('ceramicos_proyecto_actual', JSON.stringify(stateProyecto));
    setProyecto(stateProyecto);

    // Si venimos de guardar un checklist, reabrir esa torre y preparar el resaltado
    const torreGuardada = sessionStorage.getItem(KEY_TORRE_ABIERTA);
    const deptoGuardado = sessionStorage.getItem(KEY_DEPTO_RESALTADO);
    if (torreGuardada) setTorreAbierta(torreGuardada);
    if (deptoGuardado) setDeptoResaltado(deptoGuardado);

    if (yaCargo.current) return;
    yaCargo.current = true;
    cargarTorresYDeptos(stateProyecto.id);
  });

  useIonViewDidEnter(() => {
    const deptoGuardado = sessionStorage.getItem(KEY_DEPTO_RESALTADO);
    if (!deptoGuardado) return;

    // Pequeño delay para que el accordion termine su animación de apertura antes del scroll
    setTimeout(() => {
      refsDeptos.current[deptoGuardado]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 350);

    setTimeout(() => {
      setDeptoResaltado(null);
      sessionStorage.removeItem(KEY_TORRE_ABIERTA);
      sessionStorage.removeItem(KEY_DEPTO_RESALTADO);
    }, 2200);
  });

  async function cargarTorresYDeptos(proyectoId: string) {
    setCargando(true);

    try {
      const { data: torresData, error: errTorres } = await supabase
        .from('torres')
        .select('id, nombre')
        .eq('proyecto_id', proyectoId)
        .order('nombre', { ascending: true });

      if (errTorres) throw errTorres;

      const { data: deptosData, error: errDeptos } = await supabase
        .from('departamentos')
        .select('id, numero, torre_id, piso')
        .in('torre_id', (torresData ?? []).map((t) => t.id));

      if (errDeptos) throw errDeptos;

      setTorres((torresData ?? []) as Torre[]);
      setDeptos((deptosData ?? []) as Depto[]);
      guardarCacheDeptos(proyectoId, { torres: torresData ?? [], deptos: deptosData ?? [] });
      setOffline(false);
    } catch (e) {
      console.error('Error cargando torres/deptos de Levantamiento Cerámicos:', e);
      const cache = leerCacheDeptos<CacheDeptos>(proyectoId);
      if (cache) {
        setTorres(cache.torres);
        setDeptos(cache.deptos);
        setOffline(true);
      } else {
        setToast('No se pudo cargar el proyecto y no hay datos guardados localmente');
      }
    } finally {
      setCargando(false);
    }
  }

  function irAChecklist(depto: Depto, torre: Torre) {
    if (!proyecto) return;
    // Recordar qué torre estaba abierta, por si el usuario vuelve sin guardar (botón atrás)
    sessionStorage.setItem(KEY_TORRE_ABIERTA, torre.id);
    history.push('/levantamiento-ceramicos/checklist', {
      proyecto,
      torre,
      depto,
    });
  }

  async function exportar() {
    if (!proyecto) return;
    if (!navigator.onLine) {
      setToast('Necesitas conexión para exportar');
      return;
    }
    setExportando(true);
    try {
      await exportarExcelCeramicos(proyecto.id, proyecto.nombre);
    } catch (e: any) {
      console.error('Error exportando Excel Levantamiento Cerámicos:', e);
      setToast(e?.message ?? 'Error al exportar');
    } finally {
      setExportando(false);
    }
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/levantamiento-ceramicos" />
          </IonButtons>
          <IonTitle>{proyecto?.nombre ?? 'Levantamiento Cerámicos'}</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={exportar} disabled={exportando}>
              <IonIcon icon={downloadOutline} slot="start" />
              Excel
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        {offline && (
          <div style={{ padding: '8px 16px', fontSize: 13, color: 'var(--ion-color-warning)' }}>
            Sin conexión — mostrando datos guardados localmente
          </div>
        )}
        {cargando ? (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 40 }}>
            <IonSpinner />
          </div>
        ) : (
          <IonAccordionGroup
            value={torreAbierta}
            onIonChange={(e) => setTorreAbierta(e.detail.value as string | undefined)}
          >
            {torres.map((torre) => {
              const deptosTorre = deptos
                .filter((d) => d.torre_id === torre.id)
                .sort((a, b) => String(a.numero).localeCompare(String(b.numero)));

              return (
                <IonAccordion key={torre.id} value={torre.id}>
                  <IonItem slot="header" color="light">
                    <IonLabel>{torre.nombre}</IonLabel>
                    <IonBadge color="medium" slot="end" style={{ marginRight: 8 }}>
                      {deptosTorre.length}
                    </IonBadge>
                  </IonItem>
                  <div slot="content">
                    <IonList>
                      {deptosTorre.map((depto) => (
                        <IonItem
                          key={depto.id}
                          ref={(el) => { refsDeptos.current[depto.id] = el; }}
                          button
                          onClick={() => irAChecklist(depto, torre)}
                          color={deptoResaltado === depto.id ? 'warning' : undefined}
                          style={{ transition: 'background-color 0.4s ease' }}
                        >
                          <IonLabel>Depto {depto.numero}</IonLabel>
                          {depto.piso != null && <IonBadge color="medium">Piso {depto.piso}</IonBadge>}
                        </IonItem>
                      ))}
                    </IonList>
                  </div>
                </IonAccordion>
              );
            })}
          </IonAccordionGroup>
        )}
      </IonContent>
      <IonToast isOpen={!!toast} message={toast} duration={2500} onDidDismiss={() => setToast('')} />
    </IonPage>
  );
}
