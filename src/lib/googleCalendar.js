// src/lib/googleCalendar.js
import { supabase } from './supabase'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const REDIRECT_URI = `${window.location.origin}/agenda`
const SCOPES = 'https://www.googleapis.com/auth/calendar'

// Gera URL de autorizaÃ§Ã£o OAuth
export function getGoogleAuthUrl() {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

// Troca code por tokens (via Supabase Edge Function)
export async function trocarCodePorToken(code) {
  const { data, error } = await supabase.functions.invoke('google-oauth', {
    body: { code, redirect_uri: REDIRECT_URI }
  })
  if (error) throw error
  return data
}

// Busca token salvo do usuÃ¡rio
export async function buscarToken() {
  const { data } = await supabase
    .from('google_tokens')
    .select('*')
    .single()
  return data
}

// Salva/atualiza token no Supabase
export async function salvarToken(tokenData) {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('google_tokens')
    .upsert({
      user_id: user.id,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
      atualizado_em: new Date().toISOString()
    }, { onConflict: 'user_id' })
  if (error) throw error
}

// Remove token (desconectar)
export async function removerToken() {
  const { error } = await supabase
    .from('google_tokens')
    .delete()
    .neq('user_id', '00000000-0000-0000-0000-000000000000')
  if (error) throw error
}

// Verifica se token estÃ¡ vÃ¡lido
function tokenValido(token) {
  if (!token?.access_token) return false
  if (!token.expires_at) return true
  return new Date(token.expires_at) > new Date(Date.now() + 60000)
}

// Renova token se necessÃ¡rio
async function getAccessToken() {
  const token = await buscarToken()
  if (!token) throw new Error('NÃ£o conectado ao Google Calendar')
  if (tokenValido(token)) return token.access_token

  // Renovar via Edge Function
  const { data, error } = await supabase.functions.invoke('google-refresh', {
    body: { refresh_token: token.refresh_token }
  })
  if (error) throw new Error('Erro ao renovar token do Google')
  await salvarToken({ ...data, refresh_token: token.refresh_token })
  return data.access_token
}

// Formata evento do sistema para formato Google
function formatarParaGoogle(evento) {
  const dataHoraInicio = evento.hora
    ? `${evento.data}T${evento.hora}:00`
    : evento.data

  const isAllDay = !evento.hora

  const result = {
    summary: evento.titulo,
    description: [
      evento.cliente_nome ? `Cliente: ${evento.cliente_nome}` : '',
      evento.responsavel ? `ResponsÃ¡vel: ${evento.responsavel}` : '',
      evento.obs || ''
    ].filter(Boolean).join('\n'),
  }

  if (isAllDay) {
    result.start = { date: evento.data }
    result.end = { date: evento.data }
  } else {
    // Evento de 1 hora por padrÃ£o
    const [h, m] = evento.hora.split(':').map(Number)
    const endHour = String(h + 1).padStart(2, '0')
    result.start = { dateTime: `${evento.data}T${evento.hora}:00`, timeZone: 'America/Bahia' }
    result.end = { dateTime: `${evento.data}T${endHour}:${String(m).padStart(2, '0')}:00`, timeZone: 'America/Bahia' }
  }

  return result
}

// Criar evento no Google Calendar
export async function criarEventoGoogle(evento) {
  try {
    const accessToken = await getAccessToken()
    const body = formatarParaGoogle(evento)

    const res = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    )
    if (!res.ok) throw new Error('Erro ao criar evento no Google')
    const data = await res.json()
    return data.id // google_event_id
  } catch (e) {
    console.warn('Google Calendar: erro ao criar evento', e.message)
    return null
  }
}

// Atualizar evento no Google Calendar
export async function atualizarEventoGoogle(googleEventId, evento) {
  try {
    const accessToken = await getAccessToken()
    const body = formatarParaGoogle(evento)

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${googleEventId}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    )
    if (!res.ok) throw new Error('Erro ao atualizar evento no Google')
    return true
  } catch (e) {
    console.warn('Google Calendar: erro ao atualizar evento', e.message)
    return false
  }
}

// Deletar evento no Google Calendar
export async function deletarEventoGoogle(googleEventId) {
  try {
    const accessToken = await getAccessToken()
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${googleEventId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    )
    return res.ok || res.status === 404
  } catch (e) {
    console.warn('Google Calendar: erro ao deletar evento', e.message)
    return false
  }
}

// Buscar eventos do Google Calendar
export async function buscarEventosGoogle(dataInicio, dataFim) {
  try {
    const accessToken = await getAccessToken()
    const params = new URLSearchParams({
      timeMin: `${dataInicio}T00:00:00Z`,
      timeMax: `${dataFim}T23:59:59Z`,
      singleEvents: 'true',
      orderBy: 'startTime',
    })
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!res.ok) return []
    const data = await res.json()
    return data.items || []
  } catch (e) {
    console.warn('Google Calendar: erro ao buscar eventos', e.message)
    return []
  }
}

