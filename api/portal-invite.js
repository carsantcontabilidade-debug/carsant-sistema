import { createClient } from '@supabase/supabase-js';
import { enviarEmailTransacional } from './_mailer.js';

// Convida um cliente para o Portal do Cliente. Só um gestor autenticado
// pode chamar este endpoint. Usa a service role key (nunca exposta ao
// browser, só em variável de ambiente na Vercel) para criar a conta de
// login do cliente e vincular clientes.auth_user_id.
//
// O e-mail do convite/recuperação é gerado pelo Supabase (admin.generateLink)
// mas enviado pela conta Gmail já existente da CARSANT (via senha de app) —
// nem o mailer padrão do Supabase (limite de 2/hora) nem o SMTP do UOL Host
// (usado nos boletos) se mostraram confiáveis para esse fluxo especificamente,
// rejeitando entregas para @gmail.com repetidas vezes mesmo em uso normal.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function corpoEmail({ nome, link, reenvio }) {
  const acao = reenvio ? 'redefinir sua senha de acesso' : 'ativar seu acesso';
  const assunto = reenvio
    ? 'CARSANT Contabilidade — Redefinir senha do Portal do Cliente'
    : 'CARSANT Contabilidade — Convite para o Portal do Cliente';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color:#1F4788;">CARSANT Contabilidade</h2>
      <p>Olá, ${nome}!</p>
      <p>Clique no botão abaixo para ${acao} no Portal do Cliente.</p>
      <p style="text-align:center; margin: 24px 0;">
        <a href="${link}" style="background:#1F4788; color:#fff; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:bold;">
          ${reenvio ? 'Redefinir senha' : 'Ativar meu acesso'}
        </a>
      </p>
      <p style="font-size:12px; color:#777;">Se o botão não funcionar, copie e cole este link no navegador:<br>${link}</p>
      <p style="font-size:12px; color:#777;">CARSANT Contabilidade — Feira de Santana, BA</p>
    </div>
  `;
  return { assunto, html };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido' });
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({
      error: 'Variáveis do Supabase não configuradas no servidor (SUPABASE_SERVICE_ROLE_KEY).',
    });
  }

  const { clienteId } = req.body || {};
  if (!clienteId) {
    return res.status(400).json({ error: 'Campo "clienteId" é obrigatório.' });
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

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: perfil } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single();

  if (perfil?.role !== 'gestor') {
    return res.status(403).json({ error: 'Apenas o gestor pode convidar clientes para o portal.' });
  }

  const { data: cliente, error: clienteError } = await admin
    .from('clientes')
    .select('id, nome, email, auth_user_id')
    .eq('id', clienteId)
    .single();

  if (clienteError || !cliente) {
    return res.status(404).json({ error: 'Cliente não encontrado.' });
  }

  if (!cliente.email) {
    return res.status(400).json({ error: 'Este cliente não tem e-mail cadastrado.' });
  }

  // A fonte da verdade é o e-mail atual do cliente, não o auth_user_id salvo —
  // ele pode estar desatualizado se o e-mail do cliente foi editado depois do
  // convite original. Busca a conta existente (se houver) por e-mail.
  const { data: usuarios } = await admin.auth.admin.listUsers();
  const usuarioExistente = usuarios?.users?.find(
    (u) => u.email?.toLowerCase() === cliente.email.toLowerCase()
  );

  if (usuarioExistente) {
    const { data: perfilExistente } = await admin
      .from('profiles')
      .select('id')
      .eq('id', usuarioExistente.id)
      .maybeSingle();
    if (perfilExistente) {
      return res.status(409).json({
        error: 'Este e-mail já pertence a uma conta da equipe (staff). Cadastre um e-mail próprio para este cliente antes de convidar.',
      });
    }
  }

  const redirectTo = `${req.headers.origin || ''}/portal/definir-senha`;
  const reenvio = !!usuarioExistente;

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: reenvio ? 'recovery' : 'invite',
    email: cliente.email,
    options: { redirectTo, data: { cliente_id: cliente.id, nome: cliente.nome } },
  });

  if (linkError || !linkData?.properties?.action_link) {
    return res.status(502).json({ error: `Falha ao gerar link: ${linkError?.message || 'link não gerado'}` });
  }

  // admin.generateLink() NÃO confirma o e-mail automaticamente (diferente de
  // admin.inviteUserByEmail(), usado antes) — a confirmação só aconteceria
  // quando o usuário clicasse o link, o que não é garantido dado o histórico
  // de entrega instável de e-mail. Confirma direto aqui para a conta já
  // funcionar mesmo que o e-mail nunca chegue.
  if (!reenvio) {
    await admin.auth.admin.updateUserById(linkData.user.id, { email_confirm: true });
  }

  const authUserId = reenvio ? usuarioExistente.id : linkData.user.id;
  if (cliente.auth_user_id !== authUserId) {
    const { error: updateError } = await admin
      .from('clientes')
      .update({ auth_user_id: authUserId })
      .eq('id', cliente.id);

    if (updateError) {
      return res.status(500).json({ error: `Link gerado, mas falhou ao vincular: ${updateError.message}` });
    }
  }

  const { assunto, html } = corpoEmail({ nome: cliente.nome, link: linkData.properties.action_link, reenvio });

  try {
    await enviarEmailTransacional({ to: cliente.email, subject: assunto, html });
  } catch (err) {
    return res.status(502).json({ error: `Link gerado, mas falhou ao enviar o e-mail: ${err.message}` });
  }

  return res.status(200).json({ success: true, reenviado: reenvio });
}
