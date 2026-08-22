import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-neutral-950 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 dark:focus-visible:ring-neutral-300",
  {
    variants: {
      variant: {
        default:
          "bg-neutral-900 text-neutral-50 shadow-sm hover:bg-neutral-900/80 dark:bg-neutral-50 dark:text-neutral-900 dark:hover:bg-neutral-50/80",
        destructive:
          "bg-red-500 text-neutral-50 shadow-xs hover:bg-red-500/90 dark:bg-red-900 dark:text-neutral-50 dark:hover:bg-red-900/90",
        outline:
          "border border-neutral-200 bg-white shadow-xs hover:bg-neutral-100 hover:text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:bg-neutral-800 dark:hover:text-neutral-50",
        secondary:
          "bg-neutral-100 text-neutral-900 shadow-xs hover:bg-neutral-100/80 dark:bg-neutral-800 dark:text-neutral-50 dark:hover:bg-neutral-800/80",
        ghost:
          "hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-50",
        link: "text-neutral-900 underline-offset-4 hover:underline dark:text-neutral-50",
        custom: "",
        // ─── Insturix dashboard brand variants (gold-only accent system) ───
        // Primary action. Gold is the single brand accent (teal dropped 2026-06-27);
        // fill/hover/contrast come from the design tokens so a theme change propagates.
        gold: "bg-gold text-gold-contrast font-semibold hover:bg-gold-hover focus-visible:ring-gold/70",
        // Positive/approve/done. Green (Editron --ef-green) — reads as "approved", not teal.
        success: "bg-[#5EC97E] text-[#08130c] font-semibold hover:bg-[#74D28E] focus-visible:ring-[#5EC97E]/70",
        // Destructive. Outline coral (matches existing delete/reject pattern).
        danger: "border border-[#D46A5C]/50 bg-transparent text-[#E7A79D] hover:bg-[#D46A5C]/12 focus-visible:ring-[#D46A5C]/70",
        // Secondary/neutral dashboard action on the warm-dark surface.
        neutral: "border border-[#1C1B19] bg-[#12110F] text-[#ECE9E1] hover:bg-[#1C1B19]/70 focus-visible:ring-[#D4A652]/40",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-[11px]",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
        player: "h-12 w-12 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? "span" : "button";
    return (
      <Comp
        className={cn(buttonVariants({ className, variant, size,  }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
