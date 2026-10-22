import React, { useState } from 'react';
import {
  ShoppingCart,
  Plus,
  Trash2,
  Calendar,
  CreditCard,
  Banknote,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  Search,
} from 'lucide-react';
import { formatCurrency, formatDateBR, addDaysISO } from '../utils';
import SaleReceiptModal from './SaleReceiptModal';

export default function PosSaleView({
  products = [],
  clients = [],
  today = '',
  onRefreshData,
  onNavigate,
  preselectedClientId = null,
}) {
  const [selectedClientId, setSelectedClientId] = useState(
    preselectedClientId ? String(preselectedClientId) : ''
  );
  const [saleDate, setSaleDate] = useState(today || new Date().toISOString().slice(0, 10));

  // Product search & selection
  const [productSearch, setProductSearch] = useState('');
  const [cartItems, setCartItems] = useState([]);

  // Manual varied item
  const [manualName, setManualName] = useState('');
  const [manualPrice, setManualPrice] = useState('');
  const [manualQty, setManualQty] = useState('1');

  // Discount (Value or %)
  const [saleDiscountType, setSaleDiscountType] = useState('VALUE');
  const [saleDiscountInput, setSaleDiscountInput] = useState('0');

  // Payment
  const [paymentMethod, setPaymentMethod] = useState('FIADO'); // 'A_VISTA', 'CARTAO', 'FIADO'
  const [paymentSubmethod, setPaymentSubmethod] = useState('CADERNINHO');
  const [installmentsCount, setInstallmentsCount] = useState(2);
  const [intervalDays, setIntervalDays] = useState(30);
  const [firstDueDate, setFirstDueDate] = useState(
    addDaysISO(today || new Date().toISOString().slice(0, 10), 30)
  );
  const [initialPaymentAmount, setInitialPaymentAmount] = useState('0');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [completedSaleReceipt, setCompletedSaleReceipt] = useState(null);

  const selectedClient = clients.find((c) => String(c.id) === String(selectedClientId)) || null;

  const handleSelectClient = (idVal) => {
    setSelectedClientId(idVal);
    const cli = clients.find((c) => String(c.id) === String(idVal));
    if (cli && Number(cli.default_discount_percent) > 0) {
      setSaleDiscountType('PERCENT');
      setSaleDiscountInput(String(cli.default_discount_percent));
    }
  };

  const handleSelectPaymentMethod = (method) => {
    setPaymentMethod(method);
    if (method === 'A_VISTA') {
      setPaymentSubmethod('PIX');
      setInstallmentsCount(1);
      setFirstDueDate(saleDate);
      setInitialPaymentAmount('0');
    } else if (method === 'CARTAO') {
      setPaymentSubmethod('CREDITO');
      setFirstDueDate(addDaysISO(saleDate, 30));
      setInitialPaymentAmount('0');
    } else if (method === 'FIADO') {
      setPaymentSubmethod('CADERNINHO');
      setFirstDueDate(addDaysISO(saleDate, 30));
    }
  };

  const handleAddCatalogProduct = (product) => {
    setFeedback(null);
    setCartItems((prev) => {
      const idx = prev.findIndex((i) => !i.is_manual_item && i.product_id === product.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], quantity: copy[idx].quantity + 1 };
        return copy;
      }
      return [
        ...prev,
        {
          tempId: `prod-${product.id}-${Date.now()}`,
          product_id: product.id,
          sku: product.sku,
          product_name: product.name,
          is_manual_item: false,
          quantity: 1,
          catalog_unit_price: Number(product.sale_price),
          sold_unit_price: Number(product.sale_price),
        },
      ];
    });
  };

  const handleAddManualItem = (e) => {
    e.preventDefault();
    const p = Number(String(manualPrice).replace(',', '.'));
    const q = Math.max(1, Number(manualQty) || 1);
    if (!manualName.trim() || isNaN(p) || p <= 0) return;

    setCartItems((prev) => [
      ...prev,
      {
        tempId: `manual-${Date.now()}`,
        product_id: null,
        sku: 'VARIADO',
        product_name: manualName.trim(),
        is_manual_item: true,
        quantity: q,
        catalog_unit_price: p,
        sold_unit_price: p,
      },
    ]);
    setManualName('');
    setManualPrice('');
    setManualQty('1');
  };

  const updateCartItem = (tempId, field, val) => {
    setCartItems((prev) =>
      prev.map((i) => {
        if (i.tempId !== tempId) return i;
        if (field === 'quantity') return { ...i, quantity: Math.max(1, Number(val) || 1) };
        if (field === 'sold_unit_price') {
          return {
            ...i,
            sold_unit_price: Math.max(0, Number(String(val).replace(',', '.')) || 0),
          };
        }
        return i;
      })
    );
  };

  const removeCartItem = (tempId) => {
    setCartItems((prev) => prev.filter((i) => i.tempId !== tempId));
  };

  // Calculations
  const totals = cartItems.reduce(
    (acc, i) => {
      const orig = Math.max(i.catalog_unit_price, i.sold_unit_price) * i.quantity;
      const fin = i.sold_unit_price * i.quantity;
      acc.original += orig;
      acc.itemsDiscount += Math.max(0, orig - fin);
      acc.subtotal += fin;
      return acc;
    },
    { original: 0, itemsDiscount: 0, subtotal: 0 }
  );

  const discountNum = Math.max(0, Number(String(saleDiscountInput).replace(',', '.')) || 0);
  const saleDiscount =
    saleDiscountType === 'PERCENT'
      ? Number((totals.subtotal * (Math.min(100, discountNum) / 100)).toFixed(2))
      : Math.min(totals.subtotal, discountNum);

  const totalDiscount = Number((totals.itemsDiscount + saleDiscount).toFixed(2));
  const finalTotal = Number(Math.max(0, totals.original - totalDiscount).toFixed(2));

  // Installment schedule
  const numInst = Math.max(1, Number(installmentsCount) || 1);
  const step = Math.max(1, Number(intervalDays) || 30);
  const startDue = firstDueDate || saleDate;

  const previewInstallments = [];
  if (finalTotal > 0) {
    const baseVal = Math.floor((finalTotal / numInst) * 100) / 100;
    let acc = 0;
    for (let i = 1; i <= numInst; i++) {
      const isLast = i === numInst;
      const v = isLast ? Number((finalTotal - acc).toFixed(2)) : baseVal;
      acc = Number((acc + v).toFixed(2));
      previewInstallments.push({
        num: i,
        due: i === 1 ? startDue : addDaysISO(startDue, (i - 1) * step),
        amount: v,
      });
    }
  }

  const handleFinalizeSale = async () => {
    if (cartItems.length === 0) {
      setFeedback({ type: 'error', message: 'Selecione ao menos um produto.' });
      return;
    }
    if (paymentMethod === 'FIADO' && !selectedClientId) {
      setFeedback({ type: 'error', message: 'Selecione o cliente para venda no fiado.' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: selectedClientId ? Number(selectedClientId) : null,
          sale_date: saleDate,
          payment_method: paymentMethod,
          payment_submethod: paymentSubmethod,
          installments_count: numInst,
          interval_days: step,
          first_due_date: startDue,
          items: cartItems,
          sale_discount_type: saleDiscountType,
          sale_discount_input: discountNum,
          initial_payment_amount:
            paymentMethod === 'FIADO'
              ? Math.max(0, Number(String(initialPaymentAmount).replace(',', '.')) || 0)
              : 0,
          notes,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        await onRefreshData(data);
        const newSale = data.created_sale || (data.sales && data.sales[0]);
        setCartItems([]);
        setSaleDiscountInput('0');
        setInitialPaymentAmount('0');
        setNotes('');
        setFeedback({
          type: 'success',
          message: `Venda ${newSale?.sale_code || ''} registrada com sucesso!`,
        });
        if (newSale) {
          setCompletedSaleReceipt(newSale);
        }
      } else {
        setFeedback({ type: 'error', message: data.error || 'Erro ao registrar venda.' });
      }
    } catch (_err) {
      setFeedback({ type: 'error', message: 'Erro de comunicação ao salvar venda.' });
    } finally {
      setSubmitting(false);
    }
  };

  const filteredProducts = products.filter((p) => {
    const q = productSearch.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-5">
      {feedback && (
        <div
          className={`p-3.5 rounded-2xl flex items-center justify-between text-xs font-medium ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
              : 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
            )}
            <span>{feedback.message}</span>
          </div>
          {feedback.type === 'success' && (
            <button
              onClick={() => onNavigate('receivables')}
              className="underline font-semibold cursor-pointer"
            >
              Ver parcelas
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Esquerda: Cliente + Itens */}
        <div className="lg:col-span-7 space-y-4">
          {/* Cliente */}
          <div className="bg-app-card rounded-2xl p-4 border border-app-border shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-app-text">Cliente</label>
              {selectedClient && selectedClient.total_debt > 0 && (
                <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                  Saldo devedor atual: <strong>{formatCurrency(selectedClient.total_debt)}</strong>
                </span>
              )}
            </div>
            <select
              value={selectedClientId}
              onChange={(e) => handleSelectClient(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-app-border bg-app-input text-app-text text-xs font-medium focus:outline-none focus:border-stone-500"
            >
              <option value="">Cliente Balcão (Avulso)</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.phone ? `(${c.phone})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Produtos do Estoque */}
          <div className="bg-app-card rounded-2xl p-4 border border-app-border shadow-xs space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-app-text">Catálogo de Produtos</span>
              <div className="relative w-48">
                <Search className="w-3.5 h-3.5 text-app-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Filtrar produto..."
                  className="w-full pl-8 pr-2.5 py-1 rounded-lg border border-app-border text-xs bg-app-input text-app-text focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
              {filteredProducts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleAddCatalogProduct(p)}
                  className="p-2.5 rounded-xl border border-app-border hover:border-stone-400 bg-app-input hover:bg-app-card transition text-left cursor-pointer flex flex-col justify-between"
                >
                  <div className="text-xs font-medium text-app-text line-clamp-1">{p.name}</div>
                  <div className="flex items-center justify-between mt-1 text-[11px]">
                    <span className="text-app-muted">Estoque: {p.stock_qty}</span>
                    <span className="font-semibold text-app-text">
                      {formatCurrency(p.sale_price)}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {/* Inserir Item Variado / Preço Manual */}
            <form
              onSubmit={handleAddManualItem}
              className="pt-2 border-t border-app-border flex items-center gap-2"
            >
              <input
                type="text"
                placeholder="Produto variado / avulso..."
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                className="flex-1 px-2.5 py-1.5 rounded-lg border border-app-border text-xs bg-app-input text-app-text"
              />
              <input
                type="number"
                step="0.01"
                placeholder="R$ Valor"
                value={manualPrice}
                onChange={(e) => setManualPrice(e.target.value)}
                className="w-24 px-2.5 py-1.5 rounded-lg border border-app-border text-xs bg-app-input text-app-text font-medium"
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:hover:bg-white text-white dark:text-stone-900 text-xs font-medium cursor-pointer"
              >
                + Adicionar
              </button>
            </form>
          </div>

          {/* Carrinho / Itens Selecionados */}
          <div className="bg-app-card rounded-2xl p-4 border border-app-border shadow-xs space-y-2.5">
            <div className="text-xs font-semibold text-app-text">
              Itens da Venda ({cartItems.length})
            </div>

            {cartItems.length === 0 ? (
              <div className="py-6 text-center text-xs text-app-muted border border-dashed border-app-border rounded-xl">
                Nenhum item adicionado à venda.
              </div>
            ) : (
              <div className="space-y-2">
                {cartItems.map((item) => (
                  <div
                    key={item.tempId}
                    className="p-2.5 rounded-xl bg-app-input border border-app-border flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-app-text truncate">{item.product_name}</div>
                      {item.catalog_unit_price !== item.sold_unit_price && (
                        <span className="text-[10px] text-app-muted line-through">
                          Orig: {formatCurrency(item.catalog_unit_price)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateCartItem(item.tempId, 'quantity', e.target.value)}
                        className="w-12 px-1.5 py-1 rounded bg-app-card border border-app-border text-app-text text-center font-medium"
                      />
                      <input
                        type="number"
                        step="0.01"
                        value={item.sold_unit_price}
                        onChange={(e) =>
                          updateCartItem(item.tempId, 'sold_unit_price', e.target.value)
                        }
                        className="w-20 px-1.5 py-1 rounded bg-app-card border border-app-border text-app-text text-right font-medium"
                      />
                      <span className="w-18 text-right font-semibold text-app-text">
                        {formatCurrency(item.sold_unit_price * item.quantity)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeCartItem(item.tempId)}
                        className="text-app-muted hover:text-red-500 p-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Direita: Pagamento, Desconto e Finalização */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-app-card rounded-2xl p-5 border border-app-border shadow-xs space-y-4">
            <span className="text-xs font-semibold text-app-text block">Forma de Pagamento</span>

            {/* Seleção de Meio de Pagamento */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'A_VISTA', label: 'À Vista', icon: Banknote },
                { id: 'CARTAO', label: 'Cartão', icon: CreditCard },
                { id: 'FIADO', label: 'Fiado', icon: BookOpen },
              ].map((m) => {
                const Icon = m.icon;
                const isSel = paymentMethod === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleSelectPaymentMethod(m.id)}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-medium flex flex-col items-center gap-1 transition cursor-pointer ${
                      isSel
                        ? 'border-stone-900 bg-stone-900 text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900 shadow-xs'
                        : 'border-app-border bg-app-input text-app-muted hover:text-app-text'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Detalhes de Parcelas */}
            {(paymentMethod === 'FIADO' || paymentMethod === 'CARTAO') && (
              <div className="p-3.5 rounded-xl bg-app-input border border-app-border space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="text-app-muted block mb-1">Parcelas</label>
                    <select
                      value={installmentsCount}
                      onChange={(e) => setInstallmentsCount(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-app-card border border-app-border text-app-text font-medium"
                    >
                      <option value={1}>1x (Única)</option>
                      {[2, 3, 4, 5, 6, 8, 10, 12].map((n) => (
                        <option key={n} value={n}>
                          {n}x
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-app-muted block mb-1">1º Vencimento</label>
                    <input
                      type="date"
                      value={firstDueDate}
                      onChange={(e) => setFirstDueDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-app-card border border-app-border text-app-text font-medium text-xs"
                    />
                  </div>
                </div>

                {installmentsCount > 1 && (
                  <div className="text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-app-muted block">Intervalo entre parcelas</label>
                      <span className="text-[11px] font-semibold text-app-text">
                        A cada {intervalDays} dias
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <div className="grid grid-cols-4 gap-1 flex-1">
                        {[15, 30, 60, 90].map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setIntervalDays(d)}
                            className={`py-1 rounded-md text-xs font-medium border cursor-pointer transition ${
                              intervalDays === d
                                ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 border-stone-900 dark:border-stone-100'
                                : 'bg-app-card text-app-text border-app-border hover:bg-app-input'
                            }`}
                          >
                            {d}d
                          </button>
                        ))}
                      </div>

                      {/* Campo para digitar qualquer outro intervalo livremente */}
                      <div className="flex items-center gap-1 shrink-0">
                        <input
                          type="number"
                          min="1"
                          max="365"
                          value={intervalDays}
                          onChange={(e) => setIntervalDays(Math.max(1, Number(e.target.value) || 1))}
                          className="w-14 px-1.5 py-1 rounded-md bg-app-card border border-app-border text-center text-xs font-bold text-app-text"
                          title="Digite qualquer quantidade de dias personalizada"
                        />
                        <span className="text-[11px] text-app-muted">dias</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Lista de Vencimentos */}
                {previewInstallments.length > 0 && (
                  <div className="space-y-1 pt-1 max-h-28 overflow-y-auto pr-1">
                    {previewInstallments.map((inst) => (
                      <div
                        key={inst.num}
                        className="flex justify-between text-[11px] text-app-text px-2 py-1 bg-app-card rounded border border-app-border"
                      >
                        <span>
                          {inst.num}ª parcela • {formatDateBR(inst.due)}
                        </span>
                        <span className="font-semibold text-app-text">
                          {formatCurrency(inst.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Desconto */}
            <div className="pt-2 border-t border-app-border space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-app-text">Desconto</span>
                <div className="flex gap-1 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setSaleDiscountType('VALUE')}
                    className={`px-2 py-0.5 rounded ${
                      saleDiscountType === 'VALUE'
                        ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
                        : 'text-app-muted'
                    }`}
                  >
                    R$
                  </button>
                  <button
                    type="button"
                    onClick={() => setSaleDiscountType('PERCENT')}
                    className={`px-2 py-0.5 rounded ${
                      saleDiscountType === 'PERCENT'
                        ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
                        : 'text-app-muted'
                    }`}
                  >
                    %
                  </button>
                </div>
              </div>
              <input
                type="number"
                step="0.01"
                min="0"
                value={saleDiscountInput}
                onChange={(e) => setSaleDiscountInput(e.target.value)}
                placeholder="Valor do desconto"
                className="w-full px-3 py-1.5 rounded-xl border border-app-border text-app-text text-xs font-medium bg-app-input"
              />
            </div>

            {/* Resumo Financeiro Claro */}
            <div className="pt-3 border-t border-app-border space-y-1.5 text-xs">
              <div className="flex justify-between text-app-muted">
                <span>Valor original:</span>
                <span>{formatCurrency(totals.original)}</span>
              </div>
              {totalDiscount > 0 && (
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-medium">
                  <span>Desconto concedido:</span>
                  <span>- {formatCurrency(totalDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-semibold text-app-text pt-1 border-t border-app-border">
                <span>Total Final:</span>
                <span className="text-lg font-bold">{formatCurrency(finalTotal)}</span>
              </div>
            </div>

            <button
              type="button"
              disabled={submitting || cartItems.length === 0}
              onClick={handleFinalizeSale}
              className="w-full py-3 rounded-xl bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:hover:bg-white text-white dark:text-stone-900 font-medium text-xs transition cursor-pointer disabled:opacity-40 shadow-xs"
            >
              {submitting ? 'Salvando...' : `Concluir Venda (${formatCurrency(finalTotal)})`}
            </button>
          </div>
        </div>
      </div>

      {completedSaleReceipt && (
        <SaleReceiptModal
          sale={completedSaleReceipt}
          client={clients.find((c) => c.id === completedSaleReceipt.client_id) || selectedClient}
          onClose={() => setCompletedSaleReceipt(null)}
        />
      )}
    </div>
  );
}
