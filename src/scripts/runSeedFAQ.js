/**
 * Script para executar manualmente o seed do banco de dados FAQ
 */
const seedFAQ = require('../src/utils/seedFAQ');
const logger = require('../src/utils/logger');

async function run() {
    try {
        // Verificar se é para forçar o reseed
        const forceReseed = process.argv.includes('--force');
        
        logger.info(`Iniciando o processo de seed do FAQ${forceReseed ? ' (modo força)' : ''}...`);
        await seedFAQ(forceReseed);
        logger.info('Processo de seed do FAQ concluído com sucesso!');
        process.exit(0);
    } catch (error) {
        logger.error('Erro ao executar seed do FAQ:', error);
        process.exit(1);
    }
}

run();