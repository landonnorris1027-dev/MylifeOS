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
      // The neutral palette points at src/styles/tokens.css instead of at
      // Tailwind's built-in hex values. This is what makes the 268 colour
      // utilities already written in JSX follow the theme: `bg-white` becomes
      // the card surface, `text-gray-900` the strongest ink, and both invert
      // under `.dark` without a single class name changing.
      //
      // Channel triplets plus `<alpha-value>` keep the opacity modifiers
      // working — `bg-white/95` and `bg-gray-50/50` are used in the app.
      //
      // `black` is deliberately not mapped. After this batch nothing uses it,
      // and leaving it literal means a future `bg-black/40` overlay stays a
      // black scrim in both themes, which is what an overlay wants. Use
      // `bg-[var(--scrim)]` when the darkness should follow the theme.
      colors: {
        white: 'rgb(var(--n-white) / <alpha-value>)',
        gray: {
          50: 'rgb(var(--n-gray-50) / <alpha-value>)',
          100: 'rgb(var(--n-gray-100) / <alpha-value>)',
          200: 'rgb(var(--n-gray-200) / <alpha-value>)',
          300: 'rgb(var(--n-gray-300) / <alpha-value>)',
          400: 'rgb(var(--n-gray-400) / <alpha-value>)',
          500: 'rgb(var(--n-gray-500) / <alpha-value>)',
          600: 'rgb(var(--n-gray-600) / <alpha-value>)',
          700: 'rgb(var(--n-gray-700) / <alpha-value>)',
          800: 'rgb(var(--n-gray-800) / <alpha-value>)',
          900: 'rgb(var(--n-gray-900) / <alpha-value>)',
        },
        slate: {
          100: 'rgb(var(--n-slate-100) / <alpha-value>)',
          700: 'rgb(var(--n-slate-700) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
};
