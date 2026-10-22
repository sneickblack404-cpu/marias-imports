import React, { useState } from 'react';
import { Package, Plus, Search, Edit3, ArrowUp, ArrowDown, Trash2 } from 'lucide-react';
import { formatCurrency } from '../utils';

export default function InventoryView({ products = [], onRefreshData }) {
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState('ALL'); // 'ALL', 'LOW'
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const [form, setForm] = useState({
    sku: '',
    name: '',
    category: 'Geral',
    cost_price: '',
    sale_price: '',
    stock_qty: '10',
    min_stock_qty: '3',
    unit: 'UN',
  });
  const [saving, setSaving] = useState(false);

  const openNew = () => {
    setEditingProduct(null);
    setForm({
      sku: '',
      name: '',
      category: 'Geral',
      cost_price: '',
      sale_price: '',
      stock_qty: '10',
      min_stock_qty: '3',
      unit: 'UN',
    });
    setShowModal(true);
  };

  const openEdit = (p) => {
    setEditingProduct(p);
    setForm({
      sku: p.sku,
      name: p.name,
      category: p.category,
      cost_price: String(p.cost_price),
      sale_price: String(p.sale_price),
      stock_qty: String(p.stock_qty),
      min_stock_qty: String(p.min_stock_qty),
      unit: p.unit || 'UN',
    });
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const url = editingProduct ? `/api/products/${editingProduct.id}` : '/api/products';
      const method = editingProduct ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          cost_price: Number(String(form.cost_price).replace(',', '.')) || 0,
          sale_price: Number(String(form.sale_price).replace(',', '.')) || 0,
          stock_qty: Number(form.stock_qty) || 0,
          min_stock_qty: Number(form.min_stock_qty) || 0,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        await onRefreshData(data);
        setShowModal(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleAdjust = async (p, delta) => {
    const res = await fetch(`/api/products/${p.id}/stock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delta }),
    });
    if (res.ok) {
      const data = await res.json();
      await onRefreshData(data);
    }
  };

  const handleDeleteProduct = async (product) => {
    if (!window.confirm(`Deseja realmente remover o produto "${product.name}" do estoque?`)) {
      return;
    }
    setDeletingId(product.id);
    try {
      const res = await fetch(`/api/products/${product.id}`, { method: 'DELETE' });
      if (res.ok) {
        const data = await res.json();
        await onRefreshData(data);
      }
    } finally {
      setDeletingId(null);
    }
  };

  const lowCount = products.filter((p) => p.stock_qty <= p.min_stock_qty).length;

  const filtered = products.filter((p) => {
    const q = search.toLowerCase();
    const match = p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
    if (!match) return false;
    if (filterMode === 'LOW') return p.stock_qty <= p.min_stock_qty;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Top Header Clean */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 text-app-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar produto..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-app-border bg-app-card text-app-text text-xs focus:outline-none focus:border-stone-500"
            />
          </div>
          <button
            type="button"
            onClick={() => setFilterMode(filterMode === 'ALL' ? 'LOW' : 'ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border cursor-pointer transition ${
              filterMode === 'LOW'
                ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/40'
                : 'bg-app-card text-app-text border-app-border hover:bg-app-input'
            }`}
          >
            Reposição ({lowCount})
          </button>
        </div>

        <button
          type="button"
          onClick={openNew}
          className="px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:hover:bg-white dark:text-stone-900 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer shadow-xs self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          Novo Produto
        </button>
      </div>

      {/* Tabela Clean com Opção de Remover */}
      <div className="bg-app-card rounded-2xl border border-app-border shadow-xs overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-app-input border-b border-app-border text-app-muted font-medium">
              <th className="py-2.5 px-4">Produto</th>
              <th className="py-2.5 px-4">Preço Custo</th>
              <th className="py-2.5 px-4">Preço Venda</th>
              <th className="py-2.5 px-4 text-center">Estoque</th>
              <th className="py-2.5 px-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-app-border">
            {filtered.map((p) => {
              const isLow = p.stock_qty <= p.min_stock_qty;
              return (
                <tr key={p.id} className="hover:bg-app-input transition">
                  <td className="py-3 px-4">
                    <div className="font-medium text-app-text">{p.name}</div>
                    <div className="text-[10px] text-app-muted font-mono">{p.sku}</div>
                  </td>
                  <td className="py-3 px-4 text-app-muted">
                    {formatCurrency(p.cost_price)}
                  </td>
                  <td className="py-3 px-4 font-semibold text-app-text">
                    {formatCurrency(p.sale_price)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-md font-semibold text-[11px] ${
                        isLow
                          ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40'
                          : 'text-app-text'
                      }`}
                    >
                      {p.stock_qty} {p.unit}
                    </span>
                    {isLow && (
                      <div className="text-[9px] text-amber-600 dark:text-amber-400 font-medium">
                        Reposição
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        onClick={() => handleAdjust(p, -1)}
                        className="p-1 rounded hover:bg-app-input text-app-muted cursor-pointer"
                        title="-1 unidade"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleAdjust(p, 1)}
                        className="px-2 py-0.5 rounded bg-app-input hover:opacity-80 text-app-text font-medium text-[11px] cursor-pointer"
                        title="+1 unidade"
                      >
                        +1
                      </button>
                      <button
                        onClick={() => openEdit(p)}
                        className="p-1 rounded hover:bg-app-input text-app-muted ml-1 cursor-pointer"
                        title="Editar produto"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(p)}
                        disabled={deletingId === p.id}
                        className="p-1 rounded hover:bg-red-500/10 text-app-muted hover:text-red-500 ml-1 cursor-pointer transition"
                        title="Remover produto do estoque"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal Novo / Editar */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-app-card rounded-3xl max-w-sm w-full p-6 shadow-xl border border-app-border space-y-4">
            <div className="flex items-center justify-between border-b border-app-border pb-2">
              <h3 className="text-sm font-semibold text-app-text">
                {editingProduct ? 'Editar Produto' : 'Novo Produto'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-app-muted hover:text-app-text text-xs"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3 text-xs">
              <div>
                <label className="text-app-muted block mb-1">Nome do Produto</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-xl border border-app-border bg-app-input text-app-text"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-app-muted block mb-1">Preço Custo (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.cost_price}
                    onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-xl border border-app-border bg-app-input text-app-text"
                  />
                </div>
                <div>
                  <label className="text-app-muted block mb-1">Preço Venda (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={form.sale_price}
                    onChange={(e) => setForm({ ...form, sale_price: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-xl border border-app-border bg-app-input font-semibold text-app-text"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-app-muted block mb-1">Estoque</label>
                  <input
                    type="number"
                    required
                    value={form.stock_qty}
                    onChange={(e) => setForm({ ...form, stock_qty: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-xl border border-app-border bg-app-input text-app-text"
                  />
                </div>
                <div>
                  <label className="text-app-muted block mb-1">Alerta Mínimo</label>
                  <input
                    type="number"
                    value={form.min_stock_qty}
                    onChange={(e) => setForm({ ...form, min_stock_qty: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-xl border border-app-border bg-app-input text-app-text"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-app-border">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3 py-1.5 rounded-lg text-app-muted hover:bg-app-input"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 rounded-lg bg-stone-900 dark:bg-stone-100 dark:text-stone-900 text-white font-medium cursor-pointer"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
