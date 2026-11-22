type BrandLogoProps = {
  className?: string
}

export function BrandLogo({ className }: BrandLogoProps) {
  return (
    <img
      alt="Rodogarcia"
      className={className ?? 'brand-logo'}
      src="/rodogarcia-marca.png"
      width={231}
      height={27}
    />
  )
}
