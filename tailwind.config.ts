import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        trpg: {
          parchment: "#f5e6c8",
          dark: "#1a1209",
          gold: "#c9a227",
          ember: "#c0392b",
          forest: "#1e6b3c",
          shadow: "#2d2d2d",
        },
      },
      fontFamily: {
        fantasy: ["Georgia", "serif"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [],
};

export default config;
