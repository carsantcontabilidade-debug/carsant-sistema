import { createClient } from '@supabase/supabase-js';
import { gerarBackup } from './_backup.js';
import { enviarEmailTransacional } from './_mailer.js';

// Backup semanal automático, disparado pelo Vercel Cron (vercel.json).
// Envia por e-mail para o próprio escritório — garante uma cópia dos
// dados independente do acesso à conta do Supabase (perda de acesso,
// invasão, etc.).

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BACKUP_EMAIL_TO = process.env.BACKUP_EMAIL_TO || 'carsantcontabilidade@gmail.com';

export default async function handler(req, res) {
  // Se CRON_SECRET estiver configurado na Vercel, só aceita chamadas do
  // próprio cron (protege o endpoint de ser disparado por terceiros).
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Não autorizado.' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Variáveis do Supabase não configuradas no servidor.' });
  }

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
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
