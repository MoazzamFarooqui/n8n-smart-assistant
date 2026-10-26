/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0F0F0F",
        card: "#1B1B1B",
        card2: "#212121",
        primary: "#FF7A00",
        secondary: "#FF9F1C",
        accentLight: "#FFB347",
      },
    },
  },
  plugins: [],
};
