/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        riftapp: {
          bg: '#111214',
          'bg-alt': '#15171a',
          chrome: '#1f2125',
          'chrome-hover': '#2a2d33',
          content: '#15171a',
          'content-elevated': '#1b1d22',
          surface: '#1a1c20',
          'surface-hover': '#23262b',
          panel: '#1f2125',
          'panel-hover': '#282b31',
          border: '#2c2f36',
          'border-light': '#3a3f48',
          accent: '#6366f1',
          'accent-hover': '#818cf8',
          'accent-dim': '#4f46e5',
          text: '#eceef2',
          'text-muted': '#b5bac1',
          'text-dim': '#808791',
          success: '#22c55e',
          danger: '#ef4444',
          warning: '#f59e0b',
          // Discord-style @mention row + pill (dark theme)
          'mention-highlight-bg': '#3d3425',
          'mention-highlight-hover': '#4a4032',
          'mention-highlight-border': '#faa61a',
          'mention-pill-bg': '#3e416d',
          'mention-pill-hover': '#4d5180',
          'mention-pill-text': '#dee0fc',
          /** Discord-style active speaker ring */
          'voice-speaking': '#43b581',
          'discord-blurple': '#5865f2',
        },
        marketing: {
          hero: '#5865f2',
          'hero-dark': '#3c45a5',
          light: '#f6f6fe',
          'light-accent': '#e8e6fd',
        },
      },
      fontFamily: {
        sans: ['"gg sans"', '"Noto Sans"', '"Helvetica Neue"', 'Helvetica', 'Arial', 'sans-serif'],
        display: ['"gg sans"', '"Noto Sans"', '"Helvetica Neue"', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      spacing: {
        '4.5': '1.125rem',
        '13': '3.25rem',
        '15': '3.75rem',
        '18': '4.5rem',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.25rem',
      },
      boxShadow: {
        'glow': '0 0 20px rgba(99, 102, 241, 0.15)',
        'glow-sm': '0 0 10px rgba(99, 102, 241, 0.1)',
        'elevation-low': '0 1px 3px rgba(0, 0, 0, 0.3)',
        'elevation-md': '0 4px 12px rgba(0, 0, 0, 0.4)',
        'elevation-high': '0 8px 32px rgba(0, 0, 0, 0.55)',
        'modal': '0 8px 48px rgba(0, 0, 0, 0.65)',
      },
      animation: {
        'fade-in': 'fadeIn 200ms ease-out',
        'fade-out': 'fadeOut 200ms ease-out forwards',
        'slide-up': 'slideUp 200ms ease-out',
        'slide-in-left': 'slideInLeft 150ms ease-out',
        'scale-in': 'scaleIn 150ms ease-out',
        'shake': 'shake 400ms ease-in-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'typing-dot': 'typingDot 1.4s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeOut: {
          '0%': { opacity: '1', transform: 'scale(1)' },
          '100%': { opacity: '0', transform: 'scale(0.95)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInLeft: {
          '0%': { opacity: '0', transform: 'translateX(-8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '15%, 45%, 75%': { transform: 'translateX(-4px)' },
          '30%, 60%, 90%': { transform: 'translateX(4px)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        typingDot: {
          '0%, 60%, 100%': { opacity: '0.3', transform: 'translateY(0)' },
          '30%': { opacity: '1', transform: 'translateY(-3px)' },
        },
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};
