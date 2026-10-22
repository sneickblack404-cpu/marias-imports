import React, { useState } from 'react';
import { Calendar, Search } from 'lucide-react';
import { formatCurrency, formatDateBR, getInstallmentDueInfo } from '../utils';
import InstallmentReminderModal from './InstallmentReminderModal';

function WhatsAppIcon({ className = 'w-3.5 h-3.5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.455 5.711 1.456h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
    </svg>
  );
}

export default function ReceivablesView({ installments = [], today = '', onRefreshData }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('PENDING'); // 'PENDING', 'OVERDUE', 'SOON', 'PAID', 'ALL'

  const [selectedInst, setSelectedInst] = useState(null);
  const [reminderInst, setReminderInst] = useState(null);

  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(today || new Date().toISOString().slice(0, 10));
  const [payType, setPayType] = useState('PIX');
  const [saving, setSaving] = useState(false);

  const openModal = (inst) => {
    setSelectedInst(inst);
    setPayAmount(String(inst.remaining_amount));
    setPayDate(today || new Date().toISOString().slice(0, 10));
    setPayType('PIX');
  };

  const handleConfirm = async (e) => {
    e.preventDefault();
    if (!selectedInst) return;
    const v = Number(String(payAmount).replace(',', '.'));
    if (isNaN(v) || v <= 0) return;

    setSaving(true);
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          installment_id: selectedInst.id,
          amount: v,
          payment_date: payDate,
          payment_type: payType,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        await onRefreshData(data);
        setSelectedInst(null);
      }
    } finally {
      setSaving(false);
    }
  };

  const totalPending = installments
    .filter((i) => i.status !== 'PAGO')
    .reduce((acc, i) => acc + Number(i.remaining_amount || 0), 0);

  const pendingCount = installments.filter((i) => i.status !== 'PAGO').length;
  const overdueCount = installments.filter((i) => {
    if (i.status === 'PAGO') return false;
    const info = getInstallmentDueInfo(i, today);
    return info.status === 'OVERDUE';
  }).length;

  const soonCount = installments.filter((i) => {
    if (i.status === 'PAGO') return false;
    const info = getInstallmentDueInfo(i, today);
    return info.status === 'DUE_TODAY' || info.status === 'DUE_SOON';
  }).length;

  const filtered = installments.filter((i) => {
    const q = search.toLowerCase();
    const match =
      (i.client_name_snapshot || '').toLowerCase().includes(q) ||
      (i.sale_code || '').toLowerCase().includes(q) ||
      (i.client_phone || '').includes(q);
    if (!match) return false;

    const info = getInstallmentDueInfo(i, today);

    if (filter === 'PENDING') return i.status !== 'PAGO';
    if (filter === 'OVERDUE') return i.status !== 'PAGO' && info.status === 'OVERDUE';
    if (filter === 'SOON') return i.status !== 'PAGO' && (info.status === 'DUE_TODAY' || info.status === 'DUE_SOON');
    if (filter === 'PAID') return i.status === 'PAGO';
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Barra de Busca e Filtros */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 text-app-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por cliente, venda ou tel..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-app-border bg-app-card text-app-text text-xs focus:outline-none focus:border-stone-500"
            />
          </div>

          <div className="flex flex-wrap gap-1 text-xs">
            {[
              { id: 'PENDING', label: `Pendentes (${pendingCount})` },
              { id: 'OVERDUE', label: `🔴 Vencidas (${overdueCount})` },
              { id: 'SOON', label: `🟠 Vencem em Breve (${soonCount})` },
              { id: 'PAID', label: 'Pagas' },
              { id: 'ALL', label: 'Todas' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                  filter === f.id
                    ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
                    : 'bg-app-card text-app-text border border-app-border hover:bg-app-input'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="text-xs text-app-muted">
          Total pendente a receber:{' '}
          <strong className="font-semibold text-app-text">
            {formatCurrency(totalPending)}
          </strong>
        </div>
      </div>

      {/* Tabela de Parcelas Clean */}
      <div className="bg-app-card rounded-2xl border border-app-border shadow-xs overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-app-input border-b border-app-border text-app-muted font-medium">
              <th className="py-2.5 px-4">Vencimento & Status</th>
              <th className="py-2.5 px-4">Cliente</th>
              <th className="py-2.5 px-4">Parcela</th>
              <th className="py-2.5 px-4">Valor</th>
              <th className="py-2.5 px-4">Falta Pagar</th>
              <th className="py-2.5 px-4 text-right">Ações & Lembrete</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-app-border">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-xs text-app-muted">
                  Nenhuma parcela encontrada para este filtro.
                </td>
              </tr>
            ) : (
              filtered.map((inst) => {
                const dueInfo = getInstallmentDueInfo(inst, today);

                return (
                  <tr key={inst.id} className="hover:bg-app-input transition">
                    <td className="py-3 px-4 font-medium text-app-text">
                      <div className="flex items-center gap-2">
                        <span>{formatDateBR(inst.due_date)}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${dueInfo.badgeClass}`}>
                          {dueInfo.label}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-4 font-medium text-app-text">
                      <div>
                        <span>{inst.client_name_snapshot}</span>
                        {inst.client_phone && (
                          <span className="block text-[10px] text-app-muted">
                            {inst.client_phone}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-4 text-app-muted">
                      {inst.sale_code} • {inst.installment_number}/{inst.total_installments}
                    </td>

                    <td className="py-3 px-4 text-app-text">{formatCurrency(inst.amount)}</td>

                    <td className="py-3 px-4 font-semibold text-app-text">
                      {formatCurrency(inst.remaining_amount)}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5 justify-end">
                        {inst.status !== 'PAGO' ? (
                          <>
                            {/* Botão de Enviar Lembrete no WhatsApp */}
                            <button
                              onClick={() => setReminderInst(inst)}
                              title="Enviar Lembrete / Cobrança no WhatsApp"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 text-[11px] font-medium border border-emerald-500/20 cursor-pointer transition"
                            >
                              <WhatsAppIcon className="w-3.5 h-3.5 fill-current" />
                              <span>Lembrete</span>
                            </button>

                            {/* Botão de Baixa */}
                            <button
                              onClick={() => openModal(inst)}
                              className="px-2.5 py-1 rounded-lg bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-medium text-[11px] hover:opacity-90 cursor-pointer"
                            >
                              Dar Baixa
                            </button>
                          </>
                        ) : (
                          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                            Quitada
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Baixa */}
      {selectedInst && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-app-card rounded-3xl max-w-sm w-full p-5 shadow-xl border border-app-border space-y-3.5 text-xs">
            <div className="flex justify-between items-center border-b border-app-border pb-2">
              <h3 className="font-semibold text-app-text text-sm">
                Receber Parcela
              </h3>
              <button onClick={() => setSelectedInst(null)} className="text-app-muted cursor-pointer">
                ✕
              </button>
            </div>

            <div className="text-app-muted text-xs">
              Cliente: <strong className="text-app-text">{selectedInst.client_name_snapshot}</strong>
              <div className="mt-0.5">
                Vencimento: {formatDateBR(selectedInst.due_date)} • Parcela:{' '}
                {selectedInst.installment_number}/{selectedInst.total_installments}
              </div>
            </div>

            <form onSubmit={handleConfirm} className="space-y-3">
              <div>
                <label className="text-app-muted block mb-1">
                  Valor Recebido (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-app-border bg-app-input text-app-text text-base font-semibold"
                />
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                {['PIX', 'DINHEIRO', 'CARTAO'].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setPayType(t)}
                    className={`py-1.5 rounded-lg border font-medium cursor-pointer ${
                      payType === t
                        ? 'bg-stone-900 text-white border-stone-900 dark:bg-stone-100 dark:text-stone-900'
                        : 'bg-app-card text-app-text border-app-border'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-app-border">
                <button
                  type="button"
                  onClick={() => setSelectedInst(null)}
                  className="px-3 py-1.5 text-app-muted cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 rounded-lg bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-medium cursor-pointer"
                >
                  Confirmar Baixa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Lembrete WhatsApp */}
      {reminderInst && (
        <InstallmentReminderModal
          installment={reminderInst}
          today={today}
          onClose={() => setReminderInst(null)}
        />
      )}
    </div>
  );
}
