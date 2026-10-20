import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from './cn.ts';

export const badgeVariants = cva(
  'inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'bg-muted text-muted-foreground',
        primary: 'bg-primary-soft text-primary',
        success: 'bg-success-soft text-success',
        warning: 'bg-warning-soft text-warning',
        danger: 'bg-destructive-soft text-destructive',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/** A full-width message block, for errors, warnings and confirmations. */
export function Notice({
  className,
  tone = 'neutral',
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: 'neutral' | 'success' | 'warning' | 'danger' }) {
  const tones = {
    neutral: 'bg-muted text-foreground',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-destructive-soft text-destructive',
  } as const;
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('rounded-md p-3 text-sm', tones[tone], className)}
      {...props}
    />
  );
}
