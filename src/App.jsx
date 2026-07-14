import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { PortalAuthProvider, usePortalAuth } from './contexts/PortalAuthContext'
import Layout from './components/Layout'
import PortalLayout from './components/PortalLayout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'

// Páginas de uso menos frequente carregadas sob demanda, para não inflar
// o bundle inicial (login/dashboard devem carregar o mais rápido possível).
const Clientes = lazy(() => import('./pages/Clientes'))
const Honorarios = lazy(() => import('./pages/Honorarios'))
const ContasPagar = lazy(() => import('./pages/ContasPagar'))
const Tarefas = lazy(() => import('./pages/Tarefas'))
const Atendimento = lazy(() => import('./pages/Atendimento'))
const Agenda = lazy(() => import('./pages/Agenda'))
const RelatorioInadimplencia = lazy(() => import('./pages/RelatorioInadimplencia'))
const Comunicacao = lazy(() => import('./pages/Comunicacao'))
const Cobrancas = lazy(() => import('./pages/Cobrancas'))
const Documentos = lazy(() => import('./pages/Documentos'))
const PortalLogin = lazy(() => import('./pages/portal/PortalLogin'))
const PortalDefinirSenha = lazy(() => import('./pages/portal/PortalDefinirSenha'))
const PortalHome = lazy(() => import('./pages/portal/PortalHome'))
const PortalHonorarios = lazy(() => import('./pages/portal/PortalHonorarios'))
const PortalDocumentos = lazy(() => import('./pages/portal/PortalDocumentos'))
const PortalComunicacao = lazy(() => import('./pages/portal/PortalComunicacao'))

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-10 h-10 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

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
      <Suspense fallback={<PageLoader />}>
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
      </Suspense>
    </PortalAuthProvider>
  )
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
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
          <Route path="documentos" element={<Documentos />} />
          <Route path="cobrancas" element={<GestorRoute><Cobrancas /></GestorRoute>} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Routes>
    </Suspense>
  )
}
