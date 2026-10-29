const { db } = require('../server/db');
const { initNeonTable, saveToNeon, loadFromNeon } = require('../server/neon_sync');

async function main() {
  console.log('--- Conectando e Inicializando Neon Cloud DB ---');
  const inited = await initNeonTable();
  if (!inited) {
    console.error('Falha ao inicializar tabela no Neon.');
    process.exit(1);
  }

  const rawData = {
    clients: db.prepare('SELECT * FROM clients').all(),
    products: db.prepare('SELECT * FROM products').all(),
    sales: db.prepare('SELECT * FROM sales').all(),
    sale_items: db.prepare('SELECT * FROM sale_items').all(),
    installments: db.prepare('SELECT * FROM installments').all(),
    payments: db.prepare('SELECT * FROM payments').all(),
    expenses: db.prepare('SELECT * FROM expenses').all(),
    settings: db.prepare('SELECT * FROM settings').all(),
  };

  console.log(`Dados locais encontrados no SQLite:`);
  console.log(`- Clientes: ${rawData.clients.length}`);
  console.log(`- Produtos: ${rawData.products.length}`);
  console.log(`- Vendas: ${rawData.sales.length}`);
  console.log(`- Itens de venda: ${rawData.sale_items.length}`);
  console.log(`- Parcelas: ${rawData.installments.length}`);
  console.log(`- Pagamentos: ${rawData.payments.length}`);

  console.log('\nEnviando dados para o Neon PostgreSQL...');
  const saved = await saveToNeon(rawData);
  if (saved) {
    console.log('✅ SUCESSO! Dados salvos com sucesso no Neon PostgreSQL!');
  } else {
    console.error('❌ Erro ao salvar dados no Neon.');
  }

  console.log('\nVerificando leitura do Neon Cloud DB...');
  const cloudData = await loadFromNeon();
  console.log(`✅ Verificação confirmada! Neon retornou ${cloudData.clients.length} clientes e ${cloudData.sales.length} vendas.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
