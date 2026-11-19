import { useEffect, useRef, useState } from "react";
import { ImagePlus, RotateCcw, RotateCw, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

export const IMAGE_SIZE = 1080;
const VIEW = 288;

type T = { zoom: number; rot: number; x: number; y: number };

function draw(ctx: CanvasRenderingContext2D, img: HTMLImageElement, size: number, t: T) {
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#0b1020";
  ctx.fillRect(0, 0, size, size);
  const turned = t.rot % 180 !== 0;
  const w = turned ? img.height : img.width, h = turned ? img.width : img.height;
  const s = (size / Math.min(w, h)) * t.zoom;
  ctx.save();
  ctx.translate(size / 2 + t.x * size, size / 2 + t.y * size);
  ctx.rotate((t.rot * Math.PI) / 180);
  ctx.scale(s, s);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  ctx.restore();
}

/** Keeps the photo covering the whole square (no empty edges). */
function clampT(t: T, img: HTMLImageElement | null): T {
  if (!img) return t;
  const turned = t.rot % 180 !== 0;
  const w = turned ? img.height : img.width, h = turned ? img.width : img.height;
  const k = t.zoom / Math.min(w, h);
  const mx = (w * k - 1) / 2, my = (h * k - 1) / 2;
  return { ...t, x: Math.max(-mx, Math.min(mx, t.x)), y: Math.max(-my, Math.min(my, t.y)) };
}

export function pickImageFile(): Promise<string | null> {
  return new Promise((res) => {
    const i = document.createElement("input"); i.type = "file"; i.accept = "image/*";
    i.onchange = () => { const f = i.files?.[0]; if (!f) return res(null); const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(f); };
    i.click();
  });
}

export function ImageCropper({ src: initial, onCancel, onDone }: { src: string; onCancel: () => void; onDone: (dataUrl: string) => void }) {
  const [src, setSrc] = useState(initial);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [t, setRaw] = useState<T>({ zoom: 1, rot: 0, x: 0, y: 0 });
  const canvas = useRef<HTMLCanvasElement>(null);
  const setT = (n: T) => setRaw(clampT(n, img));
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  useEffect(() => { const i = new Image(); i.onload = () => { setImg(i); setRaw({ zoom: 1, rot: 0, x: 0, y: 0 }); }; i.src = src; }, [src]);
  useEffect(() => { const c = canvas.current; if (c && img) draw(c.getContext("2d")!, img, c.width, t); }, [img, t]);

  const replace = async () => { const s = await pickImageFile(); if (s) setSrc(s); };
  const done = () => {
    if (!img) return;
    const c = document.createElement("canvas"); c.width = c.height = IMAGE_SIZE;
    draw(c.getContext("2d")!, img, IMAGE_SIZE, t);
    onDone(c.toDataURL("image/jpeg", 0.9));
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-background/80 p-4 backdrop-blur" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl border bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-1 text-lg font-semibold">Ajustar imagen</h2>
        <p className="mb-4 text-sm text-muted-foreground">Arrastra para mover. Se guarda en cuadrado de 1080 × 1080.</p>
        <div className="mx-auto overflow-hidden rounded-2xl border" style={{ width: VIEW, maxWidth: "100%", aspectRatio: "1" }}>
          <canvas
            ref={canvas} width={VIEW * 2} height={VIEW * 2} aria-label="Vista previa de la imagen"
            className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { px: e.clientX, py: e.clientY, x: t.x, y: t.y }; }}
            onPointerMove={(e) => { const d = drag.current; if (!d) return; const w = e.currentTarget.clientWidth; setT({ ...t, x: d.x + (e.clientX - d.px) / w, y: d.y + (e.clientY - d.py) / w }); }}
            onPointerUp={() => (drag.current = null)}
            onWheel={(e) => setT({ ...t, zoom: Math.min(4, Math.max(1, t.zoom - e.deltaY / 500)) })}
          />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <ZoomOut className="h-4 w-4 text-muted-foreground" />
          <Slider aria-label="Ampliar" min={1} max={4} step={0.01} value={[t.zoom]} onValueChange={([z]) => setT({ ...t, zoom: z ?? 1 })} />
          <ZoomIn className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Button variant="outline" onClick={() => setT({ ...t, rot: (t.rot + 270) % 360 })}><RotateCcw className="h-4 w-4" />Girar</Button>
          <Button variant="outline" onClick={() => setT({ ...t, rot: (t.rot + 90) % 360 })}><RotateCw className="h-4 w-4" />Girar</Button>
          <Button variant="outline" onClick={replace}><ImagePlus className="h-4 w-4" />Cambiar</Button>
        </div>
        <div className="mt-4 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onCancel}>Cancelar</Button>
          <Button className="flex-1" onClick={done} disabled={!img}>Usar imagen</Button>
        </div>
      </div>
    </div>
  );
}

export function RemoveImageButton({ onClick }: { onClick: () => void }) {
  return <button onClick={onClick} className="text-xs text-muted-foreground hover:text-destructive"><Trash2 className="mr-1 inline h-3 w-3" />Quitar</button>;
}
