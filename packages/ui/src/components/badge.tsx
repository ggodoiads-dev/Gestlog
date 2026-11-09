import type { ReactElement, ReactNode } from 'react';

import { cn } from '../utils/cn';

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent';

const toneClasses: Record<BadgeTone, string> = {
  neutral:
    'bg-surface-100 text-ink-700 dark:bg-navy-800 dark:text-white border border-surface-200 dark:border-navy-700',
  info: 'bg-info-600/10 text-info-600 border border-info-600/30',
  success: 'bg-success-600/10 text-success-600 border border-success-600/30',
  warning: 'bg-warning-600/10 text-warning-600 border border-warning-600/30',
  danger: 'bg-danger-600/10 text-danger-600 border border-danger-600/30',
  accent: 'bg-accent-600/10 text-accent-600 border border-accent-600/30',
};

export function Badge({
  tone = 'neutral',
  icon,
  children,
  className,
  title,
}: {
  tone?: BadgeTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  title?: string;
}): ReactElement {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        toneClasses[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
