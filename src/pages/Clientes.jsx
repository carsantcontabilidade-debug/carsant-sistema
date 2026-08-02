import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { buscarColaboradores } from '../lib/colaboradores'
import { Plus, Search, Edit2, Trash2, ChevronDown, Wand2, Loader2, X, Save, UserPlus, CheckCircle2, SearchCheck, FileSignature, MapPin, Map, List } from 'lucide-react'
import MapaClientes from './MapaClientes'

const OBR_CATALOG = [
  { id: 'das_mei', nome: 'DAS-MEI', dia: 20, regimes: ['MEI'] },
  { id: 'das', nome: 'DAS — Simples Nacional', dia: 20, regimes: ['Simples Nacional'] },
  { id: 'dctf', nome: 'DCTF Mensal', dia: 20, regimes: ['Simples Nacional','Lucro Presumido','Lucro Real','Entidade / Assoc.','Partido Político'] },
  { id: 'sped_fiscal', nome: 'SPED Fiscal', dia: 15, regimes: ['Lucro Presumido','Lucro Real'] },
  { id: 'sped_contrib', nome: 'SPED Contribuições', dia: 10, regimes: ['Lucro Presumido','Lucro Real'] },
  { id: 'efd_reinf', nome: 'EFD-Reinf', dia: 15, regimes: ['Lucro Presumido','Lucro Real'] },
  { id: 'esocial', nome: 'eSocial', dia: 7, regimes: ['Lucro Presumido','Lucro Real'] },
  { id: 'irpj', nome: 'IRPJ Trimestral', dia: 30, regimes: ['Lucro Presumido'] },
  { id: 'ecf', nome: 'ECF (anual)', dia: 31, regimes: ['Lucro Presumido','Lucro Real'] },
  { id: 'folha', nome: 'Folha de Pagamento', dia: 5, regimes: [] },
  { id: 'fgts', nome: 'FGTS', dia: 7, regimes: [] },
  { id: 'nfse', nome: 'Nota Fiscal de Serviço', dia: 10, regimes: [] },
  { id: 'dirf', nome: 'DIRF (anual)', dia: 28, regimes: [] },
  { id: 'rais', nome: 'RAIS (anual)', dia: 31, regimes: [] },
]

const REGIMES = ['MEI','Simples Nacional','Lucro Presumido','Lucro Real','Entidade / Assoc.','Partido Político']

