import type { HTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from './cn.ts';

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

/** A short line under a field: guidance by default, or an error. */
export function FieldHint({
  error,
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement> & { error?: boolean }) {
  return (
    <p
      className={cn('text-xs', error ? 'text-destructive' : 'text-muted-foreground', className)}
      {...props}
    />
  );
}
