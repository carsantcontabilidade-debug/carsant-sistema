import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

// Envio de notificações push do Portal do Cliente. Compartilhado entre
// os endpoints que precisam avisar um cliente (ex: portal-notify.js).

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

webpush.setVapidDetails(
  'mailto:atendimento@carsantcontabilidade.com.br',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Envia para todas as assinaturas ativas de um cliente. Remove do banco
// as assinaturas que o navegador já invalidou (410 Gone / 404).
export async function enviarPushParaCliente(clienteId, { title, body, url }) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return { enviados: 0, motivo: 'VAPID não configurado' };
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: assinaturas } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('cliente_id', clienteId);

  if (!assinaturas?.length) {
    return { enviados: 0, motivo: 'sem assinaturas' };
  }

  const payload = JSON.stringify({ title, body, url: url || '/portal' });

  let enviados = 0;
  for (const sub of assinaturas) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
      enviados++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await admin.from('push_subscriptions').delete().eq('id', sub.id);
      }
    }
  }

  return { enviados };
}
