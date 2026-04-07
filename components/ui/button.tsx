import * as React from 'react';
import { cn } from '@/lib/utils/cn';

type ButtonVariant = 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive';
type ButtonSize = 'default' | 'sm' | 'icon';

const variantClasses: Record<ButtonVariant, string> = {
  default:
    'bg-[var(--primary)] text-white border border-[var(--primary)] hover:bg-[var(--primary-dark)]',
  secondary:
    'bg-[var(--tg-subtle)] text-[var(--tg-text)] border border-[var(--tg-border)] hover:bg-[var(--tg-bg-alt)]',
  outline:
    'bg-transparent text-[var(--tg-text)] border border-[var(--tg-border)] hover:bg-[var(--tg-subtle)]',
  ghost:
    'bg-transparent text-[var(--tg-muted)] border border-transparent hover:bg-[var(--tg-subtle)] hover:text-[var(--tg-text)]',
  destructive:
    'bg-[rgba(239,68,68,0.12)] text-[#ef4444] border border-[rgba(239,68,68,0.35)] hover:bg-[rgba(239,68,68,0.18)]',
};

const sizeClasses: Record<ButtonSize, string> = {
  default: 'h-10 px-4 py-2 text-sm',
  sm: 'h-8 px-3 py-1.5 text-xs',
  icon: 'h-10 w-10 p-0',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', type = 'button', ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';

