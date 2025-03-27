/**
 * Controlador para processamento de mensagens
 */
const FAQService = require('../services/faqService');
const logger = require('../utils/logger');
const messaging = require('../services/messaging');
 // Importar no topo para evitar referência circular

// Estado da conversa para controle de feedback
const conversationState = new Map();

// Constantes e utilitários
const TIMEOUT_DURATION = 300000; // 5 minutos em milissegundos
const QUESTION_INDICATORS = ['?', 'como', 'o que', 'qual', 'onde', 'quando', 'quem', 'por que','ola','oi','?que','aonde',];

/**
 * Verifica se uma mensagem é uma resposta afirmativa (sim/s)
 * @param {string} text - Texto da mensagem
 * @returns {boolean} - Verdadeiro se for afirmativa
 */
function isAffirmativeResponse(text) {
    const normalized = text.toLowerCase().trim();
    return normalized === 'sim' || normalized === 's';
}

/**
 * Verifica se uma mensagem é uma resposta negativa (não/n)
 * @param {string} text - Texto da mensagem
 * @returns {boolean} - Verdadeiro se for negativa
 */
function isNegativeResponse(text) {
    const normalized = text.toLowerCase().trim();
    return normalized === 'não' || normalized === 'nao' || normalized === 'n';
}

/**
 * Verifica se o texto parece ser uma pergunta
 * @param {string} text - Texto da mensagem
 * @returns {boolean} - Verdadeiro se parecer uma pergunta
 */
function isQuestion(text) {
    if (!text || typeof text !== 'string') {
        logger.error('Texto inválido recebido em isQuestion:', text);
        return false;
    }
    const normalized = text.toLowerCase().trim();
    return text.endsWith('?') || QUESTION_INDICATORS.some(indicator => 
        normalized.startsWith(indicator));
}

/**
 * Limpa estados de conversas expirados
 */
function cleanupExpiredStates() {
    const now = Date.now();
    const expiredTime = now - TIMEOUT_DURATION;
    
    for (const [userId, state] of conversationState.entries()) {
        if (state.timestamp <= expiredTime) {
            conversationState.delete(userId);
        }
    }
}

/**
 * Configura limpeza periódica de estados
 */
function setupStateCleanup() {
    // Executar limpeza a cada 5 minutos
    setInterval(cleanupExpiredStates, TIMEOUT_DURATION);
}

// Iniciar limpeza periódica
setupStateCleanup();

/**
 * Processa feedback do usuário
 * @param {Object} client - Cliente WhatsApp
 * @param {string} from - ID do remetente
 * @param {string} body - Conteúdo da mensagem
 * @returns {Promise<boolean>} - Verdadeiro se o feedback foi processado
 */
async function handleFeedback(client, from, body) {
    if (!conversationState.has(from)) return false;
    
    const state = conversationState.get(from);
    
    // Processar feedback sobre respostas
    if (state.waitingForFeedback && (isAffirmativeResponse(body) || isNegativeResponse(body))) {
        const isHelpful = isAffirmativeResponse(body);
        await FAQService.registerFeedback(state.questionId, isHelpful);
        
        await client.sendMessage(from, `Obrigado pelo seu feedback! ${isHelpful ? '😊' : '🙁'}`);
        
        if (!isHelpful) {
            // Se não foi útil, oferecer falar com atendente
            setTimeout(async () => {
                await client.sendMessage(from, 'Deseja falar com um atendente? Responda com SIM');
                state.waitingForFeedback = false;
                state.waitingForAttendant = true;
                state.timestamp = Date.now(); // Atualizar timestamp
                conversationState.set(from, state);
            }, 1000);
        } else {
            // Limpar estado
            conversationState.delete(from);
        }
        
        return true;
    }
    
    // Processar solicitação de atendente
    if (state.waitingForAttendant && isAffirmativeResponse(body)) {
        await client.sendMessage(from, 'Estamos transferindo você para um atendente humano. Aguarde um momento, por favor.');
        
        try {
            // Aqui implementaria a lógica para notificar um atendente
            // Exemplo: await attendantService.notifyNewChat(from, state.conversationHistory);
            logger.info(`Usuário ${from} solicitou atendimento humano`);
        } catch (error) {
            logger.error(`Erro ao transferir para atendente: ${error.message}`);
        }
        
        // Limpar estado
        conversationState.delete(from);
        return true;
    }
    
    return false;
}

/**
 * Processa seleção de perguntas relacionadas
 * @param {Object} client - Cliente WhatsApp
 * @param {string} from - ID do remetente
 * @param {string} body - Conteúdo da mensagem
 * @returns {Promise<boolean>} - Verdadeiro se a seleção foi processada
 */
