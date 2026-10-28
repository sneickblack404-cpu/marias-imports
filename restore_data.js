const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const dbPath = path.join(__dirname, 'data', 'nubia_arruda.sqlite');
const db = new DatabaseSync(dbPath);

db.exec('PRAGMA foreign_keys = OFF;');

// Clear current tables
db.exec('DELETE FROM payments;');
db.exec('DELETE FROM installments;');
db.exec('DELETE FROM sale_items;');
db.exec('DELETE FROM sales;');
db.exec('DELETE FROM clients;');

const insertClient = db.prepare('INSERT INTO clients (id, name, phone, default_discount_percent, credit_limit, notes, active) VALUES (?, ?, ?, ?, ?, ?, 1)');

// Exact clients from Núbia's screenshot
insertClient.run(1, 'Adriana Fise', '31988193774', 0, 2000, '');
insertClient.run(2, 'Amigo Leo', '', 0, 2000, '');
insertClient.run(3, 'Ana Clara', '31992817446', 0, 2000, '');
insertClient.run(4, 'Ana Laura Jaboticatubas', '', 0, 2000, '');
insertClient.run(5, 'Bruno Planalto', '31997320300', 0, 2000, '');
insertClient.run(6, 'Cintia Aluclass', '', 0, 2000, '');
insertClient.run(7, 'Dani Aluclass', '31992205009', 0, 5000, '');
insertClient.run(8, 'Dani Salao', '3198256164', 0, 2000, '');
insertClient.run(9, 'Dhebora', '', 0, 2000, '');

const insertSale = db.prepare(`
  INSERT INTO sales (
    id, sale_code, client_id, client_name_snapshot, sale_date, payment_method, payment_submethod,
    installments_count, interval_days, first_due_date, original_subtotal, item_discounts_total,
    sale_discount_type, sale_discount_input, sale_discount_amount, total_discount_amount,
    final_total, paid_total, pending_total, status, notes, created_by
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertItem = db.prepare(`
  INSERT INTO sale_items (
    sale_id, product_id, product_sku_snapshot, product_name, is_manual_item,
    quantity, catalog_unit_price, sold_unit_price, item_discount_unit, item_discount_total,
    line_original_total, line_final_total
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertInst = db.prepare(`
  INSERT INTO installments (
    sale_id, client_id, installment_number, total_installments, due_date,
    amount, paid_amount, remaining_amount, status, paid_at, notes
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// Sale VND-1018: R$ 3.439,50
insertSale.run(
  1018, 'VND-1018', 7, 'Dani Aluclass', '2026-10-28', 'FIADO', 'CADERNINHO',
  3, 90, '2026-12-10', 3439.50, 0,
  'VALUE', 0, 0, 0,
  3439.50, 0, 3439.50, 'PENDENTE', '', 'Núbia'
);
insertItem.run(1018, null, 'MANUAL', 'Peças e Itens Dani Aluclass', 1, 1, 3439.50, 3439.50, 0, 0, 3439.50, 3439.50);
insertInst.run(1018, 7, 1, 3, '2026-12-10', 1146.50, 0, 1146.50, 'PENDENTE', null, '');
insertInst.run(1018, 7, 2, 3, '2027-03-10', 1146.50, 0, 1146.50, 'PENDENTE', null, '');
insertInst.run(1018, 7, 3, 3, '2027-06-08', 1146.50, 0, 1146.50, 'PENDENTE', null, '');

// Sale VND-1019: R$ 249,00
insertSale.run(
  1019, 'VND-1019', 7, 'Dani Aluclass', '2026-10-28', 'FIADO', 'CADERNINHO',
  3, 90, '2026-11-10', 249.00, 0,
  'VALUE', 0, 0, 0,
  249.00, 0, 249.00, 'PENDENTE', '', 'Núbia'
);
insertItem.run(1019, null, 'MANUAL', 'Peças Dani Aluclass', 1, 1, 249.00, 249.00, 0, 0, 249.00, 249.00);
insertInst.run(1019, 7, 1, 3, '2026-11-10', 83.00, 0, 83.00, 'PENDENTE', null, '');
insertInst.run(1019, 7, 2, 3, '2027-02-08', 83.00, 0, 83.00, 'PENDENTE', null, '');
insertInst.run(1019, 7, 3, 3, '2027-05-09', 83.00, 0, 83.00, 'PENDENTE', null, '');

// Sale VND-1020: R$ 290,00
insertSale.run(
  1020, 'VND-1020', 7, 'Dani Aluclass', '2026-10-28', 'FIADO', 'CADERNINHO',
  3, 30, '2026-11-10', 290.00, 0,
  'VALUE', 0, 0, 0,
  290.00, 0, 290.00, 'PENDENTE', '', 'Núbia'
);
insertItem.run(1020, null, 'MANUAL', 'Peças Dani Aluclass', 1, 1, 290.00, 290.00, 0, 0, 290.00, 290.00);
insertInst.run(1020, 7, 1, 3, '2026-11-10', 96.66, 0, 96.66, 'PENDENTE', null, '');
insertInst.run(1020, 7, 2, 3, '2026-12-10', 96.66, 0, 96.66, 'PENDENTE', null, '');
insertInst.run(1020, 7, 3, 3, '2027-01-09', 96.68, 0, 96.68, 'PENDENTE', null, '');

db.exec('PRAGMA foreign_keys = ON;');

console.log('Restored successfully!');
console.log('Clients count:', db.prepare('SELECT count(*) as c FROM clients').get().c);
console.log('Sales count:', db.prepare('SELECT count(*) as c FROM sales').get().c);
console.log('Installments count:', db.prepare('SELECT count(*) as c FROM installments').get().c);
