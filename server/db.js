const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'nubia_arruda.sqlite');
const db = new DatabaseSync(dbPath);

db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

function getLocalDateStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDaysToDateStr(dateStr, days) {
  const parts = String(dateStr).split('-').map(Number);
  const d = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
  d.setDate(d.getDate() + Number(days));
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function roundMoney(val) {
  return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
}

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      company_name TEXT NOT NULL,
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Geral',
      cost_price REAL NOT NULL DEFAULT 0,
      sale_price REAL NOT NULL DEFAULT 0,
      stock_qty INTEGER NOT NULL DEFAULT 0,
      min_stock_qty INTEGER NOT NULL DEFAULT 3,
      unit TEXT NOT NULL DEFAULT 'UN',
      notes TEXT DEFAULT '',
      active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      cpf TEXT DEFAULT '',
      address TEXT DEFAULT '',
      neighborhood TEXT DEFAULT '',
      city TEXT DEFAULT '',
      default_discount_percent REAL NOT NULL DEFAULT 0,
      credit_limit REAL NOT NULL DEFAULT 2000,
      notes TEXT DEFAULT '',
      active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_code TEXT NOT NULL UNIQUE,
      client_id INTEGER,
      client_name_snapshot TEXT NOT NULL,
      sale_date TEXT NOT NULL,
      payment_method TEXT NOT NULL, -- 'A_VISTA', 'CARTAO', 'FIADO'
      payment_submethod TEXT DEFAULT '', -- 'PIX', 'DINHEIRO', 'CREDITO', 'DEBITO', 'CADERNINHO'
      installments_count INTEGER NOT NULL DEFAULT 1,
      interval_days INTEGER NOT NULL DEFAULT 30, -- 15, 30, 60, 90, etc.
      first_due_date TEXT NOT NULL,
      original_subtotal REAL NOT NULL DEFAULT 0,
      item_discounts_total REAL NOT NULL DEFAULT 0,
      sale_discount_type TEXT NOT NULL DEFAULT 'VALUE', -- 'VALUE' or 'PERCENT'
      sale_discount_input REAL NOT NULL DEFAULT 0,
      sale_discount_amount REAL NOT NULL DEFAULT 0,
      total_discount_amount REAL NOT NULL DEFAULT 0,
      final_total REAL NOT NULL DEFAULT 0,
      paid_total REAL NOT NULL DEFAULT 0,
      pending_total REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'PENDENTE', -- 'PAGO', 'PARCIAL', 'PENDENTE'
      notes TEXT DEFAULT '',
      created_by TEXT NOT NULL DEFAULT 'Núbia',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      product_id INTEGER,
      product_sku_snapshot TEXT DEFAULT '',
      product_name TEXT NOT NULL,
      is_manual_item INTEGER NOT NULL DEFAULT 0,
      quantity INTEGER NOT NULL DEFAULT 1,
      catalog_unit_price REAL NOT NULL DEFAULT 0,
      sold_unit_price REAL NOT NULL DEFAULT 0,
      item_discount_unit REAL NOT NULL DEFAULT 0,
      item_discount_total REAL NOT NULL DEFAULT 0,
      line_original_total REAL NOT NULL DEFAULT 0,
      line_final_total REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS installments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      client_id INTEGER,
      installment_number INTEGER NOT NULL,
      total_installments INTEGER NOT NULL,
      due_date TEXT NOT NULL,
      amount REAL NOT NULL,
      paid_amount REAL NOT NULL DEFAULT 0,
      remaining_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'PENDENTE', -- 'PAGO', 'PARCIAL', 'PENDENTE'
      paid_at TEXT,
      notes TEXT DEFAULT '',
      FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      installment_id INTEGER,
      client_id INTEGER,
      amount REAL NOT NULL,
      payment_date TEXT NOT NULL,
      payment_type TEXT NOT NULL DEFAULT 'PIX', -- 'PIX', 'DINHEIRO', 'CARTAO', 'TRANSFERENCIA'
      notes TEXT DEFAULT '',
      received_by TEXT NOT NULL DEFAULT 'Núbia',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
      FOREIGN KEY (installment_id) REFERENCES installments(id) ON DELETE SET NULL,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      expense_date TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Geral',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
  `);

  function safeAddColumn(tableName, columnName, columnDef) {
    try {
      const tableInfo = db.prepare(`PRAGMA table_info(${tableName})`).all();
      const exists = tableInfo.some((c) => c.name === columnName);
      if (!exists) {
        db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef};`);
      }
    } catch (_err) {
      // ignore
    }
  }

  safeAddColumn('clients', 'active', 'INTEGER DEFAULT 1');
  safeAddColumn('products', 'active', 'INTEGER DEFAULT 1');
  safeAddColumn('users', 'active', 'INTEGER DEFAULT 1');

  const userCount = db.prepare('SELECT COUNT(*) as total FROM users').get();
  if (userCount.total === 0) {
    seedDatabase();
  }
}

