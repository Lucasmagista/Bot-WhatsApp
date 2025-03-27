const FAQService = require('../services/faqService');
const logger = require('./logger');

async function testFAQ() {
    try {
        logger.info('Iniciando testes do sistema de FAQ...');
        
        // Teste 1: Correspondência exata
        const exactMatch = await FAQService.getFAQResponse('Qual o horário de funcionamento?');
        logger.info('Teste 1 (Correspondência exata):', exactMatch);
        
        // Teste 2: Correspondência similar
        const similarMatch = await FAQService.getFAQResponse('Horário de funcionamento da loja?');
        logger.info('Teste 2 (Correspondência similar):', similarMatch);
        
        // Teste 3: Sem correspondência (fallback)
        const noMatch = await FAQService.getFAQResponse('Quem é o presidente do Brasil?');
        logger.info('Teste 3 (Sem correspondência):', noMatch);
        
        // Teste 4: Registro de feedback
        if (exactMatch.questionId) {
            const feedback = await FAQService.registerFeedback(exactMatch.questionId, true, 'Resposta muito útil!');
            logger.info('Teste 4 (Registro de feedback):', feedback);
        }
        
        // Teste 5: Perguntas frequentes
        const topQuestions = await FAQService.getTopQuestions(3);
        logger.info('Teste 5 (Perguntas frequentes):', topQuestions);
        
        logger.info('Testes do sistema de FAQ concluídos com sucesso!');
    } catch (error) {
        logger.error('Erro nos testes do sistema de FAQ:', error);
    }
}

// Executar testes
testFAQ();

module.exports = testFAQ;