// "Failed to fetch" (falha de rede, sem resposta HTTP nenhuma) é
// tipicamente transitório numa varredura longa contra a API pública —
// tenta de novo antes de desistir, em vez de exigir rodar tudo de novo.
async function buscarCnpjComRetry(cnpjLimpo, tentativas = 3) {
  for (let i = 0; i < tentativas; i++) {
    try {
      const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`)
      if (!resp.ok) throw new Error(resp.status === 404 ? 'CNPJ não encontrado' : `erro ${resp.status}`)
      return await resp.json()
    } catch (err) {
      const ultimaTentativa = i === tentativas - 1
      if (ultimaTentativa || err.message !== 'Failed to fetch') throw err
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)))
    }
  }
}

const emptyForm = {
  nome: '', cnpj: '', regime: '', valor_honorario: '', dia_vencimento: 10, honorario_inicio: '',
  telefone: '', email: '', email2: '', tipo: 'recorrente', obrigacoes: [],
  logradouro: '', numero_endereco: '', complemento: '', bairro: '', cep: '',
  uf: '', codigo_municipio_ibge: '',
}

export default function Clientes() {
  const { isGestor } = useAuth()
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroRegime, setFiltroRegime] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [obrSel, setObrSel] = useState({}) // {obrId: {sel: bool, resp: string}}
  const [convidando, setConvidando] = useState(null) // id do cliente sendo convidado
  const [emitindoNfse, setEmitindoNfse] = useState(null) // id do cliente com NFS-e em emissão
  const [buscandoCnpj, setBuscandoCnpj] = useState(false)
  const [atualizandoEnderecos, setAtualizandoEnderecos] = useState(false)
  const [progressoEnderecos, setProgressoEnderecos] = useState(null)
  const [distribuicao, setDistribuicao] = useState(null)
  const [mostrarDistribuicao, setMostrarDistribuicao] = useState(false)
  const [revisando, setRevisando] = useState(false)
  const [progressoRevisao, setProgressoRevisao] = useState(null)
  const [divergencias, setDivergencias] = useState(null)
  const [corrigindoId, setCorrigindoId] = useState(null)
  const [colabs, setColabs] = useState([])
  const [aba, setAba] = useState('lista') // 'lista' | 'mapa'

  useEffect(() => { fetchClientes(); buscarColaboradores().then(setColabs) }, [])

  async function fetchClientes() {
    setLoading(true)
    const { data } = await supabase.from('clientes').select('*').order('nome')
    setClientes(data || [])
    setLoading(false)
  }

  function abrirNovo() {
    setForm(emptyForm); setEditId(null); setObrSel({}); setModalOpen(true)
  }

  function abrirEditar(c) {
    setForm({
      nome: c.nome || '', cnpj: c.cnpj || '', regime: c.regime || '',
      valor_honorario: c.valor_honorario || '', dia_vencimento: c.dia_vencimento || 10, honorario_inicio: c.honorario_inicio || '',
      telefone: c.telefone || '', email: c.email || '', email2: c.email2 || '',
      tipo: c.tipo || 'recorrente', obrigacoes: c.obrigacoes || [],
      logradouro: c.logradouro || '', numero_endereco: c.numero_endereco || '',
      complemento: c.complemento || '', bairro: c.bairro || '', cep: c.cep || '',
      uf: c.uf || '', codigo_municipio_ibge: c.codigo_municipio_ibge || '',
    })
    const sel = {}
    ;(c.obrigacoes || []).forEach(o => { sel[o.id] = { sel: true, resp: o.resp || colabs[0] || '' } })
    setObrSel(sel)
    setEditId(c.id)
    setModalOpen(true)
  }

  async function buscarCnpj() {
    const cnpjLimpo = form.cnpj.replace(/\D/g, '')
    if (cnpjLimpo.length !== 14) {
      alert('Digite um CNPJ completo (14 dígitos) para buscar. CPF não é consultável nessa base pública.')
      return
    }
    setBuscandoCnpj(true)
    try {
      const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`)
      if (!resp.ok) throw new Error(resp.status === 404 ? 'CNPJ não encontrado.' : 'Falha ao consultar a Receita Federal.')
      const dados = await resp.json()

      const regime = dados.opcao_pelo_mei ? 'MEI' : dados.opcao_pelo_simples ? 'Simples Nacional' : form.regime
      const telefone = dados.ddd_telefone_1 || form.telefone
      const email = dados.email || form.email

      setForm(f => ({
        ...f,
        nome: dados.razao_social || f.nome,
        regime,
        telefone: f.telefone || telefone,
        email: f.email || email,
        logradouro: f.logradouro || dados.logradouro || '',
        numero_endereco: f.numero_endereco || dados.numero || '',
        complemento: f.complemento || dados.complemento || '',
        bairro: f.bairro || dados.bairro || '',
        cep: f.cep || dados.cep || '',
        uf: dados.uf || f.uf,
        codigo_municipio_ibge: f.codigo_municipio_ibge && f.codigo_municipio_ibge !== '2910800' ? f.codigo_municipio_ibge : (dados.codigo_municipio_ibge || f.codigo_municipio_ibge),
      }))
    } catch (err) {
      alert(`Não foi possível buscar o CNPJ: ${err.message}`)
    } finally {
      setBuscandoCnpj(false)
    }
  }

  function sugerirObrigacoes() {
    const regime = form.regime
    const novo = { ...obrSel }
    OBR_CATALOG.forEach(o => {
      if (o.regimes.includes(regime) && !novo[o.id]) {
        novo[o.id] = { sel: true, resp: colabs[0] || '' }
      }
    })
    setObrSel(novo)
  }

  function toggleObr(id) {
    setObrSel(prev => ({
      ...prev,
      [id]: { sel: !prev[id]?.sel, resp: prev[id]?.resp || colabs[0] || '' }
    }))
  }

  function setObrResp(id, resp) {
    setObrSel(prev => ({ ...prev, [id]: { ...prev[id], resp } }))
  }

  async function salvar() {
    if (!form.nome) return
    setSaving(true)
    const obrigacoes = Object.entries(obrSel).filter(([,v]) => v.sel).map(([id,v]) => ({ id, resp: v.resp }))
    const payload = { ...form, valor_honorario: parseFloat(form.valor_honorario) || 0, dia_vencimento: parseInt(form.dia_vencimento) || 10, honorario_inicio: form.honorario_inicio || null, obrigacoes }
    const { error } = editId
      ? await supabase.from('clientes').update(payload).eq('id', editId)
      : await supabase.from('clientes').insert(payload)
    setSaving(false)
    if (error) { alert(`Erro ao salvar cliente: ${error.message}`); return }
    setModalOpen(false); fetchClientes()
  }

  async function remover(id) {
    if (!window.confirm('Remover este cliente?')) return
    await supabase.from('clientes').delete().eq('id', id)
    fetchClientes()
  }

  async function convidarPortal(cliente) {
    if (!cliente.email) {
      alert('Este cliente não tem e-mail cadastrado. Adicione um e-mail antes de convidar.')
      return
    }
    const jaTemAcesso = !!cliente.auth_user_id
    const pergunta = jaTemAcesso
      ? `Reenviar o link de acesso ao Portal para ${cliente.email}?`
      : `Enviar convite do Portal do Cliente para ${cliente.email}?`
    if (!window.confirm(pergunta)) return
    setConvidando(cliente.id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch('/api/portal-invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ clienteId: cliente.id }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Falha ao enviar convite')
      alert(jaTemAcesso ? `Link reenviado para ${cliente.email}.` : `Convite enviado para ${cliente.email}.`)
      fetchClientes()
    } catch (err) {
      alert(err.message)
    } finally {
      setConvidando(null)
    }
  }

  async function emitirNfseCliente(cliente) {
    if (!cliente.cnpj) {
      alert('Este cliente não tem CNPJ cadastrado. Adicione um CNPJ antes de emitir NFS-e.')
      return
    }
    if (!cliente.logradouro) {
      alert('Este cliente não tem endereço cadastrado. Adicione o endereço antes de emitir NFS-e — necessário para o cálculo de impostos pós-reforma tributária.')
      return
    }
    const valor = window.prompt(`Valor do serviço para ${cliente.nome} (R$):`, cliente.valor_honorario || '')
    if (!valor) return
    const mesRef = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    const discriminacao = window.prompt('Discriminação do serviço:', `Honorários contábeis referentes a ${mesRef}`)
    if (!discriminacao || discriminacao.trim().length < 10) {
      alert('A discriminação precisa ter pelo menos 10 caracteres.')
      return
    }

    // Trava extra para produção: emissão real, não é algo pra sair por
    // engano num clique. Homologação continua só com um confirm normal.
    const isProducao = window.confirm(
      `Emitir para ${cliente.nome} em PRODUÇÃO (nota fiscal real, não em teste)?\n\nOK = produção · Cancelar = homologação (teste)`
    )
    if (isProducao) {
      const confirmacao = window.prompt(
        `⚠️ ATENÇÃO: isso vai emitir uma NFS-e REAL de R$ ${valor} para ${cliente.nome} — não é ambiente de teste.\n\nDigite PRODUCAO (sem acento) para confirmar:`
      )
      if (confirmacao !== 'PRODUCAO') {
        alert('Confirmação incorreta — emissão cancelada.')
        return
      }
    } else if (!window.confirm(`Emitir NFS-e de R$ ${valor} para ${cliente.nome}? (ambiente de HOMOLOGAÇÃO — teste)`)) {
      return
    }

    const ambiente = isProducao ? 'producao' : 'homologacao'
    setEmitindoNfse(cliente.id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch('/api/nfse-emitir', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          ambiente,
          clienteId: cliente.id,
          dados: { valorServicos: parseFloat(valor), discriminacao },
        }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Falha ao emitir NFS-e')
      alert(`NFS-e emitida (${ambiente})!\nNúmero: ${data.numero}\nCódigo de verificação: ${data.codigoVerificacao}`)
    } catch (err) {
      alert(err.message)
    } finally {
      setEmitindoNfse(null)
    }
  }

  // O formulário de "Novo cliente" pré-preenche uf='BA' e
  // codigo_municipio_ibge='2910800' (Feira de Santana) como valor
  // padrão da tela. Se ninguém nunca digitou o restante do endereço
  // (logradouro/cep), esse "BA/Feira de Santana" é só o placeholder do
  // formulário salvo sem querer, não um endereço real confirmado.
  function pareceEnderecoPlaceholder(c) {
    return c.uf === 'BA' && c.codigo_municipio_ibge === '2910800' && !c.logradouro && !c.cep
  }

  async function completarEnderecosViaCnpj() {
    const semEndereco = clientes.filter(c =>
      c.cnpj?.replace(/\D/g, '').length === 14 &&
      (!c.uf || !c.codigo_municipio_ibge || pareceEnderecoPlaceholder(c))
    )
    if (semEndereco.length === 0) {
      alert('Todos os clientes com CNPJ já têm estado/cidade preenchidos.')
      return
    }
    if (!confirm(`${semEndereco.length} cliente(s) sem estado/cidade confirmados (inclui quem só tem o "BA/Feira de Santana" padrão do formulário, nunca confirmado). Buscar automaticamente na Receita Federal (BrasilAPI) agora?`)) return

    setAtualizandoEnderecos(true)
    setProgressoEnderecos({ atual: 0, total: semEndereco.length })
    const porLocal = {}
    let atualizados = 0
    const falhas = []

    for (let i = 0; i < semEndereco.length; i++) {
      const cliente = semEndereco[i]
      setProgressoEnderecos({ atual: i + 1, total: semEndereco.length })
      try {
        const cnpjLimpo = cliente.cnpj.replace(/\D/g, '')
        const dados = await buscarCnpjComRetry(cnpjLimpo)
        // Se o endereço atual for só o placeholder do formulário, o
        // valor vindo da Receita Federal manda — não é "manter o que
        // já tinha", porque o que tinha não era um dado real.
        const placeholder = pareceEnderecoPlaceholder(cliente)

        const atualizacao = {
          logradouro: (placeholder ? null : cliente.logradouro) || dados.logradouro || null,
          numero_endereco: (placeholder ? null : cliente.numero_endereco) || dados.numero || null,
          complemento: (placeholder ? null : cliente.complemento) || dados.complemento || null,
          bairro: (placeholder ? null : cliente.bairro) || dados.bairro || null,
          cep: (placeholder ? null : cliente.cep) || dados.cep || null,
          uf: (placeholder ? null : cliente.uf) || dados.uf || null,
          codigo_municipio_ibge: (placeholder ? null : cliente.codigo_municipio_ibge) || (dados.codigo_municipio_ibge != null ? String(dados.codigo_municipio_ibge) : null),
        }

        const { error } = await supabase.from('clientes').update(atualizacao).eq('id', cliente.id)
        if (error) throw error

        atualizados++
        const chave = `${dados.uf || '?'} / ${dados.municipio || '?'}`
        porLocal[chave] = (porLocal[chave] || 0) + 1
      } catch (err) {
        falhas.push(`${cliente.nome}: ${err.message}`)
      }
      await new Promise(r => setTimeout(r, 400)) // não sobrecarregar a API pública
    }

    setAtualizandoEnderecos(false)
    setProgressoEnderecos(null)
    await fetchClientes()

    const resumoLocal = Object.entries(porLocal).sort((a, b) => b[1] - a[1]).map(([local, qtd]) => `${local}: ${qtd}`).join('\n')
    alert(
      `Concluído!\n\n${atualizados} cliente(s) atualizado(s).\n${falhas.length} falha(s).\n\n` +
      (resumoLocal ? `Distribuição encontrada:\n${resumoLocal}` : '') +
      (falhas.length ? `\n\nFalhas:\n${falhas.join('\n')}` : '')
    )
  }

  // Reconfere TODOS os clientes com CNPJ contra a Receita Federal
  // (não só quem está sem endereço) — sinaliza divergência sem
  // sobrescrever nada sozinho, porque o dado atual pode ter sido
  // corrigido manualmente de propósito.
  async function revisarTodosEnderecos() {
    const comCnpj = clientes.filter((c) => c.cnpj?.replace(/\D/g, '').length === 14)
    if (!confirm(`Isso vai reconferir o endereço de todos os ${comCnpj.length} clientes com CNPJ contra a Receita Federal. Pode demorar alguns minutos (limite da API pública). Continuar?`)) return

    setRevisando(true)
    setDivergencias(null)
    const encontradas = []
    const falhas = []

    for (let i = 0; i < comCnpj.length; i++) {
      const cliente = comCnpj[i]
      setProgressoRevisao({ atual: i + 1, total: comCnpj.length })
      try {
        const cnpjLimpo = cliente.cnpj.replace(/\D/g, '')
        const dados = await buscarCnpjComRetry(cnpjLimpo)

        // A BrasilAPI devolve codigo_municipio_ibge como número; o
        // cadastro guarda como texto — sem normalizar pra string dos
        // dois lados, TUDO aparece como divergente mesmo quando é
        // exatamente igual (2910800 número !== "2910800" texto).
        const ufDivergente = dados.uf && cliente.uf !== dados.uf
        const municipioDivergente = dados.codigo_municipio_ibge != null && String(cliente.codigo_municipio_ibge) !== String(dados.codigo_municipio_ibge)
        if (ufDivergente || municipioDivergente) {
          encontradas.push({
            id: cliente.id,
            nome: cliente.nome,
            atual: `${cliente.uf || '—'} / ${cliente.codigo_municipio_ibge || '—'}`,
            correto: `${dados.uf} / ${dados.municipio} (${dados.codigo_municipio_ibge})`,
            atualizacao: {
              uf: dados.uf, codigo_municipio_ibge: String(dados.codigo_municipio_ibge),
              logradouro: dados.logradouro || null, numero_endereco: dados.numero || null,
              complemento: dados.complemento || null, bairro: dados.bairro || null, cep: dados.cep || null,
            },
          })
        }
      } catch (err) {
        falhas.push(`${cliente.nome}: ${err.message}`)
      }
      await new Promise((r) => setTimeout(r, 400))
    }

    setRevisando(false)
    setProgressoRevisao(null)
    setDivergencias(encontradas)
    if (falhas.length) alert(`Revisão concluída, mas ${falhas.length} cliente(s) falharam na consulta:\n${falhas.join('\n')}`)
  }

  async function corrigirDivergencia(divergencia) {
    setCorrigindoId(divergencia.id)
    const { error } = await supabase.from('clientes').update(divergencia.atualizacao).eq('id', divergencia.id)
    setCorrigindoId(null)
    if (error) { alert(`Não foi possível corrigir: ${error.message}`); return }
    setDivergencias((atual) => atual.filter((d) => d.id !== divergencia.id))
    fetchClientes()
  }

  async function verDistribuicao() {
    if (mostrarDistribuicao) { setMostrarDistribuicao(false); return }
    setMostrarDistribuicao(true)
    if (distribuicao) return // já calculado nesta sessão da tela

    const porUf = {}
    const porMunicipioCount = {}
    const semEndereco = []
    for (const c of clientes) {
      if (c.uf) porUf[c.uf] = (porUf[c.uf] || 0) + 1
      if (c.codigo_municipio_ibge) porMunicipioCount[c.codigo_municipio_ibge] = (porMunicipioCount[c.codigo_municipio_ibge] || 0) + 1
      if (!c.uf || !c.codigo_municipio_ibge) semEndereco.push(c.nome)
    }

    const codigos = Object.keys(porMunicipioCount)
    const municipios = await Promise.all(codigos.map(async (codigo) => {
      try {
        const r = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/municipios/${codigo}`)
        const d = await r.json()
        return { codigo, nome: d.nome, uf: d.microrregiao?.mesorregiao?.UF?.sigla || '' }
      } catch {
        return { codigo, nome: `(código ${codigo})`, uf: '' }
      }
    }))

    const porMunicipio = municipios
      .map((m) => ({ ...m, qtd: porMunicipioCount[m.codigo] }))
      .sort((a, b) => b.qtd - a.qtd)

    setDistribuicao({ porUf, porMunicipio, semEndereco })
  }

  const filtrados = clientes.filter(c =>
    c.nome.toLowerCase().includes(busca.toLowerCase()) &&
    (!filtroRegime || c.regime === filtroRegime)
  )

  const fmt = v => 'R$ ' + Number(v).toLocaleString('pt-BR')

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-sm text-gray-500 mt-1">{clientes.length} clientes cadastrados</p>
        </div>
        {isGestor && aba === 'lista' && (
          <div className="flex items-center gap-2">
            <button onClick={verDistribuicao} className="btn-secondary gap-1.5">
              📊 {mostrarDistribuicao ? 'Ocultar' : 'Ver'} distribuição
            </button>
            <button
              onClick={completarEnderecosViaCnpj}
              disabled={atualizandoEnderecos}
              className="btn-secondary gap-1.5"
              title="Busca estado/cidade na Receita Federal para clientes sem esse dado"
            >
              {atualizandoEnderecos
                ? <><Loader2 className="w-4 h-4 animate-spin" /> {progressoEnderecos ? `${progressoEnderecos.atual}/${progressoEnderecos.total}` : '...'}</>
                : <><MapPin className="w-4 h-4" /> Completar endereços</>}
            </button>
            <button
              onClick={revisarTodosEnderecos}
              disabled={revisando}
              className="btn-secondary gap-1.5"
              title="Reconfere TODOS os clientes (não só os vazios) contra a Receita Federal"
            >
              {revisando
                ? <><Loader2 className="w-4 h-4 animate-spin" /> {progressoRevisao ? `${progressoRevisao.atual}/${progressoRevisao.total}` : '...'}</>
                : <>🔍 Revisar todos</>}
            </button>
            <button onClick={abrirNovo} className="btn-primary">
              <Plus className="w-4 h-4" /> Novo cliente
            </button>
          </div>
        )}
      </div>

      {/* Abas: lista (todo mundo já usa) vs mapa (interno — visível só
          pra equipe, nunca aparece no Portal do Cliente, que é uma
          árvore de rotas totalmente separada). */}
      <div className="flex gap-1 mb-5 border-b border-gray-200">
        <button
          onClick={() => setAba('lista')}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${aba === 'lista' ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          <List className="w-4 h-4" /> Lista
        </button>
        <button
          onClick={() => setAba('mapa')}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${aba === 'mapa' ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          <Map className="w-4 h-4" /> Mapa
        </button>
      </div>

      {aba === 'mapa' && <MapaClientes />}

      {aba === 'lista' && <>

      {divergencias && (
        <div className="card p-4 mb-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            {divergencias.length === 0 ? '✅ Nenhuma divergência encontrada' : `⚠️ ${divergencias.length} divergência(s) encontrada(s)`}
          </h3>
          {divergencias.length > 0 && (
            <div className="space-y-2">
              {divergencias.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-3 text-sm border-t border-gray-100 pt-2">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-800 truncate">{d.nome}</div>
                    <div className="text-xs text-gray-500">Cadastrado: {d.atual} · Receita Federal: {d.correto}</div>
                  </div>
                  <button
                    onClick={() => corrigirDivergencia(d)}
                    disabled={corrigindoId === d.id}
                    className="btn-secondary btn-sm flex-shrink-0"
                  >
                    {corrigindoId === d.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Corrigir'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {mostrarDistribuicao && (
        <div className="card p-4 mb-5">
          {!distribuicao ? (
            <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Calculando...</div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Por estado (UF)</h3>
                <div className="space-y-1">
                  {Object.entries(distribuicao.porUf).sort((a, b) => b[1] - a[1]).map(([uf, qtd]) => (
                    <div key={uf} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">{uf}</span>
                      <span className="font-medium text-gray-900">{qtd}</span>
                    </div>
                  ))}
                  {Object.keys(distribuicao.porUf).length === 0 && <p className="text-sm text-gray-400">Nenhum dado ainda</p>}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Por cidade</h3>
                <div className="space-y-1">
                  {distribuicao.porMunicipio.map((m) => (
                    <div key={m.codigo} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">{m.nome}{m.uf ? ` — ${m.uf}` : ''}</span>
                      <span className="font-medium text-gray-900">{m.qtd}</span>
                    </div>
                  ))}
                  {distribuicao.porMunicipio.length === 0 && <p className="text-sm text-gray-400">Nenhum dado ainda</p>}
                </div>
              </div>
              {distribuicao.semEndereco.length > 0 && (
                <div className="sm:col-span-2 pt-3 border-t border-gray-100">
                  <p className="text-xs text-amber-700">
                    {distribuicao.semEndereco.length} cliente(s) ainda sem estado/cidade: {distribuicao.semEndereco.join(', ')}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9" placeholder="Buscar cliente..." value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <select className="select w-auto" value={filtroRegime} onChange={e => setFiltroRegime(e.target.value)}>
          <option value="">Todos os regimes</option>
          {REGIMES.map(r => <option key={r}>{r}</option>)}
        </select>
      </div>

      {/* Tabela */}
      <div className="table-container">
        {loading ? (
          <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>
        ) : (
          <table className="table">
            <thead><tr>
              <th>Cliente</th><th>Regime</th><th>Tipo</th>
              <th>Honorário</th><th>Venc.</th><th>Obrigações</th><th>Ações</th>
            </tr></thead>
            <tbody>
              {filtrados.map(c => (
                <tr key={c.id}>
                  <td>
                    <div className="font-medium text-gray-900">{c.nome}</div>
                    {c.email && <div className="text-xs text-gray-500">{c.email}</div>}
                  </td>
                  <td>{c.regime || '—'}</td>
                  <td>
                    <span className={c.tipo === 'recorrente' ? 'badge-blue' : 'badge-gray'}>
                      {c.tipo === 'recorrente' ? 'Recorrente' : 'Temporário'}
                    </span>
                  </td>
                  <td className="font-medium">{c.valor_honorario ? fmt(c.valor_honorario) : '—'}</td>
                  <td>{c.dia_vencimento ? `Dia ${c.dia_vencimento}` : '—'}</td>
                  <td>
                    {(c.obrigacoes || []).length > 0
                      ? <span className="badge-blue">{c.obrigacoes.length} obrigação{c.obrigacoes.length > 1 ? 'ões' : ''}</span>
                      : <span className="text-gray-400 text-xs">Nenhuma</span>}
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      {isGestor && <>
                        <button onClick={() => abrirEditar(c)} className="btn-ghost btn-sm p-1.5"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => remover(c.id)} className="btn-ghost btn-sm p-1.5 text-red-500 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                        {c.auth_user_id && (
                          <span className="text-green-600" title="Já tem acesso ao Portal do Cliente">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </span>
                        )}
                        <button
                          onClick={() => convidarPortal(c)}
                          disabled={convidando === c.id}
                          className="btn-ghost btn-sm p-1.5 text-brand-600 hover:bg-brand-50"
                          title={c.auth_user_id ? 'Reenviar link de acesso ao Portal' : 'Convidar para o Portal do Cliente'}
                        >
                          {convidando === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => emitirNfseCliente(c)}
                          disabled={emitindoNfse === c.id}
                          className="btn-ghost btn-sm p-1.5 text-brand-600 hover:bg-brand-50"
                          title="Emitir NFS-e (homologação)"
                        >
                          {emitindoNfse === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSignature className="w-3.5 h-3.5" />}
                        </button>
                      </>}
                    </div>
                  </td>
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr><td colSpan={7} className="text-center py-10 text-gray-500">Nenhum cliente encontrado</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      </>}

      {/* Modal */}
      {modalOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="modal">
            <div className="modal-header">
              <h2 className="text-lg font-semibold text-gray-900">{editId ? 'Editar cliente' : 'Novo cliente'}</h2>
              <button onClick={() => setModalOpen(false)} className="btn-ghost p-2"><X className="w-5 h-5" /></button>
            </div>
            <div className="modal-body space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="form-group col-span-2">
                  <label className="form-label">Nome / Razão social *</label>
                  <input className="input" value={form.nome} onChange={e => setForm(f => ({...f, nome: e.target.value}))} placeholder="Nome completo ou razão social" />
                </div>
                <div className="form-group">
                  <label className="form-label">CNPJ / CPF</label>
                  <div className="flex gap-1.5">
                    <input className="input" value={form.cnpj} onChange={e => setForm(f => ({...f, cnpj: e.target.value}))} placeholder="00.000.000/0001-00" />
                    <button
                      type="button"
                      onClick={buscarCnpj}
                      disabled={buscandoCnpj || !form.cnpj}
                      className="btn-secondary px-2.5 flex-shrink-0"
                      title="Buscar dados na Receita Federal (só CNPJ)"
                    >
                      {buscandoCnpj ? <Loader2 className="w-4 h-4 animate-spin" /> : <SearchCheck className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Regime tributário</label>
                  <select className="select" value={form.regime} onChange={e => setForm(f => ({...f, regime: e.target.value}))}>
                    <option value="">Selecione...</option>
                    {REGIMES.map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Honorário mensal (R$)</label>
                  <input type="number" className="input" value={form.valor_honorario} onChange={e => setForm(f => ({...f, valor_honorario: e.target.value}))} placeholder="0,00" />
                </div>
                <div className="form-group">
                  <label className="form-label">Dia de vencimento</label>
                  <input type="number" min={1} max={31} className="input" value={form.dia_vencimento} onChange={e => setForm(f => ({...f, dia_vencimento: e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Cobrar honorário a partir de (opcional)</label>
                  <input type="date" className="input" value={form.honorario_inicio} onChange={e => setForm(f => ({...f, honorario_inicio: e.target.value}))} />
                  <p className="text-xs text-gray-500 mt-1">Meses antes desta data não aparecem em Honorários (nem pendente, nem atraso). Deixe em branco pra valer desde sempre.</p>
                </div>
                <div className="form-group">
                  <label className="form-label">WhatsApp / Telefone</label>
                  <input className="input" value={form.telefone} onChange={e => setForm(f => ({...f, telefone: e.target.value}))} placeholder="(75) 99999-0000" />
                </div>
                <div className="form-group">
                  <label className="form-label">E-mail principal</label>
                  <input type="email" className="input" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} placeholder="contato@empresa.com.br" />
                </div>
                <div className="form-group">
                  <label className="form-label">E-mail secundário</label>
                  <input type="email" className="input" value={form.email2} onChange={e => setForm(f => ({...f, email2: e.target.value}))} placeholder="financeiro@empresa.com.br" />
                </div>
                <div className="form-group">
                  <label className="form-label">Tipo de cliente</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setForm(f => ({...f, tipo: 'recorrente'}))}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-all ${form.tipo === 'recorrente' ? 'bg-brand-50 text-brand-700 border-brand-300' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                      ↻ Recorrente
                    </button>
                    <button type="button" onClick={() => setForm(f => ({...f, tipo: 'temporario'}))}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-all ${form.tipo === 'temporario' ? 'bg-gray-100 text-gray-800 border-gray-400' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                      ⏱ Temporário
                    </button>
                  </div>
                </div>
              </div>

              {/* Endereço */}
              <div className="border-t border-gray-100 pt-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Endereço (necessário para emitir NFS-e)</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="form-group col-span-2">
                    <label className="form-label">Logradouro</label>
                    <input className="input" value={form.logradouro} onChange={e => setForm(f => ({...f, logradouro: e.target.value}))} placeholder="Rua/Avenida" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Número</label>
                    <input className="input" value={form.numero_endereco} onChange={e => setForm(f => ({...f, numero_endereco: e.target.value}))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Complemento</label>
                    <input className="input" value={form.complemento} onChange={e => setForm(f => ({...f, complemento: e.target.value}))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Bairro</label>
                    <input className="input" value={form.bairro} onChange={e => setForm(f => ({...f, bairro: e.target.value}))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">CEP</label>
                    <input className="input" value={form.cep} onChange={e => setForm(f => ({...f, cep: e.target.value}))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">UF</label>
                    <input className="input" value={form.uf} maxLength={2} onChange={e => setForm(f => ({...f, uf: e.target.value.toUpperCase()}))} />
                  </div>
                </div>
              </div>

              {/* Obrigações */}
              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">Obrigações fiscais vinculadas</h3>
                  <button type="button" onClick={sugerirObrigacoes} className="btn-secondary btn-sm gap-1.5">
                    <Wand2 className="w-3.5 h-3.5" /> Sugerir pelo regime
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                  {OBR_CATALOG.map(o => {
                    const sel = obrSel[o.id]?.sel || false
                    const resp = obrSel[o.id]?.resp || colabs[0] || ''
                    return (
                      <div key={o.id} className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all ${sel ? 'bg-brand-50 border-brand-300' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'}`}>
                        <input type="checkbox" checked={sel} onChange={() => toggleObr(o.id)} className="w-4 h-4 accent-brand-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0" onClick={() => toggleObr(o.id)}>
                          <div className="text-xs font-medium text-gray-900 truncate">{o.nome}</div>
                          <div className="text-xs text-gray-500">Dia {o.dia}</div>
                        </div>
                        {sel && (
                          <select className="text-xs border border-gray-300 rounded px-1 py-0.5 w-16 flex-shrink-0" value={resp} onChange={e => { e.stopPropagation(); setObrResp(o.id, e.target.value) }}>
                            {colabs.map(c => <option key={c}>{c}</option>)}
                          </select>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setModalOpen(false)} className="btn-secondary">Cancelar</button>
              <button onClick={salvar} disabled={saving} className="btn-primary">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Salvando...' : 'Salvar cliente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
