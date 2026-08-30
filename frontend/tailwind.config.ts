import type { Config } from 'tailwindcss'

export default {
  // O CSS legado não é fonte de classes utilitárias. Incluí-lo aqui faria o
  // detector do Tailwind emitir classes de layout que a SPA não utiliza.
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  corePlugins: {
    // A SPA já possui estilos globais e HTML acessível. Preflight alteraria
    // controles e margens existentes, portanto Tailwind atua só como compilador.
    preflight: false,
  },
  theme: {
    extend: {
      borderRadius: {
        'rodo-card': 'var(--visual-radius-card)',
        'rodo-control': 'var(--visual-radius-control)',
      },
      boxShadow: {
        'rodo-card': 'var(--shadow-card)',
        'rodo-raised': 'var(--shadow-md)',
      },
      colors: {
        rodo: {
          canvas: 'var(--page-bg)',
          surface: 'var(--surface)',
          'surface-muted': 'var(--surface-muted)',
          'surface-subtle': 'var(--surface-subtle)',
          border: 'var(--border)',
          'border-strong': 'var(--border-strong)',
          text: 'var(--text)',
          heading: 'var(--text-h)',
          muted: 'var(--muted)',
          primary: 'var(--primary)',
          'primary-soft': 'var(--primary-soft)',
          focus: 'var(--focus)',
        },
      },
    },
  },
  plugins: [],
} satisfies Config
