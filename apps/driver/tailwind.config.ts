import type { Config } from 'tailwindcss';

import gestlogPreset from '@gestlog/ui/tailwind-preset';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  presets: [gestlogPreset],
  theme: {
    extend: {
      // Driver usa botões maiores e tipografia mais alta.
      fontSize: {
        base: ['1.0625rem', '1.5rem'],
      },
    },
  },
};

export default config;
