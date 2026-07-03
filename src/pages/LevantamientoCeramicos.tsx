// src/pages/LevantamientoCeramicos.tsx
// Pantalla de entrada, independiente de OG. Lista proyectos -> navega a LevantamientoCeramicosDetalle.

import { useState, useRef } from 'react';
import { useHistory } from 'react-router-dom';
import {
  IonContent,
  IonHeader,
  IonMenuButton,
  IonPage,
  IonToolbar,
  IonTitle,
  IonList,
  IonItem,
  IonLabel,
  IonSpinner,
  useIonViewDidEnter,
} from '@ionic/react';
import { supabase } from '../supabase';

interface Proyecto {
  id: string;
  nombre: string;
  direccion: string;
  estado: string;
}

export default function LevantamientoCeramicos() {
  const history = useHistory();
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [cargando, setCargando] = useState(true);
  const yaCargo = useRef(false);

  useIonViewDidEnter(() => {
    if (yaCargo.current) return;
    yaCargo.current = true;
    cargarProyectos();
  });

  async function cargarProyectos() {
    setCargando(true);
    const { data, error } = await supabase
      .from('proyectos')
      .select('id, nombre, direccion, estado')
      .eq('estado', 'activo')
      .order('nombre', { ascending: true });

    if (!error && data) {
      setProyectos(data as Proyecto[]);
    }
    setCargando(false);
  }

  function irADetalle(proyecto: Proyecto) {
    history.push('/levantamiento-ceramicos/detalle', { proyecto });
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonMenuButton slot="start" menu="menu-lateral" />
          <IonTitle>Levantamiento Cerámicos</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        {cargando ? (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 40 }}>
            <IonSpinner />
          </div>
        ) : (
          <IonList>
            {proyectos.map((p) => (
              <IonItem key={p.id} button onClick={() => irADetalle(p)}>
                <IonLabel>
                  <h2>{p.nombre}</h2>
                  <p>{p.direccion}</p>
                </IonLabel>
              </IonItem>
            ))}
          </IonList>
        )}
      </IonContent>
    </IonPage>
  );
}
