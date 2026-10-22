import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  DollarSign,
  Calendar,
  Receipt,
  Plus,
  Trash2,
  HelpCircle,
  CheckCircle2,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { formatCurrency, formatDateBR, addDaysISO } from '../utils';

export default function ProfitReportView({
  sales = [],
  products = [],
  expenses = [],
  today = '',
  onRefreshData,
}) {
  // Períodos: 'TODAY', '7D', '15D', '30D', 'CUSTOM'
  const [period, setPeriod] = useState('30D');
  const [customStart, setCustomStart] = useState(addDaysISO(today, -30));
  const [customEnd, setCustomEnd] = useState(today);

  // Modal Novo Gasto
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expDescription, setExpDescription] = useState('');
  const [expCategory, setExpCategory] = useState('Geral');
  const [expAmount, setExpAmount] = useState('');
  const [expDate, setExpDate] = useState(today);
  const [expNotes, setExpNotes] = useState('');
  const [savingExpense, setSavingExpense] = useState(false);
  const [deletingExpId, setDeletingExpId] = useState(null);

  // Mapa de custo dos produtos
  const productCostMap = useMemo(() => {
    const map = new Map();
    for (const p of products) {
      map.set(p.id, Number(p.cost_price || 0));
    }
    return map;
  }, [products]);

  // Vendas filtradas por período
  const filteredSales = useMemo(() => {
    let start = '';
    let end = today;

    if (period === 'TODAY') {
      start = today;
      end = today;
    } else if (period === '7D') {
      start = addDaysISO(today, -7);
    } else if (period === '15D') {
      start = addDaysISO(today, -15);
    } else if (period === '30D') {
      start = addDaysISO(today, -30);
    } else if (period === 'CUSTOM') {
      start = customStart;
      end = customEnd;
    }

    return sales.filter((s) => {
      const d = (s.sale_date || '').slice(0, 10);
      if (start && d < start) return false;
      if (end && d > end) return false;
      return true;
    });
  }, [sales, period, customStart, customEnd, today]);

  // Gastos filtrados pelo mesmo período
  const filteredExpenses = useMemo(() => {
    let start = '';
    let end = today;

    if (period === 'TODAY') {
      start = today;
      end = today;
    } else if (period === '7D') {
      start = addDaysISO(today, -7);
    } else if (period === '15D') {
      start = addDaysISO(today, -15);
    } else if (period === '30D') {
      start = addDaysISO(today, -30);
    } else if (period === 'CUSTOM') {
      start = customStart;
      end = customEnd;
    }

    return expenses.filter((e) => {
      const d = (e.expense_date || '').slice(0, 10);
      if (start && d < start) return false;
      if (end && d > end) return false;
      return true;
    });
  }, [expenses, period, customStart, customEnd, today]);

  // Cálculos consolidados didáticos
  const report = useMemo(() => {
    let totalSold = 0; // Total faturado em vendas contratadas
    let totalReceived = 0; // Quanto o cliente já pagou em dinheiro/pix/cartão
    let totalPending = 0; // Quanto falta o cliente pagar (fiado / a receber)
    let totalGoodsCost = 0; // Custo de compra das peças vendidas

    for (const s of filteredSales) {
      const saleFinal = Number(s.final_total || 0);
      const paid = Number(s.paid_total || 0);
      const pending = Number(s.pending_total || 0);

      totalSold += saleFinal;
      totalReceived += paid;
      totalPending += pending;

      if (Array.isArray(s.items)) {
        for (const item of s.items) {
          const qty = Number(item.quantity || 1);
          let costUnit = 0;
          if (item.product_id && productCostMap.has(item.product_id)) {
            costUnit = productCostMap.get(item.product_id);
          } else {
            costUnit = Number(item.cost_price || 0);
          }
          totalGoodsCost += costUnit * qty;
        }
      }
    }

    const totalExpenses = filteredExpenses.reduce(
      (acc, e) => acc + Number(e.amount || 0),
      0
    );

    // 1. Lucro Projetado da Venda = Faturamento Total - Custo Peças - Gastos
    const projectedProfit = totalSold - totalGoodsCost - totalExpenses;

    // 2. Lucro Real no Bolso (Caixa Realizado) = Dinheiro Já Recebido - Custo Peças - Gastos
    const realizedCashProfit = totalReceived - totalGoodsCost - totalExpenses;

    return {
      salesCount: filteredSales.length,
      totalSold,
      totalReceived,
      totalPending,
      totalGoodsCost,
      totalExpenses,
      projectedProfit,
      realizedCashProfit,
      margin: totalSold > 0 ? (projectedProfit / totalSold) * 100 : 0,
    };
  }, [filteredSales, filteredExpenses, productCostMap]);

  // Salvar novo gasto
  const handleSaveExpense = async (e) => {
    e.preventDefault();
    const val = Number(String(expAmount).replace(',', '.'));
    if (!expDescription.trim() || isNaN(val) || val <= 0) return;

    setSavingExpense(true);
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: expDescription.trim(),
          category: expCategory.trim(),
          amount: val,
          expense_date: expDate,
          notes: expNotes.trim(),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        await onRefreshData(data);
        setExpDescription('');
        setExpAmount('');
        setExpNotes('');
        setShowExpenseModal(false);
      }
    } finally {
      setSavingExpense(false);
    }
  };

  // Excluir gasto
  const handleDeleteExpense = async (exp) => {
    if (
      !window.confirm(
        `Deseja remover o gasto "${exp.description}" de ${formatCurrency(exp.amount)}?`
      )
    ) {
      return;
    }
    setDeletingExpId(exp.id);
    try {
      const res = await fetch(`/api/expenses/${exp.id}`, { method: 'DELETE' });
      if (res.ok) {
        const data = await res.json();
        await onRefreshData(data);
      }
    } finally {
      setDeletingExpId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Barra de Filtro de Período e Botão de Novo Gasto */}
      <div className="bg-app-card rounded-2xl p-4 border border-app-border shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-app-text">
            Lucro, Faturamento & Gastos
          </h2>
          <p className="text-xs text-app-muted">
            Entenda exatamente quanto você vendeu, quanto já entrou no caixa e quanto ainda vai receber
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Botões de Período Rápido */}
          <div className="flex items-center gap-1 text-xs">
            {[
              { id: 'TODAY', label: 'Hoje' },
              { id: '7D', label: '7 Dias' },
              { id: '15D', label: '15 Dias' },
              { id: '30D', label: '30 Dias' },
              { id: 'CUSTOM', label: 'Período' },
            ].map((btn) => (
              <button
                key={btn.id}
                onClick={() => setPeriod(btn.id)}
                className={`px-3 py-1.5 rounded-xl font-medium transition cursor-pointer ${
                  period === btn.id
                    ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 shadow-xs'
                    : 'bg-app-input text-app-text border border-app-border hover:opacity-80'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowExpenseModal(true)}
            className="px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer shadow-xs transition"
          >
            <Plus className="w-3.5 h-3.5" />
            Registrar Gasto
          </button>
        </div>
      </div>

      {/* Calendário Personalizado */}
      {period === 'CUSTOM' && (
        <div className="bg-app-card rounded-2xl p-4 border border-app-border shadow-xs flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-app-muted font-medium">De:</span>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-app-border bg-app-input text-app-text font-medium"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-app-muted font-medium">Até:</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-app-border bg-app-input text-app-text font-medium"
            />
          </div>
          <span className="text-[11px] text-app-muted">
            Filtrando entre {formatDateBR(customStart)} e {formatDateBR(customEnd)}
          </span>
        </div>
      )}

      {/* EXPLICAÇÃO DIDÁTICA DO CÁLCULO */}
      <div className="p-4 rounded-2xl bg-app-card border border-app-border shadow-xs space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-app-text flex items-center gap-1.5">
            <HelpCircle className="w-4 h-4 text-stone-500" />
            Como é calculado o Lucro da sua Venda?
          </span>
          <span className="text-app-muted text-[11px]">
            {report.salesCount} venda(s) no período
          </span>
        </div>

        {/* Linha visual didática: Venda - Custo - Gastos = Lucro */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
          <div className="p-3 rounded-xl bg-app-input border border-app-border">
            <span className="text-[11px] text-app-muted block">1. Total Vendido</span>
            <span className="text-base font-bold text-app-text">
              {formatCurrency(report.totalSold)}
            </span>
            <div className="text-[10px] text-app-muted mt-0.5">
              Valor combinado com os clientes
            </div>
          </div>

          <div className="p-3 rounded-xl bg-app-input border border-app-border">
            <span className="text-[11px] text-app-muted block">2. Custo Peças</span>
            <span className="text-base font-bold text-stone-600 dark:text-stone-300">
              - {formatCurrency(report.totalGoodsCost)}
            </span>
            <div className="text-[10px] text-app-muted mt-0.5">
              Quanto você pagou nas peças
            </div>
          </div>

          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <span className="text-[11px] text-red-600 dark:text-red-400 block">3. Gastos</span>
            <span className="text-base font-bold text-red-600 dark:text-red-400">
              - {formatCurrency(report.totalExpenses)}
            </span>
            <div className="text-[10px] text-red-600/80 dark:text-red-400/80 mt-0.5">
              Sacolas, frete, despesas extras
            </div>
          </div>

          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 block font-semibold">
              = Lucro Total da Venda
            </span>
            <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(report.projectedProfit)}
            </span>
            <div className="text-[10px] text-emerald-700/80 dark:text-emerald-400/80 mt-0.5">
              Margem de {report.margin.toFixed(1)}% sobre as vendas
            </div>
          </div>
        </div>
      </div>

      {/* DOIS CARDS CLAROS: O QUE JÁ ENTROU NO CAIXA vs O QUE FALTA RECEBER */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Já recebido no bolso */}
        <div className="bg-app-card p-4 rounded-2xl border border-app-border shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-app-muted flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              Dinheiro que já entrou no Caixa (Pago)
            </span>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
              {formatCurrency(report.totalReceived)}
            </div>
            <span className="text-[11px] text-app-muted">
              Valores já pagos à vista, cartões ou entradas recebidas
            </span>
          </div>
        </div>

        {/* Falta receber (Fiado / Parcelas) */}
        <div className="bg-app-card p-4 rounded-2xl border border-app-border shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-app-muted flex items-center gap-1.5 font-medium">
              <Clock className="w-4 h-4 text-amber-500" />
              Aguardando Pagamento (Fiado / Parcelas a Vencer)
            </span>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
              {formatCurrency(report.totalPending)}
            </div>
            <span className="text-[11px] text-app-muted">
              Clientes que ainda vão pagar nas datas de vencimento
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Tabela de Gastos Registrados no Período */}
        <div className="lg:col-span-5 bg-app-card rounded-2xl border border-app-border shadow-xs overflow-hidden">
          <div className="p-4 border-b border-app-border flex justify-between items-center text-xs">
            <div>
              <span className="font-semibold text-app-text block">
                Gastos Registrados ({filteredExpenses.length})
              </span>
              <span className="text-app-muted text-[11px]">
                Abatidos automaticamente do lucro
              </span>
            </div>
            <button
              onClick={() => setShowExpenseModal(true)}
              className="text-red-600 dark:text-red-400 hover:underline font-semibold cursor-pointer"
            >
              + Adicionar
            </button>
          </div>

          {filteredExpenses.length === 0 ? (
            <div className="p-8 text-center text-xs text-app-muted">
              Nenhum gasto registrado neste período.
            </div>
          ) : (
            <div className="divide-y divide-app-border max-h-96 overflow-y-auto">
              {filteredExpenses.map((exp) => (
                <div
                  key={exp.id}
                  className="p-3 flex items-center justify-between text-xs hover:bg-app-input transition group"
                >
                  <div className="min-w-0 pr-2">
                    <div className="font-medium text-app-text truncate">
                      {exp.description}
                    </div>
                    <div className="text-[10px] text-app-muted">
                      {formatDateBR(exp.expense_date)} • {exp.category}
                      {exp.notes ? ` • ${exp.notes}` : ''}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-semibold text-red-600 dark:text-red-400">
                      - {formatCurrency(exp.amount)}
                    </span>
                    <button
                      onClick={() => handleDeleteExpense(exp)}
                      disabled={deletingExpId === exp.id}
                      className="opacity-0 group-hover:opacity-100 text-app-muted hover:text-red-500 p-1 cursor-pointer transition"
                      title="Excluir gasto"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tabela de Vendas do Período */}
        <div className="lg:col-span-7 bg-app-card rounded-2xl border border-app-border shadow-xs overflow-hidden">
          <div className="p-4 border-b border-app-border flex justify-between items-center text-xs">
            <span className="font-semibold text-app-text">
              Vendas no Período ({filteredSales.length})
            </span>
            <span className="text-app-muted text-[11px]">
              Faturamento Bruto
            </span>
          </div>

          {filteredSales.length === 0 ? (
            <div className="p-8 text-center text-xs text-app-muted">
              Nenhuma venda registrada neste período.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-app-input border-b border-app-border text-app-muted font-medium">
                    <th className="py-2.5 px-3">Data / Código</th>
                    <th className="py-2.5 px-3">Cliente</th>
                    <th className="py-2.5 px-3 text-right">Venda</th>
                    <th className="py-2.5 px-3 text-right">Custo Peças</th>
                    <th className="py-2.5 px-3 text-right">Lucro da Venda</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-app-border">
                  {filteredSales.map((s) => {
                    let cost = 0;
                    if (Array.isArray(s.items)) {
                      for (const it of s.items) {
                        const q = Number(it.quantity || 1);
                        const c =
                          it.product_id && productCostMap.has(it.product_id)
                            ? productCostMap.get(it.product_id)
                            : Number(it.cost_price || 0);
                        cost += c * q;
                      }
                    }
                    const profit = Number(s.final_total || 0) - cost;
                    const isFullyPaid = s.status === 'PAGO';

                    return (
                      <tr key={s.id} className="hover:bg-app-input transition">
                        <td className="py-2.5 px-3">
                          <div className="font-medium text-app-text">{s.sale_code}</div>
                          <div className="text-[10px] text-app-muted">
                            {formatDateBR(s.sale_date)}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-medium text-app-text">{s.client_name_snapshot}</div>
                          <div className="text-[10px]">
                            {isFullyPaid ? (
                              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                                Pago no ato
                              </span>
                            ) : (
                              <span className="text-amber-600 dark:text-amber-400">
                                Fiado (Falta receber: {formatCurrency(s.pending_total)})
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold text-app-text">
                          {formatCurrency(s.final_total)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-app-muted">
                          {formatCurrency(cost)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                          +{formatCurrency(profit)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal Registrar Gasto */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-app-card rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-app-border space-y-3.5 text-xs">
            <div className="flex justify-between items-center border-b border-app-border pb-2">
              <h3 className="font-semibold text-app-text text-sm">
                Registrar Gasto / Despesa
              </h3>
              <button
                onClick={() => setShowExpenseModal(false)}
                className="text-app-muted hover:text-app-text"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="space-y-3">
              <div>
                <label className="text-app-muted block mb-1">
                  Descrição do Gasto * (Qual foi o gasto?)
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Embalagens, Frete, Aluguel, Luz, Sacolas..."
                  value={expDescription}
                  onChange={(e) => setExpDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-app-border bg-app-input text-app-text"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-app-muted block mb-1">
                    Valor do Gasto (R$) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="0,00"
                    value={expAmount}
                    onChange={(e) => setExpAmount(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-app-border bg-app-input text-app-text font-semibold"
                  />
                </div>
                <div>
                  <label className="text-app-muted block mb-1">
                    Data do Gasto *
                  </label>
                  <input
                    type="date"
                    required
                    value={expDate}
                    onChange={(e) => setExpDate(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl border border-app-border bg-app-input text-app-text"
                  />
                </div>
              </div>

              <div>
                <label className="text-app-muted block mb-1">
                  Categoria
                </label>
                <select
                  value={expCategory}
                  onChange={(e) => setExpCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-app-border bg-app-input text-app-text"
                >
                  <option value="Geral">Geral</option>
                  <option value="Embalagens & Sacolas">Embalagens & Sacolas</option>
                  <option value="Frete & Logística">Frete & Logística</option>
                  <option value="Aluguel & Ponto">Aluguel & Ponto</option>
                  <option value="Água, Luz & Internet">Água, Luz & Internet</option>
                  <option value="Marketing & Divulgação">Marketing & Divulgação</option>
                  <option value="Outros">Outros</option>
                </select>
              </div>

              <div>
                <label className="text-app-muted block mb-1">
                  Observações (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Detalhes adicionais..."
                  value={expNotes}
                  onChange={(e) => setExpNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-app-border bg-app-input text-app-text"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-app-border">
                <button
                  type="button"
                  onClick={() => setShowExpenseModal(false)}
                  className="px-3 py-1.5 text-app-muted hover:bg-app-input rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingExpense}
                  className="px-4 py-1.5 rounded-lg bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-medium cursor-pointer"
                >
                  {savingExpense ? 'Salvando...' : 'Salvar e Abater'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
