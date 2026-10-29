const { Pool } = require('pg');

const NEON_URL =
  process.env.DATABASE_URL ||
  'postgresql://neondb_owner:npg_FuE9WxXyjh2N@ep-dry-mountain-b52fhzlq-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require';

const pool = new Pool({
  connectionString: NEON_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('[Neon Pool Error]:', err.message);
});

async function initNeonTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS system_snapshots (
        snapshot_key VARCHAR(50) PRIMARY KEY,
        payload JSONB NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('[Neon] Tabela de persistência permanente pronta na nuvem.');
    return true;
  } catch (err) {
    console.error('[Neon Init Error]:', err.message);
    return false;
  }
}

async function saveToNeon(payload) {
  if (!payload) return false;
  try {
    const jsonStr = JSON.stringify(payload);
    await pool.query(
      `
      INSERT INTO system_snapshots (snapshot_key, payload, updated_at)
      VALUES ('latest', $1::jsonb, NOW())
      ON CONFLICT (snapshot_key)
      DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW();
    `,
      [jsonStr]
    );
    console.log(`[Neon Cloud] Backup permanente salvo na nuvem com sucesso às ${new Date().toLocaleTimeString('pt-BR')}`);
    return true;
  } catch (err) {
    console.error('[Neon Save Error]:', err.message);
    return false;
  }
}

async function loadFromNeon() {
  try {
    const res = await pool.query("SELECT payload, updated_at FROM system_snapshots WHERE snapshot_key = 'latest'");
    if (res.rows && res.rows.length > 0) {
      return res.rows[0].payload;
    }
    return null;
  } catch (err) {
    console.error('[Neon Load Error]:', err.message);
    return null;
  }
}

function restorePayloadToSqlite(db, backupData) {
  if (!backupData || (!backupData.clients && !backupData.products)) {
    return false;
  }

  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec('BEGIN;');
  try {
    if (Array.isArray(backupData.clients)) {
      db.prepare('DELETE FROM clients').run();
      const insCli = db.prepare(`
        INSERT INTO clients (id, name, phone, cpf, address, neighborhood, city, default_discount_percent, credit_limit, notes, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const c of backupData.clients) {
        insCli.run(
          c.id, c.name, c.phone || '', c.cpf || '', c.address || '',
          c.neighborhood || '', c.city || '', c.default_discount_percent || 0,
          c.credit_limit || 2000, c.notes || '', c.active ?? 1
        );
      }
    }

    if (Array.isArray(backupData.products)) {
      db.prepare('DELETE FROM products').run();
      const insProd = db.prepare(`
        INSERT INTO products (id, sku, name, category, cost_price, sale_price, stock_qty, min_stock_qty, unit, notes, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const p of backupData.products) {
        insProd.run(
          p.id, p.sku || `PRD-${p.id}`, p.name, p.category || 'Geral',
          p.cost_price || 0, p.sale_price || 0, p.stock_qty || 0,
          p.min_stock_qty || 1, p.unit || 'UN', p.notes || '', p.active ?? 1
        );
      }
    }

    if (Array.isArray(backupData.sales)) {
      db.prepare('DELETE FROM sales').run();
      const insSale = db.prepare(`
        INSERT INTO sales (
          id, sale_code, client_id, client_name_snapshot, sale_date, payment_method, payment_submethod,
          installments_count, interval_days, first_due_date, original_subtotal, item_discounts_total,
          sale_discount_type, sale_discount_input, sale_discount_amount, total_discount_amount,
          final_total, paid_total, pending_total, status, notes, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const s of backupData.sales) {
        insSale.run(
          s.id, s.sale_code, s.client_id, s.client_name_snapshot, s.sale_date,
          s.payment_method, s.payment_submethod, s.installments_count || 1,
          s.interval_days || 30, s.first_due_date, s.original_subtotal || s.final_total,
          s.item_discounts_total || 0, s.sale_discount_type || 'VALUE',
          s.sale_discount_input || 0, s.sale_discount_amount || 0,
          s.total_discount_amount || 0, s.final_total, s.paid_total || 0,
          s.pending_total || 0, s.status || 'PENDENTE', s.notes || '',
          s.created_by || 'Núbia'
        );
      }
    }

    if (Array.isArray(backupData.sale_items)) {
      db.prepare('DELETE FROM sale_items').run();
      const insItem = db.prepare(`
        INSERT INTO sale_items (
          id, sale_id, product_id, product_sku_snapshot, product_name, is_manual_item,
          quantity, catalog_unit_price, sold_unit_price, item_discount_unit, item_discount_total,
          line_original_total, line_final_total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const it of backupData.sale_items) {
        insItem.run(
          it.id, it.sale_id, it.product_id, it.product_sku_snapshot || 'MANUAL',
          it.product_name, it.is_manual_item ? 1 : 0, it.quantity || 1,
          it.catalog_unit_price || it.sold_unit_price, it.sold_unit_price,
          it.item_discount_unit || 0, it.item_discount_total || 0,
          it.line_original_total || (it.sold_unit_price * (it.quantity || 1)),
          it.line_final_total || (it.sold_unit_price * (it.quantity || 1))
        );
      }
    }

    if (Array.isArray(backupData.installments)) {
      db.prepare('DELETE FROM installments').run();
      const insInst = db.prepare(`
        INSERT INTO installments (
          id, sale_id, client_id, installment_number, total_installments, due_date,
          amount, paid_amount, remaining_amount, status, paid_at, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const inst of backupData.installments) {
        insInst.run(
          inst.id, inst.sale_id, inst.client_id, inst.installment_number || 1,
          inst.total_installments || 1, inst.due_date, inst.amount,
          inst.paid_amount || 0, inst.remaining_amount || inst.amount,
          inst.status || 'PENDENTE', inst.paid_at || null, inst.notes || ''
        );
      }
    }

    if (Array.isArray(backupData.payments)) {
      db.prepare('DELETE FROM payments').run();
      const insPay = db.prepare(`
        INSERT INTO payments (
          id, sale_id, installment_id, client_id, amount, payment_date, payment_type, notes, received_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const p of backupData.payments) {
        insPay.run(
          p.id, p.sale_id, p.installment_id, p.client_id, p.amount,
          p.payment_date, p.payment_type || 'PIX', p.notes || '', p.received_by || 'Núbia'
        );
      }
    }

    if (Array.isArray(backupData.expenses)) {
      db.prepare('DELETE FROM expenses').run();
      const insExp = db.prepare(`
        INSERT INTO expenses (id, description, category, amount, expense_date, notes)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const exp of backupData.expenses) {
        insExp.run(
          exp.id, exp.description, exp.category || 'Geral', exp.amount,
          exp.expense_date, exp.notes || ''
        );
      }
    }

    if (Array.isArray(backupData.settings)) {
      const insSetting = db.prepare(`
        INSERT INTO settings (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value
      `);
      for (const st of backupData.settings) {
        insSetting.run(st.key, String(st.value ?? ''));
      }
    }

    db.exec('COMMIT;');
    db.exec('PRAGMA foreign_keys = ON;');
    console.log('[Neon Sync] SQLite hidratado com sucesso a partir do banco de dados permanente na nuvem!');
    return true;
  } catch (err) {
    db.exec('ROLLBACK;');
    db.exec('PRAGMA foreign_keys = ON;');
    console.error('[Neon Sync Error ao restaurar no SQLite]:', err.message);
    return false;
  }
}

module.exports = {
  pool,
  initNeonTable,
  saveToNeon,
  loadFromNeon,
  restorePayloadToSqlite,
};