function seedDatabase() {
  const today = getLocalDateStr(0);
  const fiveDaysAgo = getLocalDateStr(-5);
  const fifteenDaysAgo = getLocalDateStr(-15);
  const thirtyFiveDaysAgo = getLocalDateStr(-35);

  // Settings
  const insertSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  insertSetting.run('company_name', "Maria's Imports");
  insertSetting.run('owner_name', 'Núbia');
  insertSetting.run('company_subtitle', 'Gestão Comercial, Estoque & Crediário');
  insertSetting.run('phone', '31 99919-5562');

  // Login User: Núbia / 1234 / Empresa: Maria's Imports
  const insertUser = db.prepare(`
    INSERT INTO users (username, display_name, password, role, company_name, active)
    VALUES (?, ?, ?, ?, ?, 1)
  `);
  insertUser.run('Núbia', 'Núbia Arruda', '1234', 'Proprietária & Administradora', "Maria's Imports");

  // Products
  const insertProduct = db.prepare(`
    INSERT INTO products (sku, name, category, cost_price, sale_price, stock_qty, min_stock_qty, unit, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertProduct.run('PRD-001', 'Conjunto Alfaiataria Elegance', 'Vestuário', 85.00, 189.90, 8, 3, 'UN', 'Tamanhos P, M e G');
  insertProduct.run('PRD-002', 'Vestido Midi Floral Premium', 'Vestuário', 72.00, 159.90, 2, 4, 'UN', 'Estoque baixo - repor com fornecedor');
  insertProduct.run('PRD-003', 'Blusa Linho Fino Off-White', 'Vestuário', 42.00, 99.90, 12, 4, 'UN', 'Alta saída');
  insertProduct.run('PRD-004', 'Calça Pantalona Cintura Alta', 'Vestuário', 60.00, 139.90, 3, 5, 'UN', 'Reposição necessária');
  insertProduct.run('PRD-005', 'Perfume Deo Parfum 100ml', 'Perfumaria & Beleza', 68.00, 149.90, 6, 3, 'UN', 'Fragrância exclusiva');
  insertProduct.run('PRD-006', 'Kit Hidratante + Body Splash', 'Perfumaria & Beleza', 39.00, 89.90, 1, 4, 'KIT', 'Apenas 1 unidade restante');
  insertProduct.run('PRD-007', 'Bolsa Tiracolo Couro Sintético', 'Acessórios', 55.00, 129.90, 5, 2, 'UN', 'Cores preta e caramelo');
  insertProduct.run('PRD-008', 'Colar Folheado Ouro 18k', 'Semijoias & Acessórios', 28.00, 79.90, 0, 3, 'UN', 'Esgotado - encomendar');

  // Clients
  const insertClient = db.prepare(`
    INSERT INTO clients (name, phone, cpf, address, neighborhood, city, default_discount_percent, credit_limit, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertClient.run('Maria Fernanda Oliveira', '(31) 99123-4567', '123.456.789-00', 'Rua das Acácias, 140', 'Centro', 'Belo Horizonte', 5, 1500, 'Cliente VIP, costuma pagar em dia todo dia 10.');
  insertClient.run('Camila Santos Rocha', '(31) 99234-5678', '234.567.890-11', 'Av. Brasil, 890 - Apto 302', 'Funcionários', 'Belo Horizonte', 0, 2000, 'Prefere parcelar em 2x ou 3x a cada 30 dias.');
  insertClient.run('Juliana Costa Mendes', '(31) 99345-6789', '345.678.901-22', 'Rua Mato Grosso, 45', 'Santo Agostinho', 'Belo Horizonte', 10, 1200, 'Amiga da família (10% de desconto padrão).');
  insertClient.run('Patrícia Lima Almeida', '(31) 99456-7890', '456.789.012-33', 'Rua Paraíba, 312', 'Savassi', 'Belo Horizonte', 0, 1000, 'Compra no caderninho (fiado).');

  // Sample Sales & Installments to demonstrate history, multiple purchases per client, partial payments, and due dates
  // Sale 1: Maria Fernanda (35 days ago) - Fiado 2x 30 dias (1ª parcela já paga, 2ª pendente)
  const sale1FirstDue = addDaysToDateStr(thirtyFiveDaysAgo, 30); // Vencida há 5 dias ou paga
  const sale1SecondDue = addDaysToDateStr(thirtyFiveDaysAgo, 60); // A vencer em 25 dias
  db.prepare(`
    INSERT INTO sales (
      sale_code, client_id, client_name_snapshot, sale_date, payment_method, payment_submethod,
      installments_count, interval_days, first_due_date, original_subtotal, item_discounts_total,
      sale_discount_type, sale_discount_input, sale_discount_amount, total_discount_amount,
      final_total, paid_total, pending_total, status, notes, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'VND-1001', 1, 'Maria Fernanda Oliveira', thirtyFiveDaysAgo, 'FIADO', 'CADERNINHO',
    2, 30, sale1FirstDue, 379.80, 0,
    'VALUE', 19.80, 19.80, 19.80,
    360.00, 180.00, 180.00, 'PARCIAL', 'Compra de 2 conjuntos com desconto especial para cliente.', 'Núbia'
  );

  db.prepare(`
    INSERT INTO sale_items (
      sale_id, product_id, product_sku_snapshot, product_name, is_manual_item,
      quantity, catalog_unit_price, sold_unit_price, item_discount_unit, item_discount_total,
      line_original_total, line_final_total
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(1, 1, 'PRD-001', 'Conjunto Alfaiataria Elegance', 0, 2, 189.90, 189.90, 0, 0, 379.80, 379.80);

  db.prepare(`
    INSERT INTO installments (
      sale_id, client_id, installment_number, total_installments, due_date,
      amount, paid_amount, remaining_amount, status, paid_at, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(1, 1, 1, 2, sale1FirstDue, 180.00, 180.00, 0.00, 'PAGO', sale1FirstDue, 'Pago via PIX no vencimento');

  db.prepare(`
    INSERT INTO installments (
      sale_id, client_id, installment_number, total_installments, due_date,
      amount, paid_amount, remaining_amount, status, paid_at, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(1, 1, 2, 2, sale1SecondDue, 180.00, 0.00, 180.00, 'PENDENTE', null, '');

  db.prepare(`
    INSERT INTO payments (
      sale_id, installment_id, client_id, amount, payment_date, payment_type, notes, received_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(1, 1, 1, 180.00, sale1FirstDue, 'PIX', 'Recebimento da 1ª parcela VND-1001', 'Núbia');

  // Sale 2: Maria Fernanda (5 days ago) - Nova compra no Fiado somada ao histórico sem perder a anterior!
  const sale2FirstDue = addDaysToDateStr(fiveDaysAgo, 30);
  db.prepare(`
    INSERT INTO sales (
      sale_code, client_id, client_name_snapshot, sale_date, payment_method, payment_submethod,
      installments_count, interval_days, first_due_date, original_subtotal, item_discounts_total,
      sale_discount_type, sale_discount_input, sale_discount_amount, total_discount_amount,
      final_total, paid_total, pending_total, status, notes, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'VND-1002', 1, 'Maria Fernanda Oliveira', fiveDaysAgo, 'FIADO', 'CADERNINHO',
    1, 30, sale2FirstDue, 149.90, 9.90,
    'VALUE', 0, 0, 9.90,
    140.00, 50.00, 90.00, 'PARCIAL', 'Deu R$ 50,00 de entrada e deixou R$ 90,00 no caderninho.', 'Núbia'
  );

  db.prepare(`
    INSERT INTO sale_items (
      sale_id, product_id, product_sku_snapshot, product_name, is_manual_item,
      quantity, catalog_unit_price, sold_unit_price, item_discount_unit, item_discount_total,
      line_original_total, line_final_total
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(2, 5, 'PRD-005', 'Perfume Deo Parfum 100ml', 0, 1, 149.90, 140.00, 9.90, 9.90, 149.90, 140.00);

  db.prepare(`
    INSERT INTO installments (
      sale_id, client_id, installment_number, total_installments, due_date,
      amount, paid_amount, remaining_amount, status, paid_at, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(2, 1, 1, 1, sale2FirstDue, 140.00, 50.00, 90.00, 'PARCIAL', null, 'Adiantou R$ 50,00 em dinheiro');

  db.prepare(`
    INSERT INTO payments (
      sale_id, installment_id, client_id, amount, payment_date, payment_type, notes, received_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(2, 3, 1, 50.00, fiveDaysAgo, 'DINHEIRO', 'Pagamento parcial (entrada) na compra VND-1002', 'Núbia');

  // Sale 3: Camila Santos Rocha (15 days ago) - Fiado 3x a cada 30 dias (1ª parcela vencendo em breve)
  const sale3Due1 = addDaysToDateStr(fifteenDaysAgo, 15); // Vence Hoje!
  const sale3Due2 = addDaysToDateStr(fifteenDaysAgo, 45);
  const sale3Due3 = addDaysToDateStr(fifteenDaysAgo, 75);
  db.prepare(`
    INSERT INTO sales (
      sale_code, client_id, client_name_snapshot, sale_date, payment_method, payment_submethod,
      installments_count, interval_days, first_due_date, original_subtotal, item_discounts_total,
      sale_discount_type, sale_discount_input, sale_discount_amount, total_discount_amount,
      final_total, paid_total, pending_total, status, notes, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'VND-1003', 2, 'Camila Santos Rocha', fifteenDaysAgo, 'FIADO', 'CADERNINHO',
    3, 30, sale3Due1, 299.70, 0,
    'VALUE', 9.70, 9.70, 9.70,
    290.00, 0.00, 290.00, 'PENDENTE', 'Parcelado em 3x no caderninho.', 'Núbia'
  );

  db.prepare(`
    INSERT INTO sale_items (
      sale_id, product_id, product_sku_snapshot, product_name, is_manual_item,
      quantity, catalog_unit_price, sold_unit_price, item_discount_unit, item_discount_total,
      line_original_total, line_final_total
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(3, 2, 'PRD-002', 'Vestido Midi Floral Premium', 0, 1, 159.90, 159.90, 0, 0, 159.90, 159.90);

  db.prepare(`
    INSERT INTO sale_items (
      sale_id, product_id, product_sku_snapshot, product_name, is_manual_item,
      quantity, catalog_unit_price, sold_unit_price, item_discount_unit, item_discount_total,
      line_original_total, line_final_total
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(3, 4, 'PRD-004', 'Calça Pantalona Cintura Alta', 0, 1, 139.80, 139.80, 0, 0, 139.80, 139.80);

  db.prepare(`
    INSERT INTO installments (
      sale_id, client_id, installment_number, total_installments, due_date,
      amount, paid_amount, remaining_amount, status, paid_at, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(3, 2, 1, 3, sale3Due1, 96.67, 0.00, 96.67, 'PENDENTE', null, '');

  db.prepare(`
    INSERT INTO installments (
      sale_id, client_id, installment_number, total_installments, due_date,
      amount, paid_amount, remaining_amount, status, paid_at, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(3, 2, 2, 3, sale3Due2, 96.67, 0.00, 96.67, 'PENDENTE', null, '');

  db.prepare(`
    INSERT INTO installments (
      sale_id, client_id, installment_number, total_installments, due_date,
      amount, paid_amount, remaining_amount, status, paid_at, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(3, 2, 3, 3, sale3Due3, 96.66, 0.00, 96.66, 'PENDENTE', null, '');

  // Sale 4: Juliana Costa Mendes (Hoje) - Venda à vista (PIX) com 10% de desconto de cliente + item avulso manual
  db.prepare(`
    INSERT INTO sales (
      sale_code, client_id, client_name_snapshot, sale_date, payment_method, payment_submethod,
      installments_count, interval_days, first_due_date, original_subtotal, item_discounts_total,
      sale_discount_type, sale_discount_input, sale_discount_amount, total_discount_amount,
      final_total, paid_total, pending_total, status, notes, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'VND-1004', 3, 'Juliana Costa Mendes', today, 'A_VISTA', 'PIX',
    1, 30, today, 144.90, 0,
    'PERCENT', 10, 14.49, 14.49,
    130.41, 130.41, 0.00, 'PAGO', 'Pagamento à vista via PIX com 10% de desconto da cliente.', 'Núbia'
  );

  db.prepare(`
    INSERT INTO sale_items (
      sale_id, product_id, product_sku_snapshot, product_name, is_manual_item,
      quantity, catalog_unit_price, sold_unit_price, item_discount_unit, item_discount_total,
      line_original_total, line_final_total
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(4, 3, 'PRD-003', 'Blusa Linho Fino Off-White', 0, 1, 99.90, 99.90, 0, 0, 99.90, 99.90);

  db.prepare(`
    INSERT INTO sale_items (
      sale_id, product_id, product_sku_snapshot, product_name, is_manual_item,
      quantity, catalog_unit_price, sold_unit_price, item_discount_unit, item_discount_total,
      line_original_total, line_final_total
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(4, null, 'MANUAL', 'Ajuste de Bainha Personalizado (Valor Manual)', 1, 1, 45.00, 45.00, 0, 0, 45.00, 45.00);

  db.prepare(`
    INSERT INTO installments (
      sale_id, client_id, installment_number, total_installments, due_date,
      amount, paid_amount, remaining_amount, status, paid_at, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(4, 3, 1, 1, today, 130.41, 130.41, 0.00, 'PAGO', today, 'Quitado à vista no PIX');

  db.prepare(`
    INSERT INTO payments (
      sale_id, installment_id, client_id, amount, payment_date, payment_type, notes, received_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(4, 7, 3, 130.41, today, 'PIX', 'Pagamento à vista VND-1004', 'Núbia');
}

function recalculateSaleFinancials(saleId) {
  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(Number(saleId));
  if (!sale) return null;

  const installments = db
    .prepare('SELECT * FROM installments WHERE sale_id = ? ORDER BY installment_number ASC')
    .all(Number(saleId));

  let paidTotal = 0;
  let pendingTotal = 0;

  for (const inst of installments) {
    const paid = roundMoney(inst.paid_amount);
    const rem = roundMoney(Math.max(0, inst.amount - paid));
    let instStatus = 'PENDENTE';
    if (rem <= 0.009) {
      instStatus = 'PAGO';
    } else if (paid > 0.009) {
      instStatus = 'PARCIAL';
    }
    if (rem !== inst.remaining_amount || instStatus !== inst.status) {
      db.prepare(`
        UPDATE installments
        SET remaining_amount = ?, status = ?, paid_at = CASE WHEN ? = 'PAGO' AND paid_at IS NULL THEN date('now', 'localtime') ELSE paid_at END
        WHERE id = ?
      `).run(rem, instStatus, instStatus, inst.id);
    }
    paidTotal = roundMoney(paidTotal + paid);
    pendingTotal = roundMoney(pendingTotal + rem);
  }

  let saleStatus = 'PENDENTE';
  if (pendingTotal <= 0.009) {
    saleStatus = 'PAGO';
    pendingTotal = 0;
  } else if (paidTotal > 0.009) {
    saleStatus = 'PARCIAL';
  }

  db.prepare(`
    UPDATE sales
    SET paid_total = ?, pending_total = ?, status = ?
    WHERE id = ?
  `).run(paidTotal, pendingTotal, saleStatus, Number(saleId));

  return db.prepare('SELECT * FROM sales WHERE id = ?').get(Number(saleId));
}

initDb();

module.exports = {
  db,
  getLocalDateStr,
  addDaysToDateStr,
  roundMoney,
  recalculateSaleFinancials,
};
