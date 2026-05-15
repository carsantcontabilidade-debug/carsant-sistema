import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Clientes from './pages/Clientes'
import Honorarios from './pages/Honorarios'
import ContasPagar from './pages/ContasPagar'
import Tarefas from './pages/Tarefas'
import Atendimento from './pages/Atendimento'
import Agenda from './pages/Agenda'

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
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Navigate to="/dashboard" />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="clientes" element={<Clientes />} />
        <<Route path="honorarios" element={<GestorRoute><Honorarios /></GestorRoute>} />
<Route path="contas-pagar" element={<GestorRoute><ContasPagar /></GestorRoute>} />
        <Route path="tarefas" element={<Tarefas />} />
        <Route path="atendimento" element={<Atendimento />} />
        <Route path="agenda" element={<Agenda />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" />} />
    </Routes>
  )
}
