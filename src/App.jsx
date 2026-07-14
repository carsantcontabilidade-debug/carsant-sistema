import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { PortalAuthProvider, usePortalAuth } from './contexts/PortalAuthContext'
import Layout from './components/Layout'
import PortalLayout from './components/PortalLayout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Clientes from './pages/Clientes'
import Honorarios from './pages/Honorarios'
import ContasPagar from './pages/ContasPagar'
import Tarefas from './pages/Tarefas'
import Atendimento from './pages/Atendimento'
import Agenda from './pages/Agenda'
import RelatorioInadimplencia from './pages/RelatorioInadimplencia'
import Comunicacao from './pages/Comunicacao'
import Cobrancas from './pages/Cobrancas'
import PortalLogin from './pages/portal/PortalLogin'
import PortalDefinirSenha from './pages/portal/PortalDefinirSenha'
import PortalHome from './pages/portal/PortalHome'
import PortalHonorarios from './pages/portal/PortalHonorarios'
import PortalDocumentos from './pages/portal/PortalDocumentos'
import PortalComunicacao from './pages/portal/PortalComunicacao'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-500">Carregando...</p>
      </div>
    </div>
  )
  return user ? children : <Navigate to="/login" />
}

function GestorRoute({ children }) {
  const { user, loading, isGestor } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" />
  if (!isGestor) return <Navigate to="/dashboard" />
  return children
}

function PortalPrivateRoute({ children }) {
  const { user, loading } = usePortalAuth()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-500">Carregando...</p>
      </div>
    </div>
  )
  return user ? children : <Navigate to="/portal/login" />
}

function PortalApp() {
  return (
    <PortalAuthProvider>
      <Routes>
        <Route path="login" element={<PortalLogin />} />
        <Route path="definir-senha" element={<PortalDefinirSenha />} />
        <Route element={<PortalPrivateRoute><PortalLayout /></PortalPrivateRoute>}>
          <Route index element={<PortalHome />} />
          <Route path="honorarios" element={<PortalHonorarios />} />
          <Route path="documentos" element={<PortalDocumentos />} />
          <Route path="comunicacao" element={<PortalComunicacao />} />
        </Route>
        <Route path="*" element={<Navigate to="/portal" />} />
      </Routes>
    </PortalAuthProvider>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/portal/*" element={<PortalApp />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Navigate to="/dashboard" />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="clientes" element={<Clientes />} />
        <Route path="honorarios" element={<GestorRoute><Honorarios /></GestorRoute>} />
        <Route path="contas-pagar" element={<GestorRoute><ContasPagar /></GestorRoute>} />
        <Route path="relatorio" element={<GestorRoute><RelatorioInadimplencia /></GestorRoute>} />
        <Route path="atendimento" element={<Atendimento />} />
        <Route path="agenda" element={<Agenda />} />
        <Route path="comunicacao" element={<Comunicacao />} />
        <Route path="cobrancas" element={<GestorRoute><Cobrancas /></GestorRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" />} />
    </Routes>
  )
}
