import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import {
  TEMPLATES,
  CANAIS,
  formatarTelefone,
} from "../lib/comunicacao";
import { SETORES } from "../lib/chat";
import { sanitizarNomeArquivo } from "../lib/storage";

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

function naoLida(c) {
  return c.ultimo_origem === "cliente" && (!c.staff_lido_em || new Date(c.staff_lido_em) < new Date(c.updated_at));
}

export default function Comunicacao() {
  const { profile } = useAuth();
  const [searchParams] = useSearchParams();
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

  // --- Chat (conversas em tempo real com o Portal do Cliente) ---
  const [aba, setAba] = useState("registro"); // "registro" | "chat"
  const [conversas, setConversas] = useState([]);
  const [loadingConversas, setLoadingConversas] = useState(false);
  const [filtroSetor, setFiltroSetor] = useState("todos");
  const [filtroStatusChat, setFiltroStatusChat] = useState("aberta");
  const [conversaAtual, setConversaAtual] = useState(null);
  const [mensagensChat, setMensagensChat] = useState([]);
  const [loadingMsgsChat, setLoadingMsgsChat] = useState(false);
  const [textoChat, setTextoChat] = useState("");
  const [arquivoChat, setArquivoChat] = useState(null);
  const [enviandoChat, setEnviandoChat] = useState(false);
  const [colaboradores, setColaboradores] = useState([]);
  const [encaminharAberto, setEncaminharAberto] = useState(false);
  const fimChatRef = useRef(null);

  useEffect(() => {
    carregarClientes();
    carregarColaboradores();
  }, []);

  // Deep-link do e-mail de aviso (?conversa=ID): abre direto na conversa.
  useEffect(() => {
    const conversaId = searchParams.get("conversa");
    if (!conversaId) return;
    setAba("chat");
    supabase
      .from("chat_conversas")
      .select("*, clientes(nome, telefone)")
      .eq("id", conversaId)
      .single()
      .then(({ data }) => { if (data) abrirConversa(data); });
  }, [searchParams]);

  useEffect(() => {
    carregarComunicacoes(clienteSelecionado?.id || null);
  }, [clienteSelecionado, filtroCanal]);

  useEffect(() => {
    if (aba === "chat") carregarConversas();
  }, [aba, filtroSetor, filtroStatusChat]);

  useEffect(() => {
    if (!conversaAtual?.id) return;
    carregarMensagensChat(conversaAtual.id);

    const channel = supabase
      .channel(`staff_chat_mensagens_${conversaAtual.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_mensagens", filter: `conversa_id=eq.${conversaAtual.id}` },
        (payload) => {
          setMensagensChat((atual) => (atual.some((m) => m.id === payload.new.id) ? atual : [...atual, payload.new]));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversaAtual?.id]);

  useEffect(() => {
    fimChatRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagensChat]);

  async function carregarColaboradores() {
    const { data } = await supabase.from("profiles").select("id, nome, setor").not("setor", "is", null);
    setColaboradores(data || []);
  }

  async function carregarConversas() {
    setLoadingConversas(true);
    let query = supabase
      .from("chat_conversas")
      .select("*, clientes(nome, telefone)")
      .order("updated_at", { ascending: false });
    if (filtroSetor !== "todos") query = query.eq("setor", filtroSetor);
    if (filtroStatusChat !== "todas") query = query.eq("status", filtroStatusChat);
    const { data, error } = await query;
    if (error) console.error("Erro ao carregar conversas:", error);
    setConversas(data || []);
    setLoadingConversas(false);
  }

  async function carregarMensagensChat(conversaId) {
    setLoadingMsgsChat(true);
    const { data } = await supabase
      .from("chat_mensagens")
      .select("*")
      .eq("conversa_id", conversaId)
      .order("created_at", { ascending: true });
    setMensagensChat(data || []);
    setLoadingMsgsChat(false);
  }

  function abrirConversa(conv) {
    setConversaAtual(conv);
    setEncaminharAberto(false);
    if (naoLida(conv)) marcarConversaLida(conv.id);
  }

  async function marcarConversaLida(conversaId) {
    const agora = new Date().toISOString();
    await supabase.from("chat_conversas").update({ staff_lido_em: agora }).eq("id", conversaId);
    setConversas((atual) => atual.map((c) => (c.id === conversaId ? { ...c, staff_lido_em: agora } : c)));
    setConversaAtual((atual) => (atual?.id === conversaId ? { ...atual, staff_lido_em: agora } : atual));
  }

  async function enviarMensagemChat(e) {
    e.preventDefault();
    if (!conversaAtual || (!textoChat.trim() && !arquivoChat)) return;
    setEnviandoChat(true);
    try {
      let anexo_nome = null;
      let anexo_path = null;
      if (arquivoChat) {
        const path = `${conversaAtual.id}/${Date.now()}_${sanitizarNomeArquivo(arquivoChat.name)}`;
        const { error: uploadError } = await supabase.storage.from("chat-anexos").upload(path, arquivoChat);
        if (uploadError) throw uploadError;
        anexo_nome = arquivoChat.name;
        anexo_path = path;
      }

      const { error } = await supabase.from("chat_mensagens").insert({
        conversa_id: conversaAtual.id,
        origem: "escritorio",
        autor_id: profile?.id,
        autor_nome: profile?.nome,
        mensagem: textoChat.trim() || null,
        anexo_nome,
        anexo_path,
      });
      if (error) throw error;

      notificarClienteChat(conversaAtual);

      setTextoChat("");
      setArquivoChat(null);
      carregarMensagensChat(conversaAtual.id);
      carregarConversas();
    } catch (err) {
      alert(`Não foi possível enviar a mensagem: ${err.message}`);
    } finally {
      setEnviandoChat(false);
    }
  }

  // Falha ao notificar não deve travar o envio — é só um aviso a mais.
  async function notificarClienteChat(conversa) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch("/api/portal-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          clienteId: conversa.cliente_id,
          title: "Nova mensagem da CARSANT",
          body: conversa.assunto,
          url: "/portal/comunicacao",
        }),
      });
    } catch {
      // silencioso
    }
  }

  async function baixarAnexoChat(msg) {
    const { data, error } = await supabase.storage.from("chat-anexos").createSignedUrl(msg.anexo_path, 300);
    if (error || !data) { alert("Não foi possível abrir o anexo."); return; }
    window.open(data.signedUrl, "_blank");
  }

  async function encaminharConversa(setor, responsavelId) {
    if (!conversaAtual) return;
    const { error } = await supabase
      .from("chat_conversas")
      .update({ setor, responsavel_atual_id: responsavelId || null })
      .eq("id", conversaAtual.id);
    if (error) { alert(`Não foi possível encaminhar: ${error.message}`); return; }
    setEncaminharAberto(false);
    const atualizada = { ...conversaAtual, setor, responsavel_atual_id: responsavelId || null };
    setConversaAtual(atualizada);
    carregarConversas();
  }

  async function alternarStatusConversa() {
    if (!conversaAtual) return;
    const novoStatus = conversaAtual.status === "encerrada" ? "aberta" : "encerrada";
    const { error } = await supabase.from("chat_conversas").update({ status: novoStatus }).eq("id", conversaAtual.id);
    if (error) { alert(`Não foi possível atualizar: ${error.message}`); return; }
    setConversaAtual({ ...conversaAtual, status: novoStatus });
    carregarConversas();
  }

  function fmtHoraChat(d) {
    return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

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
      alert(`Erro ao registrar comunicação: ${error.message}`);
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
            {aba === "registro" && (
              <button onClick={() => abrirNovaComm()} className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-blue-700 font-medium">
                + Nova
              </button>
            )}
          </div>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-3">
            <button onClick={() => setAba("registro")} className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${aba === "registro" ? "bg-white shadow-sm text-gray-800" : "text-gray-500"}`}>
              Registro
            </button>
            <button onClick={() => setAba("chat")} className={`relative flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${aba === "chat" ? "bg-white shadow-sm text-gray-800" : "text-gray-500"}`}>
              💬 Chat
              {conversas.filter(naoLida).length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-semibold rounded-full min-w-[1.1rem] h-[1.1rem] flex items-center justify-center px-1">
                  {conversas.filter(naoLida).length}
                </span>
              )}
            </button>
          </div>
          {aba === "registro" ? (
            <input
              type="text"
              placeholder="Buscar cliente..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          ) : (
            <div className="flex gap-2">
              <select value={filtroSetor} onChange={(e) => setFiltroSetor(e.target.value)} className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none">
                <option value="todos">Todos os setores</option>
                {Object.entries(SETORES).map(([key, s]) => <option key={key} value={key}>{s.label}</option>)}
              </select>
              <select value={filtroStatusChat} onChange={(e) => setFiltroStatusChat(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none">
                <option value="aberta">Abertas</option>
                <option value="encerrada">Encerradas</option>
                <option value="todas">Todas</option>
              </select>
            </div>
          )}
        </div>

        {aba === "registro" ? (
          <>
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
          </>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {loadingConversas ? (
              <div className="p-4 text-sm text-gray-400 text-center">Carregando...</div>
            ) : conversas.length === 0 ? (
              <div className="p-4 text-sm text-gray-400 text-center">Nenhuma conversa encontrada</div>
            ) : (
              conversas.map((c) => (
                <button
                  key={c.id}
                  onClick={() => abrirConversa(c)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 transition-colors ${conversaAtual?.id === c.id ? "bg-blue-50 border-l-2 border-l-blue-500" : "hover:bg-gray-50"}`}
                >
                  <div className="flex items-center gap-1.5">
                    {naoLida(c) && <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />}
                    <div className={`text-sm truncate ${naoLida(c) ? "font-bold text-gray-900" : "font-medium text-gray-800"}`}>{c.clientes?.nome}</div>
                  </div>
                  <div className="text-xs text-gray-500 truncate mt-0.5">{c.assunto}</div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{SETORES[c.setor]?.label || c.setor}</span>
                    <span className="text-[10px] text-gray-400">{fmtHoraChat(c.updated_at)}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Área principal */}
      <div className="flex-1 flex flex-col">
        {aba === "registro" ? (
          <>
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
          </>
        ) : !conversaAtual ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            Selecione uma conversa para visualizar
          </div>
        ) : (
          <>
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h1 className="font-bold text-gray-800 text-xl">{conversaAtual.clientes?.nome}</h1>
                <p className="text-sm text-gray-400 mt-0.5">{conversaAtual.assunto}</p>
              </div>
              <div className="flex items-center gap-2 relative">
                <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full font-medium">
                  {SETORES[conversaAtual.setor]?.label || conversaAtual.setor}
                </span>
                <button onClick={() => setEncaminharAberto((v) => !v)} className="border border-gray-200 text-gray-600 text-xs px-3 py-1.5 rounded-lg hover:bg-gray-50 font-medium">
                  ↪ Encaminhar
                </button>
                <button onClick={alternarStatusConversa} className={`text-xs px-3 py-1.5 rounded-lg font-medium ${conversaAtual.status === "encerrada" ? "bg-green-50 text-green-700 hover:bg-green-100" : "border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                  {conversaAtual.status === "encerrada" ? "Reabrir" : "Encerrar"}
                </button>
                {encaminharAberto && (
                  <div className="absolute top-full right-0 mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-lg z-10 p-2">
                    {Object.entries(SETORES).map(([setorKey, s]) => (
                      <div key={setorKey} className="mb-1 last:mb-0">
                        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-2 pt-1">{s.label}</div>
                        {colaboradores.filter((c) => c.setor === setorKey).map((c) => (
                          <button
                            key={c.id}
                            onClick={() => encaminharConversa(setorKey, c.id)}
                            className="w-full text-left px-2 py-1.5 text-sm rounded-lg hover:bg-blue-50 text-gray-700"
                          >
                            {c.nome}
                          </button>
                        ))}
                        {colaboradores.filter((c) => c.setor === setorKey).length === 0 && (
                          <button onClick={() => encaminharConversa(setorKey, null)} className="w-full text-left px-2 py-1.5 text-sm rounded-lg hover:bg-blue-50 text-gray-500">
                            (sem responsável cadastrado)
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-gray-50">
              {loadingMsgsChat ? (
                <div className="text-center py-10 text-gray-400">Carregando...</div>
              ) : (
                mensagensChat.map((m) => (
                  <div key={m.id} className={`flex ${m.origem === "escritorio" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[65%] rounded-2xl px-4 py-2 text-sm ${m.origem === "escritorio" ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-800"}`}>
                      {m.origem === "escritorio" && m.autor_nome && <div className="text-xs font-medium mb-0.5 opacity-70">{m.autor_nome}</div>}
                      {m.mensagem && <p className="whitespace-pre-wrap">{m.mensagem}</p>}
                      {m.anexo_path && (
                        <button onClick={() => baixarAnexoChat(m)} className={`mt-1.5 flex items-center gap-1.5 text-xs underline ${m.origem === "escritorio" ? "text-white" : "text-blue-700"}`}>
                          📎 {m.anexo_nome}
                        </button>
                      )}
                      <div className={`text-[10px] mt-1 ${m.origem === "escritorio" ? "text-white/70" : "text-gray-400"}`}>{fmtHoraChat(m.created_at)}</div>
                    </div>
                  </div>
                ))
              )}
              <div ref={fimChatRef} />
            </div>

            <form onSubmit={enviarMensagemChat} className="p-3 border-t border-gray-200 bg-white flex items-end gap-2">
              <label className="border border-gray-200 rounded-lg p-2.5 cursor-pointer text-gray-500 hover:bg-gray-50">
                📎
                <input type="file" className="hidden" onChange={(e) => setArquivoChat(e.target.files?.[0] || null)} />
              </label>
              <textarea
                rows={1}
                value={textoChat}
                onChange={(e) => setTextoChat(e.target.value)}
                placeholder={arquivoChat ? `Anexo: ${arquivoChat.name}` : "Digite sua resposta..."}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={enviandoChat || (!textoChat.trim() && !arquivoChat)}
                className="bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {enviandoChat ? "..." : "Enviar"}
              </button>
            </form>
          </>
        )}
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
