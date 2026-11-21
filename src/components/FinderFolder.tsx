import { cn } from "@/lib/utils";

/** Finder-style folder icon; shows a custom picture or a collage of up to 4 account pictures on its front. */
export function FinderFolder({ images = [], image, className }: { images?: string[]; image?: string; className?: string }) {
  const pics = image ? [image] : images.slice(0, 4);
  return (
    <div className={cn("relative aspect-[64/50] w-10 shrink-0", className)}>
      <svg viewBox="0 0 64 50" className="absolute inset-0 h-full w-full drop-shadow-sm" aria-hidden>
        <path d="M4 6a4 4 0 0 1 4-4h14.5a4 4 0 0 1 3.2 1.6L29 8h27a4 4 0 0 1 4 4v4H4z" fill="var(--folder-back)" />
        <rect x="2" y="12" width="60" height="37" rx="5" fill="var(--folder-front)" />
        <rect x="2" y="12" width="60" height="3" rx="1.5" fill="white" opacity=".25" />
      </svg>
      {pics.length > 0 && (
        <div className={cn("absolute left-[22%] right-[22%] top-[34%] bottom-[10%] grid gap-[2px] overflow-hidden rounded-[4px]", pics.length > 1 && "grid-cols-2", pics.length > 2 && "grid-rows-2")}>
          {pics.map((p, i) => <img key={i} src={p} alt="" className={cn("h-full w-full object-cover", pics.length === 3 && i === 0 && "row-span-2")} />)}
        </div>
      )}
    </div>
  );
}
