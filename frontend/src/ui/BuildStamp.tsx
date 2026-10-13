type BuildStampProps = {
  timestamp?: string | null
}

export function BuildStamp({ timestamp = import.meta.env.VITE_BUILD_TIMESTAMP }: BuildStampProps) {
  if (!timestamp) {
    return <span className="application-footer__build">Build de desenvolvimento</span>
  }

  const formatted = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(timestamp))

  return (
    <span className="application-footer__build">
      Build{' '}
      <time dateTime={timestamp} title="Compilação da versão carregada · horário de Brasília">
        {formatted}
      </time>{' '}
      (Brasília)
    </span>
  )
}
