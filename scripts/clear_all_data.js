const { db } = require('../server/db');
const { initNeonTable, saveToNeon } = require('../server/neon_sync');

async function main() {
  console.log('--- Limpando dados (Produtos, Clientes, Vendas, Parcelas, Pagamentos, Despesas) ---');
  
  db.exec('PRAGMA foreign_keys = OFF;');
  db.prepare('DELETE FROM payments').run();
  db.prepare('DELETE FROM installments').run();
  db.prepare('DELETE FROM sale_items').run();
  db.prepare('DELETE FROM sales').run();
  db.prepare('DELETE FROM products').run();
  db.prepare('DELETE FROM clients').run();
  db.prepare('DELETE FROM expenses').run();
  db.exec('PRAGMA foreign_keys = ON;');

  console.log('SQLite local limpo com sucesso.');

  const cleanData = {
    clients: [],
    products: [],
    sales: [],
    sale_items: [],
    installments: [],
    payments: [],
    expenses: [],
    settings: db.prepare('SELECT * FROM settings').all(),
  };

  console.log('Sincronizando banco limpo no Neon PostgreSQL...');
  await initNeonTable();
  const saved = await saveToNeon(cleanData);
  if (saved) {
    console.log('✅ Neon PostgreSQL atualizado com sucesso! (0 produtos, 0 clientes, 0 vendas)');
  } else {
    console.error('❌ Falha ao atualizar Neon');
  }
}

main().catch(console.error);
