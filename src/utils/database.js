const sqlite3 = require('sqlite3').verbose();
const logger = require('./logger');

// Conectar ao banco de dados (cria o arquivo se não existir)

// Corrigir o caminho do banco de dados
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) {
        logger.error(`Erro ao conectar ao banco de dados: ${err.message}`);
    } else {
        logger.info('Conectado ao banco de dados SQLite.');
    }
});

// Criar as tabelas necessárias se não existirem
db.serialize(() => {
    // Tabela de Serviços
    db.run(`CREATE TABLE IF NOT EXISTS services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        price REAL NOT NULL
    )`);

    // Inserir serviços iniciais se a tabela estiver vazia
    db.get("SELECT COUNT(*) as count FROM services", (err, row) => {
        if (err) {
            logger.error(`Erro ao verificar services: ${err.message}`);
            return;
        }
        
        if (row.count === 0) {
            // Corrigir formato consistente (todos usando arrays)
            const services = [
                ["Formatação", "Formatação completa do sistema operacional", 150],
                ["Limpeza Física", "Remoção de poeira e limpeza de componentes internos", 100],
                ["Limpeza de Software", "Remoção de vírus, malware e arquivos desnecessários", 120],
                ["Conserto de Computador", "Diagnóstico e reparo de computadores", 150.00],
                ["Conserto de Notebook", "Diagnóstico e reparo de notebooks", 180.00],
                ["Atualização de Sistema", "Atualização do Windows, macOS ou Linux", 80],
                ["Instalação do Pacote Office", "Instalação do Microsoft Office original", 200.00],
                ["Instalação de Softwares", "Instalação de programas essenciais", 100.00]
            ];
            
            const stmt = db.prepare("INSERT INTO services (name, description, price) VALUES (?, ?, ?)");
            services.forEach(service => {
                stmt.run(service, (err) => {
                    if (err) logger.error(`Erro ao inserir serviço ${service[0]}: ${err.message}`);
                });
            });
            stmt.finalize();
            logger.info("Serviços iniciais adicionados ao banco de dados.");
        }
    });

    // Tabela de Agendamentos
    db.run(`CREATE TABLE IF NOT EXISTS appointments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_name TEXT NOT NULL,
        service_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        type TEXT CHECK(type IN ('presencial', 'remoto', 'loja')) NOT NULL,
        status TEXT DEFAULT 'pendente',
        FOREIGN KEY (service_id) REFERENCES services(id)
    )`);

    // Tabela de Perguntas Frequentes (FAQ)
    db.run(`CREATE TABLE IF NOT EXISTS faqs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question TEXT NOT NULL,
        answer TEXT NOT NULL
    )`);

    // Inserir perguntas frequentes se a tabela estiver vazia
    db.get("SELECT COUNT(*) as count FROM faqs", (err, row) => {
        if (row.count === 0) {
            const faqs = [
                ["Quanto custa a formatação do computador?", "O valor da formatação é R$ 150."],
                ["Vocês fazem backup dos dados?", "Sim! Antes de formatar, podemos fazer um backup completo por um custo adicional."],
                ["Trabalham com computadores Mac?", "Sim, realizamos serviços em Windows, macOS e Linux."],
		        ['Qual o valor para instalar o Office?', 'A instalação do Microsoft Office custa R$200,00.'],
		        ['Trabalham com computadores Mac?', 'Sim, oferecemos manutenção e suporte para Mac.'],
                ["Qual a garantia dos serviços?", "Oferecemos garantia de 30 dias para qualquer problema relacionado ao serviço realizado."]
            ];
            const stmt = db.prepare("INSERT INTO faqs (question, answer) VALUES (?, ?)");
            faqs.forEach(faq => stmt.run(faq));
            stmt.finalize();
            console.log("✅ Perguntas frequentes adicionadas ao banco de dados.");
        }
    });

    // Tabela de Clientes
    db.run(`CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT UNIQUE NOT NULL,
        last_interaction TEXT
    )`);
	
    // Tabela de Pagamentos
    db.run(`
        CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER,
            amount REAL NOT NULL,
            status TEXT DEFAULT 'pendente',
            payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (customer_id) REFERENCES customers(id)
        )
    `);
});

module.exports = db;
