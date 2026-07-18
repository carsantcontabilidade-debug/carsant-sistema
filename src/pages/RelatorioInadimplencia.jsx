import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";

const MESES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"
];

const STATUS_LABEL = {
  pago: { label: "Pago", color: "#16a34a", bg: "#dcfce7" },
  pendente: { label: "Pendente", color: "#d97706", bg: "#fef3c7" },
  em_atraso: { label: "Em atraso", color: "#dc2626", bg: "#fee2e2" },
};

function getStatusKey(pag, diaVencimento, mes, ano) {
  if (!pag) {
    const hoje = new Date();
    const venc = new Date(ano, mes - 1, diaVencimento);
    return hoje > venc ? "em_atraso" : "pendente";
  }
  return "pago";
}

export default function RelatorioInadimplencia() {
  const { profile } = useAuth();
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [dados, setDados] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [gerandoPDF, setGerandoPDF] = useState(false);
  const previewRef = useRef(null);

  if (profile?.role !== "gestor") {
    return (
      <div className="p-8 text-center text-gray-500">
        Acesso restrito ao gestor.
      </div>
    );
  }

  async function buscarDados() {
    setLoading(true);
    try {
      const { data: clientes, error: errCli } = await supabase
        .from("clientes")
        .select("id, nome, regime, valor_honorario, dia_vencimento, tipo")
        .order("nome");

      if (errCli) throw errCli;

      const { data: pagamentos, error: errPag } = await supabase
        .from("pagamentos_honorarios")
        .select("cliente_id, pago, data_pagamento")
        .eq("mes", mes)
        .eq("ano", ano);

      if (errPag) throw errPag;

      const pagMap = {};
      pagamentos?.forEach((p) => { pagMap[p.cliente_id] = p; });

      const rows = clientes.map((c) => {
        const pag = pagMap[c.id] || null;
        const statusKey = getStatusKey(pag?.pago, c.dia_vencimento, mes, ano);
        return {
          nome: c.nome,
          regime: c.regime || "—",
          honorario: c.valor_honorario || 0,
          status: statusKey,
          data_pagamento: pag?.data_pagamento || null,
          vencimento: c.dia_vencimento
            ? `${String(c.dia_vencimento).padStart(2, "0")}/${String(mes).padStart(2, "0")}/${ano}`
            : "—",
        };
      });

      setDados(rows);
    } catch (e) {
      console.error(e);
      alert("Erro ao buscar dados: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  const resumo = {
    total: dados.reduce((s, r) => s + r.honorario, 0),
    recebido: dados.filter((r) => r.status === "pago").reduce((s, r) => s + r.honorario, 0),
    em_atraso: dados.filter((r) => r.status === "em_atraso").reduce((s, r) => s + r.honorario, 0),
    pendente: dados.filter((r) => r.status === "pendente").reduce((s, r) => s + r.honorario, 0),
    qtd_pago: dados.filter((r) => r.status === "pago").length,
    qtd_atraso: dados.filter((r) => r.status === "em_atraso").length,
    qtd_pendente: dados.filter((r) => r.status === "pendente").length,
  };

  function fmt(v) {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function fmtData(d) {
    if (!d) return "—";
    const dt = new Date(d + "T00:00:00");
    return dt.toLocaleDateString("pt-BR");
  }

  async function exportarPDF() {
    setGerandoPDF(true);
    try {
      // html2pdf.bundle.min.js é um bundle UMD, não um módulo ES — o import()
      // só serve para carregá-lo (ele se registra como window.html2pdf).
      if (!window.html2pdf) {
        await import("https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js");
      }
      const html2pdf = window.html2pdf;
      const element = previewRef.current;
      const opt = {
        margin: [10, 10, 10, 10],
        filename: `CARSANT-Honorarios-${MESES[mes - 1]}-${ano}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      };
      await html2pdf().set(opt).from(element).save();
    } catch (e) {
      // fallback: print
      window.print();
    } finally {
      setGerandoPDF(false);
    }
  }

  const anoAtual = hoje.getFullYear();
  const anos = [anoAtual - 1, anoAtual, anoAtual + 1];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Relatório de Honorários</h1>
        <p className="text-gray-500 text-sm mt-1">Todos os clientes com status de pagamento do mês selecionado</p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-4 mb-6 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Mês</label>
          <select
            value={mes}
            onChange={(e) => setMes(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {MESES.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ano</label>
          <select
            value={ano}
            onChange={(e) => setAno(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {anos.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <button
          onClick={buscarDados}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
        >
          {loading ? "Carregando..." : "Gerar Relatório"}
        </button>
      </div>

      {/* Resultados */}
      {dados.length > 0 && (
        <>
          {/* Cards resumo */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: "Total do Mês", value: fmt(resumo.total), sub: `${dados.length} clientes`, color: "blue" },
              { label: "Recebido", value: fmt(resumo.recebido), sub: `${resumo.qtd_pago} clientes`, color: "green" },
              { label: "Em Atraso", value: fmt(resumo.em_atraso), sub: `${resumo.qtd_atraso} clientes`, color: "red" },
              { label: "Pendente", value: fmt(resumo.pendente), sub: `${resumo.qtd_pendente} clientes`, color: "yellow" },
            ].map((c) => (
              <div key={c.label} className={`bg-${c.color}-50 border border-${c.color}-200 rounded-xl p-4`}>
                <p className={`text-xs font-medium text-${c.color}-600 uppercase tracking-wide`}>{c.label}</p>
                <p className={`text-xl font-bold text-${c.color}-700 mt-1`}>{c.value}</p>
                <p className={`text-xs text-${c.color}-500 mt-1`}>{c.sub}</p>
              </div>
            ))}
          </div>

          {/* Botão preview */}
          <div className="flex justify-end mb-4">
            <button
              onClick={() => setShowPreview(true)}
              className="flex items-center gap-2 bg-gray-800 hover:bg-gray-900 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Preview e Exportar PDF
            </button>
          </div>

          {/* Tabela */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {["Cliente","Regime","Honorário","Vencimento","Status","Pago em"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {dados.map((row, i) => {
                  const s = STATUS_LABEL[row.status];
                  return (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{row.nome}</td>
                      <td className="px-4 py-3 text-gray-600">{row.regime}</td>
                      <td className="px-4 py-3 text-gray-800 font-medium">{fmt(row.honorario)}</td>
                      <td className="px-4 py-3 text-gray-600">{row.vencimento}</td>
                      <td className="px-4 py-3">
                        <span style={{ color: s.color, backgroundColor: s.bg }} className="px-2 py-1 rounded-full text-xs font-semibold">
                          {s.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{fmtData(row.data_pagamento)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modal Preview PDF */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center overflow-y-auto py-8">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl mx-4">
            {/* Header do modal */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-800">Preview do Relatório</h2>
              <div className="flex gap-2">
                <button
                  onClick={exportarPDF}
                  disabled={gerandoPDF}
                  className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  {gerandoPDF ? "Gerando..." : "Baixar PDF"}
                </button>
                <button
                  onClick={() => setShowPreview(false)}
                  className="text-gray-500 hover:text-gray-700 px-3 py-2 rounded-lg text-sm border border-gray-200 hover:bg-gray-50"
                >
                  Fechar
                </button>
              </div>
            </div>

            {/* Conteúdo do PDF */}
            <div className="p-6 overflow-auto">
              <div ref={previewRef} style={{ fontFamily: "Arial, sans-serif", color: "#1f2937", backgroundColor: "#fff", padding: "24px" }}>
                {/* Cabeçalho */}
                <div style={{ borderBottom: "3px solid #1d4ed8", paddingBottom: "16px", marginBottom: "20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <h1 style={{ fontSize: "22px", fontWeight: "bold", color: "#1d4ed8", margin: 0 }}>CARSANT Contabilidade</h1>
                      <p style={{ fontSize: "12px", color: "#6b7280", margin: "2px 0 0" }}>Assessoria Contábil e Empresarial — Feira de Santana, BA</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ fontSize: "16px", fontWeight: "bold", color: "#374151", margin: 0 }}>Relatório de Honorários</p>
                      <p style={{ fontSize: "12px", color: "#6b7280", margin: "2px 0 0" }}>{MESES[mes - 1]} / {ano}</p>
                      <p style={{ fontSize: "11px", color: "#9ca3af", margin: "2px 0 0" }}>Emitido em: {new Date().toLocaleDateString("pt-BR")}</p>
                    </div>
                  </div>
                </div>

                {/* Resumo executivo */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "12px", marginBottom: "24px" }}>
                  {[
                    { label: "TOTAL DO MÊS", value: fmt(resumo.total), sub: `${dados.length} clientes`, border: "#3b82f6" },
                    { label: "RECEBIDO", value: fmt(resumo.recebido), sub: `${resumo.qtd_pago} clientes`, border: "#16a34a" },
                    { label: "EM ATRASO", value: fmt(resumo.em_atraso), sub: `${resumo.qtd_atraso} clientes`, border: "#dc2626" },
                    { label: "PENDENTE", value: fmt(resumo.pendente), sub: `${resumo.qtd_pendente} clientes`, border: "#d97706" },
                  ].map((c) => (
                    <div key={c.label} style={{ border: `2px solid ${c.border}`, borderRadius: "8px", padding: "12px" }}>
                      <p style={{ fontSize: "9px", fontWeight: "bold", color: c.border, textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>{c.label}</p>
                      <p style={{ fontSize: "16px", fontWeight: "bold", color: "#111827", margin: "4px 0 2px" }}>{c.value}</p>
                      <p style={{ fontSize: "10px", color: "#6b7280", margin: 0 }}>{c.sub}</p>
                    </div>
                  ))}
                </div>

                {/* Tabela */}
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                  <thead>
                    <tr style={{ backgroundColor: "#1d4ed8", color: "#fff" }}>
                      {["Cliente","Regime Tributário","Honorário","Vencimento","Status","Pago em"].map((h) => (
                        <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontWeight: "600", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.03em" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dados.map((row, i) => {
                      const s = STATUS_LABEL[row.status];
                      return (
                        <tr key={i} style={{ backgroundColor: i % 2 === 0 ? "#f9fafb" : "#fff", borderBottom: "1px solid #e5e7eb" }}>
                          <td style={{ padding: "7px 10px", fontWeight: "500", color: "#111827" }}>{row.nome}</td>
                          <td style={{ padding: "7px 10px", color: "#374151" }}>{row.regime}</td>
                          <td style={{ padding: "7px 10px", fontWeight: "600", color: "#111827" }}>{fmt(row.honorario)}</td>
                          <td style={{ padding: "7px 10px", color: "#374151" }}>{row.vencimento}</td>
                          <td style={{ padding: "7px 10px" }}>
                            <span style={{ backgroundColor: s.bg, color: s.color, padding: "2px 8px", borderRadius: "9999px", fontSize: "10px", fontWeight: "700" }}>
                              {s.label}
                            </span>
                          </td>
                          <td style={{ padding: "7px 10px", color: "#374151" }}>{fmtData(row.data_pagamento)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Rodapé */}
                <div style={{ marginTop: "24px", paddingTop: "12px", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#9ca3af" }}>
                  <span>CARSANT Contabilidade — Sistema de Gestão Contábil</span>
                  <span>Relatório gerado em {new Date().toLocaleDateString("pt-BR")} às {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
