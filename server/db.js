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

  // Purge any legacy demo/mock data
  try {
    const demoClients = [
      'Maria Fernanda Oliveira',
      'Camila Santos Rocha',
      'Juliana Costa Mendes',
      'Patrícia Lima Almeida',
    ];
    for (const name of demoClients) {
      const cli = db.prepare('SELECT id FROM clients WHERE name = ?').get(name);
      if (cli) {
        db.prepare('DELETE FROM payments WHERE client_id = ?').run(cli.id);
        db.prepare('DELETE FROM installments WHERE client_id = ?').run(cli.id);
        db.prepare('DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE client_id = ?)').run(cli.id);
        db.prepare('DELETE FROM sales WHERE client_id = ?').run(cli.id);
        db.prepare('DELETE FROM clients WHERE id = ?').run(cli.id);
      }
    }

    db.prepare(`
      DELETE FROM products WHERE sku IN (
        'PRD-001', 'PRD-002', 'PRD-003', 'PRD-004',
        'PRD-005', 'PRD-006', 'PRD-007', 'PRD-008'
      )
    `).run();

    db.prepare(`
      DELETE FROM sales WHERE client_name_snapshot IN (
        'Maria Fernanda Oliveira', 'Camila Santos Rocha',
        'Juliana Costa Mendes', 'Patrícia Lima Almeida'
      )
    `).run();
  } catch (_e) {
    // ignore
  }

  const userCount = db.prepare('SELECT COUNT(*) as total FROM users').get();
  if (userCount.total === 0) {
    seedDatabase();
  }
}

function seedDatabase() {
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
