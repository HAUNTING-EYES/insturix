import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      screens: {
        'xs': '475px',
        'mobile': { 'max': '640px' },
        'tablet': { 'min': '641px', 'max': '1024px' },
      },
      spacing: {
        'mobile': '1rem',
        'tablet': '1.5rem',
        'desktop': '2rem',
      },
      fontSize: {
        'mobile-xs': ['0.75rem', { lineHeight: '1.4' }],
        'mobile-sm': ['0.875rem', { lineHeight: '1.5' }],
        'mobile-base': ['1rem', { lineHeight: '1.5' }],
        'mobile-lg': ['1.125rem', { lineHeight: '1.4' }],
        'mobile-xl': ['1.25rem', { lineHeight: '1.3' }],
      },
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
        'mobile-bounce': {
          '0%, 100%': { 
            transform: 'translateY(0)',
            animationTimingFunction: 'cubic-bezier(0.8, 0, 1, 1)'
          },
          '50%': { 
            transform: 'translateY(-2px)',
            animationTimingFunction: 'cubic-bezier(0, 0, 0.2, 1)'
          },
        },
        'fade-in-up': {
          '0%': {
            opacity: '0',
            transform: 'translateY(10px)'
          },
          '100%': {
            opacity: '1',
            transform: 'translateY(0)'
          },
        },
      },
      animation: {
        progress: "progress 2s ease-in-out infinite",
        shine: "shine 1s linear infinite",
        'mobile-bounce': 'mobile-bounce 0.3s ease-in-out',
        'fade-in-up': 'fade-in-up 0.5s ease-out',
      },
    },
  },
  plugins: [
    require('@tailwindcss/line-clamp'),
  ],
};

export default config;