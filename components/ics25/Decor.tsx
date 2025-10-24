import { cn } from "@/lib/utils";

export function Sticker({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "select-none rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-white shadow-[0_4px_20px_rgba(58,158,255,0.25)] backdrop-blur-sm",
        "rotate-[-6deg] inline-flex items-center gap-2",
        className
      )}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#3A9EFF]" />
      <span>{text}</span>
    </div>
  );
}

export function Ribbon({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-white/10 bg-gradient-to-r from-[#3A9EFF]/30 to-[#FF2EE6]/30 px-4 py-1.5 text-xs text-white backdrop-blur",
        className
      )}
    >
      {children}
    </div>
  );
}
