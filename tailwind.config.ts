import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      keyframes: {
        progress: {
          "0%": { transform: "translateX(-100%)" },
          "50%": { transform: "translateX(0%)" },
          "100%": { transform: "translateX(100%)" }
        },
        shine: {
          '0%': { left: '-75%' },
          '100%': { left: '125%' },
        },
      },
      animation: {
        progress: "progress 2s ease-in-out infinite",
        shine: "shine 1s linear infinite",
      },
    },
  },
  plugins: [
    require('@tailwindcss/line-clamp'),
  ],
};

export default config;