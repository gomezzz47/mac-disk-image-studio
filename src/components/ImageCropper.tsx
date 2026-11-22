import { useEffect, useRef, useState } from "react";
import { Crosshair, ImagePlus, RotateCcw, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useI18n } from "@/lib/i18n";
import type { Crop } from "@/lib/vault/types";

export const IMAGE_SIZE = 1080;
const MAX_SRC = 2400; // originals bigger than this are scaled down once, keeping proportions
const VIEW = 288;
const START: Crop = { zoom: 1, rot: 0, x: 0, y: 0 };
export type CropResult = { image: string; src: string; crop: Crop };

function draw(ctx: CanvasRenderingContext2D, img: HTMLImageElement, size: number, t: Crop) {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.clearRect(0, 0, size, size);
  const turned = t.rot % 180 !== 0;
  const w = turned ? img.height : img.width, h = turned ? img.width : img.height;
  const s = (size / Math.min(w, h)) * t.zoom; // same scale on both axes: never stretched
  ctx.save();
  ctx.translate(size / 2 + t.x * size, size / 2 + t.y * size);
  ctx.rotate((t.rot * Math.PI) / 180);
  ctx.scale(s, s);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  ctx.restore();
}

/** Keeps the photo covering the whole square (no empty edges). */
export function clampCrop(t: Crop, w0: number, h0: number): Crop {
  const turned = t.rot % 180 !== 0;
  const w = turned ? h0 : w0, h = turned ? w0 : h0;
  const k = t.zoom / Math.min(w, h);
  const mx = (w * k - 1) / 2, my = (h * k - 1) / 2;
  return { ...t, x: Math.max(-mx, Math.min(mx, t.x)), y: Math.max(-my, Math.min(my, t.y)) };
}

const loadImg = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

async function prepareOriginal(dataUrl: string): Promise<string> {
  const img = await loadImg(dataUrl);
  const m = Math.max(img.width, img.height);
  if (m <= MAX_SRC) return dataUrl;
  const k = MAX_SRC / m;
  const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  const x = c.getContext("2d")!; x.imageSmoothingQuality = "high"; x.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.95);
}

export function pickImageFile(): Promise<string | null> {
  return new Promise((res) => {
    const i = document.createElement("input"); i.type = "file"; i.accept = "image/*";
    i.onchange = () => { const f = i.files?.[0]; if (!f) return res(null); const r = new FileReader(); r.onload = async () => res(await prepareOriginal(r.result as string)); r.readAsDataURL(f); };
    i.click();
  });
}

export function ImageCropper({ src: initial, crop, onCancel, onDone }: { src: string; crop?: Crop | undefined; onCancel: () => void; onDone: (r: CropResult) => void }) {
  const { t: tr } = useI18n();
  const [src, setSrc] = useState(initial);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [t, setRaw] = useState<Crop>(crop ?? START);
  const canvas = useRef<HTMLCanvasElement>(null);
  const first = useRef(true);
  const setT = (n: Crop) => setRaw(img ? clampCrop(n, img.width, img.height) : n);
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  useEffect(() => { loadImg(src).then((i) => { setImg(i); if (!first.current || !crop) setRaw(START); first.current = false; }); }, [src]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const c = canvas.current; if (!c || !img) return;
    const px = Math.round(c.clientWidth * (window.devicePixelRatio || 1));
    if (c.width !== px) { c.width = px; c.height = px; }
    draw(c.getContext("2d")!, img, c.width, t);
  }, [img, t]);

  const replace = async () => { const s = await pickImageFile(); if (s) setSrc(s); };
  const done = () => {
    if (!img) return;
    const c = document.createElement("canvas"); c.width = c.height = IMAGE_SIZE;
    const x = c.getContext("2d")!;
    x.fillStyle = "#fff"; x.fillRect(0, 0, IMAGE_SIZE, IMAGE_SIZE);
    draw(x, img, IMAGE_SIZE, t);
    onDone({ image: c.toDataURL("image/jpeg", 0.95), src, crop: t });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl border bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-1 text-lg font-semibold">{tr("adjustImage")}</h2>
        <p className="mb-4 text-sm text-muted-foreground">{tr("dragHint")}</p>
        <div className="mx-auto overflow-hidden rounded-2xl border bg-muted" style={{ width: VIEW, maxWidth: "100%", aspectRatio: "1" }}>
          <canvas
            ref={canvas} aria-label={tr("preview")}
            className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { px: e.clientX, py: e.clientY, x: t.x, y: t.y }; }}
            onPointerMove={(e) => { const d = drag.current; if (!d) return; const w = e.currentTarget.clientWidth; setT({ ...t, x: d.x + (e.clientX - d.px) / w, y: d.y + (e.clientY - d.py) / w }); }}
            onPointerUp={() => (drag.current = null)}
            onWheel={(e) => setT({ ...t, zoom: Math.min(4, Math.max(1, t.zoom - e.deltaY / 500)) })}
          />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <ZoomOut className="h-4 w-4 text-muted-foreground" />
          <Slider aria-label={tr("zoom")} min={1} max={4} step={0.01} value={[t.zoom]} onValueChange={([z]) => setT({ ...t, zoom: z ?? 1 })} />
          <ZoomIn className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2">
          <Button variant="outline" size="icon" className="w-full" aria-label={tr("rotateLeft")} title={tr("rotateLeft")} onClick={() => setT({ ...t, rot: (t.rot + 270) % 360 })}><RotateCcw className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" className="w-full" aria-label={tr("rotateRight")} title={tr("rotateRight")} onClick={() => setT({ ...t, rot: (t.rot + 90) % 360 })}><RotateCw className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" className="w-full" aria-label={tr("center")} title={tr("center")} onClick={() => setT({ ...t, x: 0, y: 0 })}><Crosshair className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" className="w-full" aria-label={tr("replace")} title={tr("replace")} onClick={replace}><ImagePlus className="h-4 w-4" /></Button>
        </div>
        <div className="mt-4 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onCancel}>{tr("cancel")}</Button>
          <Button className="flex-1" onClick={done} disabled={!img}>{tr("useImage")}</Button>
        </div>
      </div>
    </div>
  );
}
