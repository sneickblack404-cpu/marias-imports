import React, { useState, useMemo } from 'react';
import {
  X,
  Plus,
  Trash2,
  Calendar,
  DollarSign,
  Package,
  Save,
  AlertCircle,
  Search,
} from 'lucide-react';
import { formatCurrency, formatDateBR, addDaysISO } from '../utils';

export default function EditSaleModal({
  sale,
  products = [],
  onClose,
  onSaveSuccess,
}) {
  if (!sale) return null;

  const [saleDate, setSaleDate] = useState(sale.sale_date || '');
  const [paymentMethod, setPaymentMethod] = useState(sale.payment_method || 'FIADO');
  const [paymentSubmethod, setPaymentSubmethod] = useState(sale.payment_submethod || 'CADERNINHO');
  const [installmentsCount, setInstallmentsCount] = useState(sale.installments_count || 1);
  const [intervalDays, setIntervalDays] = useState(sale.interval_days || 30);
  const [firstDueDate, setFirstDueDate] = useState(
    sale.first_due_date || (sale.installments?.[0]?.due_date) || sale.sale_date || ''
  );

  // Items in the sale
  const [items, setItems] = useState(() => {
    if (Array.isArray(sale.items) && sale.items.length > 0) {
      return sale.items.map((it, idx) => ({
        tempId: `item-${it.id || idx}-${Date.now()}`,
        product_id: it.product_id || null,
        product_sku_snapshot: it.product_sku_snapshot || 'MANUAL',
        product_name: it.product_name || 'Item Variado',
        is_manual_item: Boolean(it.is_manual_item || !it.product_id),
        quantity: Number(it.quantity) || 1,
        catalog_unit_price: Number(it.catalog_unit_price ?? it.sold_unit_price ?? 0),
        sold_unit_price: Number(it.sold_unit_price ?? 0),
      }));
    }
    return [];
  });

  // Discount
  const [saleDiscountType, setSaleDiscountType] = useState(sale.sale_discount_type || 'VALUE');
  const [saleDiscountInput, setSaleDiscountInput] = useState(String(sale.sale_discount_input || '0'));
  const [notes, setNotes] = useState(sale.notes || '');

  // Add Item states
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualPrice, setManualPrice] = useState('');
  const [manualQty, setManualQty] = useState('1');

  // Submit states
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Calculate live financial figures
  const { subtotal, totalDiscount, finalTotal, installmentsPreview } = useMemo(() => {
    let sub = 0;
    items.forEach((it) => {
      sub += (Number(it.sold_unit_price) || 0) * (Number(it.quantity) || 1);
    });

    const discVal = Math.max(0, parseFloat(saleDiscountInput.replace(',', '.')) || 0);
    let discountAmount = 0;
    if (saleDiscountType === 'PERCENT') {
      discountAmount = sub * (Math.min(100, discVal) / 100);
    } else {
      discountAmount = Math.min(sub, discVal);
    }

    const finalVal = Math.max(0, sub - discountAmount);

    // Installments preview
    const count = Math.max(1, Number(installmentsCount) || 1);
    const step = Math.max(1, Number(intervalDays) || 30);
    const startDue = firstDueDate || saleDate || new Date().toISOString().slice(0, 10);

    const baseAmount = Math.floor((finalVal / count) * 100) / 100;
    let acc = 0;
    const instList = [];
    for (let i = 1; i <= count; i++) {
      const isLast = i === count;
      const amount = isLast ? Math.round((finalVal - acc) * 100) / 100 : baseAmount;
      acc += amount;
      const dueDate = i === 1 ? startDue : addDaysISO(startDue, (i - 1) * step);
      instList.push({
        num: i,
        due_date: dueDate,
        amount,
      });
    }

    return {
      subtotal: sub,
      totalDiscount: discountAmount,
      finalTotal: finalVal,
      installmentsPreview: instList,
    };
  }, [items, saleDiscountType, saleDiscountInput, installmentsCount, intervalDays, firstDueDate, saleDate]);

  // Catalog products filtered
  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products.slice(0, 8);
    const q = productSearch.toLowerCase();
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || (p.sku && p.sku.toLowerCase().includes(q)))
      .slice(0, 15);
  }, [products, productSearch]);

  const handleUpdateItemQty = (tempId, newQty) => {
    const qty = Math.max(1, Number(newQty) || 1);
    setItems((prev) => prev.map((it) => (it.tempId === tempId ? { ...it, quantity: qty } : it)));
  };

  const handleUpdateItemPrice = (tempId, newPriceStr) => {
    const clean = Math.max(0, parseFloat(newPriceStr.replace(',', '.')) || 0);
    setItems((prev) =>
      prev.map((it) =>
        it.tempId === tempId
          ? { ...it, sold_unit_price: clean, catalog_unit_price: Math.max(it.catalog_unit_price, clean) }
          : it
      )
    );
  };

  const handleRemoveItem = (tempId) => {
    if (items.length === 1) {
      if (!confirm('A venda ficará sem nenhum item. Deseja remover mesmo assim?')) return;
    }
    setItems((prev) => prev.filter((it) => it.tempId !== tempId));
  };

  const handleAddCatalogProduct = (prod) => {
    setItems((prev) => {
      const existingIdx = prev.findIndex((i) => !i.is_manual_item && i.product_id === prod.id);
      if (existingIdx >= 0) {
        const copy = [...prev];
        copy[existingIdx] = { ...copy[existingIdx], quantity: copy[existingIdx].quantity + 1 };
        return copy;
      }
      return [
        ...prev,
        {
          tempId: `prod-${prod.id}-${Date.now()}`,
          product_id: prod.id,
          product_sku_snapshot: prod.sku || 'CATALOG',
          product_name: prod.name,
          is_manual_item: false,
          quantity: 1,
          catalog_unit_price: Number(prod.sale_price) || 0,
          sold_unit_price: Number(prod.sale_price) || 0,
        },
      ];
    });
    setProductSearch('');
    setShowAddMenu(false);
  };

  const handleAddManualItem = (e) => {
    e.preventDefault();
    if (!manualName.trim()) return;
    const price = Math.max(0, parseFloat(manualPrice.replace(',', '.')) || 0);
    const qty = Math.max(1, parseInt(manualQty) || 1);

    setItems((prev) => [
      ...prev,
      {
        tempId: `manual-${Date.now()}`,
        product_id: null,
        product_sku_snapshot: 'MANUAL',
        product_name: manualName.trim(),
        is_manual_item: true,
        quantity: qty,
        catalog_unit_price: price,
        sold_unit_price: price,
      },
    ]);

    setManualName('');
    setManualPrice('');
    setManualQty('1');
    setShowAddMenu(false);
  };

  const handleSave = async () => {
    setErrorMsg(null);
    if (items.length === 0) {
      setErrorMsg('A venda deve conter pelo menos 1 item ou peça.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        sale_date: saleDate,
        payment_method: paymentMethod,
        payment_submethod: paymentSubmethod,
        installments_count: Number(installmentsCount) || 1,
        interval_days: Number(intervalDays) || 30,
        first_due_date: firstDueDate,
        sale_discount_type: saleDiscountType,
        sale_discount_input: parseFloat(saleDiscountInput.replace(',', '.')) || 0,
        notes,
        items: items.map((it) => ({
          product_id: it.product_id,
          product_sku_snapshot: it.product_sku_snapshot,
          product_name: it.product_name,
          is_manual_item: it.is_manual_item,
          quantity: it.quantity,
          catalog_unit_price: it.catalog_unit_price,
          sold_unit_price: it.sold_unit_price,
        })),
      };

      const res = await fetch(`/api/sales/${sale.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Erro ao atualizar a venda.');
      }

      if (onSaveSuccess) {
        onSaveSuccess(json);
      }
      onClose();
    } catch (err) {
      console.error('Erro ao salvar venda:', err);
      setErrorMsg(err.message || 'Falha ao conectar com o servidor.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-app-card rounded-3xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl border border-app-border space-y-4 text-xs my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-app-border pb-3 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-app-text text-sm">
                Editar Venda {sale.sale_code}
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-app-input border border-app-border text-[10px] font-medium text-app-muted">
                {sale.client_name_snapshot || 'Cliente'}
              </span>
            </div>
            <p className="text-[11px] text-app-muted mt-0.5">
              Altere os itens, preços, quantidades, desconto ou parcelamento desta venda.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-app-muted hover:text-app-text hover:bg-app-input transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center gap-2 text-xs shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Scrollable Content */}
        <div className="overflow-y-auto pr-1 space-y-4 flex-1">
          {/* Linha 1: Data e Forma de Pagamento */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-app-muted block mb-1">
                Data da Venda
              </label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-app-muted" />
                <input
                  type="date"
                  value={saleDate}
                  onChange={(e) => setSaleDate(e.target.value)}
                  className="w-full bg-app-input border border-app-border rounded-xl pl-8 pr-3 py-2 text-xs text-app-text outline-none focus:border-stone-400"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-medium text-app-muted block mb-1">
                Forma de Pagamento
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => {
                  const m = e.target.value;
                  setPaymentMethod(m);
                  if (m === 'A_VISTA') {
                    setPaymentSubmethod('PIX');
                    setInstallmentsCount(1);
                  } else if (m === 'CARTAO') {
                    setPaymentSubmethod('CREDITO');
                  } else if (m === 'FIADO') {
                    setPaymentSubmethod('CADERNINHO');
                  }
                }}
                className="w-full bg-app-input border border-app-border rounded-xl px-3 py-2 text-xs text-app-text outline-none focus:border-stone-400"
              >
                <option value="FIADO">Fiado (Caderninho / Crediário)</option>
                <option value="A_VISTA">À Vista (PIX / Dinheiro)</option>
                <option value="CARTAO">Cartão de Crédito / Débito</option>
              </select>
            </div>
          </div>

          {/* Peças / Itens da Venda */}
          <div className="space-y-2 border border-app-border rounded-2xl p-3 bg-app-input/20">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-app-text flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-app-muted" />
                Itens Comprados ({items.length})
              </span>

              <button
                type="button"
                onClick={() => setShowAddMenu(!showAddMenu)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-medium text-[11px] cursor-pointer hover:opacity-90 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Adicionar Peça</span>
              </button>
            </div>

            {/* Menu Dropdown de Adição */}
            {showAddMenu && (
              <div className="p-3 rounded-xl border border-app-border bg-app-card shadow-lg space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-semibold text-app-text">
                    Adicionar Produto do Estoque ou Avulso
                  </span>
                  <button
                    onClick={() => setShowAddMenu(false)}
                    className="text-app-muted hover:text-app-text text-[11px]"
                  >
                    Fechar
                  </button>
                </div>

                {/* Buscar catálogo */}
                <div className="space-y-1.5">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-app-muted" />
                    <input
                      type="text"
                      placeholder="Buscar por nome ou SKU no estoque..."
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      className="w-full bg-app-input border border-app-border rounded-lg pl-7 pr-3 py-1.5 text-xs text-app-text outline-none"
                    />
                  </div>

                  <div className="max-h-36 overflow-y-auto space-y-1 divide-y divide-app-border/40">
                    {filteredProducts.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => handleAddCatalogProduct(p)}
                        className="p-1.5 flex justify-between items-center hover:bg-app-input/60 rounded-lg cursor-pointer transition text-xs"
                      >
                        <div>
                          <span className="font-medium text-app-text block">{p.name}</span>
                          <span className="text-[10px] text-app-muted">
                            {p.sku ? `SKU: ${p.sku} • ` : ''}Estoque: {p.stock_qty} un
                          </span>
                        </div>
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(p.sale_price)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Formulário Avulso */}
                <div className="pt-2 border-t border-app-border">
                  <span className="text-[10px] text-app-muted block mb-1">
                    Ou adicione um item avulso/manual:
                  </span>
                  <div className="grid grid-cols-12 gap-1.5">
                    <input
                      type="text"
                      placeholder="Nome do item / peça..."
                      value={manualName}
                      onChange={(e) => setManualName(e.target.value)}
                      className="col-span-6 bg-app-input border border-app-border rounded-lg px-2 py-1 text-xs text-app-text outline-none"
                    />
                    <input
                      type="number"
                      placeholder="Qtd"
                      min="1"
                      value={manualQty}
                      onChange={(e) => setManualQty(e.target.value)}
                      className="col-span-2 bg-app-input border border-app-border rounded-lg px-2 py-1 text-xs text-app-text outline-none text-center"
                    />
                    <input
                      type="text"
                      placeholder="Preço R$"
                      value={manualPrice}
                      onChange={(e) => setManualPrice(e.target.value)}
                      className="col-span-2 bg-app-input border border-app-border rounded-lg px-2 py-1 text-xs text-app-text outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleAddManualItem}
                      className="col-span-2 px-2 py-1 rounded-lg bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-medium text-[11px] cursor-pointer"
                    >
                      Inserir
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Lista dos Itens da Venda */}
            {items.length === 0 ? (
              <div className="p-4 text-center text-app-muted text-xs">
                Nenhum item na venda. Clique em "Adicionar Peça" acima.
              </div>
            ) : (
              <div className="space-y-1.5">
                {items.map((it) => {
                  const lineTotal = (Number(it.sold_unit_price) || 0) * (Number(it.quantity) || 1);
                  return (
                    <div
                      key={it.tempId}
                      className="p-2.5 rounded-xl border border-app-border bg-app-card flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex-1">
                        <span className="font-medium text-app-text block">{it.product_name}</span>
                        {it.product_sku_snapshot && it.product_sku_snapshot !== 'MANUAL' && (
                          <span className="text-[10px] text-app-muted">SKU: {it.product_sku_snapshot}</span>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        {/* Qtd */}
                        <div className="flex items-center border border-app-border rounded-lg bg-app-input overflow-hidden">
                          <button
                            type="button"
                            onClick={() => handleUpdateItemQty(it.tempId, it.quantity - 1)}
                            className="px-2 py-1 text-app-muted hover:text-app-text cursor-pointer"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={it.quantity}
                            onChange={(e) => handleUpdateItemQty(it.tempId, e.target.value)}
                            className="w-10 text-center bg-transparent text-xs text-app-text outline-none font-semibold"
                          />
                          <button
                            type="button"
                            onClick={() => handleUpdateItemQty(it.tempId, it.quantity + 1)}
                            className="px-2 py-1 text-app-muted hover:text-app-text cursor-pointer"
                          >
                            +
                          </button>
                        </div>

                        {/* Preço Unitário Editável */}
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-app-muted">R$</span>
                          <input
                            type="number"
                            step="0.01"
                            value={it.sold_unit_price}
                            onChange={(e) => handleUpdateItemPrice(it.tempId, e.target.value)}
                            className="w-16 bg-app-input border border-app-border rounded-lg px-2 py-1 text-xs text-app-text font-medium outline-none text-right"
                          />
                        </div>

                        {/* Total Linha */}
                        <span className="font-semibold text-app-text w-20 text-right">
                          {formatCurrency(lineTotal)}
                        </span>

                        {/* Botão Remover */}
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(it.tempId)}
                          className="p-1 rounded-lg text-rose-500 hover:bg-rose-500/10 cursor-pointer transition"
                          title="Remover peça"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Desconto Geral e Parcelamento */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Desconto */}
            <div className="p-3 border border-app-border rounded-2xl bg-app-input/20 space-y-2">
              <span className="font-medium text-app-text text-[11px] block">
                Desconto da Venda
              </span>
              <div className="flex gap-2">
                <select
                  value={saleDiscountType}
                  onChange={(e) => setSaleDiscountType(e.target.value)}
                  className="bg-app-input border border-app-border rounded-xl px-2.5 py-1.5 text-xs text-app-text outline-none"
                >
                  <option value="VALUE">R$ (Valor)</option>
                  <option value="PERCENT">% (Porcento)</option>
                </select>
                <input
                  type="text"
                  placeholder="0,00"
                  value={saleDiscountInput}
                  onChange={(e) => setSaleDiscountInput(e.target.value)}
                  className="flex-1 bg-app-input border border-app-border rounded-xl px-3 py-1.5 text-xs text-app-text outline-none text-right font-medium"
                />
              </div>
              {totalDiscount > 0 && (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block text-right font-medium">
                  Desconto aplicado: - {formatCurrency(totalDiscount)}
                </span>
              )}
            </div>

            {/* Parcelamento */}
            <div className="p-3 border border-app-border rounded-2xl bg-app-input/20 space-y-2">
              <span className="font-medium text-app-text text-[11px] block">
                Configuração das Parcelas
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-app-muted block">Qtd Parcelas</label>
                  <select
                    value={installmentsCount}
                    onChange={(e) => setInstallmentsCount(Number(e.target.value))}
                    className="w-full bg-app-input border border-app-border rounded-xl px-2 py-1.5 text-xs text-app-text outline-none mt-0.5"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12].map((n) => (
                      <option key={n} value={n}>
                        {n}x {n > 1 ? `de ${formatCurrency(finalTotal / n)}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-app-muted block">1º Vencimento</label>
                  <input
                    type="date"
                    value={firstDueDate}
                    onChange={(e) => setFirstDueDate(e.target.value)}
                    className="w-full bg-app-input border border-app-border rounded-xl px-2 py-1 text-xs text-app-text outline-none mt-0.5"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Prévia das Parcelas */}
          {installmentsPreview.length > 1 && (
            <div className="p-3 border border-app-border rounded-2xl bg-app-card space-y-1.5">
              <span className="text-[11px] font-semibold text-app-text block">
                Cronograma de Parcelas Gerado:
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {installmentsPreview.map((inst) => (
                  <div
                    key={inst.num}
                    className="p-2 rounded-xl border border-app-border bg-app-input/40 flex justify-between items-center text-[11px]"
                  >
                    <span className="font-semibold text-app-text">{inst.num}ª Parcela</span>
                    <div className="text-right">
                      <span className="block font-medium">{formatCurrency(inst.amount)}</span>
                      <span className="text-[10px] text-app-muted">{formatDateBR(inst.due_date)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Observações */}
          <div>
            <label className="text-[11px] font-medium text-app-muted block mb-1">
              Observações da Venda
            </label>
            <input
              type="text"
              placeholder="Ex: Pegou para provar, combinou de pagar no dia 10..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-app-input border border-app-border rounded-xl px-3 py-2 text-xs text-app-text outline-none focus:border-stone-400"
            />
          </div>
        </div>

        {/* Resumo Financeiro & Ações de Salvar */}
        <div className="border-t border-app-border pt-3 space-y-3 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl bg-app-input/50 border border-app-border text-xs">
            <div>
              <span className="text-app-muted block text-[11px]">Subtotal:</span>
              <span className="font-semibold text-app-text">{formatCurrency(subtotal)}</span>
            </div>
            {totalDiscount > 0 && (
              <div>
                <span className="text-emerald-600 dark:text-emerald-400 block text-[11px]">Desconto:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  - {formatCurrency(totalDiscount)}
                </span>
              </div>
            )}
            <div>
              <span className="text-app-muted block text-[11px]">Total Final:</span>
              <span className="font-bold text-sm text-app-text">{formatCurrency(finalTotal)}</span>
            </div>
          </div>

          <div className="flex justify-end items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-xl border border-app-border text-app-muted hover:text-app-text hover:bg-app-input font-medium cursor-pointer transition"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-semibold cursor-pointer shadow-sm hover:opacity-95 transition disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Salvando...' : 'Salvar Alterações'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
