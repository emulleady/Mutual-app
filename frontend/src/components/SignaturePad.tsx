import { useEffect, useRef, useState } from "react";

// Cuadro para firmar con lapiz o dedo (tablet). Devuelve la firma como PNG (data URL).
export default function SignaturePad({
  title,
  onConfirm,
  onCancel,
}: {
  title: string;
  onConfirm: (dataUrl: string, name: string, dni: string) => Promise<void> | void;
  onCancel: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);
  const [name, setName] = useState("");
  const [dni, setDni] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111";
  }, []);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    canvasRef.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.arc(last.current.x, last.current.y, 1.1, 0, Math.PI * 2);
    ctx.fillStyle = "#111";
    ctx.fill();
    setEmpty(false);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !last.current) return;
    e.preventDefault();
    const p = point(e);
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  }

  function up() {
    drawing.current = false;
    last.current = null;
  }

  function clear() {
    const canvas = canvasRef.current!;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setEmpty(true);
  }

  async function confirm() {
    if (empty) return;
    if (name.trim().length < 3 || dni.trim().length < 5) {
      setError("Escribí la aclaración (nombre y apellido) y el DNI o documento.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onConfirm(canvasRef.current!.toDataURL("image/png"), name.trim(), dni.trim());
    } catch (e: any) {
      setError(e.message || "No se pudo guardar la firma");
      setSaving(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 10, padding: 16, width: "min(720px, 100%)", color: "#111" }}>
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        <div style={{ border: "2px dashed #7a8ca0", borderRadius: 8, background: "#fff", position: "relative" }}>
          <canvas
            ref={canvasRef}
            style={{ width: "100%", height: 260, display: "block", touchAction: "none", cursor: "crosshair" }}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onPointerLeave={up}
          />
          {empty && (
            <span style={{ position: "absolute", left: 0, right: 0, top: "45%", textAlign: "center", color: "#9aa7b4", pointerEvents: "none" }}>
              Firmar acá
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
          <label style={{ display: "flex", flexDirection: "column", fontSize: 13, gap: 2, flex: "2 1 260px" }}>
            Aclaración (nombre y apellido)
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" style={{ fontSize: 16 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", fontSize: 13, gap: 2, flex: "1 1 160px" }}>
            DNI o documento
            <input value={dni} onChange={(e) => setDni(e.target.value)} autoComplete="off" style={{ fontSize: 16 }} />
          </label>
        </div>
        {error && <div className="error-box">{error}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12, flexWrap: "wrap" }}>
          <button type="button" className="small-button" onClick={onCancel} disabled={saving}>Cancelar</button>
          <button type="button" className="small-button" onClick={clear} disabled={saving || empty}>Borrar</button>
          <button type="button" onClick={confirm} disabled={saving || empty}>{saving ? "Guardando..." : "Confirmar firma"}</button>
        </div>
      </div>
    </div>
  );
}
