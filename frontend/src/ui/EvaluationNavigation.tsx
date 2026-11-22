import { Avatar } from '@astryxdesign/core/Avatar'
import { Button } from '@astryxdesign/core/Button'
import { MobileNav } from '@astryxdesign/core/MobileNav'
import { SideNav, SideNavItem, SideNavSection } from '@astryxdesign/core/SideNav'
import { KeyRound, LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { type ReactNode, useEffect, useState, useSyncExternalStore } from 'react'

type MenuItem = {
  label: string
  href: string
  icon: ReactNode
  selected: boolean
  select: () => void
}
export type MenuGroup = { title: string; items: MenuItem[] }
const media = '(min-width: 1024px)'
const preference = 'adc.sidebar.collapsed'
function subscribe(listener: () => void) {
  const query = window.matchMedia(media)
  query.addEventListener('change', listener)
  return () => query.removeEventListener('change', listener)
}
function isDesktop() {
  return window.matchMedia(media).matches
}
function initialCollapse() {
  try {
    return localStorage.getItem(preference) === 'true'
  } catch {
    return false
  }
}

export function EvaluationNavigation({
  groups,
  displayName,
  profile,
  help,
  open,
  onOpenChange,
  onHome,
  onPassword,
  onLogout,
  signingOut,
}: {
  groups: MenuGroup[]
  displayName: string
  profile: string
  help: ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
  onHome: () => void
  onPassword: () => void
  onLogout: () => void
  signingOut: boolean
}) {
  const desktop = useSyncExternalStore(subscribe, isDesktop, () => false)
  const [collapsed, setCollapsed] = useState(initialCollapse)
  const compact = desktop && collapsed
  useEffect(() => {
    if (desktop && open) onOpenChange(false)
  }, [desktop, open, onOpenChange])

  function changeCollapse(next: boolean) {
    setCollapsed(next)
    try {
      localStorage.setItem(preference, String(next))
    } catch {
      /* A escolha dura nesta visita. */
    }
  }
  const brand = (
    <a
      className="ev-brand"
      href="/"
      aria-label="Rodogarcia, ir para o início"
      onClick={(event) => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
        event.preventDefault()
        onHome()
      }}
    >
      {compact ? (
        <span className="ev-brand-mark" aria-hidden="true" />
      ) : (
        <img src="/rodogarcia-marca.png" width={231} height={27} alt="" />
      )}
    </a>
  )
  const items = groups
    .filter((group) => group.items.length > 0)
    .map((group) => (
      <SideNavSection key={group.title} title={group.title}>
        {group.items.map((item) => (
          <SideNavItem
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            isSelected={item.selected}
            onClick={(event) => {
              if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
              event.preventDefault()
              item.select()
            }}
          />
        ))}
      </SideNavSection>
    ))
  const account = (
    <div className="ev-nav-footer" data-compact={compact}>
      <Button
        label="Alterar minha senha"
        variant="ghost"
        size="sm"
        isIconOnly={compact}
        icon={<KeyRound size={16} aria-hidden="true" />}
        isDisabled={signingOut}
        onClick={onPassword}
      />
      <Button
        label={signingOut ? 'Saindo…' : 'Sair da conta'}
        variant="ghost"
        size="sm"
        isIconOnly={compact}
        icon={<LogOut size={16} aria-hidden="true" />}
        isDisabled={signingOut}
        onClick={onLogout}
      />
      {desktop && (
        <Button
          label={compact ? 'Expandir menu' : 'Recolher menu'}
          variant="ghost"
          size="sm"
          className="ev-collapse"
          isIconOnly={compact}
          aria-expanded={!compact}
          icon={compact ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          onClick={() => changeCollapse(!collapsed)}
        />
      )}
      <div
        className="ev-profile"
        role="region"
        aria-label="Conta ativa"
        title={compact ? displayName : undefined}
      >
        <Avatar name={displayName} size="sm" />
        {!compact && (
          <div>
            <strong>{displayName}</strong>
            <small>
              {profile} {help}
            </small>
          </div>
        )}
      </div>
    </div>
  )
  return desktop ? (
    <aside className="ev-rail" data-collapsed={compact} aria-label="Menu lateral da Avaliação">
      <SideNav
        className="ev-side-nav"
        aria-label="Menu de módulos"
        style={{ width: compact ? 62 : 248 }}
        collapsible={{ isCollapsed: compact, onCollapsedChange: changeCollapse, hasButton: false }}
        header={brand}
        footer={account}
      >
        {items}
      </SideNav>
    </aside>
  ) : (
    <MobileNav
      label="Menu de módulos"
      id="workspace-sidebar"
      side="start"
      width={310}
      isOpen={open}
      onOpenChange={onOpenChange}
      header={brand}
      className="ev-mobile-nav"
    >
      <div className="ev-mobile-body">
        <div>{items}</div>
        {account}
      </div>
    </MobileNav>
  )
}
