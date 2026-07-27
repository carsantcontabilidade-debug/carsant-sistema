// src/lib/geoBrasil.js
// Helpers pro Mapa de Clientes (Brasil → Estado → Município → Cliente).
// Malhas (contornos) vêm da API oficial do IBGE, gratuita, sem chave —
// já confirmada por teste real (2026-07-27):
//   https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo+json&intrarregiao=UF
//   https://servicodados.ibge.gov.br/api/v3/malhas/estados/{codigoUf}?formato=application/vnd.geo+json&intrarregiao=municipio
// Cada feature só tem "codarea" (código IBGE numérico) nas properties,
// sem nome — por isso a tabela UF abaixo e a busca de nome de município
// via API de localidades (já usada em Clientes.jsx).

// Tabela oficial IBGE: código numérico de UF -> sigla/nome.
export const UFS_IBGE = {
  '11': { sigla: 'RO', nome: 'Rondônia' },
  '12': { sigla: 'AC', nome: 'Acre' },
  '13': { sigla: 'AM', nome: 'Amazonas' },
  '14': { sigla: 'RR', nome: 'Roraima' },
  '15': { sigla: 'PA', nome: 'Pará' },
  '16': { sigla: 'AP', nome: 'Amapá' },
  '17': { sigla: 'TO', nome: 'Tocantins' },
  '21': { sigla: 'MA', nome: 'Maranhão' },
  '22': { sigla: 'PI', nome: 'Piauí' },
  '23': { sigla: 'CE', nome: 'Ceará' },
  '24': { sigla: 'RN', nome: 'Rio Grande do Norte' },
  '25': { sigla: 'PB', nome: 'Paraíba' },
  '26': { sigla: 'PE', nome: 'Pernambuco' },
  '27': { sigla: 'AL', nome: 'Alagoas' },
  '28': { sigla: 'SE', nome: 'Sergipe' },
  '29': { sigla: 'BA', nome: 'Bahia' },
  '31': { sigla: 'MG', nome: 'Minas Gerais' },
  '32': { sigla: 'ES', nome: 'Espírito Santo' },
  '33': { sigla: 'RJ', nome: 'Rio de Janeiro' },
  '35': { sigla: 'SP', nome: 'São Paulo' },
  '41': { sigla: 'PR', nome: 'Paraná' },
  '42': { sigla: 'SC', nome: 'Santa Catarina' },
  '43': { sigla: 'RS', nome: 'Rio Grande do Sul' },
  '50': { sigla: 'MS', nome: 'Mato Grosso do Sul' },
  '51': { sigla: 'MT', nome: 'Mato Grosso' },
  '52': { sigla: 'GO', nome: 'Goiás' },
  '53': { sigla: 'DF', nome: 'Distrito Federal' },
};

export const SIGLA_PARA_CODIGO_UF = Object.fromEntries(
  Object.entries(UFS_IBGE).map(([codigo, { sigla }]) => [sigla, codigo])
);

// Centro aproximado do Brasil, pra estado inicial do mapa.
export const CENTRO_BRASIL = [-14.2, -51.9];

export async function buscarMalhaBrasil() {
  const resp = await fetch('https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo+json&intrarregiao=UF');
  if (!resp.ok) throw new Error('Não foi possível carregar o mapa do Brasil.');
  return resp.json();
}

export async function buscarMalhaMunicipios(codigoUf) {
  const resp = await fetch(`https://servicodados.ibge.gov.br/api/v3/malhas/estados/${codigoUf}?formato=application/vnd.geo+json&intrarregiao=municipio`);
  if (!resp.ok) throw new Error('Não foi possível carregar os municípios deste estado.');
  return resp.json();
}

export async function buscarNomeMunicipio(codigoMunicipioIbge) {
  const resp = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/municipios/${codigoMunicipioIbge}`);
  if (!resp.ok) return `(código ${codigoMunicipioIbge})`;
  const d = await resp.json();
  return d?.nome || `(código ${codigoMunicipioIbge})`;
}

// Geocoding sob demanda (um cliente por vez, só quando o usuário clica
// "ver no mapa") via Nominatim/OpenStreetMap — gratuito, sem chave,
// respeitando a política de uso deles (nada de geocodificar em lote).
// Confirmado por teste real que o formato de busca funciona (2026-07-27).
export async function geocodificarEndereco(cliente) {
  const partes = [
    [cliente.logradouro, cliente.numero_endereco].filter(Boolean).join(', '),
    cliente.bairro,
    cliente.cep,
    cliente.uf,
    'Brasil',
  ].filter(Boolean);
  const query = partes.join(', ');
  if (!query) return null;

  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(query)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('Serviço de geolocalização indisponível no momento.');
  const resultados = await resp.json();
  if (!resultados?.[0]) return null;
  return { latitude: Number(resultados[0].lat), longitude: Number(resultados[0].lon) };
}
