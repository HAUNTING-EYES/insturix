import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/* ═══ Insturix primitives · Btn ═══════════════════════════════════════
   Thin wrapper over the shadcn Button (single source of truth for the
   gold/success/danger/neutral brand variants). Maps the design vocabulary
   (primary/ghost/danger/approve × sm/md/lg) onto it and applies the
   design-system button radius. */

type BtnVariant = 'primary' | 'ghost' | 'danger' | 'approve';
type BtnSize = 'sm' | 'md' | 'lg';

const VARIANT: Record<BtnVariant, NonNullable<ButtonProps['variant']>> = {
  primary: 'gold',
  ghost: 'neutral',
  danger: 'danger',
  approve: 'success',
};
const SIZE: Record<BtnSize, NonNullable<ButtonProps['size']>> = {
  sm: 'sm',
  md: 'default',
  lg: 'lg',
};

export function Btn({
  variant = 'ghost',
  size = 'md',
  className,
  children,
  ...props
}: {
  variant?: BtnVariant;
  size?: BtnSize;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>) {
  return (
    <Button variant={VARIANT[variant]} size={SIZE[size]} className={cn('rounded-button font-sans font-bold', className)} {...props}>
      {children}
    </Button>
  );
}
