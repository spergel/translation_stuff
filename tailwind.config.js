/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f8f5f0',
          100: '#8D6E63',
          200: '#6D4C41',
          300: '#5D4037',
          400: '#4E342E',
        }
      }
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
} 