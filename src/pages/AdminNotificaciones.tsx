import React, { useState } from 'react';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonInput,
  IonTextarea,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonAlert,
  IonModal,
} from '@ionic/react';
import { Plus, Save, Trash2, Pencil, Eye, EyeOff, CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { useNotificacionesAdmin } from '../hooks/useNotificaciones';
import { supabase } from '../supabase';

interface FormNotificacion {
  id?: string;
  titulo: string;
  mensaje: string;
  tipo: 'info' | 'warning' | 'error' | 'success';
  usuario_email: string;
  activa: boolean;
}

const FORM_INICIAL: FormNotificacion = {
  titulo: '',
  mensaje: '',
  tipo: 'info',
  usuario_email: 'jcaballero@vain.cl',
  activa: true,
};

const CONFIG: Record<string, { color: string; bg: string; border: string; Icon: any; label: string }> = {
  success: { color: '#3fa64c', bg: 'rgba(63,166,76,0.12)', border: 'rgba(63,166,76,0.3)', Icon: CheckCircle2, label: 'Éxito' },
  warning: { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.3)', Icon: AlertTriangle, label: 'Advertencia' },
  error:   { color: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.3)', Icon: XCircle, label: 'Error' },
  info:    { color: '#4c86e6', bg: 'rgba(76,134,230,0.12)', border: 'rgba(76,134,230,0.3)', Icon: Info, label: 'Info' },
};

const BG = '#000000';
const CARD_BG = '#0a0a0a';
const BORDER = '#1a1a1a';
const TEXT = '#f2f3f5';
const TEXT_SEC = '#a9adb3';
const TEXT_MUTED = '#75797f';
const ACCENT = '#4c86e6';

const AdminNotificaciones: React.FC = () => {
  const { notificaciones, cargando } = useNotificacionesAdmin();
  const [form, setForm] = useState<FormNotificacion>(FORM_INICIAL);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [notifAEliminar, setNotifAEliminar] = useState<string | null>(null);

  const handleNueva = () => {
    setForm(FORM_INICIAL);
    setEditando(false);
    setShowModal(true);
    setError(null);
    setExito(null);
  };

  const handleEditar = (notif: any) => {
    setForm({
      id: notif.id,
      titulo: notif.titulo,
      mensaje: notif.mensaje,
      tipo: notif.tipo,
      usuario_email: notif.usuario_email,
      activa: notif.activa,
    });
    setEditando(true);
    setError(null);
    setExito(null);
    setShowModal(true);
  };

  const handleGuardar = async () => {
    if (!form.titulo.trim()) {
      setError('Título requerido');
      return;
    }
    if (!form.mensaje.trim()) {
      setError('Mensaje requerido');
      return;
    }

    setGuardando(true);
    setError(null);

    try {
      if (editando && form.id) {
        // Al editar, se resetea el visto (es un mensaje nuevo para el usuario)
        const { error: err } = await supabase
          .from('notificaciones_admin')
          .update({
            titulo: form.titulo,
            mensaje: form.mensaje,
            tipo: form.tipo,
            usuario_email: form.usuario_email,
            activa: form.activa,
            visto: false,
            visto_en: null,
            actualizado_en: new Date().toISOString(),
          })
          .eq('id', form.id);

        if (err) throw err;
        setExito('✅ Actualizada');
      } else {
        const { error: err } = await supabase
          .from('notificaciones_admin')
          .insert([
            {
              titulo: form.titulo,
              mensaje: form.mensaje,
              tipo: form.tipo,
              usuario_email: form.usuario_email,
              activa: form.activa,
            },
          ]);

        if (err) throw err;
        setExito('✅ Creada');
      }

      setTimeout(() => {
        setShowModal(false);
        setForm(FORM_INICIAL);
        setExito(null);
      }, 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminar = async (id: string) => {
    setGuardando(true);
    try {
      const { error: err } = await supabase
        .from('notificaciones_admin')
        .delete()
        .eq('id', id);

      if (err) throw err;
      setExito('✅ Eliminada');
      setTimeout(() => {
        setNotifAEliminar(null);
        setExito(null);
      }, 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setGuardando(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    '--background': '#111111',
    '--color': TEXT,
    '--placeholder-color': TEXT_MUTED,
    '--padding-start': '14px',
    '--padding-end': '14px',
    border: `0.5px solid ${BORDER}`,
    borderRadius: 10,
    marginTop: 6,
  } as any;

  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color: TEXT_SEC,
    textTransform: 'uppercase', letterSpacing: '0.5px',
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': BG, '--color': TEXT, '--border-color': BORDER } as any}>
          <IonTitle style={{ fontWeight: 600 }}>Notificaciones</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': BG } as any}>
        <div style={{ padding: '20px 16px 40px' }}>
          {/* Header */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: TEXT }}>Centro de avisos</h1>
              <button
                onClick={handleNueva}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: ACCENT, border: 'none', borderRadius: 10,
                  padding: '10px 16px', color: '#fff', fontSize: 14,
                  fontWeight: 600, cursor: 'pointer',
                }}
              >
                <Plus size={17} />
                Nueva
              </button>
            </div>
            <div style={{ fontSize: 13, color: TEXT_MUTED, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3fa64c' }} />
              Destinatario: jcaballero@vain.cl
            </div>
          </div>

          {/* Lista */}
          {cargando ? (
            <div style={{ padding: '60px 0', textAlign: 'center', color: TEXT_MUTED }}>
              <IonSpinner style={{ '--color': ACCENT } as any} />
              <div style={{ marginTop: 12, fontSize: 13 }}>Cargando...</div>
            </div>
          ) : notificaciones.length === 0 ? (
            <div style={{
              padding: '48px 24px', textAlign: 'center', color: TEXT_MUTED,
              background: CARD_BG, borderRadius: 16, border: `0.5px solid ${BORDER}`,
            }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
              <div style={{ fontSize: 14 }}>No hay notificaciones creadas</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {notificaciones.map((notif) => {
                const cfg = CONFIG[notif.tipo] || CONFIG.info;
                const Icon = cfg.Icon;
                return (
                  <div
                    key={notif.id}
                    style={{
                      background: CARD_BG,
                      borderRadius: 16,
                      border: `0.5px solid ${BORDER}`,
                      borderLeft: `3px solid ${cfg.color}`,
                      overflow: 'hidden',
                      opacity: notif.activa ? 1 : 0.55,
                    }}
                  >
                    <div style={{ padding: '16px 18px' }}>
                      {/* Fila superior: ícono + título + estado */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
                        <div style={{
                          width: 38, height: 38, borderRadius: 11, flexShrink: 0,
                          background: cfg.bg, border: `0.5px solid ${cfg.border}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Icon size={19} color={cfg.color} strokeWidth={2} />
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 600, color: TEXT, marginBottom: 3 }}>
                            {notif.titulo}
                          </div>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{
                              fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                              letterSpacing: '0.5px', padding: '2px 8px', borderRadius: 6,
                              background: cfg.bg, color: cfg.color,
                            }}>
                              {cfg.label}
                            </span>
                            <span style={{
                              fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                              letterSpacing: '0.5px', padding: '2px 8px', borderRadius: 6,
                              background: notif.activa ? 'rgba(63,166,76,0.12)' : 'rgba(117,121,127,0.12)',
                              color: notif.activa ? '#3fa64c' : TEXT_MUTED,
                            }}>
                              {notif.activa ? 'Activo' : 'Inactivo'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Mensaje */}
                      <p style={{ margin: '0 0 12px 0', fontSize: 13, lineHeight: 1.5, color: TEXT_SEC }}>
                        {notif.mensaje}
                      </p>

                      {/* Estado de lectura */}
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 12px', borderRadius: 10, marginBottom: 12,
                        background: notif.visto ? 'rgba(63,166,76,0.08)' : 'rgba(251,191,36,0.08)',
                        border: `0.5px solid ${notif.visto ? 'rgba(63,166,76,0.2)' : 'rgba(251,191,36,0.2)'}`,
                      }}>
                        {notif.visto ? (
                          <>
                            <Eye size={15} color="#3fa64c" />
                            <span style={{ fontSize: 12, color: '#3fa64c', fontWeight: 500 }}>
                              Visto
                              {notif.visto_en && (
                                <span style={{ color: TEXT_MUTED, fontWeight: 400 }}>
                                  {' · '}
                                  {new Date(notif.visto_en).toLocaleString('es-CL', {
                                    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                                  })}
                                </span>
                              )}
                            </span>
                          </>
                        ) : (
                          <>
                            <EyeOff size={15} color="#fbbf24" />
                            <span style={{ fontSize: 12, color: '#fbbf24', fontWeight: 500 }}>
                              Aún no visto
                            </span>
                          </>
                        )}
                      </div>

                      {/* Acciones */}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => handleEditar(notif)}
                          style={{
                            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            background: 'transparent', border: `0.5px solid ${BORDER}`,
                            borderRadius: 10, padding: '9px 0', color: TEXT_SEC,
                            fontSize: 13, fontWeight: 500, cursor: 'pointer',
                          }}
                        >
                          <Pencil size={14} />
                          Editar
                        </button>
                        <button
                          onClick={() => setNotifAEliminar(notif.id)}
                          style={{
                            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            background: 'transparent', border: `0.5px solid rgba(248,113,113,0.3)`,
                            borderRadius: 10, padding: '9px 0', color: '#f87171',
                            fontSize: 13, fontWeight: 500, cursor: 'pointer',
                          }}
                        >
                          <Trash2 size={14} />
                          Eliminar
                        </button>
                      </div>

                      {/* Fecha creación */}
                      <div style={{ fontSize: 10, color: '#4a4d52', marginTop: 10, textAlign: 'right' }}>
                        Creada {new Date(notif.creado_en).toLocaleDateString('es-CL')}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal crear/editar */}
        <IonModal
          isOpen={showModal}
          onDidDismiss={() => setShowModal(false)}
          style={{ '--background': BG } as any}
        >
          <IonHeader>
            <IonToolbar style={{ '--background': BG, '--color': TEXT, '--border-color': BORDER } as any}>
              <IonTitle>{editando ? 'Editar aviso' : 'Nuevo aviso'}</IonTitle>
              <button
                slot="end"
                onClick={() => setShowModal(false)}
                style={{
                  background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: 8,
                  width: 32, height: 32, marginRight: 12, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X size={16} color={TEXT_MUTED} />
              </button>
            </IonToolbar>
          </IonHeader>
          <IonContent style={{ '--background': BG } as any}>
            <div style={{ padding: '20px 16px 40px' }}>
              {error && (
                <div style={{
                  padding: '12px 14px', borderRadius: 10, marginBottom: 16,
                  background: 'rgba(248,113,113,0.1)', border: '0.5px solid rgba(248,113,113,0.3)',
                  color: '#f87171', fontSize: 13,
                }}>
                  {error}
                </div>
              )}
              {exito && (
                <div style={{
                  padding: '12px 14px', borderRadius: 10, marginBottom: 16,
                  background: 'rgba(63,166,76,0.1)', border: '0.5px solid rgba(63,166,76,0.3)',
                  color: '#3fa64c', fontSize: 13,
                }}>
                  {exito}
                </div>
              )}

              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>Título</label>
                <IonInput
                  placeholder="Ej: Sistema en mantenimiento"
                  value={form.titulo}
                  onIonInput={(e) => setForm({ ...form, titulo: e.detail.value || '' })}
                  disabled={guardando}
                  style={inputStyle}
                />
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>Mensaje</label>
                <IonTextarea
                  placeholder="Mensaje detallado..."
                  value={form.mensaje}
                  onIonInput={(e) => setForm({ ...form, mensaje: e.detail.value || '' })}
                  rows={4}
                  disabled={guardando}
                  style={inputStyle}
                />
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>Tipo</label>
                <IonSelect
                  value={form.tipo}
                  onIonChange={(e) => setForm({ ...form, tipo: e.detail.value })}
                  disabled={guardando}
                  interface="action-sheet"
                  style={inputStyle}
                >
                  <IonSelectOption value="info">ℹ️ Info</IonSelectOption>
                  <IonSelectOption value="success">✅ Éxito</IonSelectOption>
                  <IonSelectOption value="warning">⚠️ Advertencia</IonSelectOption>
                  <IonSelectOption value="error">❌ Error</IonSelectOption>
                </IonSelect>
              </div>

              <div style={{ marginBottom: 28 }}>
                <label style={labelStyle}>Estado</label>
                <IonSelect
                  value={form.activa ? 'si' : 'no'}
                  onIonChange={(e) => setForm({ ...form, activa: e.detail.value === 'si' })}
                  disabled={guardando}
                  interface="action-sheet"
                  style={inputStyle}
                >
                  <IonSelectOption value="si">Activo (se muestra)</IonSelectOption>
                  <IonSelectOption value="no">Inactivo (oculto)</IonSelectOption>
                </IonSelect>
              </div>

              <button
                onClick={handleGuardar}
                disabled={guardando}
                style={{
                  width: '100%', height: 50, borderRadius: 12,
                  background: ACCENT, border: 'none', color: '#fff',
                  fontSize: 15, fontWeight: 600, cursor: guardando ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  opacity: guardando ? 0.7 : 1, marginBottom: 10,
                }}
              >
                {guardando ? <IonSpinner style={{ '--color': '#fff', width: 20, height: 20 } as any} /> : <><Save size={18} /> Guardar</>}
              </button>
              <button
                onClick={() => setShowModal(false)}
                disabled={guardando}
                style={{
                  width: '100%', height: 46, borderRadius: 12,
                  background: 'transparent', border: `0.5px solid ${BORDER}`,
                  color: TEXT_SEC, fontSize: 14, fontWeight: 500, cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
            </div>
          </IonContent>
        </IonModal>

        <IonAlert
          isOpen={notifAEliminar !== null}
          onDidDismiss={() => setNotifAEliminar(null)}
          header="Eliminar notificación"
          message="Esta acción no se puede deshacer."
          buttons={[
            { text: 'Cancelar', role: 'cancel' },
            {
              text: 'Eliminar',
              role: 'destructive',
              handler: () => {
                if (notifAEliminar) {
                  handleEliminar(notifAEliminar);
                }
              },
            },
          ]}
        />
      </IonContent>
    </IonPage>
  );
};

export default AdminNotificaciones;