// src/pages/RevisionOGAmbiente.tsx
import React from 'react';
import { IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonMenuButton } from '@ionic/react';

const RevisionOGAmbiente: React.FC = () => (
  <IonPage>
    <IonHeader>
      <IonToolbar style={{ '--background': '#1e3a5f', '--color': '#ffffff' } as any}>
        <IonMenuButton slot="start" menu="menu-lateral" />
        <IonTitle style={{ fontSize: 15 }}>📐 Ambiente</IonTitle>
      </IonToolbar>
    </IonHeader>
    <IonContent>
      <div style={{ padding: 32, textAlign: 'center', color: '#64748b', marginTop: 60 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🔧</div>
        En construcción
      </div>
    </IonContent>
  </IonPage>
);

export default RevisionOGAmbiente;