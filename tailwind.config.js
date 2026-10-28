/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
    './public/index.html',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
      },
      // Mapped onto the radius scale in src/styles/tokens.css. The step names
      // do not line up one-to-one with Tailwind's, and that is deliberate: each
      // class keeps the pixel value it already rendered, so the utility classes
      // in JSX stay visually unchanged while gaining a single source of truth.
      // `rounded-sm` (2px) and `rounded-md` (6px) were the only two off-scale
      // values; they now land on 4 and 8.
      borderRadius: {
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-md)',
        xl: 'var(--radius-lg)',
        '2xl': 'var(--radius-xl)',
        '3xl': 'var(--radius-2xl)',
        full: 'var(--radius-pill)',
      },
      colors: {
        notion: {
          bg: '#F7F7F5',
          card: '#FFFFFF',
          text: '#37352F',
          gray: '#9B9A97',
        },
      },
    },
  },
  plugins: [],
};
