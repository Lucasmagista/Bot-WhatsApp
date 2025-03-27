/**
 * Script para popular o banco de dados com perguntas e respostas iniciais
 */
// Modificar a função seedDatabase para aceitar o parâmetro forceReseed

const db = require('./database');
const logger = require('./logger');
const { removeAccents } = require('./textProcessor');

// Função para normalizar a pergunta
function normalizeQuestion(question) {
    let normalized = question.toLowerCase();
    normalized = removeAccents(normalized);
    normalized = normalized.replace(/[^\w\s]/g, '');
    normalized = normalized.replace(/\s+/g, ' ').trim();
    return normalized;
}

async function seedDatabase(forceReseed = false) {
    try {
        logger.info('Iniciando população do banco de dados de FAQ...');
        
        // Verificar se já existem dados
        if (!forceReseed) {
            const hasData = await new Promise((resolve, reject) => {
                db.get('SELECT COUNT(*) as count FROM faq', [], (err, row) => {
                    if (err) reject(err);
                    else resolve(row && row.count > 0);
                });
            });

            if (hasData) {
                logger.info('Banco de dados FAQ já contém dados. Pulando seeding.');
                return; // Pular o processo
            }
        } else {
            // Se forceReseed for true, limpar os dados existentes
            await new Promise((resolve, reject) => {
                db.run('DELETE FROM faq', err => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            
            await new Promise((resolve, reject) => {
                db.run('DELETE FROM faq_categories', err => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            
            logger.info('Dados existentes de FAQ removidos para reseed forçado');
        }

// Lista de perguntas e respostas iniciais
const initialFAQs = [
    {
        question: 'Qual o horário de funcionamento?',
        answer: 'Nosso horário de funcionamento é de segunda a sexta das 8h às 18h e aos sábados das 9h às 13h.',
        category_id: 1 // Informações Gerais
    },
    {
        question: 'Como faço para agendar um serviço?',
        answer: 'Para agendar um serviço, envie "agendar" e nosso sistema de agendamento irá guiá-lo pelo processo.',
        category_id: 1 // Informações Gerais
    },
    {
        question: 'Qual o valor do serviço de formatação?',
        answer: 'O serviço de formatação básica custa R$ 80,00. Com backup, o valor é R$ 120,00. Você pode ver todos os preços enviando "tabela de preços".',
        category_id: 2 // Preços
    },
    {
        question: 'Qual o prazo para conserto de notebook?',
        answer: 'O prazo médio para conserto de notebooks é de 2 a 5 dias úteis, dependendo do problema identificado e disponibilidade de peças.',
        category_id: 3 // Prazos
    },
    {
        question: 'Vocês fazem atendimento em domicílio?',
        answer: 'Sim, fazemos atendimento em domicílio. A taxa de deslocamento varia conforme a região. Para agendar, envie "agendar" e escolha a opção "Presencial".',
        category_id: 4 // Serviços
    },
    {
        question: 'Como faço para cancelar um agendamento?',
        answer: 'Para cancelar um agendamento, envie "meus agendamentos" para ver os agendamentos ativos e depois "cancelar #123" substituindo 123 pelo código do seu agendamento.',
        category_id: 1 // Informações Gerais
    },
    {
        question: 'Vocês dão garantia nos serviços?',
        answer: 'Sim, todos os nossos serviços têm garantia de 90 dias para mão de obra. Peças substituídas seguem a garantia do fabricante.',
        category_id: 4 // Serviços
    },
    {
        question: 'Vocês aceitam cartão de crédito?',
        answer: 'Sim, aceitamos pagamentos em dinheiro, PIX, cartões de débito e crédito (parcelamento em até 3x sem juros).',
        category_id: 2 // Preços
    },
    {
        question: 'Como faço para obter um orçamento?',
        answer: 'Para solicitar um orçamento, envie "orçamento" seguido de uma descrição do problema. Você também pode enviar fotos ou vídeos mostrando o problema.',
        category_id: 1 // Informações Gerais
    },
    {
        question: 'Onde vocês estão localizados?',
        answer: 'Estamos localizados na Rua Exemplo, 123 - Centro. Próximo ao Shopping Principal. Temos estacionamento próprio para clientes.',
        category_id: 1 // Informações Gerais
    }
];

// Categorias de perguntas
const categories = [
    { id: 1, name: 'Informações Gerais', description: 'Horários, local, contato e procedimentos' },
    { id: 2, name: 'Preços', description: 'Valores e formas de pagamento' },
    { id: 3, name: 'Prazos', description: 'Tempo de entrega e agendamento' },
    { id: 4, name: 'Serviços', description: 'Detalhes sobre os serviços oferecidos' }
];

async function seedDatabase() {
    try {
        logger.info('Iniciando população do banco de dados de FAQ...');
        
        // Criar tabelas se não existirem
        await new Promise((resolve, reject) => {
            db.run(`CREATE TABLE IF NOT EXISTS faq_categories (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`, err => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        await new Promise((resolve, reject) => {
            db.run(`CREATE TABLE IF NOT EXISTS faq (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                question TEXT NOT NULL,
                normalized_question TEXT NOT NULL,
                answer TEXT NOT NULL,
                category_id INTEGER,
                keywords TEXT,
                active INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (category_id) REFERENCES faq_categories (id)
            )`, err => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        // Inserir categorias
        for (const category of categories) {
            await new Promise((resolve, reject) => {
                db.run(`INSERT OR IGNORE INTO faq_categories (id, name, description) VALUES (?, ?, ?)`,
                    [category.id, category.name, category.description],
                    err => {
                        if (err) reject(err);
                        else resolve();
                    });
            });
        }
        
        // Inserir perguntas e respostas
        for (const faq of initialFAQs) {
            const normalizedQuestion = normalizeQuestion(faq.question);
            
            await new Promise((resolve, reject) => {
                db.run(`INSERT OR IGNORE INTO faq (question, normalized_question, answer, category_id) 
                        VALUES (?, ?, ?, ?)`,
                    [faq.question, normalizedQuestion, faq.answer, faq.category_id],
                    err => {
                        if (err) reject(err);
                        else resolve();
                    });
            });
        }
        
        logger.info('Banco de dados de FAQ populado com sucesso!');
    } catch (error) {
        logger.error('Erro ao popular banco de dados de FAQ:', error);
    }
}
    } catch (error) {
        logger.error('Erro ao popular banco de dados de FAQ:', error);
    }
}

// Executar o script diretamente se for chamado como programa principal
if (require.main === module) {
    // Verificar se é para forçar o reseed quando executado diretamente
    const forceReseed = process.argv.includes('--force');
    seedDatabase(forceReseed);
}

module.exports = seedDatabase;