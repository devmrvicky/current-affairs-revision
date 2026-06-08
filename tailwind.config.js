/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        display: ['Sora', 'sans-serif'],
        body: ['DM Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b',
        },
        surface: {
          DEFAULT: '#ffffff',
          dark: '#0f0f13',
        },
        card: {
          DEFAULT: '#f8f9ff',
          dark: '#16161f',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in': 'slideIn 0.3s ease-out',
        'pop': 'pop 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'pulse-ring': 'pulseRing 1.5s ease-out infinite',
        'shimmer': 'shimmer 1.5s infinite',
        'bounce-in': 'bounceIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp: { from: { transform: 'translateY(16px)', opacity: 0 }, to: { transform: 'translateY(0)', opacity: 1 } },
        slideIn: { from: { transform: 'translateX(-16px)', opacity: 0 }, to: { transform: 'translateX(0)', opacity: 1 } },
        pop: { '0%': { transform: 'scale(0.95)' }, '60%': { transform: 'scale(1.03)' }, '100%': { transform: 'scale(1)' } },
        pulseRing: { '0%': { transform: 'scale(0.8)', opacity: 1 }, '100%': { transform: 'scale(2)', opacity: 0 } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        bounceIn: { '0%': { transform: 'scale(0)' }, '60%': { transform: 'scale(1.1)' }, '100%': { transform: 'scale(1)' } },
      },
      boxShadow: {
        'glow': '0 0 20px rgba(99, 102, 241, 0.3)',
        'glow-green': '0 0 20px rgba(34, 197, 94, 0.3)',
        'glow-red': '0 0 20px rgba(239, 68, 68, 0.3)',
        'card': '0 4px 24px rgba(0,0,0,0.06)',
        'card-dark': '0 4px 24px rgba(0,0,0,0.3)',
      },
    },
  },
  plugins: [],
};
