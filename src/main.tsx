import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initOfflineQueues } from './Context/OfflineContext';
import { initOgQueue } from './utils/Ogofflinequeue';
import { initPostventaQueue } from './utils/postventaOfflineQueue';
import { initPreEntregaFotosQueue } from './utils/preEntregaFotosQueue';
import { initPostventaBorradorLocal } from './utils/postventaBorradorLocal';
import { initPostventaFotosPendientes } from './utils/postventaFotosPendientes';

const container = document.getElementById('root');
const root = createRoot(container!);

// Hidratar las colas offline (IndexedDB) ANTES de renderizar: así, si el
// usuario abre la app y entra directo a una pantalla que lee contadores de
// pendientes de forma síncrona (ej. RevisionOG), ya ve el número correcto
// desde el primer render en vez de un 0 momentáneo. En la práctica esto
// tarda unos pocos milisegundos (son pocos registros).
Promise.all([
  initOfflineQueues(), initOgQueue(), initPostventaQueue(),
  initPreEntregaFotosQueue(), initPostventaBorradorLocal(),
  initPostventaFotosPendientes(),
]).finally(() => {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});