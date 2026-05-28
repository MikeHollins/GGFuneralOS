import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { dark: '#000000', DEFAULT: '#111111', light: '#2b2b2b' },
        gold: { DEFAULT: '#efb70c', light: '#ffc000', dark: '#d2a006' },
      },
    },
  },
  plugins: [],
};

export default config;
