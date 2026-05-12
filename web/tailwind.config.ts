import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      colors: {
        primary: {
          DEFAULT: '#007aff',
          hover:   '#0a6fda',
          active:  '#0058b8',
        },
      },
    },
  },
  plugins: [],
};

export default config;
