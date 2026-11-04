import type { LandingImage } from '@/components/landing/images'
import { cn } from '@/lib/utils'

/** The artwork once it's ready, and a labelled placeholder naming the file until then. */
export function ImageSlot({ image, className, priority = false }: { image: LandingImage; className?: string; priority?: boolean }) {
  if (image.ready) {
    return (
      <img
        src={`/landing/${image.file}`}
        width={image.width}
        height={image.height}
        alt={image.alt}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
        decoding="async"
        className={cn('h-auto w-full object-contain', className)}
      />
    )
  }
  return (
    <div
      role="img"
      aria-label={`Image placeholder: ${image.alt}`}
      style={{ aspectRatio: `${image.width} / ${image.height}` }}
      className={cn(
        'flex w-full flex-col items-center justify-center gap-1.5 rounded-3xl border-2 border-dashed border-amber-400 bg-amber-50 p-6 text-center text-amber-900 dark:border-amber-500/60 dark:bg-amber-950/30 dark:text-amber-200',
        className,
      )}
    >
      <span className="text-xs font-semibold tracking-wider uppercase">Image goes here</span>
      <code className="text-sm">public/landing/{image.file}</code>
      <span className="text-xs tabular-nums">
        {image.width} × {image.height}
      </span>
      <span className="mt-1 max-w-72 text-xs leading-relaxed text-amber-800/80 dark:text-amber-200/70">
        {image.brief}
      </span>
    </div>
  )
}
