import { cn } from '@/lib/utils';

/* ═══ Insturix primitives · Portrait ═════════════════════════════════
   Avatar/person thumbnail. Real image when a url is present, else a
   stylised silhouette + gold initials. Fixed size steps keep classes
   static (Tailwind-purge safe). */

const SIZE = {
  sm: { box: 'h-[52px] w-[52px] rounded-[10px]', text: 'text-[13px]', svg: 52 },
  md: { box: 'h-14 w-14 rounded-[10px]', text: 'text-[13px]', svg: 56 },
  lg: { box: 'h-[120px] w-[120px] rounded-[14px]', text: 'text-[22px]', svg: 120 },
} as const;

export type PortraitSize = keyof typeof SIZE;

const initialsOf = (name: string) =>
  name ? name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() : '?';

export function Portrait({ name, size = 'md', url }: { name: string; size?: PortraitSize; url?: string | null }) {
  const s = SIZE[size];
  return (
    <div className={cn('relative flex shrink-0 items-center justify-center overflow-hidden border border-ds-emphasis bg-surface-well', s.box)}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} className="h-full w-full object-cover" />
      ) : (
        <>
          <svg width={s.svg} height={s.svg} viewBox="0 0 56 56" className="absolute text-ds-faint opacity-50">
            <circle cx="28" cy="21" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M12 48 C12 37 20 33 28 33 C36 33 44 37 44 48" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <span className={cn('relative font-mono font-bold tracking-[0.04em] text-gold', s.text)}>{initialsOf(name)}</span>
        </>
      )}
    </div>
  );
}
