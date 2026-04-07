import * as React from 'react';
import { cn } from '@/lib/utils/cn';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          'flex h-10 w-full rounded-xl border border-[var(--tg-border)] bg-[var(--tg-input-bg)] px-3 py-2 text-sm text-[var(--tg-text)] shadow-sm transition outline-none placeholder:text-[var(--tg-muted)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[rgba(37,151,233,0.15)] disabled:opacity-60',
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';

