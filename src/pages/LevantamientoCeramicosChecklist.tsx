// src/pages/LevantamientoCeramicosChecklist.tsx
// Checklist por depto. Guarda primero en localStorage (offline-first) y sincroniza
// con Supabase al reconectar / al volver a entrar a la pantalla.
// Al guardar con éxito, vuelve automáticamente a LevantamientoCeramicosDetalle,
// que reabre la torre correspondiente y resalta el depto (ver KEY_TORRE_ABIERTA /
// KEY_DEPTO_RESALTADO en ese archivo).

import { useState, useEffect, useRef } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import {
  IonContent,
  IonHeader,
  IonBackButton,
  IonButtons,
  IonPage,
  IonToolbar,
  IonTitle,
  IonCheckbox,
  IonItem,
  IonLabel,
  IonTextarea,
  IonButton,
  IonIcon,
  IonBadge,
  IonToast,
  useIonViewWillEnter,
} from '@ionic/react';
import { cloudOfflineOutline, saveOutline } from 'ionicons/icons';
import { supabase } from '../supabase';
import {
  AMBIENTES_CERAMICOS,
  ChecklistCeramicos,
  checklistVacio,
  toggleItem,
  estaMarcado,
} from '../utils/ceramicosConfig';
import {
  encolarRegistro,
  sincronizarCola,
  contarPendientes,
} from '../utils/ceramicosOffline';

interface Proyecto {
  id: string;
  nombre: string;
}
interface Torre {
  id: string;
  nombre: string;
}
interface Depto {
  id: string;
  numero: string;
}

const KEY_TORRE_ABIERTA = 'ceramicos_torre_abierta';
const KEY_DEPTO_RESALTADO = 'ceramicos_depto_resaltado';

// Mensaje discreto, solo visible para este usuario puntual
const EMAIL_MENSAJE_OCULTO = 'jcaballero@vain.cl';
const MENSAJE_OCULTO = '._.. .. _. _.. ._';

