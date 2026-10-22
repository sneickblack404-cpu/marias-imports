import React, { useState, useEffect } from 'react';
import {
  X,
  Download,
  Copy,
  Check,
  Calendar,
  Package,
  Image as ImageIcon,
  FileText,
  ExternalLink,
} from 'lucide-react';
import {
  formatCurrency,
  formatDateBR,
  cleanPhoneDigits,
  buildWhatsAppLink,
  formatSaleReceiptMessage,
} from '../utils';
import { generateReceiptImage } from '../utils/generateReceiptImage';

function WhatsAppIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.455 5.711 1.456h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
    </svg>
  );
}

export default function SaleReceiptModal({
  sale,
  client = null,
  onClose,
}) {
  if (!sale) return null;

  const initialPhone = (client && client.phone) || sale.client_phone || '';
  const [customPhone, setCustomPhone] = useState(initialPhone);
  const [activeTab, setActiveTab] = useState('IMAGE'); // 'IMAGE' or 'DETAILS'

  const [imageResult, setImageResult] = useState(null);
  const [generating, setGenerating] = useState(true);
  const [copiedImage, setCopiedImage] = useState(false);
  const [copiedText, setCopiedText] = useState(false);

  // Generate Image automatically
  useEffect(() => {
    let isMounted = true;
    setGenerating(true);

    generateReceiptImage(sale, client)
      .then((res) => {
        if (isMounted) {
          setImageResult(res);
          setGenerating(false);
        }
      })
      .catch((err) => {
        console.error('Erro ao gerar imagem:', err);
        if (isMounted) setGenerating(false);
      });

    return () => {
      isMounted = false;
    };
  }, [sale, client]);

  // Download image PNG
  const handleDownloadImage = () => {
    if (!imageResult?.dataUrl) return;
    const a = document.createElement('a');
    a.href = imageResult.dataUrl;
    const cleanClient = (sale.client_name_snapshot || 'cliente')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-');
    a.download = `comprovante-${sale.sale_code || 'venda'}-${cleanClient}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Copy Image directly to clipboard so user can press Ctrl+V in WhatsApp
  const handleCopyImage = async () => {
    if (!imageResult?.blob) return;

    try {
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': imageResult.blob }),
        ]);
        setCopiedImage(true);
        setTimeout(() => setCopiedImage(false), 3000);
      } else {
        handleDownloadImage();
      }
    } catch (_err) {
      // Fallback: download the file
      handleDownloadImage();
    }
  };

  // Open WhatsApp directly with client
  const handleOpenWhatsApp = () => {
    const clean = cleanPhoneDigits(customPhone);
    if (!clean) {
      alert('Por favor, digite o telefone do cliente com DDD para abrir o WhatsApp.');
      return;
    }
    // Simple, clean intro message without emojis that could corrupt
    const introMsg = `Olá, ${sale.client_name_snapshot || 'tudo bem'}! Segue o comprovante da sua compra na loja Maria's Imports:`;
    const link = `https://wa.me/${clean}?text=${encodeURIComponent(introMsg)}`;
    window.open(link, '_blank', 'noopener,noreferrer');
  };

  // Copy plain text receipt as fallback
  const handleCopyText = async () => {
    const text = formatSaleReceiptMessage(sale, customPhone);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2500);
    } catch (_err) {
      // ignore
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-app-card rounded-3xl max-w-xl w-full p-4 sm:p-6 shadow-2xl border border-app-border space-y-4 my-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-app-border pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                Comprovante Gerado
              </span>
              <span className="text-xs text-app-muted">
                {sale.sale_code} • {formatDateBR(sale.sale_date)}
              </span>
            </div>
            <h2 className="text-lg font-bold text-app-text mt-1">
              Imagem do Comprovante de Compra
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

        {/* Telefone & WhatsApp do Cliente */}
        <div className="p-3 rounded-2xl bg-app-input border border-app-border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
          <div>
            <span className="text-app-muted text-[11px] block">Cliente:</span>
            <strong className="text-app-text text-sm">
              {sale.client_name_snapshot || (client && client.name) || 'Cliente Balcão'}
            </strong>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={customPhone}
              onChange={(e) => setCustomPhone(e.target.value)}
              placeholder="DDD + Celular (ex: 31999998888)"
              className="px-2.5 py-1.5 rounded-xl border border-app-border bg-app-card text-app-text text-xs w-48 focus:outline-none"
            />
            <button
              onClick={handleOpenWhatsApp}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center gap-1.5 cursor-pointer transition shadow-xs shrink-0"
              title="Abrir WhatsApp com o cliente"
            >
              <WhatsAppIcon className="w-3.5 h-3.5 fill-current" />
              <span>Abrir WhatsApp</span>
            </button>
          </div>
        </div>

        {/* Alternador de Visualização (Imagem do Cartão vs Detalhes) */}
        <div className="flex border-b border-app-border gap-2 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('IMAGE')}
            className={`pb-2 px-1 font-semibold flex items-center gap-1.5 transition cursor-pointer border-b-2 ${
              activeTab === 'IMAGE'
                ? 'border-stone-900 dark:border-stone-100 text-app-text'
                : 'border-transparent text-app-muted hover:text-app-text'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Imagem do Comprovante (PNG)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('DETAILS')}
            className={`pb-2 px-1 font-semibold flex items-center gap-1.5 transition cursor-pointer border-b-2 ${
              activeTab === 'DETAILS'
                ? 'border-stone-900 dark:border-stone-100 text-app-text'
                : 'border-transparent text-app-muted hover:text-app-text'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Detalhes em Texto</span>
          </button>
        </div>

        {/* Tab 1: Imagem do Comprovante */}
        {activeTab === 'IMAGE' && (
          <div className="space-y-3">
            {/* Visualização da imagem gerada */}
            <div className="relative rounded-2xl border border-app-border bg-stone-100 dark:bg-stone-950 p-2 overflow-hidden flex items-center justify-center max-h-[380px] overflow-y-auto">
              {generating ? (
                <div className="py-16 text-center text-xs text-app-muted flex flex-col items-center gap-2">
                  <div className="w-6 h-6 border-2 border-stone-400 border-t-transparent rounded-full animate-spin" />
                  <span>Gerando imagem em alta resolução...</span>
                </div>
              ) : imageResult?.dataUrl ? (
                <img
                  src={imageResult.dataUrl}
                  alt="Comprovante de Compra"
                  className="rounded-xl shadow-md max-w-full h-auto object-contain"
                />
              ) : (
                <div className="py-12 text-center text-xs text-red-500">
                  Não foi possível renderizar a imagem.
                </div>
              )}
            </div>

            {/* Ações da Imagem */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {/* Botão Copiar Imagem (Ctrl+V) */}
              <button
                type="button"
                onClick={handleCopyImage}
                disabled={generating || !imageResult}
                className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer transition shadow-xs active:scale-[0.99] disabled:opacity-50"
              >
                {copiedImage ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Imagem Copiada! (Dê Ctrl+V no WhatsApp)</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copiar Imagem (Colar no WhatsApp)</span>
                  </>
                )}
              </button>

              {/* Botão Baixar Imagem */}
              <button
                type="button"
                onClick={handleDownloadImage}
                disabled={generating || !imageResult}
                className="py-2.5 px-3 rounded-xl border border-app-border bg-app-card hover:bg-app-input text-app-text font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer transition disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                <span>Baixar Imagem (PNG)</span>
              </button>
            </div>

            <div className="text-[11px] text-app-muted text-center">
              💡 <strong>Como enviar:</strong> Clique em <em>"Copiar Imagem"</em>, abra o WhatsApp da pessoa e aperte <strong>Ctrl + V</strong> para colar a foto direto na conversa!
            </div>
          </div>
        )}

        {/* Tab 2: Detalhes da Compra em Texto */}
        {activeTab === 'DETAILS' && (
          <div className="space-y-3">
            {/* Itens Comprados */}
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-app-text flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-app-muted" />
                Itens da Compra ({sale.items ? sale.items.length : 0})
              </span>
              <div className="divide-y divide-app-border rounded-xl border border-app-border bg-app-input/50 max-h-32 overflow-y-auto">
                {sale.items && sale.items.length > 0 ? (
                  sale.items.map((item, idx) => (
                    <div key={idx} className="p-2 flex items-center justify-between text-xs">
                      <div className="min-w-0 pr-2">
                        <span className="font-medium text-app-text block truncate">
                          {item.quantity}x {item.product_name}
                        </span>
                        <span className="text-[10px] text-app-muted">
                          Unitário: {formatCurrency(item.sold_unit_price || item.catalog_unit_price)}
                        </span>
                      </div>
                      <span className="font-semibold text-app-text shrink-0">
                        {formatCurrency(item.line_final_total)}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="p-2 text-center text-xs text-app-muted">Sem itens discriminados</div>
                )}
              </div>
            </div>

            {/* Resumo Financeiro */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="p-2 rounded-xl bg-app-input border border-app-border">
                <span className="text-[10px] text-app-muted block">Subtotal</span>
                <span className="font-semibold text-app-text">
                  {formatCurrency(sale.original_subtotal || sale.final_total)}
                </span>
              </div>

              <div className="p-2 rounded-xl bg-app-input border border-app-border">
                <span className="text-[10px] text-app-muted block">Total Final</span>
                <span className="font-bold text-app-text">
                  {formatCurrency(sale.final_total)}
                </span>
              </div>

              <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block font-medium">
                  {sale.payment_method === 'A_VISTA' ? 'Pago' : 'Entrada'}
                </span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(sale.paid_total)}
                </span>
              </div>
            </div>

            {/* Cronograma Parcelas */}
            {sale.payment_method === 'FIADO' && sale.installments && sale.installments.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-app-text flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-app-muted" />
                  Vencimento das Parcelas ({sale.installments.length}x)
                </span>
                <div className="divide-y divide-app-border rounded-xl border border-app-border bg-app-input/50 max-h-32 overflow-y-auto">
                  {sale.installments.map((inst) => (
                    <div key={inst.id || inst.installment_number} className="p-2 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-semibold text-app-text mr-2">
                          {inst.installment_number}ª Parcela
                        </span>
                        <span className="text-app-muted text-[11px]">
                          Vencimento: <strong className="text-app-text">{formatDateBR(inst.due_date)}</strong>
                        </span>
                      </div>
                      <span className="font-semibold text-app-text">
                        {formatCurrency(inst.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handleCopyText}
              className="w-full py-2 px-3 rounded-xl border border-app-border bg-app-card hover:bg-app-input text-app-text text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer transition"
            >
              {copiedText ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400">Texto Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar Resumo em Texto</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Rodapé Fechar */}
        <div className="pt-2 border-t border-app-border flex justify-end">
          <button
            onClick={onClose}
            className="py-2 px-5 rounded-xl bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:hover:bg-white text-white dark:text-stone-900 text-xs font-medium cursor-pointer transition"
          >
            Concluir / Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
