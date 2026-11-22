import { Button, type ButtonProps } from '@astryxdesign/core/Button'

/** Preserva o disabled nativo dos formulários, inclusive na submissão pelo teclado. */
export function ActionButton({
  disabled,
  title,
  ...props
}: Omit<ButtonProps, 'isDisabled' | 'href' | 'as'> & { disabled?: boolean; title?: string }) {
  const native = { disabled, title }
  return <Button {...props} {...native} isDisabled={disabled} />
}
