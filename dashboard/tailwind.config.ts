import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { dark: '#1a1a2e', DEFAULT: '#16213e', light: '#0f3460' },
        gold: { DEFAULT: '#c9a96e', light: '#dfc59b', dark: '#a88a4e' },
      },
    },
  },
  plugins: [],
};

export default config;
