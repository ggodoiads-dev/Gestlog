import type { Config } from 'tailwindcss';

/**
 * Preset Tailwind compartilhado pelo web admin e pelo driver app.
 * Mapeia os tokens de `src/tokens.css` para classes utilitárias.
 */
const preset: Omit<Config, 'content'> = {
  theme: {
    extend: {
      colors: {
        navy: {
          950: 'var(--color-navy-950)',
          900: 'var(--color-navy-900)',
          800: 'var(--color-navy-800)',
          700: 'var(--color-navy-700)',
        },
        ink: {
          900: 'var(--color-ink-900)',
          700: 'var(--color-ink-700)',
          500: 'var(--color-ink-500)',
        },
        surface: {
          0: 'var(--color-surface-0)',
          50: 'var(--color-surface-50)',
          100: 'var(--color-surface-100)',
          200: 'var(--color-surface-200)',
          page: 'var(--surface-page)',
          card: 'var(--surface-card)',
          raised: 'var(--surface-raised)',
        },
        accent: {
          700: 'var(--color-accent-700)',
          600: 'var(--color-accent-600)',
          500: 'var(--color-accent-500)',
          300: 'var(--color-accent-300)',
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
        },
        success: { 600: 'var(--color-success-600)' },
        warning: { 600: 'var(--color-warning-600)' },
        danger: { 600: 'var(--color-danger-600)' },
        info: { 600: 'var(--color-info-600)' },
      },
      borderRadius: {
        control: 'var(--radius-control)',
        card: 'var(--radius-card)',
        modal: 'var(--radius-modal)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
    },
  },
  plugins: [],
};

export default preset;
