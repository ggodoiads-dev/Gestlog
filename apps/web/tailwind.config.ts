import type { Config } from 'tailwindcss';

import gestlogPreset from '@gestlog/ui/tailwind-preset';

const config: Config = {
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  presets: [gestlogPreset],
};

export default config;
