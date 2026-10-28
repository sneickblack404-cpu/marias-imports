import React, { useState, useMemo } from 'react';
import { Users, Plus, Search, Edit3, Trash2, Package } from 'lucide-react';
import { formatCurrency, formatDateBR, getInstallmentDueInfo } from '../utils';
import SaleReceiptModal from './SaleReceiptModal';
import InstallmentReminderModal from './InstallmentReminderModal';
import EditSaleModal from './EditSaleModal';

function WhatsAppIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.455 5.711 1.456h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
    </svg>
  );
}

function getWhatsAppUrl(phone) {
  if (!phone) return null;
  const clean = phone.replace(/\D/g, '');
  if (!clean) return null;
  const full = clean.length === 10 || clean.length === 11 ? `55${clean}` : clean;
  return `https://wa.me/${full}`;
}

export default function ClientsLedgerView({
  clients = [],
  products = [],
  today = '',
  onRefreshData,
  onStartSaleForClient,
}) {
  const [search, setSearch] = useState('');
  const [selectedClientId, setSelectedClientId] = useState(clients[0]?.id || null);

  // New Client Modal
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [discount, setDiscount] = useState('0');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // Payment Modal
  const [payModal, setPayModal] = useState(null); // { installment, client }
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(today || new Date().toISOString().slice(0, 10));
  const [payType, setPayType] = useState('PIX');
  const [savingPay, setSavingPay] = useState(false);

  // Reminder, Receipt & Edit Sale Modals
  const [reminderInst, setReminderInst] = useState(null);
  const [viewReceiptSale, setViewReceiptSale] = useState(null);
  const [editingSale, setEditingSale] = useState(null);
  const [deletingSaleId, setDeletingSaleId] = useState(null);
  const [itemSearch, setItemSearch] = useState('');

  const selectedClient =
    clients.find((c) => c.id === Number(selectedClientId)) || clients[0] || null;

  const filtered = clients.filter((c) => {
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || (c.phone || '').includes(q);
  });

  const openNew = () => {
    setEditingClient(null);
    setName('');
    setPhone('');
    setDiscount('0');
    setShowModal(true);
  };

  const openEdit = (cli) => {
    setEditingClient(cli);
    setName(cli.name);
    setPhone(cli.phone || '');
    setDiscount(String(cli.default_discount_percent || 0));
    setShowModal(true);
  };

  const handleSaveClient = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const url = editingClient ? `/api/clients/${editingClient.id}` : '/api/clients';
      const method = editingClient ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          default_discount_percent: Number(discount) || 0,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        await onRefreshData(data);
        if (data.created_client_id) setSelectedClientId(data.created_client_id);
        setShowModal(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClient = async (cli) => {
    if (!window.confirm(`Deseja realmente remover o cliente "${cli.name}"?`)) {
      return;
    }
    setDeletingId(cli.id);
    try {
      const res = await fetch(`/api/clients/${cli.id}`, { method: 'DELETE' });
      if (res.ok) {
        const data = await res.json();
        await onRefreshData(data);
        if (selectedClientId === cli.id) {
          setSelectedClientId(null);
        }
      }
    } finally {
      setDeletingId(null);
    }
  };

  const handlePay = async (e) => {
    e.preventDefault();
    const val = Number(String(payAmount).replace(',', '.'));
    if (!payModal || isNaN(val) || val <= 0) return;
    setSavingPay(true);
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          installment_id: payModal.installment?.id || null,
          client_id: payModal.client?.id || null,
          amount: val,
          payment_date: payDate,
          payment_type: payType,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        await onRefreshData(data);
        setPayModal(null);
      }
    } finally {
      setSavingPay(false);
    }
  };

  const handleDeleteSale = async (sale) => {
    if (
      !window.confirm(
        `Tem certeza que deseja apagar a venda ${sale.sale_code}? Os produtos voltarão ao estoque e as parcelas pendentes serão excluídas.`
      )
    ) {
      return;
    }
    setDeletingSaleId(sale.id);
    try {
      const res = await fetch(`/api/sales/${sale.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao excluir venda.');
      }
      if (onRefreshData) await onRefreshData(data);
    } catch (err) {
      alert(err.message || 'Erro ao excluir venda.');
    } finally {
      setDeletingSaleId(null);
    }
  };

  // Consolidar todos os itens comprados de todos os pedidos da cliente
  // Ordenado do mais recente em cima para o mais antigo embaixo (antigo de baixo para cima)
  const allClientItems = useMemo(() => {
    if (!selectedClient?.sales_history) return [];
    const list = [];
    for (const sale of selectedClient.sales_history) {
      if (Array.isArray(sale.items)) {
        for (const it of sale.items) {
          list.push({
            ...it,
            sale_id: sale.id,
            sale_code: sale.sale_code,
            sale_date: sale.sale_date,
            payment_method: sale.payment_method,
            sale_status: sale.status,
          });
        }
      }
    }
    return list.sort((a, b) => {
      if (b.sale_date !== a.sale_date) {
        return b.sale_date.localeCompare(a.sale_date);
      }
      return (b.sale_id || b.id || 0) - (a.sale_id || a.id || 0);
    });
  }, [selectedClient?.sales_history]);

  const filteredClientItems = useMemo(() => {
    if (!itemSearch.trim()) return allClientItems;
    const q = itemSearch.toLowerCase();
    return allClientItems.filter(
      (it) =>
        (it.product_name || '').toLowerCase().includes(q) ||
        (it.sale_code || '').toLowerCase().includes(q) ||
        (it.product_sku_snapshot || '').toLowerCase().includes(q)
    );
  }, [allClientItems, itemSearch]);

  const totalPiecesCount = useMemo(() => {
    return allClientItems.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);
  }, [allClientItems]);

  const totalPiecesAmount = useMemo(() => {
    return allClientItems.reduce((acc, it) => acc + (Number(it.line_final_total) || 0), 0);
  }, [allClientItems]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Lista de Clientes */}
        <div className="lg:col-span-4 bg-app-card rounded-2xl border border-app-border shadow-xs overflow-hidden flex flex-col">
          <div className="p-3 border-b border-app-border flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-app-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar cliente..."
                className="w-full pl-7 pr-2.5 py-1 rounded-lg border border-app-border text-xs bg-app-input text-app-text focus:outline-none"
              />
            </div>
            <button
              onClick={openNew}
              className="p-1.5 rounded-lg bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 hover:opacity-90 cursor-pointer"
              title="Novo cliente"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-app-border max-h-[500px] overflow-y-auto">
            {filtered.map((c) => {
              const isSel = selectedClient && selectedClient.id === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => setSelectedClientId(c.id)}
                  className={`w-full p-3 text-left transition cursor-pointer flex items-center justify-between text-xs group ${
                    isSel
                      ? 'bg-app-input border-l-2 border-stone-900 dark:border-stone-300 font-medium'
                      : 'hover:bg-app-input'
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <div className="truncate text-app-text">{c.name}</div>
                    <div className="text-[10px] text-app-muted flex items-center gap-1.5">
                      <span>{c.phone || 'Sem telefone'}</span>
                      {c.phone && getWhatsAppUrl(c.phone) && (
                        <a
                          href={getWhatsAppUrl(c.phone)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          title="Abrir WhatsApp"
                          className="text-emerald-500 hover:text-emerald-400 inline-flex items-center p-0.5 rounded hover:bg-emerald-500/10 transition"
                        >
                          <WhatsAppIcon className="w-3.5 h-3.5 fill-current" />
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {c.total_debt > 0 ? (
                      <span className="text-amber-600 dark:text-amber-400 font-semibold">
                        {formatCurrency(c.total_debt)}
                      </span>
                    ) : (
                      <span className="text-app-muted text-[10px]">Sem pendência</span>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClient(c);
                      }}
                      disabled={deletingId === c.id}
                      className="opacity-0 group-hover:opacity-100 text-app-muted hover:text-red-500 p-1 transition cursor-pointer"
                      title="Excluir cliente"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Ficha do Cliente Selecionado */}
        <div className="lg:col-span-8 space-y-4">
          {selectedClient ? (
            <>
              {/* Resumo do Cliente */}
              <div className="bg-app-card rounded-2xl p-5 border border-app-border shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-app-border pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold text-app-text">
                        {selectedClient.name}
                      </h3>
                      <button
                        onClick={() => openEdit(selectedClient)}
                        className="text-app-muted hover:text-app-text p-1 cursor-pointer"
                        title="Editar cliente"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteClient(selectedClient)}
                        className="text-app-muted hover:text-red-500 p-1 cursor-pointer"
                        title="Excluir cliente"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="text-xs text-app-muted mt-1 flex items-center gap-2 flex-wrap">
                      <span>{selectedClient.phone || 'Sem telefone cadastrado'}</span>
                      {selectedClient.phone && getWhatsAppUrl(selectedClient.phone) && (
                        <a
                          href={getWhatsAppUrl(selectedClient.phone)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 font-medium text-xs transition cursor-pointer"
                          title="Conversar com cliente no WhatsApp"
                        >
                          <WhatsAppIcon className="w-3.5 h-3.5 fill-current text-emerald-500" />
                          <span>WhatsApp</span>
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {selectedClient.total_debt > 0 && (
                      <button
                        onClick={() =>
                          setPayModal({ client: selectedClient, installment: null })
                        }
                        className="px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:hover:bg-white text-white dark:text-stone-900 text-xs font-medium cursor-pointer shadow-xs"
                      >
                        Abater Dívida
                      </button>
                    )}
                    <button
                      onClick={() => onStartSaleForClient(selectedClient.id)}
                      className="px-3 py-1.5 rounded-xl border border-app-border text-app-text hover:bg-app-input text-xs font-medium cursor-pointer"
                    >
                      + Nova Venda
                    </button>
                  </div>
                </div>

                {/* 3 Valores Principais Claros */}
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-app-input border border-app-border">
                    <span className="text-app-muted block mb-0.5">Total Comprado</span>
                    <span className="text-sm font-semibold text-app-text">
                      {formatCurrency(selectedClient.total_bought)}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <span className="text-emerald-600 dark:text-emerald-400 block mb-0.5">Já Pago</span>
                    <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(selectedClient.total_paid)}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                    <span className="text-amber-600 dark:text-amber-400 block mb-0.5">Falta Pagar</span>
                    <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                      {formatCurrency(selectedClient.total_debt)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Parcelas */}
              <div className="bg-app-card rounded-2xl p-4 border border-app-border shadow-xs space-y-3">
                <span className="text-xs font-semibold text-app-text block">
                  Parcelas ({selectedClient.installments?.length || 0})
                </span>

                {selectedClient.installments?.length === 0 ? (
                  <div className="py-4 text-center text-xs text-app-muted">
                    Nenhuma parcela registrada.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {selectedClient.installments.map((inst) => {
                      const dueInfo = getInstallmentDueInfo(inst, today);

                      return (
                        <div
                          key={inst.id}
                          className="p-2.5 rounded-xl bg-app-input border border-app-border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-app-text">
                                {inst.sale_code} • {inst.installment_number}ª parcela
                              </span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${dueInfo.badgeClass}`}>
                                {dueInfo.label}
                              </span>
                            </div>
                            <div className="text-[11px] text-app-muted mt-0.5">
                              Vencimento: {formatDateBR(inst.due_date)} • {dueInfo.description}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-auto">
                            <div className="text-right">
                              <span className="font-semibold text-app-text block">
                                {formatCurrency(inst.remaining_amount)}
                              </span>
                              {inst.status === 'PAGO' ? (
                                <span className="text-[10px] text-emerald-600 dark:text-emerald-400">Quitada</span>
                              ) : inst.paid_amount > 0 ? (
                                <span className="text-[10px] text-amber-600 dark:text-amber-400">Parcial</span>
                              ) : (
                                <span className="text-[10px] text-app-muted">Pendente</span>
                              )}
                            </div>

                            {inst.status !== 'PAGO' && (
                              <>
                                <button
                                  onClick={() =>
                                    setReminderInst({
                                      ...inst,
                                      client_name_snapshot: selectedClient.name,
                                      client_phone: selectedClient.phone,
                                    })
                                  }
                                  title="Enviar lembrete no WhatsApp"
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 text-[11px] font-medium border border-emerald-500/20 cursor-pointer transition"
                                >
                                  <WhatsAppIcon className="w-3.5 h-3.5 fill-current" />
                                  <span>Lembrete</span>
                                </button>

                                <button
                                  onClick={() => {
                                    setPayModal({ client: selectedClient, installment: inst });
                                    setPayAmount(String(inst.remaining_amount));
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-[11px] font-medium cursor-pointer"
                                >
                                  Dar Baixa
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Histórico de Compras */}
              <div className="bg-app-card rounded-2xl p-4 border border-app-border shadow-xs space-y-2.5">
                <span className="text-xs font-semibold text-app-text block">
                  Histórico de Vendas ({selectedClient.sales_history?.length || 0})
                </span>

                <div className="space-y-2">
                  {selectedClient.sales_history?.length === 0 ? (
                    <div className="p-3 text-center text-xs text-app-muted">
                      Nenhuma venda registrada para este cliente.
                    </div>
                  ) : (
                    selectedClient.sales_history?.map((s) => (
                      <div
                        key={s.id}
                        className="p-2.5 rounded-xl border border-app-border flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 text-xs text-app-text"
                      >
                        <div>
                          <span className="font-semibold text-app-text mr-2">{s.sale_code}</span>
                          <span className="text-app-muted">{formatDateBR(s.sale_date)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold mr-1">{formatCurrency(s.final_total)}</span>

                          <button
                            onClick={() => setViewReceiptSale(s)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-app-border hover:bg-app-input text-[11px] font-medium text-app-text cursor-pointer transition"
                            title="Ver comprovante e enviar no WhatsApp"
                          >
                            <WhatsAppIcon className="w-3 h-3 text-emerald-500 fill-current" />
                            <span>Comprovante</span>
                          </button>

                          <button
                            onClick={() => setEditingSale(s)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-app-border hover:bg-app-input text-[11px] font-medium text-app-text cursor-pointer transition"
                            title="Editar esta venda (itens, quantidades, valores e parcelas)"
                          >
                            <Edit3 className="w-3 h-3 text-app-muted" />
                            <span>Editar</span>
                          </button>

                          <button
                            onClick={() => handleDeleteSale(s)}
                            disabled={deletingSaleId === s.id}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 text-[11px] font-medium cursor-pointer transition disabled:opacity-50"
                            title="Apagar esta venda e devolver peças ao estoque"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>{deletingSaleId === s.id ? 'Apagando...' : 'Apagar'}</span>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Todas as Peças Compradas (Extrato Geral de Peças Consolidado) */}
              <div className="bg-app-card rounded-2xl p-4 border border-app-border shadow-xs space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-app-border pb-2.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-app-text" />
                      <span className="text-xs font-semibold text-app-text">
                        Todas as Peças Compradas ({allClientItems.length})
                      </span>
                    </div>
                    <p className="text-[11px] text-app-muted mt-0.5">
                      Extrato consolidado de pedidos (mais recentes no topo, antigos abaixo)
                    </p>
                  </div>

                  <div className="flex items-center gap-2 text-xs flex-wrap">
                    <span className="px-2 py-0.5 rounded-lg bg-app-input border border-app-border text-app-text text-[11px]">
                      <strong>{totalPiecesCount}</strong> {totalPiecesCount === 1 ? 'peça' : 'peças'}
                    </span>
                    <span className="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/20 text-[11px]">
                      Total: {formatCurrency(totalPiecesAmount)}
                    </span>
                  </div>
                </div>

                {allClientItems.length > 3 && (
                  <div className="relative">
                    <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-app-muted" />
                    <input
                      type="text"
                      placeholder="Filtrar peça comprada por esta cliente..."
                      value={itemSearch}
                      onChange={(e) => setItemSearch(e.target.value)}
                      className="w-full bg-app-input border border-app-border rounded-xl pl-7 pr-3 py-1 text-xs text-app-text outline-none focus:border-stone-400"
                    />
                  </div>
                )}

                {filteredClientItems.length === 0 ? (
                  <div className="p-4 text-center text-xs text-app-muted">
                    Nenhuma peça encontrada no histórico.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-app-text">
                      <thead>
                        <tr className="border-b border-app-border text-[11px] text-app-muted font-medium">
                          <th className="pb-1.5 font-medium">Data</th>
                          <th className="pb-1.5 font-medium">Pedido</th>
                          <th className="pb-1.5 font-medium">Peça / Produto</th>
                          <th className="pb-1.5 font-medium text-center">Qtd</th>
                          <th className="pb-1.5 font-medium text-right">Unitário</th>
                          <th className="pb-1.5 font-medium text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-app-border/50">
                        {filteredClientItems.map((it, idx) => (
                          <tr key={`${it.sale_id}-${it.id || idx}`} className="hover:bg-app-input/40 transition">
                            <td className="py-2 text-[11px] text-app-muted whitespace-nowrap">
                              {formatDateBR(it.sale_date)}
                            </td>
                            <td className="py-2 font-medium whitespace-nowrap">
                              <span className="px-1.5 py-0.5 rounded bg-app-input border border-app-border text-[10px]">
                                {it.sale_code}
                              </span>
                            </td>
                            <td className="py-2 font-medium">
                              <div className="flex flex-col">
                                <span>{it.product_name}</span>
                                {it.product_sku_snapshot && it.product_sku_snapshot !== 'MANUAL' && (
                                  <span className="text-[10px] text-app-muted">SKU: {it.product_sku_snapshot}</span>
                                )}
                              </div>
                            </td>
                            <td className="py-2 text-center font-semibold text-[11px]">
                              {it.quantity}x
                            </td>
                            <td className="py-2 text-right text-app-muted text-[11px]">
                              {formatCurrency(it.sold_unit_price)}
                            </td>
                            <td className="py-2 text-right font-semibold text-[11px]">
                              {formatCurrency(it.line_final_total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-xs text-app-muted bg-app-card rounded-2xl border border-app-border">
              Selecione um cliente ao lado.
            </div>
          )}
        </div>
      </div>

      {/* Modal Pagamento */}
      {payModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-app-card rounded-3xl max-w-sm w-full p-5 shadow-xl border border-app-border space-y-3.5 text-xs">
            <div className="flex justify-between items-center border-b border-app-border pb-2">
              <h3 className="font-semibold text-app-text text-sm">Receber Pagamento</h3>
              <button onClick={() => setPayModal(null)} className="text-app-muted">
                ✕
              </button>
            </div>

            <form onSubmit={handlePay} className="space-y-3">
              <div>
                <label className="text-app-muted block mb-1">Valor Recebido (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder="0,00"
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
                  onClick={() => setPayModal(null)}
                  className="px-3 py-1.5 text-app-muted"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingPay}
                  className="px-4 py-1.5 rounded-lg bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-medium cursor-pointer"
                >
                  Confirmar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Novo / Editar Cliente */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-app-card rounded-3xl max-w-sm w-full p-5 shadow-xl border border-app-border space-y-3 text-xs">
            <div className="flex justify-between items-center border-b border-app-border pb-2">
              <h3 className="font-semibold text-app-text text-sm">
                {editingClient ? 'Editar Cliente' : 'Novo Cliente'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-app-muted">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveClient} className="space-y-3">
              <div>
                <label className="text-app-muted block mb-1">Nome Completo</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-app-border bg-app-input text-app-text"
                />
              </div>

              <div>
                <label className="text-app-muted block mb-1">WhatsApp / Telefone</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-app-border bg-app-input text-app-text"
                />
              </div>

              <div>
                <label className="text-app-muted block mb-1">Desconto Padrão (%)</label>
                <input
                  type="number"
                  step="0.5"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-app-border bg-app-input text-app-text"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-app-border">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3 py-1.5 text-app-muted"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 rounded-lg bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-medium cursor-pointer"
                >
                  Salvar
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
          client={selectedClient}
          today={today}
          onClose={() => setReminderInst(null)}
        />
      )}

      {/* Modal Comprovante de Venda / WhatsApp */}
      {viewReceiptSale && (
        <SaleReceiptModal
          sale={viewReceiptSale}
          client={selectedClient}
          onClose={() => setViewReceiptSale(null)}
        />
      )}

      {/* Modal Editar Venda */}
      {editingSale && (
        <EditSaleModal
          sale={editingSale}
          products={products}
          onClose={() => setEditingSale(null)}
          onSaveSuccess={(data) => {
            if (onRefreshData) onRefreshData(data);
          }}
        />
      )}
    </div>
  );
}
