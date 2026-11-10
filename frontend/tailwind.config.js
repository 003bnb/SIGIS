/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./*.html', './app.js'],
  theme: {
    extend: {
      colors: {
        sigis: {
          navy: '#153a62',
          blue: '#1769aa',
          background: '#f4f7fb'
        }
      }
    },
  },
  plugins: [],
};
