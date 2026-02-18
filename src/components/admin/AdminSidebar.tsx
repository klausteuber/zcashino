'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface AdminSidebarProps {
  currentAdmin: string
  adminRole: string
  onLogout: () => void
}

interface NavItem {
  label: string
  href: string
  icon: string
  requiredRole?: string
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Overview', href: '/admin', icon: '~' },
  { label: 'Analytics', href: '/admin/analytics', icon: '#' },
  { label: 'Players', href: '/admin/players', icon: '@' },
  { label: 'Games', href: '/admin/games', icon: '*' },
  { label: 'Withdrawals', href: '/admin/withdrawals', icon: '$' },
  { label: 'Alerts', href: '/admin/alerts', icon: '!' },
  { label: 'Audit Logs', href: '/admin/audit-logs', icon: '&' },
  { label: 'Settings', href: '/admin/settings', icon: '%', requiredRole: 'super_admin' },
  { label: 'Users', href: '/admin/users', icon: '+', requiredRole: 'super_admin' },
]

export default function AdminSidebar({ currentAdmin, adminRole, onLogout }: AdminSidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin'
    return pathname.startsWith(href)
  }

  return (
    <aside
      className={`fixed left-0 top-0 h-full bg-midnight-black/90 border-r border-masque-gold/20 backdrop-blur-sm z-40 transition-all duration-200 flex flex-col ${
        collapsed ? 'w-14' : 'w-48'
      }`}
    >
      {/* Header */}
      <div className="p-3 border-b border-masque-gold/20 flex items-center justify-between">
        {!collapsed && (
          <span className="text-sm font-display font-bold text-masque-gold truncate">
            Admin
          </span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-venetian-gold/50 hover:text-masque-gold transition-colors text-xs p-1"
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '>>' : '<<'}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {NAV_ITEMS.filter(
          (item) => !item.requiredRole || item.requiredRole === adminRole
        ).map((item) => {
          const active = isActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 px-3 py-2 mx-1 rounded-lg text-sm transition-colors ${
                active
                  ? 'bg-masque-gold/15 text-masque-gold border border-masque-gold/30'
                  : 'text-venetian-gold/60 hover:text-bone-white hover:bg-midnight-black/60 border border-transparent'
              }`}
              title={collapsed ? item.label : undefined}
            >
              <span className="font-mono text-xs w-4 text-center flex-shrink-0">
                {item.icon}
              </span>
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-masque-gold/20">
        {!collapsed && (
          <div className="mb-2">
            <div className="text-xs text-venetian-gold/50 truncate">{currentAdmin}</div>
            <div className="text-[10px] text-venetian-gold/30 truncate">{adminRole.replace('_', ' ')}</div>
          </div>
        )}
        <button
          onClick={onLogout}
          className={`text-xs text-blood-ruby hover:text-blood-ruby/80 transition-colors ${
            collapsed ? 'w-full text-center' : ''
          }`}
          title="Sign Out"
        >
          {collapsed ? 'x' : 'Sign Out'}
        </button>
      </div>
    </aside>
  )
}
