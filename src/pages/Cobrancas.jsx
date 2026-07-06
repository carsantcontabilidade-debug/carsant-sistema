import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const STATUS_INFO = {
  pendente:  { label: "Pendente",   cor: "bg-gray-100 text-gray-600" },
  gerada:    { label: "Gerada",     cor: "bg-blue-100 text-blue-700" },
  paga:      { label: "Paga",       cor: "bg-green-100 text-green-700" },
  cancelada: { label: "Cancelada",  cor: "bg-red-100 text-red-700" },
  vencida:   { label: "Vencida",    cor: "bg-orange-100 text-orange-700" },
  erro:      { label: "Erro",       cor: "bg-red-100 text-red-600" },
};

function formatarValor(v) {
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(d) {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("pt-BR");
}

async function chamarEdgeFunction(action, payload) {
  const resp = await fetch(`/api/inter-cobranca`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, payload }),
  });
  const data = await resp.json();
  if (data.error) throw new Error(data.error);
  return data;
}

export default function Cobrancas() {
  const { profile } = useAuth();
  const [clientes, setClientes] = useState([]);
  const [cobrancas, setCobrancas] = useState([]);
  const [clienteSelecionado, setClienteSelecionado] = useState(null);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [loadingClientes, setLoadingClientes] = useState(true);
  const [loadingCobrancas, setLoadingCobrancas] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [modalTipo, setModalTipo] = useState("nova"); // nova | detalhe
  const [cobrancaAtual, setCobrancaAtual] = useState(null);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const [form, setForm] = useState({
    cliente_id: "",
    descricao: "",
    valor: "",
    vencimento: "",
    tipo: "honorario",
    mes_referencia: "",
    enviar_email: false,
    enviar_whatsapp: false,
  });
  const [clienteForm, setClienteForm] = useState(null);

  useEffect(() => { carregarClientes(); }, []);
  useEffect(() => { carregarCobrancas(); }, [clienteSelecionado, filtroStatus]);

  async function carregarClientes() {
    setLoadingClientes(true);
    const { data } = await supabase.from("clientes").select("*").order("nome");
    setClientes(data || []);
    setLoadingClientes(false);
  }

  async function carregarCobrancas() {
    setLoadingCobrancas(true);
    let query = supabase
      .from("cobrancas")
      .select("*, clientes(nome, telefone, email), profiles(nome)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (clienteSelecionado) query = query.eq("cliente_id", clienteSelecionado.id);
    if (filtroStatus !== "todos") query = query.eq("status", filtroStatus);
    const { data } = await query;
    setCobrancas(data || []);
    setLoadingCobrancas(false);
  }

  function abrirNovaCobranca(clientePre = null) {
    const hoje = new Date();
    const vencimento = new Date(hoje.getFullYear(), hoje.getMonth(), clientePre?.dia_vencimento || 10);
    if (vencimento < hoje) vencimento.setMonth(vencimento.getMonth() + 1);
    const mesRef = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;

    setForm({
      cliente_id: clientePre?.id || "",
      descricao: clientePre ? `Honorários Contábeis — ${mesRef.replace("-", "/")}` : "",
      valor: clientePre?.["valor_honorario"] ? String(clientePre["valor_honorario"]) : "",
      vencimento: vencimento.toISOString().split("T")[0],
      tipo: "honorario",
      mes_referencia: mesRef,
      enviar_email: false,
      enviar_whatsapp: false,
    });
    setClienteForm(clientePre);
    setErro("");
    setSucesso("");
    setModalTipo("nova");
    setModalAberto(true);
  }

  function onChangeCliente(clienteId) {
    const c = clientes.find(x => x.id === clienteId);
    setClienteForm(c || null);
    if (c) {
      const hoje = new Date();
      const vencimento = new Date(hoje.getFullYear(), hoje.getMonth(), c.dia_vencimento || 10);
      if (vencimento < hoje) vencimento.setMonth(vencimento.getMonth() + 1);
      const mesRef = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
      setForm(f => ({
        ...f,
        cliente_id: clienteId,
        descricao: `Honorários Contábeis — ${mesRef.replace("-", "/")}`,
        valor: c["valor_honorario"] ? String(c["valor_honorario"]) : "",
        vencimento: vencimento.toISOString().split("T")[0],
        mes_referencia: mesRef,
      }));
    } else {
      setForm(f => ({ ...f, cliente_id: clienteId }));
    }
  }

  async function gerarCobranca() {
    if (!form.cliente_id || !form.valor || !form.vencimento || !form.descricao) {
      setErro("Preencha todos os campos obrigatórios.");
      return;
    }
    setProcessando(true);
    setErro("");
    setSucesso("");

    try {
      // 1. Salvar no banco com status pendente
      const { data: cobSalva, error: errSalvar } = await supabase.from("cobrancas").insert({
        cliente_id: form.cliente_id,
        descricao: form.descricao,
        valor: parseFloat(form.valor.replace(",", ".")),
        vencimento: form.vencimento,
        tipo: form.tipo,
        mes_referencia: form.tipo === "honorario" ? form.mes_referencia : null,
        status: "pendente",
        responsavel_id: profile?.id,
      }).select().single();

      if (errSalvar) throw new Error(errSalvar.message);

      // 2. Chamar Edge Function para gerar no Banco Inter
      const payloadInter = {
        pagador: {
          cpfCnpj: clienteForm?.cnpj?.replace(/\D/g, "") || "00000000000000",
          tipoPessoa: "JURIDICA",
          nome: clienteForm?.nome,
          email: clienteForm?.["email"] || clienteForm?.email2 || "",
          endereco: "Feira de Santana",
          cidade: "Feira de Santana",
          uf: "BA",
          cep: "44000000",
          numero: "S/N",
          bairro: "Centro",
        },
        mensagem: { linha1: form.descricao, linha2: "CARSANT Contabilidade", linha3: "Feira de Santana, BA" },
        dataVencimento: form.vencimento,
        valorNominal: parseFloat(form.valor.replace(",", ".")),
        numDiasAgenda: 60,
        seuNumero: cobSalva.id.substring(0, 8).toUpperCase(),
      };

      const resultado = await chamarEdgeFunction("criar_cobranca", payloadInter);

      // 3. Atualizar banco com dados do Inter
      await supabase.from("cobrancas").update({
        status: "gerada",
        codigo_solicitacao: resultado.codigoSolicitacao,
        nosso_numero: resultado.nossoNumero,
        codigo_barras: resultado.codigoBarras,
        linha_digitavel: resultado.linhaDigitavel,
        pix_copia_cola: resultado.pixCopiaECola,
        link_boleto: resultado.linkVisualizacaoBoleto,
      }).eq("id", cobSalva.id);

      setSucesso("Cobrança gerada com sucesso!");
      setModalAberto(false);
      carregarCobrancas();

      // 4. Abrir detalhes automaticamente
      setTimeout(() => {
        setCobrancaAtual({ ...cobSalva, ...resultado, status: "gerada", clientes: clienteForm });
        setModalTipo("detalhe");
        setModalAberto(true);
      }, 300);

    } catch (e) {
      console.error(e);
      setErro(`Erro: ${e.message}`);
    }
    setProcessando(false);
  }

  async function atualizarStatus(cobranca) {
    if (!cobranca.codigo_solicitacao) return;
    setProcessando(true);
    try {
      const resultado = await chamarEdgeFunction("consultar_cobranca", {
        codigoSolicitacao: cobranca.codigo_solicitacao,
      });
      const novoStatus = resultado.situacao === "PAGO" ? "paga"
        : resultado.situacao === "CANCELADO" ? "cancelada"
        : resultado.situacao === "VENCIDO" ? "vencida"
        : "gerada";
      await supabase.from("cobrancas").update({
        status: novoStatus,
        paga_em: resultado.situacao === "PAGO" ? new Date().toISOString() : null,
      }).eq("id", cobranca.id);
      carregarCobrancas();
      setSucesso("Status atualizado!");
    } catch (e) {
      setErro(`Erro ao atualizar: ${e.message}`);
    }
    setProcessando(false);
  }

  async function cancelarCobranca(cobranca) {
    if (!confirm("Confirmar cancelamento desta cobrança?")) return;
    setProcessando(true);
    try {
      await chamarEdgeFunction("cancelar_cobranca", {
        codigoSolicitacao: cobranca.codigo_solicitacao,
        motivo: "ACERTOS",
      });
      await supabase.from("cobrancas").update({
        status: "cancelada",
        cancelada_em: new Date().toISOString(),
        motivo_cancelamento: "Cancelado pelo escritório",
      }).eq("id", cobranca.id);
      setModalAberto(false);
      carregarCobrancas();
      setSucesso("Cobrança cancelada.");
    } catch (e) {
      setErro(`Erro ao cancelar: ${e.message}`);
    }
    setProcessando(false);
  }

  function abrirDetalhe(cob) {
    setCobrancaAtual(cob);
    setModalTipo("detalhe");
    setErro("");
    setSucesso("");
    setModalAberto(true);
  }

  function copiarTexto(texto) {
    navigator.clipboard.writeText(texto);
    setSucesso("Copiado!");
    setTimeout(() => setSucesso(""), 2000);
  }

  function abrirWhatsApp(cob) {
    const tel = cob.clientes?.telefone?.replace(/\D/g, "");
    if (!tel) return;
    const msg = `Olá! Segue a cobrança referente a ${cob.descricao}.\n\nValor: ${formatarValor(cob.valor)}\nVencimento: ${formatarData(cob.vencimento)}\n\n${cob.pix_copia_cola ? `Pix Copia e Cola:\n${cob.pix_copia_cola}\n\n` : ""}${cob.link_boleto ? `Boleto: ${cob.link_boleto}` : ""}`;
    window.open(`https://wa.me/55${tel}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  async function abrirEmail(cob) {
    const email = cob.clientes?.["email"] || "";
    if (!email) return;
    const assunto = `CARSANT Contabilidade — ${cob.descricao}`;
    const corpo = `Prezado(a) ${cob.clientes?.nome},\n\nSegue a cobrança referente a ${cob.descricao}.\n\nValor: ${formatarValor(cob.valor)}\nVencimento: ${formatarData(cob.vencimento)}\n\n${cob.pix_copia_cola ? `Pix Copia e Cola:\n${cob.pix_copia_cola}\n\n` : ""}${cob.link_boleto ? `Boleto para visualização/impressão:\n${cob.link_boleto}\n\n` : ""}Em caso de dúvidas, entre em contato.\n\nAtenciosamente,\nEquipe CARSANT Contabilidade\nFeira de Santana, BA`;

    setErro("");
    setSucesso("");
    setProcessando(true);
    try {
      const resp = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: email, subject: assunto, text: corpo }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.detail || data.error || "Falha ao enviar e-mail");
      }
      setSucesso(`E-mail enviado para ${email}`);
      setTimeout(() => setSucesso(""), 4000);
    } catch (e) {
      setErro(`Erro ao enviar e-mail: ${e.message}`);
    }
    setProcessando(false);
  }

  // Totais
  const totalGeradas = cobrancas.filter(c => c.status === "gerada").reduce((s, c) => s + Number(c.valor), 0);
  const totalPagas = cobrancas.filter(c => c.status === "paga").reduce((s, c) => s + Number(c.valor), 0);
  const totalVencidas = cobrancas.filter(c => c.status === "vencida").reduce((s, c) => s + Number(c.valor), 0);

  const clientesFiltrados = clientes.filter(c => c.nome.toLowerCase().includes(busca.toLowerCase()));

  return (
    <div className="flex h-full min-h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-72 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-800 text-lg">🏦 Cobranças</h2>
            <button onClick={() => abrirNovaCobranca()} className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-blue-700 font-medium">
              + Nova
            </button>
          </div>
          <input
            type="text"
            placeholder="Buscar cliente..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          onClick={() => setClienteSelecionado(null)}
          className={`w-full text-left px-4 py-3 text-sm border-b border-gray-100 flex items-center gap-2 ${!clienteSelecionado ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-600 hover:bg-gray-50"}`}
        >
          <span className="text-lg">📋</span> Todas as cobranças
        </button>

        <div className="flex-1 overflow-y-auto">
          {loadingClientes ? (
            <div className="p-4 text-sm text-gray-400 text-center">Carregando...</div>
          ) : clientesFiltrados.map(c => (
            <button
              key={c.id}
              onClick={() => setClienteSelecionado(c)}
              className={`w-full text-left px-4 py-3 border-b border-gray-50 transition-colors ${clienteSelecionado?.id === c.id ? "bg-blue-50 border-l-2 border-l-blue-500" : "hover:bg-gray-50"}`}
            >
              <div className="font-medium text-sm text-gray-800 truncate">{c.nome}</div>
              <div className="text-xs text-gray-400 mt-0.5">{c.regime}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Área principal */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="font-bold text-gray-800 text-xl">
                {clienteSelecionado ? clienteSelecionado.nome : "Todas as cobranças"}
              </h1>
              {clienteSelecionado && (
                <p className="text-sm text-gray-400 mt-0.5">
                  {clienteSelecionado.telefone && `📱 ${clienteSelecionado.telefone}`}
                  {clienteSelecionado["email"] && ` · ✉️ ${clienteSelecionado["email"]}`}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="todos">Todos os status</option>
                <option value="pendente">Pendente</option>
                <option value="gerada">Gerada</option>
                <option value="paga">Paga</option>
                <option value="vencida">Vencida</option>
                <option value="cancelada">Cancelada</option>
              </select>
              {clienteSelecionado && (
                <button onClick={() => abrirNovaCobranca(clienteSelecionado)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                  + Nova cobrança
                </button>
              )}
            </div>
          </div>

          {/* Totalizadores */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
              <div className="text-xs text-blue-600 font-medium">Em aberto</div>
              <div className="text-lg font-bold text-blue-700">{formatarValor(totalGeradas)}</div>
            </div>
            <div className="bg-green-50 rounded-xl p-3 border border-green-100">
              <div className="text-xs text-green-600 font-medium">Recebido</div>
              <div className="text-lg font-bold text-green-700">{formatarValor(totalPagas)}</div>
            </div>
            <div className="bg-orange-50 rounded-xl p-3 border border-orange-100">
              <div className="text-xs text-orange-600 font-medium">Vencidas</div>
              <div className="text-lg font-bold text-orange-700">{formatarValor(totalVencidas)}</div>
            </div>
          </div>
        </div>

        {/* Alertas */}
        {sucesso && <div className="mx-6 mt-4 bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-lg text-sm">{sucesso}</div>}
        {erro && <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{erro}</div>}

        {/* Lista */}
        <div className="flex-1 overflow-y-auto p-6">
          {loadingCobrancas ? (
            <div className="text-center py-10 text-gray-400">Carregando...</div>
          ) : cobrancas.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-5xl mb-4">🏦</div>
              <p className="text-gray-500 font-medium">Nenhuma cobrança registrada</p>
              <p className="text-gray-400 text-sm mt-1">Clique em "+ Nova" para gerar a primeira cobrança</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cobrancas.map(cob => (
                <div key={cob.id} onClick={() => abrirDetalhe(cob)} className="bg-white rounded-xl border border-gray-200 p-4 cursor-pointer hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="text-2xl">🧾</div>
                      <div className="flex-1 min-w-0">
                        {!clienteSelecionado && <div className="font-semibold text-gray-800 text-sm">{cob.clientes?.nome}</div>}
                        <div className="text-sm text-gray-700 font-medium">{cob.descricao}</div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                          <span>Venc: {formatarData(cob.vencimento)}</span>
                          {cob.codigo_solicitacao && <span>Inter: {cob.codigo_solicitacao.substring(0, 8)}...</span>}
                          {cob.profiles?.nome && <span>por {cob.profiles.nome}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <div className="font-bold text-gray-800">{formatarValor(cob.valor)}</div>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_INFO[cob.status]?.cor || "bg-gray-100 text-gray-600"}`}>
                        {STATUS_INFO[cob.status]?.label || cob.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

            {/* Modal Detalhe */}
            {modalTipo === "detalhe" && cobrancaAtual && (
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-gray-800">🧾 Detalhe da Cobrança</h2>
                  <button onClick={() => setModalAberto(false)} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div><label className="text-xs text-gray-500 uppercase">Cliente</label><p className="font-medium mt-1">{cobrancaAtual.clientes?.nome}</p></div>
                  <div><label className="text-xs text-gray-500 uppercase">Status</label><p className="mt-1"><span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_INFO[cobrancaAtual.status]?.cor}`}>{STATUS_INFO[cobrancaAtual.status]?.label}</span></p></div>
                  <div><label className="text-xs text-gray-500 uppercase">Valor</label><p className="font-bold text-lg text-gray-800 mt-1">{formatarValor(cobrancaAtual.valor)}</p></div>
                  <div><label className="text-xs text-gray-500 uppercase">Vencimento</label><p className="font-medium mt-1">{formatarData(cobrancaAtual.vencimento)}</p></div>
                  <div className="col-span-2"><label className="text-xs text-gray-500 uppercase">Descrição</label><p className="font-medium mt-1">{cobrancaAtual.descricao}</p></div>
                </div>

                {/* Dados bancários */}
                {cobrancaAtual.codigo_solicitacao && (
                  <div className="space-y-3 border-t border-gray-100 pt-4">
                    {cobrancaAtual.pix_copia_cola && (
                      <div>
                        <label className="text-xs text-gray-500 uppercase">Pix Copia e Cola</label>
                        <div className="flex items-center gap-2 mt-1">
                          <input readOnly value={cobrancaAtual.pix_copia_cola} className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono" />
                          <button onClick={() => copiarTexto(cobrancaAtual.pix_copia_cola)} className="bg-green-500 text-white px-3 py-2 rounded-lg text-xs hover:bg-green-600">Copiar</button>
                        </div>
                      </div>
                    )}
                    {cobrancaAtual.linha_digitavel && (
                      <div>
                        <label className="text-xs text-gray-500 uppercase">Linha Digitável</label>
                        <div className="flex items-center gap-2 mt-1">
                          <input readOnly value={cobrancaAtual.linha_digitavel} className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono" />
                          <button onClick={() => copiarTexto(cobrancaAtual.linha_digitavel)} className="bg-blue-500 text-white px-3 py-2 rounded-lg text-xs hover:bg-blue-600">Copiar</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Ações */}
                <div className="flex flex-wrap gap-2 mt-6 pt-4 border-t border-gray-100">
                  {cobrancaAtual.link_boleto && (
                    <a href={cobrancaAtual.link_boleto} target="_blank" rel="noreferrer" className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700">
                      🖨️ Ver boleto
                    </a>
                  )}
                  {cobrancaAtual.clientes?.telefone && cobrancaAtual.status === "gerada" && (
                    <button onClick={() => abrirWhatsApp(cobrancaAtual)} className="bg-green-500 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-green-600">
                      📱 Enviar WhatsApp
                    </button>
                  )}
                  {cobrancaAtual.clientes?.["email"] && cobrancaAtual.status === "gerada" && (
                    <button onClick={() => abrirEmail(cobrancaAtual)} className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-indigo-700">
                      ✉️ Enviar E-mail
                    </button>
                  )}
                  {cobrancaAtual.codigo_solicitacao && cobrancaAtual.status === "gerada" && (
                    <button onClick={() => atualizarStatus(cobrancaAtual)} disabled={processando} className="border border-gray-300 text-gray-600 px-4 py-2 rounded-xl text-sm hover:bg-gray-50 disabled:opacity-50">
                      🔄 Atualizar status
                    </button>
                  )}
                  {cobrancaAtual.codigo_solicitacao && cobrancaAtual.status === "gerada" && (
                    <button onClick={() => cancelarCobranca(cobrancaAtual)} disabled={processando} className="border border-red-200 text-red-600 px-4 py-2 rounded-xl text-sm hover:bg-red-50 disabled:opacity-50">
                      ❌ Cancelar
                    </button>
                  )}
                  <button onClick={() => setModalAberto(false)} className="text-gray-400 px-4 py-2 rounded-xl text-sm hover:bg-gray-50">Fechar</button>
                </div>
                {erro && <p className="text-red-500 text-xs mt-3">{erro}</p>}
                {sucesso && <p className="text-green-600 text-xs mt-3">{sucesso}</p>}
              </div>
            )}

            {/* Modal Nova Cobrança */}
            {modalTipo === "nova" && (
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-gray-800">Nova Cobrança</h2>
                  <button onClick={() => setModalAberto(false)} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
                </div>

                <div className="space-y-4">
                  {/* Tipo */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Tipo</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[["honorario","💰 Honorário Mensal"], ["avulsa","📄 Cobrança Avulsa"]].map(([val, label]) => (
                        <button key={val} onClick={() => setForm(f => ({ ...f, tipo: val }))}
                          className={`p-3 rounded-xl border-2 text-sm font-medium transition-all ${form.tipo === val ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Cliente */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cliente *</label>
                    <select value={form.cliente_id} onChange={e => onChangeCliente(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">Selecione o cliente...</option>
                      {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                    {clienteForm && (
                      <div className="mt-1 text-xs text-gray-400 flex gap-3">
                        {clienteForm.cnpj && <span>CNPJ: {clienteForm.cnpj}</span>}
                        {clienteForm["valor_honorario"] && <span>Honorário: {formatarValor(clienteForm["valor_honorario"])}</span>}
                      </div>
                    )}
                  </div>

                  {/* Descrição */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Descrição *</label>
                    <input type="text" value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                      placeholder="Ex: Honorários Contábeis — Junho/2026"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>

                  {/* Valor e Vencimento */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$) *</label>
                      <input type="number" step="0.01" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
                        placeholder="0,00"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Vencimento *</label>
                      <input type="date" value={form.vencimento} onChange={e => setForm(f => ({ ...f, vencimento: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>

                  {/* Mês referência (honorário) */}
                  {form.tipo === "honorario" && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Mês de referência</label>
                      <input type="month" value={form.mes_referencia} onChange={e => setForm(f => ({ ...f, mes_referencia: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  )}

                  {erro && <p className="text-red-500 text-sm">{erro}</p>}
                </div>

                <div className="flex gap-3 mt-6 pt-4 border-t border-gray-100">
                  <button onClick={gerarCobranca} disabled={processando}
                    className="flex-1 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                    {processando ? <><span className="animate-spin">⚙️</span> Gerando...</> : "🏦 Gerar no Banco Inter"}
                  </button>
                  <button onClick={() => setModalAberto(false)} className="text-gray-400 px-4 py-2.5 rounded-xl text-sm hover:bg-gray-50">Cancelar</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}





