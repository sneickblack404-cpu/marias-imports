const express = require('express');
const cors = require('cors');
const path = require('node:path');
const {
  db,
  getLocalDateStr,
  addDaysToDateStr,
  roundMoney,
  recalculateSaleFinancials,
} = require('./db');

const app = express();
const PORT = process.env.PORT || 3005;

app.use(cors());
app.use(express.json());

function normalizeText(str) {
  return String(str || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function getSettingsMap() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const map = {};
  for (const r of rows) {
    map[r.key] = r.value;
  }
  return map;
}

function getFullDataPayload() {
  const today = getLocalDateStr(0);
  const settings = getSettingsMap();

  const products = db
    .prepare('SELECT * FROM products WHERE active = 1 ORDER BY name ASC')
    .all();

  const salesRaw = db
    .prepare('SELECT * FROM sales ORDER BY sale_date DESC, id DESC')
    .all();

  const itemsAll = db
    .prepare('SELECT * FROM sale_items ORDER BY id ASC')
    .all();

  const installmentsAll = db
    .prepare(`
      SELECT
        i.*,
        s.sale_code,
        s.sale_date,
        s.payment_method,
        s.payment_submethod,
        s.client_name_snapshot,
        c.phone AS client_phone
      FROM installments i
      JOIN sales s ON i.sale_id = s.id
      LEFT JOIN clients c ON i.client_id = c.id
      ORDER BY i.due_date ASC, i.installment_number ASC
    `)
    .all()
    .map((inst) => {
      const isPending = inst.status !== 'PAGO';
      const isOverdue = isPending && inst.due_date < today;
      const isDueToday = isPending && inst.due_date === today;
      const dueTime = new Date(inst.due_date + 'T00:00:00').getTime();
      const todayTime = new Date(today + 'T00:00:00').getTime();
      const daysDiff = Math.round((dueTime - todayTime) / (1000 * 60 * 60 * 24));
      const isDueSoon = isPending && daysDiff > 0 && daysDiff <= 5;

      return {
        ...inst,
        is_overdue: isOverdue,
        is_due_today: isDueToday,
        is_due_soon: isDueSoon,
        days_diff: daysDiff,
      };
    });

  const paymentsAll = db
    .prepare(`
      SELECT
        p.*,
        s.sale_code,
        s.client_name_snapshot,
        i.installment_number,
        i.total_installments
      FROM payments p
      JOIN sales s ON p.sale_id = s.id
      LEFT JOIN installments i ON p.installment_id = i.id
      ORDER BY p.payment_date DESC, p.id DESC
    `)
    .all();

  const expenses = db
    .prepare('SELECT * FROM expenses ORDER BY expense_date DESC, id DESC')
    .all();

  const itemsBySale = new Map();
  for (const item of itemsAll) {
    if (!itemsBySale.has(item.sale_id)) itemsBySale.set(item.sale_id, []);
    itemsBySale.get(item.sale_id).push(item);
  }

  const instBySale = new Map();
  for (const inst of installmentsAll) {
    if (!instBySale.has(inst.sale_id)) instBySale.set(inst.sale_id, []);
    instBySale.get(inst.sale_id).push(inst);
  }

  const payBySale = new Map();
  for (const pay of paymentsAll) {
    if (!payBySale.has(pay.sale_id)) payBySale.set(pay.sale_id, []);
    payBySale.get(pay.sale_id).push(pay);
  }

  const sales = salesRaw.map((s) => ({
    ...s,
    items: itemsBySale.get(s.id) || [],
    installments: instBySale.get(s.id) || [],
    payments: payBySale.get(s.id) || [],
  }));

  const clientsRaw = db
    .prepare('SELECT * FROM clients WHERE active = 1 OR active IS NULL ORDER BY name ASC')
    .all();

  const clients = clientsRaw.map((c) => {
    const clientSales = sales.filter((s) => s.client_id === c.id);
    const clientInstallments = installmentsAll.filter((i) => i.client_id === c.id);
    const clientPayments = paymentsAll.filter((p) => p.client_id === c.id);

    const totalBought = roundMoney(
      clientSales.reduce((acc, s) => acc + Number(s.final_total || 0), 0)
    );
    const totalPaid = roundMoney(
      clientSales.reduce((acc, s) => acc + Number(s.paid_total || 0), 0)
    );
    const totalDebt = roundMoney(
      clientSales.reduce((acc, s) => acc + Number(s.pending_total || 0), 0)
    );
    const overdueInstallmentsCount = clientInstallments.filter(
      (i) => i.status !== 'PAGO' && i.due_date < today
    ).length;

    const nextPendingInstallment = clientInstallments.find((i) => i.status !== 'PAGO') || null;

    return {
      ...c,
      total_bought: totalBought,
      total_paid: totalPaid,
      total_debt: totalDebt,
      purchases_count: clientSales.length,
      overdue_installments_count: overdueInstallmentsCount,
      next_due_date: nextPendingInstallment ? nextPendingInstallment.due_date : null,
      sales_history: clientSales,
      installments: clientInstallments,
      payments: clientPayments,
    };
  });

  return {
    today,
    settings,
    products,
    clients,
    sales,
    installments: installmentsAll,
    payments: paymentsAll,
    expenses,
  };
}

// POST /api/login
app.post('/api/login', (req, res) => {
  try {
    const { username = '', password = '' } = req.body || {};
    const cleanInputUser = normalizeText(username);
    const cleanPass = String(password || '').trim();

    const users = db.prepare('SELECT * FROM users WHERE active = 1').all();
    const matchedUser = users.find(
      (u) =>
        normalizeText(u.username) === cleanInputUser ||
        normalizeText(u.display_name) === cleanInputUser
    );

    if (!matchedUser || String(matchedUser.password) !== cleanPass) {
      return res.status(401).json({
        error: 'Usuário ou senha incorretos.',
      });
    }

    res.json({
      user: {
        id: matchedUser.id,
        username: matchedUser.username,
        displayName: matchedUser.display_name,
        role: matchedUser.role,
        companyName: matchedUser.company_name,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bootstrap
app.get('/api/bootstrap', (_req, res) => {
  try {
    res.json(getFullDataPayload());
  } catch (err) {
    console.error('Error in /api/bootstrap:', err);
    res.status(500).json({ error: err.message });
  }
});

// PRODUCTS (1. Controle de Estoque)
app.post('/api/products', (req, res) => {
  try {
    const {
      sku = '',
      name = '',
      category = 'Geral',
      cost_price = 0,
      sale_price = 0,
      stock_qty = 0,
      min_stock_qty = 3,
      unit = 'UN',
      notes = '',
    } = req.body || {};

    if (!String(name).trim()) {
      return res.status(400).json({ error: 'Informe o nome do produto.' });
    }

    let finalSku = String(sku || '').trim().toUpperCase();
    if (!finalSku) {
      const last = db.prepare('SELECT id FROM products ORDER BY id DESC LIMIT 1').get();
      const nextNum = String((last?.id || 0) + 1).padStart(3, '0');
      finalSku = `PRD-${nextNum}`;
    }

    db.prepare(`
      INSERT INTO products (sku, name, category, cost_price, sale_price, stock_qty, min_stock_qty, unit, notes, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      finalSku,
      String(name).trim(),
      String(category || 'Geral').trim(),
      roundMoney(cost_price),
      roundMoney(sale_price),
      Number(stock_qty) || 0,
      Number(min_stock_qty) || 0,
      String(unit || 'UN').trim().toUpperCase(),
      String(notes || '').trim()
    );

    res.status(201).json(getFullDataPayload());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/products/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Produto não encontrado.' });

    const {
      sku = existing.sku,
      name = existing.name,
      category = existing.category,
      cost_price = existing.cost_price,
      sale_price = existing.sale_price,
      stock_qty = existing.stock_qty,
      min_stock_qty = existing.min_stock_qty,
      unit = existing.unit,
      notes = existing.notes,
    } = req.body || {};

    db.prepare(`
      UPDATE products SET
        sku = ?, name = ?, category = ?, cost_price = ?, sale_price = ?,
        stock_qty = ?, min_stock_qty = ?, unit = ?, notes = ?
      WHERE id = ?
    `).run(
      String(sku).trim().toUpperCase(),
      String(name).trim(),
      String(category).trim(),
      roundMoney(cost_price),
      roundMoney(sale_price),
      Number(stock_qty),
      Number(min_stock_qty),
      String(unit || 'UN').trim().toUpperCase(),
      String(notes || '').trim(),
      id
    );

    res.json(getFullDataPayload());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/clients/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    db.prepare('UPDATE clients SET active = 0 WHERE id = ?').run(id);
    res.json(getFullDataPayload());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/products/:id/stock', (req, res) => {
  try {
    const id = Number(req.params.id);
    const { delta = 0, exact_qty = null } = req.body || {};
    const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Produto não encontrado.' });

    const newQty =
      exact_qty !== null && exact_qty !== undefined
        ? Math.max(0, Number(exact_qty))
        : Math.max(0, Number(existing.stock_qty) + Number(delta));

    db.prepare('UPDATE products SET stock_qty = ? WHERE id = ?').run(newQty, id);
    res.json(getFullDataPayload());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/products/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    db.prepare('UPDATE products SET active = 0 WHERE id = ?').run(id);
    res.json(getFullDataPayload());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CLIENTS (2. Cadastro de Clientes)
app.post('/api/clients', (req, res) => {
  try {
    const {
      name = '',
      phone = '',
      cpf = '',
      address = '',
      neighborhood = '',
      city = '',
      default_discount_percent = 0,
      credit_limit = 2000,
      notes = '',
    } = req.body || {};

    if (!String(name).trim()) {
      return res.status(400).json({ error: 'Informe o nome do cliente.' });
    }

    const result = db.prepare(`
      INSERT INTO clients (
        name, phone, cpf, address, neighborhood, city,
        default_discount_percent, credit_limit, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      String(name).trim(),
      String(phone || '').trim(),
      String(cpf || '').trim(),
      String(address || '').trim(),
      String(neighborhood || '').trim(),
      String(city || '').trim(),
      roundMoney(default_discount_percent),
      roundMoney(credit_limit),
      String(notes || '').trim()
    );

    const payload = getFullDataPayload();
    res.status(201).json({
      ...payload,
      created_client_id: Number(result.lastInsertRowid),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/clients/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Cliente não encontrado.' });

    const {
      name = existing.name,
      phone = existing.phone,
      cpf = existing.cpf,
      address = existing.address,
      neighborhood = existing.neighborhood,
      city = existing.city,
      default_discount_percent = existing.default_discount_percent,
      credit_limit = existing.credit_limit,
      notes = existing.notes,
    } = req.body || {};

    db.prepare(`
      UPDATE clients SET
        name = ?, phone = ?, cpf = ?, address = ?, neighborhood = ?, city = ?,
        default_discount_percent = ?, credit_limit = ?, notes = ?
      WHERE id = ?
    `).run(
      String(name).trim(),
      String(phone || '').trim(),
      String(cpf || '').trim(),
      String(address || '').trim(),
      String(neighborhood || '').trim(),
      String(city || '').trim(),
      roundMoney(default_discount_percent),
      roundMoney(credit_limit),
      String(notes || '').trim(),
      id
    );

    res.json(getFullDataPayload());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/clients/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    db.prepare('UPDATE clients SET active = 0 WHERE id = ?').run(id);
    res.json(getFullDataPayload());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SALES (2, 3, 4, 5, 6 - Vendas, Estoque, Formas de Pagamento, Parcelamento, Descontos)
app.post('/api/sales', (req, res) => {
  try {
    const {
      client_id = null,
      sale_date = getLocalDateStr(0),
      payment_method = 'A_VISTA', // 'A_VISTA', 'CARTAO', 'FIADO'
      payment_submethod = 'PIX',
      installments_count = 1,
      interval_days = 30,
      first_due_date = getLocalDateStr(0),
      custom_installments = null, // optional array of { installment_number, due_date, amount }
      items = [],
      sale_discount_type = 'VALUE', // 'VALUE' or 'PERCENT'
      sale_discount_input = 0,
      initial_payment_amount = 0, // optional down-payment or immediate payment for Fiado/Parcial
      notes = '',
    } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Adicione pelo menos 1 produto ou item à venda.' });
    }

    let clientObj = null;
    if (client_id) {
      clientObj = db.prepare('SELECT * FROM clients WHERE id = ?').get(Number(client_id));
    }

    if (payment_method === 'FIADO' && !clientObj) {
      return res.status(400).json({
        error: 'Para vendas Fiadas (Caderninho), selecione ou cadastre o cliente para vincular o histórico.',
      });
    }

    const clientNameSnapshot = clientObj ? clientObj.name : 'Cliente Balcão (Avulso)';

    // Calculate item lines & check stock without altering catalog prices
    let originalSubtotal = 0;
    let itemDiscountsTotal = 0;
    let subtotalAfterItemDiscounts = 0;

    const preparedItems = [];

    for (const rawItem of items) {
      const qty = Math.max(1, Number(rawItem.quantity) || 1);
      const isManual = Boolean(rawItem.is_manual_item || !rawItem.product_id);
      let productRow = null;

      if (!isManual && rawItem.product_id) {
        productRow = db.prepare('SELECT * FROM products WHERE id = ?').get(Number(rawItem.product_id));
        if (!productRow) {
          return res.status(400).json({ error: `Produto ID ${rawItem.product_id} não encontrado.` });
        }
      }

      const catalogUnitPrice = roundMoney(
        rawItem.catalog_unit_price !== undefined && rawItem.catalog_unit_price !== null
          ? Number(rawItem.catalog_unit_price)
          : productRow
          ? productRow.sale_price
          : Number(rawItem.sold_unit_price || 0)
      );

      // Allow manual price override or item-specific discount
      const soldUnitPrice = roundMoney(
        rawItem.sold_unit_price !== undefined && rawItem.sold_unit_price !== null
          ? Number(rawItem.sold_unit_price)
          : catalogUnitPrice
      );

      const itemDiscountUnit = roundMoney(Math.max(0, catalogUnitPrice - soldUnitPrice));
      const itemDiscountTotal = roundMoney(itemDiscountUnit * qty);

      // Line original uses whichever is higher between catalog price and manual price so original >= final
      const effectiveOriginalUnit = Math.max(catalogUnitPrice, soldUnitPrice);
      const lineOriginalTotal = roundMoney(effectiveOriginalUnit * qty);
      const lineFinalTotal = roundMoney(soldUnitPrice * qty);

      originalSubtotal = roundMoney(originalSubtotal + lineOriginalTotal);
      itemDiscountsTotal = roundMoney(itemDiscountsTotal + itemDiscountTotal);
      subtotalAfterItemDiscounts = roundMoney(subtotalAfterItemDiscounts + lineFinalTotal);

      preparedItems.push({
        product_id: productRow ? productRow.id : null,
        product_sku_snapshot: productRow ? productRow.sku : 'MANUAL',
        product_name: String(rawItem.product_name || (productRow ? productRow.name : 'Item Variado')).trim(),
        is_manual_item: isManual ? 1 : 0,
        quantity: qty,
        catalog_unit_price: effectiveOriginalUnit,
        sold_unit_price: soldUnitPrice,
        item_discount_unit: itemDiscountUnit,
        item_discount_total: itemDiscountTotal,
        line_original_total: lineOriginalTotal,
        line_final_total: lineFinalTotal,
      });
    }

    // Sale-level discount (specific for client or general sale discount)
    const discountInputNum = Math.max(0, Number(sale_discount_input) || 0);
    let saleDiscountAmount = 0;
    if (sale_discount_type === 'PERCENT') {
      saleDiscountAmount = roundMoney(subtotalAfterItemDiscounts * (Math.min(100, discountInputNum) / 100));
    } else {
      saleDiscountAmount = roundMoney(Math.min(subtotalAfterItemDiscounts, discountInputNum));
    }

    const totalDiscountAmount = roundMoney(itemDiscountsTotal + saleDiscountAmount);
    const finalTotal = roundMoney(Math.max(0, originalSubtotal - totalDiscountAmount));

    const lastSale = db.prepare('SELECT id FROM sales ORDER BY id DESC LIMIT 1').get();
    const nextSaleNum = 1001 + (lastSale ? lastSale.id : 0);
    const saleCode = `VND-${nextSaleNum}`;

    const numInstallments = Math.max(1, Number(installments_count) || 1);
    const stepDays = Math.max(1, Number(interval_days) || 30);
    const startDueDate = first_due_date || sale_date || getLocalDateStr(0);

    // Determine if paid immediately
    const isImmediateFullPayment =
      payment_method === 'A_VISTA' ||
      (payment_method === 'CARTAO' && req.body.auto_settle_card !== false && numInstallments === 1);

    let paidTotalInit = isImmediateFullPayment ? finalTotal : roundMoney(Number(initial_payment_amount) || 0);
    if (paidTotalInit > finalTotal) paidTotalInit = finalTotal;
    const pendingTotalInit = roundMoney(finalTotal - paidTotalInit);
    const statusInit =
      pendingTotalInit <= 0.009 ? 'PAGO' : paidTotalInit > 0.009 ? 'PARCIAL' : 'PENDENTE';

    db.exec('BEGIN');
    try {
      const saleResult = db.prepare(`
        INSERT INTO sales (
          sale_code, client_id, client_name_snapshot, sale_date, payment_method, payment_submethod,
          installments_count, interval_days, first_due_date, original_subtotal, item_discounts_total,
          sale_discount_type, sale_discount_input, sale_discount_amount, total_discount_amount,
          final_total, paid_total, pending_total, status, notes, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        saleCode,
        clientObj ? clientObj.id : null,
        clientNameSnapshot,
        sale_date,
        payment_method,
        payment_submethod,
        numInstallments,
        stepDays,
        startDueDate,
        originalSubtotal,
        itemDiscountsTotal,
        sale_discount_type,
        discountInputNum,
        saleDiscountAmount,
        totalDiscountAmount,
        finalTotal,
        paidTotalInit,
        pendingTotalInit,
        statusInit,
        String(notes || '').trim(),
        'Núbia'
      );

      const saleId = Number(saleResult.lastInsertRowid);

      // Insert sale items AND automatically deduct from stock (1. Controle de Estoque)
      const insertItemStmt = db.prepare(`
        INSERT INTO sale_items (
          sale_id, product_id, product_sku_snapshot, product_name, is_manual_item,
          quantity, catalog_unit_price, sold_unit_price, item_discount_unit, item_discount_total,
          line_original_total, line_final_total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const deductStockStmt = db.prepare(`
        UPDATE products
        SET stock_qty = CASE WHEN stock_qty - ? < 0 THEN 0 ELSE stock_qty - ? END
        WHERE id = ?
      `);

      for (const it of preparedItems) {
        insertItemStmt.run(
          saleId,
          it.product_id,
          it.product_sku_snapshot,
          it.product_name,
          it.is_manual_item,
          it.quantity,
          it.catalog_unit_price,
          it.sold_unit_price,
          it.item_discount_unit,
          it.item_discount_total,
          it.line_original_total,
          it.line_final_total
        );

        if (it.product_id && !it.is_manual_item) {
          deductStockStmt.run(it.quantity, it.quantity, it.product_id);
        }
      }

      // Generate installments (4. Parcelamento e Vencimentos)
      let scheduleList = [];
      if (Array.isArray(custom_installments) && custom_installments.length === numInstallments) {
        scheduleList = custom_installments.map((ci, idx) => ({
          installment_number: idx + 1,
          due_date: ci.due_date || addDaysToDateStr(startDueDate, idx * stepDays),
          amount: roundMoney(ci.amount),
        }));
      } else {
        const baseInstallment = Math.floor((finalTotal / numInstallments) * 100) / 100;
        let accumulated = 0;
        for (let i = 1; i <= numInstallments; i++) {
          const isLast = i === numInstallments;
          const amount = isLast
            ? roundMoney(finalTotal - accumulated)
            : roundMoney(baseInstallment);
          accumulated = roundMoney(accumulated + amount);
          const dueDate = i === 1 ? startDueDate : addDaysToDateStr(startDueDate, (i - 1) * stepDays);
          scheduleList.push({
            installment_number: i,
            due_date: dueDate,
            amount,
          });
        }
      }

      let remainingInitialPayToDistribute = paidTotalInit;
      const insertInstStmt = db.prepare(`
        INSERT INTO installments (
          sale_id, client_id, installment_number, total_installments, due_date,
          amount, paid_amount, remaining_amount, status, paid_at, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertPayStmt = db.prepare(`
        INSERT INTO payments (
          sale_id, installment_id, client_id, amount, payment_date, payment_type, notes, received_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const instItem of scheduleList) {
        const paidOnThis = roundMoney(
          Math.min(instItem.amount, Math.max(0, remainingInitialPayToDistribute))
        );
        remainingInitialPayToDistribute = roundMoney(remainingInitialPayToDistribute - paidOnThis);
        const remOnThis = roundMoney(instItem.amount - paidOnThis);
        const instStatus =
          remOnThis <= 0.009 ? 'PAGO' : paidOnThis > 0.009 ? 'PARCIAL' : 'PENDENTE';

        const instRes = insertInstStmt.run(
          saleId,
          clientObj ? clientObj.id : null,
          instItem.installment_number,
          numInstallments,
          instItem.due_date,
          instItem.amount,
          paidOnThis,
          remOnThis,
          instStatus,
          instStatus === 'PAGO' ? sale_date : null,
          instStatus === 'PAGO'
            ? `Quitado na venda (${payment_submethod || payment_method})`
            : paidOnThis > 0
            ? `Pagamento parcial de entrada: R$ ${paidOnThis.toFixed(2)}`
            : ''
        );

        if (paidOnThis > 0.009) {
          insertPayStmt.run(
            saleId,
            Number(instRes.lastInsertRowid),
            clientObj ? clientObj.id : null,
            paidOnThis,
            sale_date,
            payment_submethod || (payment_method === 'CARTAO' ? 'CARTAO' : 'PIX'),
            isImmediateFullPayment
              ? `Pagamento integral no ato da venda ${saleCode}`
              : `Entrada / pagamento inicial na venda ${saleCode}`,
            'Núbia'
          );
        }
      }

      recalculateSaleFinancials(saleId);
      db.exec('COMMIT');

      const payload = getFullDataPayload();
      const createdSale = payload.sales.find((s) => s.id === saleId);
      res.status(201).json({
        ...payload,
        created_sale: createdSale,
      });
    } catch (innerErr) {
      db.exec('ROLLBACK');
      throw innerErr;
    }
  } catch (err) {
    console.error('Error creating sale:', err);
    res.status(500).json({ error: err.message });
  }
});

// PAYMENTS & INSTALLMENT RECEIPTS (5. Controle de Recebimentos)
// Supports paying a specific installment (full or partial) OR paying an arbitrary amount towards a client's debt / sale
app.post('/api/payments', (req, res) => {
  try {
    const {
      installment_id = null,
      sale_id = null,
      client_id = null,
      amount = 0,
      payment_date = getLocalDateStr(0),
      payment_type = 'PIX',
      notes = '',
    } = req.body || {};

    const payAmount = roundMoney(Number(amount) || 0);
    if (payAmount <= 0) {
      return res.status(400).json({ error: 'Informe um valor de pagamento maior que zero.' });
    }

    db.exec('BEGIN');
    try {
      let remainingToApply = payAmount;
      const affectedSales = new Set();

      // 1. If a specific installment_id is provided, apply to it first (and spill over to subsequent pending installments of the same sale/client if overpaid)
      if (installment_id) {
        const targetInst = db
          .prepare('SELECT * FROM installments WHERE id = ?')
          .get(Number(installment_id));
        if (!targetInst) {
          db.exec('ROLLBACK');
          return res.status(404).json({ error: 'Parcela não encontrada.' });
        }

        const applyHere = roundMoney(Math.min(targetInst.remaining_amount, remainingToApply));
        if (applyHere > 0) {
          const newPaid = roundMoney(targetInst.paid_amount + applyHere);
          const newRem = roundMoney(Math.max(0, targetInst.amount - newPaid));
          const newStatus = newRem <= 0.009 ? 'PAGO' : 'PARCIAL';

          db.prepare(`
            UPDATE installments
            SET paid_amount = ?, remaining_amount = ?, status = ?, paid_at = ?
            WHERE id = ?
          `).run(
            newPaid,
            newRem,
            newStatus,
            newStatus === 'PAGO' ? payment_date : targetInst.paid_at,
            targetInst.id
          );

          db.prepare(`
            INSERT INTO payments (
              sale_id, installment_id, client_id, amount, payment_date, payment_type, notes, received_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            targetInst.sale_id,
            targetInst.id,
            targetInst.client_id,
            applyHere,
            payment_date,
            payment_type,
            notes ||
              (newStatus === 'PARCIAL'
                ? `Pagamento parcial da parcela ${targetInst.installment_number}/${targetInst.total_installments}`
                : `Quitação da parcela ${targetInst.installment_number}/${targetInst.total_installments}`),
            'Núbia'
          );

          remainingToApply = roundMoney(remainingToApply - applyHere);
          affectedSales.add(targetInst.sale_id);
        }

        // If user paid more than this installment's remaining balance, distribute to next open installments of same sale or client
        if (remainingToApply > 0.009) {
          const nextInstallments = db
            .prepare(`
              SELECT * FROM installments
              WHERE (sale_id = ? OR (client_id IS NOT NULL AND client_id = ?))
                AND status != 'PAGO'
                AND id != ?
              ORDER BY CASE WHEN sale_id = ? THEN 0 ELSE 1 END ASC, due_date ASC, installment_number ASC
            `)
            .all(targetInst.sale_id, targetInst.client_id, targetInst.id, targetInst.sale_id);

          for (const nextInst of nextInstallments) {
            if (remainingToApply <= 0.009) break;
            const take = roundMoney(Math.min(nextInst.remaining_amount, remainingToApply));
            if (take <= 0) continue;

            const newPaid = roundMoney(nextInst.paid_amount + take);
            const newRem = roundMoney(Math.max(0, nextInst.amount - newPaid));
            const newStatus = newRem <= 0.009 ? 'PAGO' : 'PARCIAL';

            db.prepare(`
              UPDATE installments
              SET paid_amount = ?, remaining_amount = ?, status = ?, paid_at = ?
              WHERE id = ?
            `).run(
              newPaid,
              newRem,
              newStatus,
              newStatus === 'PAGO' ? payment_date : nextInst.paid_at,
              nextInst.id
            );

            db.prepare(`
              INSERT INTO payments (
                sale_id, installment_id, client_id, amount, payment_date, payment_type, notes, received_by
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              nextInst.sale_id,
              nextInst.id,
              nextInst.client_id,
              take,
              payment_date,
              payment_type,
              notes || `Abatimento automático na parcela ${nextInst.installment_number}/${nextInst.total_installments}`,
              'Núbia'
            );

            remainingToApply = roundMoney(remainingToApply - take);
            affectedSales.add(nextInst.sale_id);
          }
        }
      } else if (sale_id || client_id) {
        // 2. General payment towards a sale or a client's oldest pending installments
        const filterSql = sale_id
          ? 'WHERE sale_id = ? AND status != \'PAGO\' ORDER BY due_date ASC, installment_number ASC'
          : 'WHERE client_id = ? AND status != \'PAGO\' ORDER BY due_date ASC, installment_number ASC';
        const filterParam = sale_id ? Number(sale_id) : Number(client_id);

        const openInstallments = db.prepare(`SELECT * FROM installments ${filterSql}`).all(filterParam);
        if (openInstallments.length === 0) {
          db.exec('ROLLBACK');
          return res.status(400).json({ error: 'Não há parcelas pendentes para abater este pagamento.' });
        }

        for (const inst of openInstallments) {
          if (remainingToApply <= 0.009) break;
          const take = roundMoney(Math.min(inst.remaining_amount, remainingToApply));
          if (take <= 0) continue;

          const newPaid = roundMoney(inst.paid_amount + take);
          const newRem = roundMoney(Math.max(0, inst.amount - newPaid));
          const newStatus = newRem <= 0.009 ? 'PAGO' : 'PARCIAL';

          db.prepare(`
            UPDATE installments
            SET paid_amount = ?, remaining_amount = ?, status = ?, paid_at = ?
            WHERE id = ?
          `).run(
            newPaid,
            newRem,
            newStatus,
            newStatus === 'PAGO' ? payment_date : inst.paid_at,
            inst.id
          );

          db.prepare(`
            INSERT INTO payments (
              sale_id, installment_id, client_id, amount, payment_date, payment_type, notes, received_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            inst.sale_id,
            inst.id,
            inst.client_id,
            take,
            payment_date,
            payment_type,
            notes || `Abatimento de saldo devedor (Parcela ${inst.installment_number}/${inst.total_installments})`,
            'Núbia'
          );

          remainingToApply = roundMoney(remainingToApply - take);
          affectedSales.add(inst.sale_id);
        }
      } else {
        db.exec('ROLLBACK');
        return res.status(400).json({ error: 'Informe a parcela, venda ou cliente para registrar o recebimento.' });
      }

      for (const sId of affectedSales) {
        recalculateSaleFinancials(sId);
      }

      db.exec('COMMIT');
      res.status(201).json(getFullDataPayload());
    } catch (innerErr) {
      db.exec('ROLLBACK');
      throw innerErr;
    }
  } catch (err) {
    console.error('Error recording payment:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/sales/:id - Cancelar / Excluir venda e estornar estoque
app.delete('/api/sales/:id', (req, res) => {
  try {
    const saleId = Number(req.params.id);
    const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId);
    if (!sale) return res.status(404).json({ error: 'Venda não encontrada.' });

    db.exec('BEGIN');
    try {
      // 1. Devolver quantidades vendidas de volta ao estoque
      const saleItems = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(saleId);
      const returnStockStmt = db.prepare(`
        UPDATE products
        SET stock_qty = stock_qty + ?
        WHERE id = ?
      `);

      for (const item of saleItems) {
        if (item.product_id && !item.is_manual_item) {
          returnStockStmt.run(item.quantity, item.product_id);
        }
      }

      // 2. Excluir pagamentos, parcelas, itens e a venda
      db.prepare('DELETE FROM payments WHERE sale_id = ?').run(saleId);
      db.prepare('DELETE FROM installments WHERE sale_id = ?').run(saleId);
      db.prepare('DELETE FROM sale_items WHERE sale_id = ?').run(saleId);
      db.prepare('DELETE FROM sales WHERE id = ?').run(saleId);

      db.exec('COMMIT');
      res.json(getFullDataPayload());
    } catch (innerErr) {
      db.exec('ROLLBACK');
      throw innerErr;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// EXPENSES (Registro de Gastos & Despesas p/ Abater no Lucro)
app.post('/api/expenses', (req, res) => {
  try {
    const {
      description = '',
      category = 'Geral',
      amount = 0,
      expense_date = getLocalDateStr(0),
      notes = '',
    } = req.body || {};

    const cleanDesc = String(description).trim();
    const val = roundMoney(Number(amount) || 0);

    if (!cleanDesc) {
      return res.status(400).json({ error: 'Informe a descrição do gasto.' });
    }
    if (val <= 0) {
      return res.status(400).json({ error: 'Informe um valor válido para o gasto.' });
    }

    db.prepare(`
      INSERT INTO expenses (description, category, amount, expense_date, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(cleanDesc, String(category).trim(), val, expense_date, String(notes).trim());

    res.status(201).json(getFullDataPayload());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/expenses/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
    res.json(getFullDataPayload());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check for Render and monitoring keep-alive
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Serve static frontend in production
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get('/{*splat}', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Maria's Imports API] Servidor rodando na porta ${PORT}`);
});
