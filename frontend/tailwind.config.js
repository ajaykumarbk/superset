/** @type {import('tailwindcss').Config} */
export default {
  // Tailwind scans TSX/TS files for class names
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'neon-cyan':    '#00f5ff',
        'neon-ruby':    '#ff005f',
        'neon-gold':    '#ffd700',
        'neon-emerald': '#00ff88',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
