import type { Config } from 'tailwindcss';
import lineClamp from '@tailwindcss/line-clamp';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // ─── Insturix Design System v1.0 ───
      // These map CSS custom properties from design-tokens.css to Tailwind utility classes.
      // Usage: bg-surface-raised, text-ds-muted, border-ds-subtle, etc.
      // Prefixed with "surface-", "ds-", "status-", "category-" to avoid collisions with Tailwind defaults.

      colors: {
        // Surfaces
        surface: {
          canvas: 'var(--bg-canvas)',
          raised: 'var(--bg-raised)',
          deeper: 'var(--bg-deeper)',
          well: 'var(--bg-well)',
        },
        // Borders
        ds: {
          subtle: 'var(--border-subtle)',
          emphasis: 'var(--border-emphasis)',
          // Text
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          dim: 'var(--text-dim)',
          faint: 'var(--text-faint)',
        },
        // Accent
        gold: 'var(--accent-gold)',
        // Status
        status: {
          success: 'var(--status-success)',
          warning: 'var(--status-warning)',
          danger: 'var(--status-danger)',
        },
        // Category
        category: {
          purple: 'var(--category-purple)',
          pink: 'var(--category-pink)',
          cyan: 'var(--category-cyan)',
        },
        // Social (Legacy compat)
        social: {
          pink: '#D4A652',
          canvas: '#0B0B0A',
          raised: '#0F0F0E',
          well: '#1B1A18',
          line: '#1C1B19',
          muted: '#7A776E'
        }
      },
      fontFamily: {
        jakarta: ['var(--font-plus-jakarta-sans)'],
        jetbrains: ['var(--font-jetbrains-mono)'],
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      borderRadius: {
        tag: 'var(--radius-tag)',
        button: 'var(--radius-button)',
        card: 'var(--radius-card)',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      transitionDuration: {
        micro: 'var(--motion-micro)',
        response: 'var(--motion-response)',
        atmosphere: 'var(--motion-atmosphere)',
      },
      // Existing extensions preserved below
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
        'blink': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        "border-beam-spin": {
          "0%": { transform: "translate(-50%, -50%) rotate(0deg)" },
          "100%": { transform: "translate(-50%, -50%) rotate(360deg)" },
        },
      },

      animation: {
        progress: "progress 2s ease-in-out infinite",
        shine: "shine 1s linear infinite",
        'mobile-bounce': 'mobile-bounce 0.3s ease-in-out',
        'fade-in-up': 'fade-in-up 0.5s ease-out',
        'blink': 'blink 1s step-end infinite',
        "border-beam-spin": "border-beam-spin calc(var(--duration) * 1s) infinite linear",
      },
    },
  },
  plugins: [
    lineClamp,
  ],
};

export default config;
