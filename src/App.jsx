import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  CalendarClock,
  TrendingUp,
  LogOut,
  Plus,
  RefreshCw,
  Sun,
  Moon,
  Trash2,
} from 'lucide-react';
import LoginScreen from './components/LoginScreen';
import PosSaleView from './components/PosSaleView';
import InventoryView from './components/InventoryView';
import ClientsLedgerView from './components/ClientsLedgerView';
import ReceivablesView from './components/ReceivablesView';
import ProfitReportView from './components/ProfitReportView';
import NubiaLogo from './components/NubiaLogo';
import { formatCurrency, formatDateBR, getInstallmentDueInfo } from './utils';

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('nubia_arruda_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Modo Noturno / Diurno: aplicação direta e infalível na tag HTML
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('nubia_arruda_theme') === 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      localStorage.setItem('nubia_arruda_theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('nubia_arruda_theme', 'light');
    }
  }, [darkMode]);

  const [activeTab, setActiveTab] = useState('dashboard');
  const [preselectedClientId, setPreselectedClientId] = useState(null);

  const [data, setData] = useState({
    today: new Date().toISOString().slice(0, 10),
    products: [],
    clients: [],
    sales: [],
    installments: [],
    payments: [],
    expenses: [],
  });
  const [loading, setLoading] = useState(true);

  const fetchBootstrap = useCallback(async (directPayload = null) => {
    if (directPayload && directPayload.products && directPayload.clients) {
      setData(directPayload);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/bootstrap');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) fetchBootstrap();
  }, [user, fetchBootstrap]);

  const handleLoginSuccess = (loggedUser) => {
    setUser(loggedUser);
    localStorage.setItem('nubia_arruda_user', JSON.stringify(loggedUser));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('nubia_arruda_user');
  };

  const handleStartSaleForClient = (clientId) => {
    setPreselectedClientId(clientId);
    setActiveTab('pos');
  };

  const handleDeleteSale = async (sale) => {
    if (
      !window.confirm(
        `Deseja cancelar a venda "${sale.sale_code}" de ${sale.client_name_snapshot}? As peças serão devolvidas ao estoque.`
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/sales/${sale.id}`, { method: 'DELETE' });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (!user) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} isDark={darkMode} />;
  }

  // Métricas principais
  const totalSales = data.sales.reduce((acc, s) => acc + Number(s.final_total || 0), 0);
  const totalReceived = data.sales.reduce((acc, s) => acc + Number(s.paid_total || 0), 0);
  const totalPending = data.sales.reduce((acc, s) => acc + Number(s.pending_total || 0), 0);

  const lowStockCount = data.products.filter((p) => p.stock_qty <= p.min_stock_qty).length;
  const pendingInstallments = data.installments.filter((i) => i.status !== 'PAGO');

  const nav = [
    { id: 'dashboard', label: 'Início', icon: LayoutDashboard },
    { id: 'pos', label: 'Nova Venda', icon: ShoppingCart },
    {
      id: 'inventory',
      label: 'Estoque',
      icon: Package,
      badge: lowStockCount > 0 ? lowStockCount : null,
    },
    { id: 'clients', label: 'Clientes & Fiado', icon: Users },
    {
      id: 'receivables',
      label: 'Recebimentos',
      icon: CalendarClock,
      badge: pendingInstallments.length > 0 ? pendingInstallments.length : null,
    },
    { id: 'profit', label: 'Lucro & Gastos', icon: TrendingUp },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-app-bg text-app-text transition-colors duration-150">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-app-card border-b border-app-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Logo Oficial adaptável (com 'Nubia' branco no escuro) */}
          <div className="cursor-pointer" onClick={() => setActiveTab('dashboard')}>
            <NubiaLogo size="md" isDark={darkMode} />
          </div>

          {/* Abas de Navegação */}
          <nav className="hidden md:flex items-center gap-1">
            {nav.map((item) => {
              const Icon = item.icon;
              const isSel = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (item.id !== 'pos') setPreselectedClientId(null);
                    setActiveTab(item.id);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition cursor-pointer ${
                    isSel
                      ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 shadow-xs'
                      : 'text-app-muted hover:text-app-text hover:bg-app-input'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{item.label}</span>
                  {item.badge && (
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-semibold ${
                        isSel
                          ? 'bg-white text-stone-900 dark:bg-stone-900 dark:text-white'
                          : 'bg-app-input text-app-text'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Ações Direita: Usuário, Modo Noturno / Diurno, Atualizar, Sair */}
          <div className="flex items-center gap-1.5">
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-app-input border border-app-border text-xs text-app-text font-medium mr-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>{user?.displayName || 'Núbia Arruda'}</span>
            </div>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-xl text-app-muted hover:text-app-text hover:bg-app-input cursor-pointer transition border border-app-border"
              title={
                darkMode
                  ? 'Mudar para modo claro (Fundo claro e caixas brancas)'
                  : 'Mudar para modo escuro (Cinza escuro)'
              }
            >
              {darkMode ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-stone-600" />
              )}
            </button>

            <button
              onClick={() => fetchBootstrap()}
              className="p-2 rounded-xl text-app-muted hover:text-app-text hover:bg-app-input cursor-pointer"
              title="Atualizar dados"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleLogout}
              className="p-2 rounded-xl text-app-muted hover:text-app-text hover:bg-app-input cursor-pointer"
              title="Sair"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className="md:hidden flex items-center gap-1 overflow-x-auto px-4 py-2 border-t border-app-border bg-app-card">
          {nav.map((item) => {
            const Icon = item.icon;
            const isSel = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1 shrink-0 ${
                  isSel
                    ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900'
                    : 'text-app-muted'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* Conteúdo Central */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6">
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Header de Ação Direta */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-app-text">Visão Geral</h1>
                <p className="text-xs text-app-muted mt-0.5">
                  Acompanhamento simplificado de vendas e recebimentos
                </p>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                <button
                  onClick={() => setActiveTab('profit')}
                  className="px-3.5 py-2 rounded-xl border border-app-border text-app-text hover:bg-app-input text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  Lucro & Gastos
                </button>
                <button
                  onClick={() => {
                    setPreselectedClientId(null);
                    setActiveTab('pos');
                  }}
                  className="px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:hover:bg-white text-white dark:text-stone-900 text-xs font-medium flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Registrar Venda
                </button>
              </div>
            </div>

            {/* 3 Cartões de Resumo Diretos */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-app-card p-4 rounded-2xl border border-app-border shadow-xs">
                <span className="text-[11px] font-medium text-app-muted block mb-1">
                  Total em Vendas
                </span>
                <span className="text-xl font-bold text-app-text">
                  {formatCurrency(totalSales)}
                </span>
                <span className="text-[11px] text-app-muted block mt-1">
                  {data.sales.length} vendas registradas
                </span>
              </div>

              <div className="bg-app-card p-4 rounded-2xl border border-app-border shadow-xs">
                <span className="text-[11px] font-medium text-app-muted block mb-1">
                  Total Já Recebido
                </span>
                <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(totalReceived)}
                </span>
                <span className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80 block mt-1">
                  Entradas e parcelas quitadas
                </span>
              </div>

              <div
                onClick={() => setActiveTab('receivables')}
                className="bg-app-card p-4 rounded-2xl border border-app-border shadow-xs cursor-pointer hover:border-stone-400 dark:hover:border-stone-600 transition"
              >
                <span className="text-[11px] font-medium text-app-muted block mb-1">
                  A Receber (Fiado / Parcelas)
                </span>
                <span className="text-xl font-bold text-amber-600 dark:text-amber-400">
                  {formatCurrency(totalPending)}
                </span>
                <span className="text-[11px] text-amber-700/80 dark:text-amber-400/80 block mt-1">
                  {pendingInstallments.length} parcelas pendentes
                </span>
              </div>
            </div>

            {/* Próximos Vencimentos e Últimas Vendas */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Próximas Parcelas a Vencer */}
              <div className="bg-app-card p-4 rounded-2xl border border-app-border shadow-xs space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-app-text">Próximos Vencimentos</span>
                  <button
                    onClick={() => setActiveTab('receivables')}
                    className="text-app-muted hover:text-app-text font-medium cursor-pointer"
                  >
                    Ver todas
                  </button>
                </div>

                <div className="space-y-1.5 text-xs">
                  {pendingInstallments.slice(0, 4).map((inst) => {
                    const dueInfo = getInstallmentDueInfo(inst, data.today);
                    return (
                      <div
                        key={inst.id}
                        onClick={() => setActiveTab('receivables')}
                        className="p-2.5 rounded-xl bg-app-input border border-app-border flex justify-between items-center cursor-pointer hover:border-stone-400 dark:hover:border-stone-600 transition"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-app-text">
                              {inst.client_name_snapshot}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${dueInfo.badgeClass}`}>
                              {dueInfo.label}
                            </span>
                          </div>
                          <div className="text-[11px] text-app-muted mt-0.5">
                            Vence em: {formatDateBR(inst.due_date)} • Parcela{' '}
                            {inst.installment_number}/{inst.total_installments}
                          </div>
                        </div>
                        <span className="font-semibold text-app-text">
                          {formatCurrency(inst.remaining_amount)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Últimas Vendas */}
              <div className="bg-app-card p-4 rounded-2xl border border-app-border shadow-xs space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-app-text">Últimas Vendas</span>
                  <span className="text-app-muted">{data.sales.length} no total</span>
                </div>

                <div className="space-y-1.5 text-xs">
                  {data.sales.slice(0, 4).map((s) => (
                    <div
                      key={s.id}
                      className="p-2.5 rounded-xl border border-app-border flex justify-between items-center group"
                    >
                      <div>
                        <div className="font-medium text-app-text">
                          {s.client_name_snapshot}
                        </div>
                        <div className="text-[11px] text-app-muted">
                          {s.sale_code} • {formatDateBR(s.sale_date)} •{' '}
                          {s.payment_method === 'FIADO' ? 'Fiado' : 'À Vista / Cartão'}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-app-text">
                          {formatCurrency(s.final_total)}
                        </span>
                        <button
                          onClick={() => handleDeleteSale(s)}
                          className="opacity-0 group-hover:opacity-100 text-app-muted hover:text-red-500 p-1 cursor-pointer transition"
                          title="Cancelar venda e estornar estoque"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'pos' && (
          <PosSaleView
            products={data.products}
            clients={data.clients}
            today={data.today}
            onRefreshData={fetchBootstrap}
            onNavigate={setActiveTab}
            preselectedClientId={preselectedClientId}
          />
        )}

        {activeTab === 'inventory' && (
          <InventoryView products={data.products} onRefreshData={fetchBootstrap} />
        )}

        {activeTab === 'clients' && (
          <ClientsLedgerView
            clients={data.clients}
            products={data.products}
            today={data.today}
            onRefreshData={fetchBootstrap}
            onStartSaleForClient={handleStartSaleForClient}
          />
        )}

        {activeTab === 'receivables' && (
          <ReceivablesView
            installments={data.installments}
            today={data.today}
            onRefreshData={fetchBootstrap}
          />
        )}

        {activeTab === 'profit' && (
          <ProfitReportView
            sales={data.sales}
            products={data.products}
            expenses={data.expenses || []}
            today={data.today}
            onRefreshData={fetchBootstrap}
          />
        )}
      </main>
    </div>
  );
}
