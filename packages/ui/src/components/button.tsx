import { forwardRef, type ButtonHTMLAttributes } from 'react';

import { cn } from '../utils/cn.js';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-accent text-white hover:bg-accent-hover focus-visible:outline-accent disabled:opacity-60',
  secondary:
    'bg-surface-card text-ink-900 border border-surface-200 hover:bg-surface-100 focus-visible:outline-accent disabled:opacity-60 dark:text-white dark:border-navy-700 dark:bg-navy-800 dark:hover:bg-navy-700',
  ghost:
    'bg-transparent text-ink-700 hover:bg-surface-100 focus-visible:outline-accent dark:text-white dark:hover:bg-navy-800',
  danger:
    'bg-danger-600 text-white hover:brightness-110 focus-visible:outline-danger-600 disabled:opacity-60',
};

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = 'primary', size = 'md', isLoading, disabled, children, ...rest },
    ref,
  ) => (
    <button
      ref={ref}
      disabled={disabled ?? isLoading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-control font-medium transition-colors',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...rest}
    >
      {isLoading ? <span className="inline-block h-4 w-4 animate-spin">⟳</span> : null}
      {children}
    </button>
  ),
);

Button.displayName = 'Button';