export default function LevantamientoCeramicosChecklist() {
  const history = useHistory();
  const location = useLocation<{ proyecto?: Proyecto; torre?: Torre; depto?: Depto }>();

  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [torre, setTorre] = useState<Torre | null>(null);
  const [depto, setDepto] = useState<Depto | null>(null);
  const [checklist, setChecklist] = useState<ChecklistCeramicos>(checklistVacio());
  const [comentario, setComentario] = useState('');
  const [sinConexion, setSinConexion] = useState(!navigator.onLine);
  const [pendientes, setPendientes] = useState(contarPendientes());
  const [toast, setToast] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [mostrarMensajeOculto, setMostrarMensajeOculto] = useState(false);
  const yaCargo = useRef(false);

  useIonViewWillEnter(() => {
    const stateData = {
      proyecto: location.state?.proyecto
        ?? JSON.parse(sessionStorage.getItem('ceramicos_proyecto_actual') || 'null'),
      torre: location.state?.torre
        ?? JSON.parse(sessionStorage.getItem('ceramicos_torre_actual') || 'null'),
      depto: location.state?.depto
        ?? JSON.parse(sessionStorage.getItem('ceramicos_depto_actual') || 'null'),
    };

    if (!stateData.proyecto || !stateData.torre || !stateData.depto) {
      history.replace('/levantamiento-ceramicos');
      return;
    }

    sessionStorage.setItem('ceramicos_proyecto_actual', JSON.stringify(stateData.proyecto));
    sessionStorage.setItem('ceramicos_torre_actual', JSON.stringify(stateData.torre));
    sessionStorage.setItem('ceramicos_depto_actual', JSON.stringify(stateData.depto));

    setProyecto(stateData.proyecto);
    setTorre(stateData.torre);
    setDepto(stateData.depto);

    if (yaCargo.current) return;
    yaCargo.current = true;
    cargarRegistroExistente(stateData.depto.id);
    intentarSincronizar();
    verificarUsuario();
  });

  async function verificarUsuario() {
    const { data: sesion } = await supabase.auth.getSession();
    const email = sesion?.session?.user?.email ?? '';
    setMostrarMensajeOculto(email === EMAIL_MENSAJE_OCULTO);
  }

  useEffect(() => {
    function onlineHandler() {
      setSinConexion(false);
      intentarSincronizar();
    }
    function offlineHandler() {
      setSinConexion(true);
    }
    window.addEventListener('online', onlineHandler);
    window.addEventListener('offline', offlineHandler);
    return () => {
      window.removeEventListener('online', onlineHandler);
      window.removeEventListener('offline', offlineHandler);
    };
  }, []);

  async function cargarRegistroExistente(departamentoId: string) {
    const { data, error } = await supabase
      .from('ceramicos_levantamiento')
      .select('checklist, comentario')
      .eq('departamento_id', departamentoId)
      .maybeSingle();

    if (!error && data) {
      setChecklist((data.checklist as ChecklistCeramicos) ?? checklistVacio());
      setComentario(data.comentario ?? '');
    }
  }

  async function intentarSincronizar() {
    if (!navigator.onLine) return;
    const resultado = await sincronizarCola();
    setPendientes(contarPendientes());
    if (resultado.ok > 0) {
      setToast(`Sincronizados ${resultado.ok} registro(s) pendiente(s)`);
    }
  }

  function onToggle(ambiente: string, item: string) {
    setChecklist((prev) => toggleItem(prev, ambiente, item));
  }

  async function guardar() {
    if (!proyecto || !torre || !depto || guardando) return;
    setGuardando(true);

    const { data: sesion } = await supabase.auth.getSession();
    const usuarioId = sesion?.session?.user?.id ?? null;

    encolarRegistro({
      proyecto_id: proyecto.id,
      torre_id: torre.id,
      departamento_id: depto.id,
      checklist,
      comentario: comentario.trim() || null,
      usuario_id: usuarioId,
      creado_en: new Date().toISOString(),
    });
    setPendientes(contarPendientes());

    let mensaje = 'Guardado localmente';
    if (navigator.onLine) {
      const resultado = await sincronizarCola();
      setPendientes(contarPendientes());
      if (resultado.ok > 0) mensaje = 'Guardado y sincronizado';
    }
    setToast(mensaje);

    // Dejar marca para que Detalle reabra esta torre y resalte el depto al volver
    sessionStorage.setItem(KEY_TORRE_ABIERTA, torre.id);
    sessionStorage.setItem(KEY_DEPTO_RESALTADO, depto.id);

    // Pequeña pausa para que se alcance a ver el toast antes de salir de la pantalla
    setTimeout(() => {
      history.goBack();
    }, 500);
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/levantamiento-ceramicos/detalle" />
          </IonButtons>
          <IonTitle>
            <div>
              {torre?.nombre} · Depto {depto?.numero}
            </div>
            {mostrarMensajeOculto && (
              <div style={{ fontSize: 10, opacity: 0.4, fontWeight: 400, letterSpacing: '0.5px' }}>
                {MENSAJE_OCULTO}
              </div>
            )}
          </IonTitle>
          {sinConexion && (
            <IonBadge color="warning" slot="end" style={{ marginRight: 12 }}>
              <IonIcon icon={cloudOfflineOutline} style={{ verticalAlign: '-2px', marginRight: 4 }} />
              Sin conexión
            </IonBadge>
          )}
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <div style={{ padding: 16 }}>
          {AMBIENTES_CERAMICOS.map((ambiente) => (
            <div
              key={ambiente.nombre}
              style={{
                border: '0.5px solid var(--ion-color-medium)',
                borderRadius: 12,
                padding: '12px 14px',
                marginBottom: 14,
              }}
            >
              <h2 style={{ fontSize: 15, fontWeight: 500, margin: '0 0 8px' }}>{ambiente.nombre}</h2>
              {ambiente.items.map((item) => (
                <IonItem key={item} lines="none" style={{ '--padding-start': 0 }}>
                  <IonCheckbox
                    slot="start"
                    checked={estaMarcado(checklist, ambiente.nombre, item)}
                    onIonChange={() => onToggle(ambiente.nombre, item)}
                  />
                  <IonLabel>{item}</IonLabel>
                </IonItem>
              ))}
            </div>
          ))}

          <IonItem lines="none" style={{ '--padding-start': 0 }}>
            <IonLabel position="stacked">Comentario (opcional)</IonLabel>
            <IonTextarea
              value={comentario}
              onIonChange={(e) => setComentario(e.detail.value ?? '')}
              placeholder="Observaciones generales del depto"
              rows={3}
            />
          </IonItem>

          <IonButton expand="block" onClick={guardar} disabled={guardando} style={{ marginTop: 16 }}>
            <IonIcon icon={saveOutline} slot="start" />
            {guardando ? 'Guardando…' : 'Guardar'}
          </IonButton>

          {pendientes > 0 && (
            <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--ion-color-medium)' }}>
              {pendientes} depto(s) pendientes de sincronizar
            </p>
          )}
        </div>
      </IonContent>
      <IonToast
        isOpen={!!toast}
        message={toast}
        duration={2000}
        onDidDismiss={() => setToast('')}
      />
    </IonPage>
  );
}