async function handleRelatedQuestionSelection(client, from, body) {
    if (!conversationState.has(from) || !conversationState.get(from).relatedQuestions) return false;
    
    const state = conversationState.get(from);
    
    if (/^[1-9]$/.test(body)) {
        const questionIndex = parseInt(body) - 1;
        
        if (questionIndex >= 0 && questionIndex < state.relatedQuestions.length) {
            const selectedQuestion = state.relatedQuestions[questionIndex];
            logger.info(`Usuário ${from} selecionou pergunta relacionada: "${selectedQuestion}"`);
            
            // Buscar resposta para a pergunta selecionada
            const response = await FAQService.getFAQResponse(selectedQuestion);
            
            if (response.success) {
                await client.sendMessage(from, response.answer);
                
                // Atualizar estado com nova pergunta
                conversationState.set(from, {
                    waitingForFeedback: true,
                    questionId: response.questionId,
                    timestamp: Date.now(),
                    relatedQuestions: response.relatedQuestions || []
                });
                
                // Solicitar feedback
                setTimeout(async () => {
                    await client.sendMessage(from, 'Esta resposta foi útil? Responda com SIM ou NÃO');
                }, 2000);
                
                return true;
            }
        }
    }
    
    return false;
}

/**
 * Processa perguntas para o FAQ
 * @param {Object} client - Cliente WhatsApp
 * @param {string} from - ID do remetente
 * @param {string} body - Conteúdo da mensagem
 * @returns {Promise<boolean>} - Verdadeiro se a pergunta foi processada
 */
async function handleFAQQuestion(client, from, body) {
    if (!body || typeof body !== 'string') {
        logger.error(`Mensagem inválida recebida de ${from}:`, body);
        return false;
    }
    
    if (!isQuestion(body)) return false;
    
    logger.info(`Pergunta recebida de ${from}: "${body}"`);
    
    // Buscar resposta no FAQ
    const response = await FAQService.getFAQResponse(body);
    
    if (!response.success) return false;
    
    // Enviar resposta
    await client.sendMessage(from, response.answer);
    
    // Armazenar perguntas relacionadas no estado
    const relatedQuestions = response.relatedQuestions || [];
    
    // Se houver perguntas relacionadas, sugerir
    if (relatedQuestions.length > 0) {
        let relatedMsg = '📌 *Perguntas relacionadas:*\n\n';
        relatedQuestions.forEach((question, index) => {
            relatedMsg += `${index + 1}. ${question}\n`;
        });
        relatedMsg += '\nDigite o número para saber mais.';
        
        setTimeout(async () => {
            await client.sendMessage(from, relatedMsg);
        }, 1000);
    }
    
    // Solicitar feedback após um tempo
    setTimeout(async () => {
        await client.sendMessage(from, 'Esta resposta foi útil? Responda com SIM ou NÃO');
        
        // Armazenar estado da conversa para processar feedback
        conversationState.set(from, {
            waitingForFeedback: true,
            questionId: response.questionId,
            timestamp: Date.now(),
            relatedQuestions: relatedQuestions
        });
    }, 3000);
    
    return true;
}

/**
 * Processa mensagens recebidas e decide como responder
 * @param {Object} client - Cliente WhatsApp
 * @param {Object} message - Mensagem recebida
 * @returns {Promise<boolean>} - Verdadeiro se a mensagem foi tratada
 */
async function handleMessage(client, message) {
    try {
        const from = message.from;
        const body = message.body;

        // Ignorar mensagens de grupos, broadcasts, status
        if (typeof from === 'string' && (from.includes('g.us') || from.includes('broadcast') || from.includes('status'))) {
            return false;
        }

        // Verificar se a mensagem contém mídia
        if (message.hasMedia) {
            const media = await message.downloadMedia();
            logger.info(`Mídia recebida de ${from}: Tipo - ${message.type}, Tamanho - ${media.size || 'desconhecido'}`);
            // Processar mídia conforme necessário (exemplo: salvar ou responder)
            return true;
        }

        // Processar mensagens de texto
        if (body) {
            logger.info(`Mensagem de texto recebida de ${from}: "${body}"`);
            // Adicione lógica para processar mensagens de texto aqui
        } else {
            logger.warn(`Mensagem sem corpo recebida de ${from}`);
        }

        return true;
    } catch (error) {
        logger.error(`Erro ao processar mensagem de ${message.from}: ${error.message}`, error);
        return false;
    }
}

module.exports = {
    handleMessage
};