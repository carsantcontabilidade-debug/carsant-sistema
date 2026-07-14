import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { usePortalAuth } from '../contexts/PortalAuthContext'
import { Home, Wallet, FolderOpen, MessageCircle, LogOut, Menu, X } from 'lucide-react'

const navItems = [
  { to: '/portal', icon: Home, label: 'Início', end: true },
  { to: '/portal/honorarios', icon: Wallet, label: 'Honorários & Cobranças' },
  { to: '/portal/documentos', icon: FolderOpen, label: 'Documentos' },
  { to: '/portal/comunicacao', icon: MessageCircle, label: 'Comunicação' },
]

export default function PortalLayout() {
  const { cliente, signOut } = usePortalAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/portal/login')
  }

  const Sidebar = ({ mobile = false }) => (
    <div className={`flex flex-col h-full ${mobile ? '' : 'w-64'}`}>
      <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100">
        <img src="/logo.png" alt="CARSANT" className="h-10 w-auto rounded-lg" />
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            onClick={() => mobile && setSidebarOpen(false)}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="px-4 py-4 border-t border-gray-100">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center text-brand-700 font-semibold text-sm">
            {cliente?.nome?.charAt(0) || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 truncate">{cliente?.nome || 'Cliente'}</div>
            <div className="text-xs text-gray-500">Portal do Cliente</div>
          </div>
        </div>
        <button onClick={handleSignOut} className="btn-ghost btn-sm w-full justify-start text-gray-500">
          <LogOut className="w-4 h-4" /> Sair
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-gray-200 flex-shrink-0">
        <Sidebar />
      </aside>
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 bg-white shadow-2xl z-10">
            <div className="flex justify-end p-4">
              <button onClick={() => setSidebarOpen(false)} className="btn-ghost p-2">
                <X className="w-5 h-5" />
              </button>
            </div>
            <Sidebar mobile />
          </aside>
        </div>
      )}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200">
          <button onClick={() => setSidebarOpen(true)} className="btn-ghost p-2">
            <Menu className="w-5 h-5" />
          </button>
          <img src="/logo.png" alt="CARSANT" className="h-8 w-auto" />
        </header>
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
