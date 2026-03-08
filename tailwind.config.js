/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        serif: ['Playfair Display', 'serif'],
        display: ['Playfair Display', 'serif'],
        heading: ['Roboto', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
      },
      fontWeight: {
        normal: '400',
        medium: '500',
        semibold: '600',
      },
      letterSpacing: {
        tighter: '-0.02em',
        tight: '-0.015em',
        heading: '-0.01em',
        normal: '0',
      },
      lineHeight: {
        'ui': '1.45',
        'body': '1.6',
        'dense': '1.25',
      },
      colors: {
        'chart-label': 'var(--chart-label)',
        'chart-tooltip-foreground': 'var(--chart-tooltip-foreground)',
        'chart-tooltip-muted': 'var(--chart-tooltip-muted)',
        'chart-tooltip-background': 'var(--chart-tooltip-background)',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: 'hsl(var(--card))',
        'card-foreground': 'hsl(var(--card-foreground))',
        popover: 'hsl(var(--popover))',
        'popover-foreground': 'hsl(var(--popover-foreground))',
        primary: 'hsl(var(--primary))',
        'primary-foreground': 'hsl(var(--primary-foreground))',
        secondary: 'hsl(var(--secondary))',
        'secondary-foreground': 'hsl(var(--secondary-foreground))',
        muted: 'hsl(var(--muted))',
        'muted-foreground': 'hsl(var(--muted-foreground))',
        accent: 'hsl(var(--accent))',
        'accent-foreground': 'hsl(var(--accent-foreground))',
        destructive: 'hsl(var(--destructive))',
        'destructive-foreground': 'hsl(var(--destructive-foreground))',
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        /* iOS 26 / visionOS design tokens — base & glass */
        base: '#F5F7FA',
        'base-alt': '#F7F9FC',
        'glass-white': 'rgba(255, 255, 255, 0.65)',
        'glass-white/80': 'rgba(255, 255, 255, 0.8)',
        'glass-border': 'rgba(255, 255, 255, 0.4)',
        /* Muted system-style accents */
        'accent-blue': '#5E9FED',
        'accent-slate': '#475569',
        'accent-mint': '#5EC9B0',
        /* Positive / negative (muted) */
        'accent-positive': '#5EC9B0',
        'accent-negative': '#E07B7B',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        /* iOS / visionOS card & pill */
        'card': '24px',
        'card-xl': '28px',
        'card-2xl': '32px',
        'pill': '9999px',
      },
      boxShadow: {
        /* Floating, diffused, spatial — no hard shadows */
        'glass-sm':
          '0 2px 8px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
        'glass':
          '0 8px 32px rgba(0, 0, 0, 0.06), 0 2px 12px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.7)',
        'glass-lg':
          '0 16px 48px rgba(0, 0, 0, 0.08), 0 4px 16px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.8)',
        'glass-hover':
          '0 20px 56px rgba(0, 0, 0, 0.08), 0 8px 24px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.85)',
        'float':
          '0 24px 64px -12px rgba(0, 0, 0, 0.12), 0 12px 32px -8px rgba(0, 0, 0, 0.06)',
        'float-lg':
          '0 32px 80px -16px rgba(0, 0, 0, 0.14), 0 16px 40px -12px rgba(0, 0, 0, 0.08)',
      },
      backdropBlur: {
        'glass': '20px',
        'glass-xl': '24px',
        'glass-2xl': '32px',
      },
    },
  },
  plugins: [],
}
