import * as React from 'react';
import { cn } from '@/lib/utils/cn';

type BadgeVariant = 'default' | 'secondary' | 'destructive';

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-[var(--tg-subtle)] text-[var(--primary)] border border-[var(--tg-border-primary)]',
  secondary: 'bg-[var(--tg-bg-alt)] text-[var(--tg-muted)] border border-[var(--tg-border)]',
  destructive: 'bg-[rgba(239,68,68,0.12)] text-[#ef4444] border border-[rgba(239,68,68,0.35)]',
};

export function Badge({
  className,
  variant = 'default',
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold',
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}

