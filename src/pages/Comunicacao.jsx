import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import {
  gerarMensagemWhatsApp,
  gerarCorpoEmail,
  TEMPLATES,
  CANAIS,
  formatarTelefone,
} from "../lib/comunicacao";

const STATUS_CORES = {
  enviado: "bg-green-100 text-green-700",
  pendente: "bg-yellow-100 text-yellow-700",
  registrado: "bg-blue-100 text-blue-700",
};

const CANAL_ICONES = {
  whatsapp: "📱",
  email: "✉️",
  telefone: "📞",
  presencial: "🤝",
};

export default function Comunicacao() {
  const { profile } = useAuth();
  const [clientes, setClientes] = useState([]);
  const [comunicacoes, setComunicacoes] = useState([]);
  const [clienteSelecionado, setClienteSelecionado] = useState(null);
  const [busca, setBusca] = useState("");
  const [filtroCanal, setFiltroCanal] = useState("todos");
  const [modalAberto, setModalAberto] = useState(false);
  const [modalTipo, setModalTipo] = useState("nova");
  const [comunicacaoAtual, setComunicacaoAtual] = useState(null);
  const [loadingClientes, setLoadingClientes] = useState(true);
  const [loadingComms, setLoadingComms] = useState(false);

  const [clienteForm, setClienteForm] = useState(null);

  const [form, setForm] = useState({
    cliente_id: "",
    canal: "whatsapp",
    template: "",
    mensagem: "",
    assunto: "",
    proximo_passo: "",
  });

  useEffect(() => {
    carregarClientes();
  }, []);

  useEffect(() => {
    carregarComunicacoes(clienteSelecionado?.id || null);
  }, [clienteSelecionado, filtroCanal]);

  async function carregarClientes() {
    setLoadingClientes(true);
    const { data, error } = await supabase
      .from("clientes")
      .select('*')
      .order("nome");
    if (error) console.error("Erro ao carregar clientes:", error);
    setClientes(data || []);
    setLoadingClientes(false);
  }

  async function carregarComunicacoes(clienteId) {
    setLoadingComms(true);
    let query = supabase
      .from("comunicacoes")
      .select("*, clientes(*), profiles(nome)")
      .order("created_at", { ascending: false })
      .limit(100);

    if (clienteId) query = query.eq("cliente_id", clienteId);
    if (filtroCanal !== "todos") query = query.eq("canal", filtroCanal);

    const { data, error } = await query;
    if (error) console.error("Erro ao carregar comunicações:", error);
    setComunicacoes(data || []);
    setLoadingComms(false);
  }

  function getEmail(cliente) {
    return cliente?.["e-mail"] || cliente?.email2 || "";
  }

  function abrirNovaComm(clientePreSelecionado = null) {
    setForm({ cliente_id: clientePreSelecionado?.id || "", canal: "whatsapp", template: "", mensagem: "", assunto: "", proximo_passo: "" });
    setClienteForm(clientePreSelecionado || null);
    setModalTipo("nova");
    setModalAberto(true);
  }

  function onChangeCliente(clienteId) {
    const c = clientes.find((x) => x.id === clienteId);
    setClienteForm(c || null);
    setForm((f) => ({ ...f, cliente_id: clienteId, mensagem: "", template: "" }));
  }

  function onChangeTemplate(templateKey) {
    setForm((f) => ({ ...f, template: templateKey, mensagem: "" }));
  }

  function gerarMensagemComIA() {
    if (!form.template || !clienteForm) return;
    const template = TEMPLATES[form.template];
    if (!template?.gerar) return;
    const texto = template.gerar(clienteForm, form.canal);
    setForm((f) => ({ ...f, mensagem: texto }));
  }

  async function enviarWhatsApp() {
    if (!clienteForm?.telefone || !form.mensagem) return;
    const link = `https://wa.me/55${formatarTelefone(clienteForm.telefone)}?text=${encodeURIComponent(form.mensagem)}`;
    window.open(link, "_blank");
    await registrarComunicacao("enviado");
  }

  async function abrirEmail() {
    const emailCliente = getEmail(clienteForm);
    if (!emailCliente || !form.mensagem) return;
    const assunto = form.assunto || TEMPLATES[form.template]?.assuntoPadrao || "CARSANT Contabilidade";
    const mailto = `mailto:${emailCliente}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(form.mensagem)}`;
    window.location.href = mailto;
    await registrarComunicacao("enviado");
  }

  async function registrarComunicacao(status = "registrado") {
    if (!form.cliente_id || !form.mensagem) return;
    const { error } = await supabase.from("comunicacoes").insert({
      cliente_id: form.cliente_id,
      canal: form.canal,
      template: form.template || null,
      assunto: form.assunto || null,
      mensagem: form.mensagem,
      proximo_passo: form.proximo_passo || null,
      status,
      responsavel_id: profile?.id,
    });
    if (!error) {
      setModalAberto(false);
      carregarComunicacoes(clienteSelecionado?.id || null);
    } else {
      console.error("Erro ao registrar:", error);
    }
  }

  function visualizarComm(comm) {
    setComunicacaoAtual(comm);
    setModalTipo("visualizar");
    setModalAberto(true);
  }

  const clientesFiltrados = clientes.filter((c) =>
    c.nome.toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <div className="flex h-full min-h-screen bg-gray-50">
      {/* Sidebar clientes */}
      <div className="w-72 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-800 text-lg">💬 Comunicação</h2>
            <button onClick={() => abrirNovaComm()} className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-blue-700 font-medium">
              + Nova
            </button>
          </div>
          <input
            type="text"
            placeholder="Buscar cliente..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          onClick={() => setClienteSelecionado(null)}
          className={`w-full text-left px-4 py-3 text-sm border-b border-gray-100 flex items-center gap-2 transition-colors ${!clienteSelecionado ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-600 hover:bg-gray-50"}`}
        >
          <span className="text-lg">📋</span>
          <span>Todas as comunicações</span>
        </button>

        <div className="flex-1 overflow-y-auto">
          {loadingClientes ? (
            <div className="p-4 text-sm text-gray-400 text-center">Carregando...</div>
          ) : clientesFiltrados.length === 0 ? (
            <div className="p-4 text-sm text-gray-400 text-center">Nenhum cliente encontrado</div>
          ) : (
            clientesFiltrados.map((c) => (
              <button
                key={c.id}
                onClick={() => setClienteSelecionado(c)}
                className={`w-full text-left px-4 py-3 border-b border-gray-50 transition-colors ${clienteSelecionado?.id === c.id ? "bg-blue-50 border-l-2 border-l-blue-500" : "hover:bg-gray-50"}`}
              >
                <div className="font-medium text-sm text-gray-800 truncate">{c.nome}</div>
                <div className="text-xs text-gray-400 mt-0.5">{c.regime}</div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Área principal */}
      <div className="flex-1 flex flex-col">
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="font-bold text-gray-800 text-xl">
              {clienteSelecionado ? clienteSelecionado.nome : "Todas as comunicações"}
            </h1>
            {clienteSelecionado && (
              <p className="text-sm text-gray-400 mt-0.5">
                {clienteSelecionado.telefone && `📱 ${clienteSelecionado.telefone}`}
                {getEmail(clienteSelecionado) && ` · ✉️ ${getEmail(clienteSelecionado)}`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <select
              value={filtroCanal}
              onChange={(e) => setFiltroCanal(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
            >
              <option value="todos">Todos os canais</option>
              <option value="whatsapp">📱 WhatsApp</option>
              <option value="email">✉️ E-mail</option>
              <option value="telefone">📞 Telefone</option>
              <option value="presencial">🤝 Presencial</option>
            </select>
            {clienteSelecionado && (
              <button onClick={() => abrirNovaComm(clienteSelecionado)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                + Nova comunicação
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loadingComms ? (
            <div className="text-center py-10 text-gray-400">Carregando...</div>
          ) : comunicacoes.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-5xl mb-4">💬</div>
              <p className="text-gray-500 font-medium">Nenhuma comunicação registrada</p>
              <p className="text-gray-400 text-sm mt-1">Clique em "+ Nova" para registrar a primeira</p>
            </div>
          ) : (
            <div className="space-y-3">
              {comunicacoes.map((comm) => (
                <div key={comm.id} onClick={() => visualizarComm(comm)} className="bg-white rounded-xl border border-gray-200 p-4 cursor-pointer hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <span className="text-2xl mt-0.5">{CANAL_ICONES[comm.canal]}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {!clienteSelecionado && <span className="font-semibold text-gray-800 text-sm">{comm.clientes?.nome}</span>}
                          {comm.template && (
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                              {TEMPLATES[comm.template]?.label || comm.template}
                            </span>
                          )}
                        </div>
                        {comm.assunto && <p className="text-sm font-medium text-gray-700 mt-1">{comm.assunto}</p>}
                        <p className="text-sm text-gray-500 mt-1 line-clamp-2">{comm.mensagem}</p>
                        {comm.proximo_passo && <p className="text-xs text-blue-600 mt-1.5">→ Próximo passo: {comm.proximo_passo}</p>}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_CORES[comm.status] || "bg-gray-100 text-gray-600"}`}>
                        {comm.status}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(comm.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {comm.profiles?.nome && <span className="text-xs text-gray-400">{comm.profiles.nome}</span>}
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
            {modalTipo === "visualizar" && comunicacaoAtual ? (
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-gray-800">{CANAL_ICONES[comunicacaoAtual.canal]} Comunicação</h2>
                  <button onClick={() => setModalAberto(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-gray-500 uppercase tracking-wide">Cliente</label>
                      <p className="font-medium text-gray-800 mt-1">{comunicacaoAtual.clientes?.nome}</p>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 uppercase tracking-wide">Canal</label>
                      <p className="font-medium text-gray-800 mt-1 capitalize">{CANAL_ICONES[comunicacaoAtual.canal]} {comunicacaoAtual.canal}</p>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 uppercase tracking-wide">Status</label>
                      <p className="mt-1"><span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_CORES[comunicacaoAtual.status]}`}>{comunicacaoAtual.status}</span></p>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 uppercase tracking-wide">Data</label>
                      <p className="font-medium text-gray-800 mt-1">{new Date(comunicacaoAtual.created_at).toLocaleString("pt-BR")}</p>
                    </div>
                  </div>
                  {comunicacaoAtual.assunto && (
                    <div>
                      <label className="text-xs text-gray-500 uppercase tracking-wide">Assunto</label>
                      <p className="font-medium text-gray-800 mt-1">{comunicacaoAtual.assunto}</p>
                    </div>
                  )}
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide">Mensagem</label>
                    <div className="mt-2 bg-gray-50 rounded-xl p-4 text-sm text-gray-700 whitespace-pre-wrap border border-gray-100">{comunicacaoAtual.mensagem}</div>
                  </div>
                  {comunicacaoAtual.proximo_passo && (
                    <div>
                      <label className="text-xs text-gray-500 uppercase tracking-wide">Próximo passo</label>
                      <p className="text-blue-700 mt-1 text-sm">{comunicacaoAtual.proximo_passo}</p>
                    </div>
                  )}
                </div>
                <div className="flex gap-3 mt-6">
                  {comunicacaoAtual.canal === "whatsapp" && comunicacaoAtual.clientes?.telefone && (
                    <a href={`https://wa.me/55${formatarTelefone(comunicacaoAtual.clientes.telefone)}?text=${encodeURIComponent(comunicacaoAtual.mensagem)}`} target="_blank" rel="noreferrer" className="bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-600">
                      📱 Reenviar WhatsApp
                    </a>
                  )}
                  <button onClick={() => setModalAberto(false)} className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Fechar</button>
                </div>
              </div>
            ) : (
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-gray-800">Nova Comunicação</h2>
                  <button onClick={() => setModalAberto(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
                </div>
                <div className="space-y-4">
                  {/* Cliente */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cliente *</label>
                    <select
                      value={form.cliente_id}
                      onChange={(e) => onChangeCliente(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Selecione o cliente...</option>
                      {clientes.map((c) => (
                        <option key={c.id} value={c.id}>{c.nome}</option>
                      ))}
                    </select>
                    {clienteForm && (
                      <div className="mt-1.5 flex gap-3 text-xs text-gray-500">
                        {clienteForm.telefone && <span>📱 {clienteForm.telefone}</span>}
                        {getEmail(clienteForm) && <span>✉️ {getEmail(clienteForm)}</span>}
                      </div>
                    )}
                  </div>

                  {/* Canal */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Canal *</label>
                    <div className="grid grid-cols-4 gap-2">
                      {Object.entries(CANAIS).map(([key, canal]) => (
                        <button
                          key={key}
                          onClick={() => setForm((f) => ({ ...f, canal: key }))}
                          className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 text-xs font-medium transition-all ${form.canal === key ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}
                        >
                          <span className="text-xl">{canal.icone}</span>
                          <span>{canal.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Template */}
                  {(form.canal === "whatsapp" || form.canal === "email") && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Template de mensagem</label>
                      <select
                        value={form.template}
                        onChange={(e) => onChangeTemplate(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Mensagem livre (sem template)</option>
                        {Object.entries(TEMPLATES).map(([key, t]) => (
                          <option key={key} value={key}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Assunto e-mail */}
                  {form.canal === "email" && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Assunto do e-mail</label>
                      <input
                        type="text"
                        value={form.assunto || (form.template ? TEMPLATES[form.template]?.assuntoPadrao || "" : "")}
                        onChange={(e) => setForm((f) => ({ ...f, assunto: e.target.value }))}
                        placeholder="Assunto do e-mail..."
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}

                  {/* Mensagem */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-sm font-medium text-gray-700">
                        {form.canal === "telefone" || form.canal === "presencial" ? "Resumo do contato *" : "Mensagem *"}
                      </label>
                      {form.template && clienteForm && (form.canal === "whatsapp" || form.canal === "email") && (
                        <button
                          onClick={gerarMensagemComIA}
                          className="text-xs bg-purple-100 text-purple-700 px-3 py-1 rounded-lg hover:bg-purple-200 font-medium flex items-center gap-1"
                        >
                          📝 Gerar mensagem
                        </button>
                      )}
                    </div>
                    <textarea
                      value={form.mensagem}
                      onChange={(e) => setForm((f) => ({ ...f, mensagem: e.target.value }))}
                      rows={6}
                      placeholder={
                        form.canal === "telefone" ? "Descreva o que foi tratado na ligação..." :
                        form.canal === "presencial" ? "Descreva o que foi tratado no atendimento presencial..." :
                        "Digite a mensagem ou use um template + IA para gerar automaticamente..."
                      }
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                    {form.mensagem && <p className="text-xs text-gray-400 mt-1 text-right">{form.mensagem.length} caracteres</p>}
                  </div>

                  {/* Próximo passo */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Próximo passo (opcional)</label>
                    <input
                      type="text"
                      value={form.proximo_passo}
                      onChange={(e) => setForm((f) => ({ ...f, proximo_passo: e.target.value }))}
                      placeholder="Ex: Aguardar retorno até dia 30, Confirmar recebimento da guia..."
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Botões */}
                <div className="flex gap-3 mt-6 pt-4 border-t border-gray-100">
                  {form.canal === "whatsapp" && (
                    <button
                      onClick={enviarWhatsApp}
                      disabled={!form.cliente_id || !form.mensagem || !clienteForm?.telefone}
                      className="flex-1 bg-green-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      📱 Abrir WhatsApp
                    </button>
                  )}
                  {form.canal === "email" && (
                    <button
                      onClick={abrirEmail}
                      disabled={!form.cliente_id || !form.mensagem || !getEmail(clienteForm)}
                      className="flex-1 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      ✉️ Abrir E-mail
                    </button>
                  )}
                  {(form.canal === "telefone" || form.canal === "presencial") && (
                    <button
                      onClick={() => registrarComunicacao("registrado")}
                      disabled={!form.cliente_id || !form.mensagem}
                      className="flex-1 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      ✅ Registrar contato
                    </button>
                  )}
                  <button
                    onClick={() => registrarComunicacao("pendente")}
                    disabled={!form.cliente_id || !form.mensagem}
                    className="border border-gray-300 text-gray-600 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Salvar rascunho
                  </button>
                  <button onClick={() => setModalAberto(false)} className="text-gray-400 px-4 py-2.5 rounded-xl text-sm hover:bg-gray-50">
                    Cancelar
                  </button>
                </div>

                {/* Avisos */}
                {form.canal === "whatsapp" && !clienteForm?.telefone && form.cliente_id && (
                  <p className="text-xs text-red-500 mt-2">⚠️ Este cliente não tem telefone cadastrado.</p>
                )}
                {form.canal === "email" && !getEmail(clienteForm) && form.cliente_id && (
                  <p className="text-xs text-red-500 mt-2">⚠️ Este cliente não tem e-mail cadastrado.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
