import { createClient } from '@supabase/supabase-js';
import { gerarBackup } from './_backup.js';
import { enviarEmailTransacional } from './_mailer.js';

// Backup — dois gatilhos no mesmo endpoint (o plano Hobby da Vercel
// limita a 12 Serverless Functions por deploy; juntar isso evita passar
// do limite toda vez que uma feature nova precisar de uma rota nova):
//   1. Vercel Cron (vercel.json, toda segunda de madrugada) — identificado
//      pelo header x-vercel-cron ou pelo CRON_SECRET — gera o backup e
//      manda por e-mail para o próprio escritório.
//   2. Botão "Baixar backup agora" em Configurações — gestor autenticado
//      via Supabase, recebe o JSON direto para download.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BACKUP_EMAIL_TO = process.env.BACKUP_EMAIL_TO || 'carsantcontabilidade@gmail.com';

function ehChamadaDoCron(req) {
  if (req.headers['x-vercel-cron']) return true;
  if (process.env.CRON_SECRET && req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`) return true;
  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método não permitido' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Variáveis do Supabase não configuradas no servidor.' });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  if (ehChamadaDoCron(req)) {
    try {
      const backup = await gerarBackup(admin);
      const conteudo = JSON.stringify(backup, null, 2);
      const dataStr = new Date().toISOString().slice(0, 10);

      await enviarEmailTransacional({
        to: BACKUP_EMAIL_TO,
        subject: `CARSANT — Backup semanal (${dataStr})`,
        html: `<p>Backup automático dos dados do sistema CARSANT gerado em ${dataStr}.</p><p>Guarde este e-mail em local seguro.</p>`,
        attachments: [{ filename: `carsant-backup-${dataStr}.json`, content: Buffer.from(conteudo, 'utf-8') }],
      });

      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('Erro ao gerar/enviar backup semanal:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // Fluxo manual — precisa de gestor autenticado.
  if (!SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: 'Variáveis do Supabase não configuradas no servidor (ANON_KEY).' });
  }

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData?.user) {
    return res.status(401).json({ error: 'Sessão inválida.' });
  }

  const { data: perfil } = await admin.from('profiles').select('role').eq('id', userData.user.id).single();
  if (perfil?.role !== 'gestor') {
    return res.status(403).json({ error: 'Apenas o gestor pode baixar o backup.' });
  }

  const backup = await gerarBackup(admin);

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="carsant-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  return res.status(200).send(JSON.stringify(backup, null, 2));
}
