'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import AdminSidebar from './AdminSidebar'

export default function AdminLayoutClient({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const isOverviewPage = pathname === '/admin'

  const [authChecked, setAuthChecked] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [currentAdmin, setCurrentAdmin] = useState<string>('admin')

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/auth', { cache: 'no-store' })
      const data = await res.json()

      if (data.authenticated) {
        setIsAuthenticated(true)
        setCurrentAdmin(data.username || 'admin')
      } else {
        setIsAuthenticated(false)
      }
    } catch {
      setIsAuthenticated(false)
    } finally {
      setAuthChecked(true)
    }
  }, [])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  const handleLogout = async () => {
    await fetch('/api/admin/auth', { method: 'DELETE' })
    setIsAuthenticated(false)
    window.location.href = '/admin'
  }

  // The overview page (/admin) handles its own auth gate + login form.
  // For sub-pages, show sidebar when authenticated.
  // If not authenticated and on a sub-page, the sub-page's API call will 401.
  if (isOverviewPage) {
    // Overview page has its own full auth flow, don't add sidebar —
    // it renders its own sidebar via its auth state.
    if (!authChecked) return <>{children}</>
    if (!isAuthenticated) return <>{children}</>

    return (
      <div className="flex min-h-screen">
        <AdminSidebar currentAdmin={currentAdmin} onLogout={handleLogout} />
        <div className="flex-1 ml-48 transition-all duration-200">
          {children}
        </div>
      </div>
    )
  }

  // Sub-pages: show sidebar when authenticated, redirect to login if not
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-midnight-black flex items-center justify-center">
        <div className="text-venetian-gold/50 text-sm">Checking auth...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    // Redirect to main admin page for login
    if (typeof window !== 'undefined') {
      window.location.href = '/admin'
    }
    return (
      <div className="min-h-screen bg-midnight-black flex items-center justify-center">
        <div className="text-venetian-gold/50 text-sm">Redirecting to login...</div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen">
      <AdminSidebar currentAdmin={currentAdmin} onLogout={handleLogout} />
      <div className="flex-1 ml-48 transition-all duration-200">
        {children}
      </div>
    </div>
  )
}
