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
