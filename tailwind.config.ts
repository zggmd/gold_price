import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx,js,jsx,mdx}'],
  theme: {
    extend: {
      colors: {
        gold: {
          50: '#fbf7ee',
          100: '#f6ecd0',
          200: '#ecd79c',
          300: '#e2bf63',
          400: '#d9a73c',
          500: '#c68f23',
          600: '#a87019',
          700: '#855318',
          800: '#6e4319',
          900: '#5e391a',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};

export default config;
