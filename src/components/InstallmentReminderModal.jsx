import React, { useState } from 'react';
import { X, Copy, Check, Calendar, AlertTriangle, Clock, Send } from 'lucide-react';
import {
  formatCurrency,
  formatDateBR,
  cleanPhoneDigits,
  buildWhatsAppLink,
  getInstallmentDueInfo,
  formatInstallmentReminderMessage,
} from '../utils';

function WhatsAppIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.455 5.711 1.456h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
    </svg>
  );
}

export default function InstallmentReminderModal({
  installment,
  client = null,
  today = '',
  onClose,
}) {
  if (!installment) return null;

  const clientName = installment.client_name_snapshot || (client && client.name) || 'Cliente';
  const initialPhone = (client && client.phone) || installment.client_phone || '';

  const [phone, setPhone] = useState(initialPhone);
  const dueInfo = getInstallmentDueInfo(installment, today);

  const [message, setMessage] = useState(() =>
    formatInstallmentReminderMessage(installment, clientName)
  );
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (_err) {
      // fallback
    }
  };

  const handleSendWhatsApp = () => {
    const link = buildWhatsAppLink(phone, message);
    if (!link) {
      alert('Por favor, informe o telefone do cliente com DDD para abrir o WhatsApp.');
      return;
    }
    window.open(link, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-app-card rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-app-border space-y-4 my-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-app-border pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${dueInfo.badgeClass}`}>
                {dueInfo.label}
              </span>
              <span className="text-xs text-app-muted">
                {installment.sale_code} • {installment.installment_number}/{installment.total_installments}
              </span>
            </div>
            <h2 className="text-lg font-bold text-app-text mt-1">
              Lembrete de Cobrança / Pagamento
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-app-muted hover:text-app-text hover:bg-app-input cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Detalhes da Parcela */}
        <div className="p-3.5 rounded-2xl bg-app-input border border-app-border space-y-2.5 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-app-muted">Cliente:</span>
            <strong className="text-app-text text-sm">{clientName}</strong>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-app-muted">Vencimento:</span>
            <span className="font-semibold text-app-text">
              {formatDateBR(installment.due_date)} ({dueInfo.description})
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-app-muted">Valor Restante:</span>
            <strong className="text-sm font-bold text-red-600 dark:text-red-400">
              {formatCurrency(installment.remaining_amount || installment.amount)}
            </strong>
          </div>

          <div className="pt-2 border-t border-app-border flex items-center justify-between gap-2">
            <span className="text-app-muted text-[11px] shrink-0">Telefone / WhatsApp:</span>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="DDD + Número"
              className="px-2.5 py-1 rounded-lg border border-app-border bg-app-card text-app-text text-xs w-48 text-right focus:outline-none"
            />
          </div>
        </div>

        {/* Mensagem Pronta & Editável */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="text-app-muted font-medium">Texto do Lembrete (personalizável):</span>
            <button
              type="button"
              onClick={() => setMessage(formatInstallmentReminderMessage(installment, clientName))}
              className="text-[11px] text-stone-600 dark:text-stone-300 hover:underline cursor-pointer"
            >
              Restaurar texto padrão
            </button>
          </div>
          <textarea
            rows={6}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full p-3 rounded-xl border border-app-border bg-app-input text-app-text text-xs leading-relaxed focus:outline-none focus:border-stone-500 font-sans"
          />
        </div>

        {/* Ações */}
        <div className="pt-2 border-t border-app-border space-y-2">
          <button
            onClick={handleSendWhatsApp}
            className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md cursor-pointer transition active:scale-[0.99]"
          >
            <WhatsAppIcon className="w-5 h-5 fill-current" />
            <span>Enviar Lembrete no WhatsApp</span>
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleCopy}
              className="py-2 px-3 rounded-xl border border-app-border bg-app-card hover:bg-app-input text-app-text text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer transition"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400">Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar Mensagem</span>
                </>
              )}
            </button>

            <button
              onClick={onClose}
              className="py-2 px-3 rounded-xl bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:hover:bg-white text-white dark:text-stone-900 text-xs font-medium cursor-pointer transition"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
