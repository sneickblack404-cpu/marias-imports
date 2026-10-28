import React, { useState } from 'react';
import { X, Download, Upload, ShieldCheck, Check, AlertCircle } from 'lucide-react';

export default function BackupModal({
  currentData,
  onClose,
  onRestoreSuccess,
}) {
  const [restoring, setRestoring] = useState(false);
  const [msg, setMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Check what's in local browser storage
  const browserBackup = (() => {
    try {
      const saved = localStorage.getItem('marias_imports_data_backup');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  })();

  const handleDownloadBackup = async () => {
    setErrorMsg(null);
    setMsg(null);
    try {
      const res = await fetch('/api/backup/export');
      if (!res.ok) throw new Error('Falha ao exportar dados do servidor.');
      const json = await res.json();

      const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const now = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `backup_marias_imports_${now}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setMsg('Arquivo de backup baixado com sucesso! Guarde-o em segurança.');
    } catch (err) {
      setErrorMsg(err.message || 'Erro ao baixar backup.');
    }
  };

  const handleRestoreFromFile = async (e) => {
    setErrorMsg(null);
    setMsg(null);
    const file = e.target.files?.[0];
    if (!file) return;

    setRestoring(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      const res = await fetch('/api/backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Erro ao restaurar arquivo de backup.');
      }

      const updatedData = await res.json();
      if (onRestoreSuccess) onRestoreSuccess(updatedData);
      setMsg('Dados restaurados com sucesso do arquivo!');
      setTimeout(() => onClose(), 1500);
    } catch (err) {
      setErrorMsg(err.message || 'Arquivo de backup inválido.');
    } finally {
      setRestoring(false);
    }
  };

  const handleRestoreFromBrowser = async () => {
    if (!browserBackup) return;
    setErrorMsg(null);
    setMsg(null);
    setRestoring(true);
    try {
      const res = await fetch('/api/backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(browserBackup),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Erro ao restaurar do navegador.');
      }

      const updatedData = await res.json();
      if (onRestoreSuccess) onRestoreSuccess(updatedData);
      setMsg('Dados restaurados com sucesso da memória do navegador!');
      setTimeout(() => onClose(), 1500);
    } catch (err) {
      setErrorMsg(err.message || 'Erro ao restaurar cópia.');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-app-card rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-app-border space-y-4 text-xs">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-app-border pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-app-text text-sm">
                Segurança & Backup dos Dados
              </h3>
              <p className="text-[11px] text-app-muted">
                Salve cópias de segurança para nunca perder seus clientes ou produtos.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-app-muted hover:text-app-text hover:bg-app-input cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {msg && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center gap-2 text-xs">
            <Check className="w-4 h-4 shrink-0" />
            <span>{msg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center gap-2 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Resumo Atual */}
        <div className="p-3 rounded-2xl bg-app-input/40 border border-app-border flex justify-between items-center text-xs">
          <div>
            <span className="text-app-muted block text-[11px]">Banco Atual no Servidor:</span>
            <span className="font-semibold text-app-text">
              {currentData?.clients?.length || 0} Clientes • {currentData?.products?.length || 0} Produtos • {currentData?.sales?.length || 0} Vendas
            </span>
          </div>
        </div>

        {/* Ação 1: Baixar Cópia (Download) */}
        <div className="p-3.5 rounded-2xl border border-app-border bg-app-card space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-semibold text-app-text block">
                1. Baixar Cópia para o seu Computador / Celular
              </span>
              <p className="text-[11px] text-app-muted mt-0.5">
                Gera um arquivo com todos os clientes, produtos, vendas e parcelas para você guardar.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDownloadBackup}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-semibold cursor-pointer shadow-xs hover:opacity-90 transition"
          >
            <Download className="w-4 h-4" />
            <span>Baixar Arquivo de Backup</span>
          </button>
        </div>

        {/* Ação 2: Cópia Automática do Navegador */}
        {browserBackup && (
          <div className="p-3.5 rounded-2xl border border-app-border bg-app-card space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold text-app-text block">
                  2. Cópia Salva no seu Navegador
                </span>
                <p className="text-[11px] text-app-muted mt-0.5">
                  Seu navegador mantém uma cópia automática com {browserBackup.clients?.length || 0} clientes e {browserBackup.products?.length || 0} produtos.
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={restoring}
              onClick={handleRestoreFromBrowser}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-app-border bg-app-input hover:bg-stone-200 dark:hover:bg-stone-800 text-app-text font-semibold cursor-pointer transition disabled:opacity-50"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>{restoring ? 'Restaurando...' : 'Restaurar da Memória do Navegador'}</span>
            </button>
          </div>
        )}

        {/* Ação 3: Restaurar de um Arquivo */}
        <div className="p-3.5 rounded-2xl border border-dashed border-app-border bg-app-input/20 space-y-2">
          <span className="font-semibold text-app-text block">
            3. Restaurar a partir de um Arquivo Salvo
          </span>
          <p className="text-[11px] text-app-muted">
            Se precisar recarregar um arquivo de backup que você baixou anteriormente:
          </p>
          <label className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-app-border bg-app-card hover:bg-app-input text-app-text font-medium cursor-pointer transition">
            <Upload className="w-4 h-4" />
            <span>Selecionar Arquivo .JSON</span>
            <input
              type="file"
              accept=".json"
              onChange={handleRestoreFromFile}
              className="hidden"
            />
          </label>
        </div>

        <div className="flex justify-end pt-2 border-t border-app-border">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl text-app-muted hover:text-app-text font-medium cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
