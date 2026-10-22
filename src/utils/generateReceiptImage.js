import { formatCurrency, formatDateBR } from '../utils';

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Generates a high-resolution 2x retina PNG card for the sale receipt
 */
export async function generateReceiptImage(sale, client = null) {
  if (!sale) return null;

  const items = sale.items || [];
  const installments = sale.installments || [];
  const hasInstallments = sale.payment_method === 'FIADO' && installments.length > 0;

  // Virtual canvas dimensions (retina scale = 2)
  const scale = 2;
  const width = 800;

  // Calculate dynamic height
  let contentHeight = 240; // Header & logo
  contentHeight += 95; // Client & sale info
  contentHeight += 45 + Math.max(1, items.length) * 40 + 25; // Items table
  contentHeight += 150; // Financial summary box

  if (hasInstallments) {
    contentHeight += 50 + installments.length * 44 + 30; // Installments table
  }

  contentHeight += 110; // Footer

  const height = contentHeight;

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;

  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  // Background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  // Outer border
  ctx.strokeStyle = '#E4E4E7';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(10, 10, width - 20, height - 20);

  // Decorative top bar
  ctx.fillStyle = '#18181B';
  ctx.fillRect(10, 10, width - 20, 8);

  // Try loading logo
  let currentY = 30;
  const logoImg =
    (await loadImage('/logo-marias-imports.png')) ||
    (await loadImage('/logo-nubia.png'));

  if (logoImg) {
    const targetHeight = 110;
    const targetWidth = 110;
    ctx.drawImage(logoImg, width / 2 - targetWidth / 2, currentY, targetWidth, targetHeight);
    currentY += targetHeight + 10;
  } else {
    ctx.fillStyle = '#18181B';
    ctx.font = 'bold 26px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText("MARIA'S IMPORTS", width / 2, currentY + 28);
    currentY += 45;
  }

  // Subtitle (Sem moda feminina e acessórios)
  ctx.fillStyle = '#71717A';
  ctx.font = '600 12px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('COMPROVANTE DE COMPRA', width / 2, currentY);
  currentY += 22;

  // Divider
  ctx.strokeStyle = '#E4E4E7';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(35, currentY);
  ctx.lineTo(width - 35, currentY);
  ctx.stroke();
  currentY += 20;

  // Client & Sale Info Box
  const infoBoxX = 35;
  const infoBoxWidth = width - 70;
  const infoBoxHeight = 72;

  ctx.fillStyle = '#F8FAFC';
  roundRect(ctx, infoBoxX, currentY, infoBoxWidth, infoBoxHeight, 10);
  ctx.fill();
  ctx.strokeStyle = '#E2E8F0';
  ctx.stroke();

  // Client info left
  const clientName = sale.client_name_snapshot || (client && client.name) || 'Cliente Balcão';
  const clientPhone = (client && client.phone) || sale.client_phone || '';

  ctx.textAlign = 'left';
  ctx.fillStyle = '#64748B';
  ctx.font = '500 11px Inter, sans-serif';
  ctx.fillText('CLIENTE', infoBoxX + 16, currentY + 24);

  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 15px Inter, sans-serif';
  ctx.fillText(clientName, infoBoxX + 16, currentY + 44);

  if (clientPhone) {
    ctx.fillStyle = '#64748B';
    ctx.font = '400 12px Inter, sans-serif';
    ctx.fillText(clientPhone, infoBoxX + 16, currentY + 60);
  }

  // Sale info right
  ctx.textAlign = 'right';
  ctx.fillStyle = '#64748B';
  ctx.font = '500 11px Inter, sans-serif';
  ctx.fillText('VENDA / DATA', infoBoxX + infoBoxWidth - 16, currentY + 24);

  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 15px Inter, sans-serif';
  ctx.fillText(sale.sale_code || 'VND-0000', infoBoxX + infoBoxWidth - 16, currentY + 44);

  ctx.fillStyle = '#64748B';
  ctx.font = '400 12px Inter, sans-serif';
  ctx.fillText(formatDateBR(sale.sale_date), infoBoxX + infoBoxWidth - 16, currentY + 60);

  currentY += infoBoxHeight + 22;

  // Section: Itens Comprados
  ctx.textAlign = 'left';
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 13px Inter, sans-serif';
  ctx.fillText('ITENS COMPRADOS', 35, currentY);
  currentY += 12;

  // Table Header
  const tableX = 35;
  const tableWidth = width - 70;
  ctx.fillStyle = '#F1F5F9';
  roundRect(ctx, tableX, currentY, tableWidth, 32, 6);
  ctx.fill();

  ctx.fillStyle = '#475569';
  ctx.font = '600 11px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('ITEM / DESCRIÇÃO', tableX + 14, currentY + 20);

  ctx.textAlign = 'center';
  ctx.fillText('QTD', tableX + tableWidth - 190, currentY + 20);

  ctx.textAlign = 'right';
  ctx.fillText('UNITÁRIO', tableX + tableWidth - 100, currentY + 20);
  ctx.fillText('TOTAL', tableX + tableWidth - 14, currentY + 20);

  currentY += 36;

  // Table Rows
  if (items.length === 0) {
    ctx.fillStyle = '#64748B';
    ctx.font = '400 12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Nenhum item discriminado', width / 2, currentY + 20);
    currentY += 36;
  } else {
    items.forEach((item, index) => {
      // Row bg alternating
      if (index % 2 === 1) {
        ctx.fillStyle = '#F8FAFC';
        roundRect(ctx, tableX, currentY - 4, tableWidth, 34, 4);
        ctx.fill();
      }

      ctx.textAlign = 'left';
      ctx.fillStyle = '#0F172A';
      ctx.font = '500 12px Inter, sans-serif';

      // Truncate item name if too long
      const itemName = item.product_name || 'Produto';
      const maxTextWidth = tableWidth - 240;
      let displayItemName = itemName;
      if (ctx.measureText(displayItemName).width > maxTextWidth) {
        while (ctx.measureText(displayItemName + '...').width > maxTextWidth && displayItemName.length > 0) {
          displayItemName = displayItemName.slice(0, -1);
        }
        displayItemName += '...';
      }

      ctx.fillText(displayItemName, tableX + 14, currentY + 18);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#334155';
      ctx.fillText(`${item.quantity}x`, tableX + tableWidth - 190, currentY + 18);

      ctx.textAlign = 'right';
      ctx.fillText(formatCurrency(item.sold_unit_price || item.catalog_unit_price), tableX + tableWidth - 100, currentY + 18);

      ctx.fillStyle = '#0F172A';
      ctx.font = '600 12px Inter, sans-serif';
      ctx.fillText(formatCurrency(item.line_final_total), tableX + tableWidth - 14, currentY + 18);

      currentY += 36;
    });
  }

  currentY += 10;

  // Financial Summary Box
  const summaryBoxX = 35;
  const summaryBoxWidth = width - 70;
  const summaryBoxHeight = 120;

  ctx.fillStyle = '#F8FAFC';
  roundRect(ctx, summaryBoxX, currentY, summaryBoxWidth, summaryBoxHeight, 10);
  ctx.fill();
  ctx.strokeStyle = '#E2E8F0';
  ctx.stroke();

  // Subtotal & discount rows
  ctx.textAlign = 'left';
  ctx.font = '400 12px Inter, sans-serif';
  ctx.fillStyle = '#64748B';
  ctx.fillText('Subtotal:', summaryBoxX + 18, currentY + 26);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#0F172A';
  ctx.fillText(formatCurrency(sale.original_subtotal || sale.final_total), summaryBoxX + summaryBoxWidth - 18, currentY + 26);

  if (Number(sale.total_discount_amount) > 0) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#059669';
    ctx.fillText('Desconto Aplicado:', summaryBoxX + 18, currentY + 46);

    ctx.textAlign = 'right';
    ctx.fillText(`- ${formatCurrency(sale.total_discount_amount)}`, summaryBoxX + summaryBoxWidth - 18, currentY + 46);
  } else {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#64748B';
    ctx.fillText('Forma de Pagamento:', summaryBoxX + 18, currentY + 46);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#0F172A';
    const payMethodText =
      sale.payment_method === 'A_VISTA'
        ? `À Vista (${sale.payment_submethod || 'PIX'})`
        : sale.payment_method === 'CARTAO'
        ? `Cartão de Crédito (${sale.installments_count || 1}x)`
        : `Parcelado / Caderninho (${sale.installments_count || 1}x)`;
    ctx.fillText(payMethodText, summaryBoxX + summaryBoxWidth - 18, currentY + 46);
  }

  // Divider inside summary
  ctx.strokeStyle = '#CBD5E1';
  ctx.beginPath();
  ctx.moveTo(summaryBoxX + 18, currentY + 60);
  ctx.lineTo(summaryBoxX + summaryBoxWidth - 18, currentY + 60);
  ctx.stroke();

  // TOTAL FINAL (Bold Large)
  ctx.textAlign = 'left';
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 15px Inter, sans-serif';
  ctx.fillText('TOTAL DA COMPRA:', summaryBoxX + 18, currentY + 84);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 18px Inter, sans-serif';
  ctx.fillText(formatCurrency(sale.final_total), summaryBoxX + summaryBoxWidth - 18, currentY + 84);

  // If entry paid and remaining
  if (sale.payment_method === 'FIADO' && Number(sale.paid_total) > 0) {
    ctx.font = '500 11px Inter, sans-serif';
    ctx.fillStyle = '#059669';
    ctx.textAlign = 'left';
    ctx.fillText(`Entrada paga: ${formatCurrency(sale.paid_total)}`, summaryBoxX + 18, currentY + 106);

    ctx.fillStyle = '#D97706';
    ctx.textAlign = 'right';
    ctx.fillText(`Saldo restante a pagar: ${formatCurrency(sale.pending_total)}`, summaryBoxX + summaryBoxWidth - 18, currentY + 106);
  }

  currentY += summaryBoxHeight + 22;

  // Section: CRONOGRAMA DE PARCELAS (se houver)
  if (hasInstallments) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 13px Inter, sans-serif';
    ctx.fillText(`CRONOGRAMA DE PARCELAS & DATAS DE VENCIMENTO (${installments.length}X)`, 35, currentY);
    currentY += 12;

    installments.forEach((inst) => {
      const isPaid = inst.status === 'PAGO';

      ctx.fillStyle = isPaid ? '#F0FDF4' : '#FFFBEB';
      roundRect(ctx, tableX, currentY, tableWidth, 38, 8);
      ctx.fill();

      ctx.strokeStyle = isPaid ? '#BBF7D0' : '#FDE68A';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Parcela text
      ctx.textAlign = 'left';
      ctx.fillStyle = '#0F172A';
      ctx.font = 'bold 12px Inter, sans-serif';
      ctx.fillText(`${inst.installment_number}ª Parcela`, tableX + 16, currentY + 24);

      // Due date
      ctx.fillStyle = '#475569';
      ctx.font = '500 12px Inter, sans-serif';
      ctx.fillText(`Vencimento: ${formatDateBR(inst.due_date)}`, tableX + 120, currentY + 24);

      // Value & Status Badge
      ctx.textAlign = 'right';
      ctx.fillStyle = '#0F172A';
      ctx.font = 'bold 13px Inter, sans-serif';
      ctx.fillText(formatCurrency(inst.amount), tableX + tableWidth - 95, currentY + 24);

      // Status pill
      ctx.textAlign = 'center';
      ctx.font = 'bold 10px Inter, sans-serif';
      if (isPaid) {
        ctx.fillStyle = '#166534';
        ctx.fillText('QUITADA', tableX + tableWidth - 45, currentY + 24);
      } else {
        ctx.fillStyle = '#B45309';
        ctx.fillText('PENDENTE', tableX + tableWidth - 45, currentY + 24);
      }

      currentY += 44;
    });

    currentY += 10;
  }

  // Footer message
  currentY += 10;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#0F172A';
  ctx.font = '600 13px Inter, sans-serif';
  ctx.fillText('Muito obrigada pela preferência! 💕', width / 2, currentY);
  currentY += 20;

  ctx.fillStyle = '#71717A';
  ctx.font = '400 11px Inter, sans-serif';
  ctx.fillText("Guarde este comprovante para seu acompanhamento • Maria's Imports", width / 2, currentY);

  // Return both dataUrl and Blob for easy sharing/downloading/copying
  const dataUrl = canvas.toDataURL('image/png');
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));

  return { dataUrl, blob, canvas };
}
