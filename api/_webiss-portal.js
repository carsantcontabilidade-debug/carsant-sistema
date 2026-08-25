// Acesso à área logada do portal WebISS (feiradesantanaba.webiss.com.br) só
// para baixar o DANFSE oficial de uma NFS-e já emitida pela CARSANT.
//
// É um mecanismo DIFERENTE da emissão (_webiss-nfse.js), que usa o certificado
// A1 pra assinar o XML enviado por SOAP. Aqui é login comum (usuário/senha)
// na área web do prestador — confirmado por teste real em 29/07/2026 que:
// - O captcha só existe na página pública de "validar nota de terceiros"
//   (/externo/nfse/validar); login e a exportação de PDF não pedem captcha.
// - O mesmo usuário (CPF do Ronaldo) dá acesso a várias empresas — é preciso
//   trocar a "autorização corrente" pra CARSANT depois de logar, senão o
//   perfil ativo fica como tomador (só enxerga notas recebidas).
// - O próprio recurso nativo da Prefeitura "Exportar Lote PDF" (usado na
//   listagem de notas do prestador) devolve um .zip com o PDF oficial da(s)
//   nota(s) filtradas — dá pra filtrar por um número de nota específico.
//
// Arquivo com "_" na frente não conta no teto de 12 Serverless Functions da
// Vercel Hobby (convenção oficial) — é só um módulo auxiliar importado por
// nfse-emitir.js.

import JSZip from 'jszip';

const PORTAL_BASE = 'https://feiradesantanaba.webiss.com.br';
const ID_AUTORIZACAO_CARSANT = process.env.WEBISS_PORTAL_ID_AUTORIZACAO_CARSANT || '95641';

function extrairCookies(resposta) {
  const bruto = typeof resposta.headers.getSetCookie === 'function'
    ? resposta.headers.getSetCookie()
    : (resposta.headers.get('set-cookie') ? [resposta.headers.get('set-cookie')] : []);
  return bruto.map((c) => c.split(';')[0]);
}

function mesclarCookies(jar, novos) {
  for (const par of novos) {
    const [nome] = par.split('=');
    jar.set(nome, par);
  }
}

function cookieHeader(jar) {
  return Array.from(jar.values()).join('; ');
}

async function loginPortal() {
  const usuario = process.env.WEBISS_PORTAL_USUARIO;
  const senha = process.env.WEBISS_PORTAL_SENHA;
  if (!usuario || !senha) throw new Error('WEBISS_PORTAL_USUARIO/WEBISS_PORTAL_SENHA não configurados.');

  const body = new URLSearchParams({ Login: usuario, Senha: senha, IndicaAcessoComCertificado: 'false' });
  const resp = await fetch(`${PORTAL_BASE}/autenticacao/autenticar`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: `${PORTAL_BASE}/`,
    },
    body: body.toString(),
  });
  if (resp.status !== 302) throw new Error(`Login no portal WebISS falhou (usuário ou senha incorretos? status ${resp.status}).`);

  const jar = new Map();
  mesclarCookies(jar, extrairCookies(resp));
  if (jar.size === 0) throw new Error('Login no portal WebISS não retornou sessão.');
  return jar;
}

async function trocarParaAutorizacaoCarsant(jar) {
  const resp = await fetch(`${PORTAL_BASE}/controle-acesso/autorizacao-usuario/definir-corrente/${ID_AUTORIZACAO_CARSANT}`, {
    redirect: 'manual',
    headers: { Cookie: cookieHeader(jar) },
  });
  mesclarCookies(jar, extrairCookies(resp));
  if (resp.status >= 400) throw new Error(`Falha ao trocar para o perfil da CARSANT no portal WebISS (status ${resp.status}).`);
}

// Retorna { pdfBase64, nomeArquivo } com o DANFSE oficial, ou lança erro se
// o WebISS não devolver um PDF pra esse número (ex.: nota de homologação,
// que não existe nesta área — só produção).
export async function baixarDanfseOficialPdf(numeroNfse) {
  const jar = await loginPortal();
  await trocarParaAutorizacaoCarsant(jar);

  const body = new URLSearchParams({
    NumeroDaPrimeiraNota: String(numeroNfse),
    NumeroDaUltimaNota: String(numeroNfse),
  });
  const resp = await fetch(`${PORTAL_BASE}/issqn/nfse/pdf/lote`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookieHeader(jar),
    },
    body: body.toString(),
  });
  if (!resp.ok) throw new Error(`Falha ao exportar PDF do portal WebISS (status ${resp.status}).`);

  const contentType = resp.headers.get('content-type') || '';
  if (!contentType.includes('zip')) {
    throw new Error('O portal WebISS não retornou um PDF pra esta nota (verifique se é uma nota de produção já visível no prestador).');
  }

  const arrayBuffer = await resp.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const arquivoPdf = Object.values(zip.files).find((f) => !f.dir && f.name.toLowerCase().endsWith('.pdf'));
  if (!arquivoPdf) throw new Error('O arquivo devolvido pelo portal WebISS não continha nenhum PDF.');

  const pdfBuffer = await arquivoPdf.async('nodebuffer');
  return { pdfBase64: pdfBuffer.toString('base64'), nomeArquivo: arquivoPdf.name };
}
