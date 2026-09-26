/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#dfe9ff",
          200: "#c5d6ff",
          300: "#a2baff",
          400: "#7c93fb",
          500: "#5b6cf4",
          600: "#4446e8",
          700: "#3837cd",
          800: "#3030a5",
          900: "#2d2f82",
          950: "#1b1b4d",
        },
      },
    },
  },
  plugins: [],
};
