export function formatCurrency(value) {
  const num = Number(value) || 0;
  return num.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function formatDateBR(dateStr) {
  if (!dateStr) return '—';
  const clean = String(dateStr).slice(0, 10);
  const parts = clean.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function addDaysISO(dateStr, days) {
  if (!dateStr) return '';
  const parts = String(dateStr).slice(0, 10).split('-').map(Number);
  const d = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
  d.setDate(d.getDate() + Number(days));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getPaymentMethodBadge(method, submethod) {
  if (method === 'A_VISTA') {
    return {
      label: submethod ? `À Vista (${submethod})` : 'À Vista',
      className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    };
  }
  if (method === 'CARTAO') {
    return {
      label: submethod ? `Cartão (${submethod})` : 'Cartão',
      className: 'bg-blue-50 text-blue-700 border-blue-200',
    };
  }
  if (method === 'FIADO') {
    return {
      label: 'Fiado / Caderninho',
      className: 'bg-amber-50 text-amber-800 border-amber-200',
    };
  }
  return {
    label: method || 'Outro',
    className: 'bg-slate-100 text-slate-700 border-slate-200',
  };
}

export function cleanPhoneDigits(phone) {
  if (!phone) return '';
  const clean = String(phone).replace(/\D/g, '');
  if (!clean) return '';
  if (clean.length === 10 || clean.length === 11) {
    return `55${clean}`;
  }
  return clean;
}

export function buildWhatsAppLink(phone, message = '') {
  const clean = cleanPhoneDigits(phone);
  if (!clean) return null;
  const encoded = encodeURIComponent(message || '');
  return `https://wa.me/${clean}${encoded ? `?text=${encoded}` : ''}`;
}

export function getInstallmentDueInfo(installment, todayStr) {
  const isPaid = installment.status === 'PAGO';
  if (isPaid) {
    return {
      status: 'PAID',
      label: 'Quitada',
      badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20',
      daysDiff: 0,
      description: 'Pagamento confirmado',
    };
  }

  const today = todayStr || new Date().toISOString().slice(0, 10);
  const due = String(installment.due_date || '').slice(0, 10);
  const dueTime = new Date(due + 'T00:00:00').getTime();
  const todayTime = new Date(today + 'T00:00:00').getTime();
  const daysDiff = Math.round((dueTime - todayTime) / (1000 * 60 * 60 * 24));

  if (daysDiff < 0) {
    const overdueDays = Math.abs(daysDiff);
    return {
      status: 'OVERDUE',
      label: overdueDays === 1 ? 'Vencida há 1 dia' : `Vencida há ${overdueDays} dias`,
      shortLabel: `Vencida (${overdueDays}d)`,
      badgeClass: 'bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 font-semibold',
      daysDiff,
      overdueDays,
      description: `Atrasada desde ${formatDateBR(due)}`,
    };
  }

  if (daysDiff === 0) {
    return {
      status: 'DUE_TODAY',
      label: 'Vence Hoje!',
      shortLabel: 'Vence Hoje',
      badgeClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 font-semibold animate-pulse',
      daysDiff: 0,
      description: 'Vencimento nesta data',
    };
  }

  if (daysDiff <= 5) {
    return {
      status: 'DUE_SOON',
      label: daysDiff === 1 ? 'Vence amanhã' : `Vence em ${daysDiff} dias`,
      shortLabel: `Vence em ${daysDiff}d`,
      badgeClass: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border border-yellow-500/30 font-medium',
      daysDiff,
      description: `Vence no dia ${formatDateBR(due)}`,
    };
  }

  return {
    status: 'PENDING_FUTURE',
    label: `A vencer (${formatDateBR(due)})`,
    shortLabel: 'A vencer',
    badgeClass: 'bg-app-input text-app-muted border border-app-border',
    daysDiff,
    description: `Vencimento futuro em ${formatDateBR(due)}`,
  };
}

export function formatSaleReceiptMessage(sale, clientPhone = '') {
  const clientName = sale.client_name_snapshot || 'Cliente';
  const saleCode = sale.sale_code || 'Venda';
  const saleDate = formatDateBR(sale.sale_date);

  const lines = [
    `*COMPROVANTE DE COMPRA — MARIA'S IMPORTS*`,
    `Olá, *${clientName}*! Muito obrigada pela sua preferência!`,
    ``,
    `*Venda:* ${saleCode}`,
    `*Data da Compra:* ${saleDate}`,
    ``,
    `*Itens Comprados:*`,
  ];

  if (Array.isArray(sale.items) && sale.items.length > 0) {
    for (const item of sale.items) {
      const qty = item.quantity || 1;
      const unit = formatCurrency(item.sold_unit_price || item.catalog_unit_price || 0);
      const total = formatCurrency(item.line_final_total || 0);
      lines.push(`- ${qty}x *${item.product_name}* (${unit} cada) = ${total}`);
    }
  } else {
    lines.push(`- Produtos da compra`);
  }

  lines.push(``);
  lines.push(`*Total da Compra:* ${formatCurrency(sale.final_total)}`);

  if (Number(sale.total_discount_amount) > 0) {
    lines.push(`*Desconto Concedido:* ${formatCurrency(sale.total_discount_amount)}`);
  }

  if (sale.payment_method === 'A_VISTA') {
    lines.push(`*Forma de Pagamento:* À Vista (${sale.payment_submethod || 'PIX/Dinheiro'}) — Quitado!`);
  } else if (sale.payment_method === 'CARTAO') {
    lines.push(`*Forma de Pagamento:* Cartão de Crédito (${sale.installments_count || 1}x)`);
  } else {
    lines.push(`*Forma de Pagamento:* Parcelado (${sale.installments_count || 1}x)`);

    if (Number(sale.paid_total) > 0) {
      lines.push(`*Entrada Paga no Ato:* ${formatCurrency(sale.paid_total)}`);
      lines.push(`*Saldo Restante:* ${formatCurrency(sale.pending_total)}`);
    }

    if (Array.isArray(sale.installments) && sale.installments.length > 0) {
      lines.push(``);
      lines.push(`*Cronograma de Vencimento das Parcelas:*`);
      for (const inst of sale.installments) {
        const num = inst.installment_number;
        const val = formatCurrency(inst.amount);
        const due = formatDateBR(inst.due_date);
        const statusNote = inst.status === 'PAGO' ? ' (Quitada)' : '';
        lines.push(`- *${num}a Parcela:* ${val} — Vencimento: *${due}*${statusNote}`);
      }
    }
  }

  lines.push(``);
  lines.push(`*Guarde este comprovante para o seu controle.*`);
  lines.push(`Qualquer dúvida estou à disposição! Maria's Imports.`);

  return lines.join('\n');
}

export function formatInstallmentReminderMessage(installment, clientName = '') {
  const name = clientName || installment.client_name_snapshot || 'Cliente';
  const val = formatCurrency(installment.remaining_amount || installment.amount);
  const due = formatDateBR(installment.due_date);
  const instDesc = `Parcela ${installment.installment_number}/${installment.total_installments}`;
  const saleCode = installment.sale_code ? ` (Venda ${installment.sale_code})` : '';

  if (installment.is_overdue) {
    return [
      `Olá, *${name}*! Tudo bem?`,
      `Passando para te lembrar com carinho sobre a sua *${instDesc}* no valor de *${val}*${saleCode} da loja *Maria's Imports*, que venceu no dia *${due}*.`,
      ``,
      `Caso já tenha efetuado o pagamento, por favor desconsidere este aviso! Se precisar dos dados do PIX ou quiser combinar, estou por aqui.`,
      ``,
      `Muito obrigada pela atenção e um ótimo dia!`,
    ].join('\n');
  }

  if (installment.is_due_today) {
    return [
      `Olá, *${name}*! Tudo bem?`,
      `Passando para te avisar que a sua *${instDesc}* no valor de *${val}*${saleCode} da loja *Maria's Imports* vence *hoje, ${due}*.`,
      ``,
      `Se você já realizou o pagamento, muito obrigada! Caso queira a chave PIX, me avise por aqui.`,
      ``,
      `Qualquer dúvida estou à disposição!`,
    ].join('\n');
  }

  return [
    `Olá, *${name}*! Tudo bem?`,
    `Passando com carinho para lembrar que a sua *${instDesc}* no valor de *${val}*${saleCode} da loja *Maria's Imports* vai vencer no dia *${due}*.`,
    ``,
    `Qualquer dúvida estou à disposição! Muito obrigada pela preferência.`,
  ].join('\n');
}

export function getStatusBadge(status, isOverdue = false, isDueToday = false) {
  if (status === 'PAGO') {
    return {
      label: 'Pago / Quitado',
      className: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    };
  }
  if (isOverdue) {
    return {
      label: status === 'PARCIAL' ? 'Parcial • Vencido' : 'Em Atraso',
      className: 'bg-rose-100 text-rose-800 border-rose-300',
    };
  }
  if (isDueToday) {
    return {
      label: status === 'PARCIAL' ? 'Parcial • Vence Hoje' : 'Vence Hoje',
      className: 'bg-amber-100 text-amber-900 border-amber-300',
    };
  }
  if (status === 'PARCIAL') {
    return {
      label: 'Parcialmente Pago',
      className: 'bg-sky-100 text-sky-800 border-sky-300',
    };
  }
  return {
    label: 'Pendente',
    className: 'bg-slate-100 text-slate-700 border-slate-300',
  };
}
