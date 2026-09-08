import { ThemeToggle } from '@/components/ui/curtain-theme-toggle'

// Exemplo isolado; não substitui demo.tsx da tabela nem cria uma rota pública.
export default function CurtainThemeToggleDemo() {
  return (
    <div className="flex min-h-[400px] w-full flex-col items-center justify-center gap-4">
      <p className="text-sm text-rodo-muted">Clique no botão para ver a troca de tema.</p>
      <div className="rounded-2xl border border-rodo-border bg-rodo-surface p-4 shadow-xl">
        <ThemeToggle variant="icon" defaultTheme="light" duration={600} />
      </div>
    </div>
  )
}
