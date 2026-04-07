import * as React from 'react';
import { cn } from '@/lib/utils/cn';

export const ScrollArea = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn('overflow-y-auto rounded-xl border border-[var(--tg-border)]', className)}
      {...props}
    />
  );
});

ScrollArea.displayName = 'ScrollArea';

