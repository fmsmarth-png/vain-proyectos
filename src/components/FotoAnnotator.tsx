// FotoAnnotator.tsx — FMS
// Renderiza como div fullscreen (position:fixed) en vez de IonPage+IonModal,
// evitando que Ionic registre entradas en el historial del router.
// Fix pantalla negra: ResizeObserver espera dimensiones reales del contenedor.

import React, { useRef, useState, useCallback, useEffect } from "react";
import {
  IonButtons, IonButton, IonIcon,
} from "@ionic/react";
import {
  arrowUndoOutline, checkmarkOutline, closeOutline, trashOutline,
} from "ionicons/icons";

type Tool = "arrow" | "circle";
interface Point { x: number; y: number; }
interface Annotation { tool: Tool; color: string; start: Point; end: Point; }

const COLORS = ["#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#007AFF", "#FFFFFF"];
const DEFAULT_COLOR = "#FF3B30";

function drawArrow(ctx: CanvasRenderingContext2D, from: Point, to: Point, color: string, lw: number) {
  const headLength = lw * 5;
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineWidth = lw; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - headLength * Math.cos(angle - Math.PI / 6), to.y - headLength * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(to.x - headLength * Math.cos(angle + Math.PI / 6), to.y - headLength * Math.sin(angle + Math.PI / 6));
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawCircle(ctx: CanvasRenderingContext2D, from: Point, to: Point, color: string, lw: number) {
  const cx = (from.x + to.x) / 2, cy = (from.y + to.y) / 2;
  const rx = Math.abs(to.x - from.x) / 2, ry = Math.abs(to.y - from.y) / 2;
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.max(rx, 4), Math.max(ry, 4), 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function redrawAll(ctx: CanvasRenderingContext2D, image: HTMLImageElement, annotations: Annotation[], lw: number) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.drawImage(image, 0, 0, ctx.canvas.width, ctx.canvas.height);
  for (const ann of annotations) {
    if (ann.tool === "arrow") drawArrow(ctx, ann.start, ann.end, ann.color, lw);
    else drawCircle(ctx, ann.start, ann.end, ann.color, lw);
  }
}

interface FotoAnnotatorProps {
  imageSrc: string;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
}

const FotoAnnotator: React.FC<FotoAnnotatorProps> = ({ imageSrc, onConfirm, onCancel }) => {
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const containerRef   = useRef<HTMLDivElement>(null);
  const imageRef       = useRef<HTMLImageElement | null>(null);
  const annotationsRef = useRef<Annotation[]>([]);
  const activeRef      = useRef<Annotation | null>(null);
  const scaleRef       = useRef({ x: 1, y: 1 });
  const initializedRef = useRef(false);

  const [tool, setTool]                       = useState<Tool>("arrow");
  const [color, setColor]                     = useState(DEFAULT_COLOR);
  const [annotationCount, setAnnotationCount] = useState(0);
  const [ready, setReady]                     = useState(false);

  const lineWidthFor = (imgW: number) => Math.max(3, Math.round(imgW / 120));

  const initCanvas = useCallback((containerW: number, containerH: number) => {
    if (initializedRef.current) return;
    const img = imageRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas || containerW === 0 || containerH === 0) return;
    initializedRef.current = true;
    canvas.width  = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const scale = Math.min(containerW / img.naturalWidth, containerH / img.naturalHeight, 1);
    canvas.style.width  = `${img.naturalWidth  * scale}px`;
    canvas.style.height = `${img.naturalHeight * scale}px`;
    scaleRef.current = { x: scale, y: scale };
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    setReady(true);
  }, []);

  useEffect(() => {
    initializedRef.current = false;
    annotationsRef.current = [];
    setAnnotationCount(0);
    setReady(false);
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      const container = containerRef.current;
      if (container && container.clientHeight > 0) {
        initCanvas(container.clientWidth, container.clientHeight);
      }
    };
    img.src = imageSrc;
  }, [imageSrc, initCanvas]);

  // ResizeObserver: dispara cuando el contenedor tiene altura real
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (height > 0 && imageRef.current && !initializedRef.current) {
          initCanvas(width, height);
        }
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [initCanvas]);

  const toCanvas = useCallback((clientX: number, clientY: number): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: (clientX - rect.left) / scaleRef.current.x, y: (clientY - rect.top) / scaleRef.current.y };
  }, []);

  const getPoint = (e: React.MouseEvent | React.TouchEvent): Point =>
    "touches" in e
      ? toCanvas(e.touches[0].clientX, e.touches[0].clientY)
      : toCanvas((e as React.MouseEvent).clientX, (e as React.MouseEvent).clientY);

  const handleDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!ready) return;
    activeRef.current = { tool, color, start: getPoint(e), end: getPoint(e) };
  }, [tool, color, ready]);

  const handleMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!activeRef.current || !imageRef.current || !ready) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const lw = lineWidthFor(canvas.width);
    activeRef.current.end = getPoint(e);
    redrawAll(ctx, imageRef.current, annotationsRef.current, lw);
    const a = activeRef.current;
    if (a.tool === "arrow") drawArrow(ctx, a.start, a.end, a.color, lw);
    else drawCircle(ctx, a.start, a.end, a.color, lw);
  }, [ready]);

  const handleUp = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!activeRef.current) return;
    const ann = activeRef.current;
    activeRef.current = null;
    if (Math.hypot(ann.end.x - ann.start.x, ann.end.y - ann.start.y) < 8) return;
    annotationsRef.current = [...annotationsRef.current, ann];
    setAnnotationCount(annotationsRef.current.length);
  }, []);

  const handleUndo = useCallback(() => {
    if (!imageRef.current || annotationsRef.current.length === 0) return;
    annotationsRef.current = annotationsRef.current.slice(0, -1);
    setAnnotationCount(annotationsRef.current.length);
    const canvas = canvasRef.current!;
    redrawAll(canvas.getContext("2d")!, imageRef.current, annotationsRef.current, lineWidthFor(canvas.width));
  }, []);

  const handleClear = useCallback(() => {
    if (!imageRef.current) return;
    annotationsRef.current = [];
    setAnnotationCount(0);
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imageRef.current, 0, 0, canvas.width, canvas.height);
  }, []);

  const handleConfirm = useCallback(() => {
    canvasRef.current?.toBlob(blob => { if (blob) onConfirm(blob); }, "image/jpeg", 0.92);
  }, [onConfirm]);

  // ── Render: div fullscreen, sin IonPage ni IonModal ─────────────────────
  // position:fixed cubre toda la pantalla por encima de InspeccionDepto
  // sin tocar el historial de navegación de Ionic.
  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 9999,
      display: "flex",
      flexDirection: "column",
      background: "#000",
    }}>
      {/* Fila 1: acciones */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "#1c1c1e",
        borderBottom: "0.5px solid #2c2c2e",
        paddingLeft: 4,
        paddingRight: 4,
        paddingBottom: 0,
        paddingTop: "env(safe-area-inset-top)",
        flexShrink: 0,
      }}>
        <IonButtons slot="start">
          <IonButton onClick={onCancel} style={{ "--color": "#f9fafb" }}>
            <IonIcon slot="icon-only" icon={closeOutline} />
          </IonButton>
        </IonButtons>
        <span style={{ color: "#f9fafb", fontSize: 14, fontWeight: 600 }}>Anotar foto</span>
        <IonButtons slot="end">
          <IonButton disabled={annotationCount === 0} onClick={handleUndo} style={{ "--color": "#f9fafb" }}>
            <IonIcon slot="icon-only" icon={arrowUndoOutline} />
          </IonButton>
          <IonButton disabled={annotationCount === 0} onClick={handleClear} style={{ "--color": "#f9fafb" }}>
            <IonIcon slot="icon-only" icon={trashOutline} />
          </IonButton>
          <IonButton strong onClick={handleConfirm} style={{ "--color": "#2563eb" }}>
            <IonIcon slot="icon-only" icon={checkmarkOutline} />
          </IonButton>
        </IonButtons>
      </div>

      {/* Fila 2: herramientas + colores */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: "#1c1c1e",
        borderBottom: "0.5px solid #2c2c2e",
        padding: "8px 16px",
        flexShrink: 0,
      }}>
        <ToolButton label="Flecha" active={tool === "arrow"} color={color} onClick={() => setTool("arrow")}>
          <svg viewBox="0 0 24 24" width={18} height={18} fill="none">
            <line x1="4" y1="20" x2="18" y2="6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            <polyline points="10,6 18,6 18,14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        </ToolButton>

        <ToolButton label="Círculo" active={tool === "circle"} color={color} onClick={() => setTool("circle")}>
          <svg viewBox="0 0 24 24" width={18} height={18} fill="none">
            <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2.5" />
          </svg>
        </ToolButton>

        <div style={{ width: "0.5px", height: 32, background: "#3a3a3c", flexShrink: 0 }} />

        <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1 }}>
          {COLORS.map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              style={{
                width: color === c ? 30 : 24,
                height: color === c ? 30 : 24,
                borderRadius: "50%",
                background: c,
                border: color === c ? "2.5px solid #fff" : "1.5px solid rgba(255,255,255,0.25)",
                cursor: "pointer",
                padding: 0,
                transition: "all 0.15s ease",
                boxShadow: color === c ? "0 0 0 1.5px rgba(0,0,0,0.6)" : "none",
                flexShrink: 0,
              }}
            />
          ))}
        </div>
      </div>

      {/* Área canvas */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          touchAction: "none",
          background: "#111",
        }}
      >
        {!ready && (
          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Cargando foto...</span>
        )}
        <canvas
          ref={canvasRef}
          style={{ display: ready ? "block" : "none", touchAction: "none", userSelect: "none" }}
          onMouseDown={handleDown} onMouseMove={handleMove} onMouseUp={handleUp}
          onTouchStart={handleDown} onTouchMove={handleMove} onTouchEnd={handleUp}
        />
      </div>
    </div>
  );
};


interface ToolButtonProps {
  label: string; active: boolean; color: string;
  onClick: () => void; children: React.ReactNode;
}
const ToolButton: React.FC<ToolButtonProps> = ({ label, active, color, onClick, children }) => (
  <button
    onClick={onClick}
    style={{
      display: "flex", flexDirection: "row", alignItems: "center", gap: 6,
      padding: "6px 12px", borderRadius: 8,
      border: active ? `1.5px solid ${color}` : "1.5px solid rgba(255,255,255,0.12)",
      background: active ? `${color}22` : "rgba(255,255,255,0.04)",
      color: active ? color : "rgba(255,255,255,0.5)",
      cursor: "pointer", fontSize: 12, fontWeight: active ? 600 : 400,
      transition: "all 0.15s ease", flexShrink: 0,
    }}
  >
    {children}{label}
  </button>
);

export default FotoAnnotator;
