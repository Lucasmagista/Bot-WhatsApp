/**
 * Fluxo para responder dúvidas frequentes
 * Gerencia o processo de receber perguntas, encontrar respostas e fornecer feedback
 */
const logger = require('../utils/logger');
const dialogController = require('../controllers/dialogController');
const faqService = require('../services/faqService');
const faqAnalytics = require('../services/faqAnalytics');
const conversationState = require('../utils/conversationState');
const { formatPhoneNumber } = require('../utils/formatter');
const customerModel = require('../models/customerModel');

// No ponto onde processa uma pergunta do usuário
async function handleUserQuestion(userId, question) {
    // Lógica para encontrar resposta...
    const foundAnswer = true; // ou false se não encontrou resposta adequada
    
    // Registra a consulta para análise
    await faqAnalytics.logFaqQuery(userId, question, foundAnswer, 'categoria-da-pergunta');
    
    // Resto do código para responder ao usuário...
  }
  
  // Em um fluxo onde solicita feedback do usuário
  async function collectUserFeedback(userId, question, rating, comment) {
    await faqAnalytics.logUserFeedback(userId, question, rating, comment);
    // Agradece ao usuário pelo feedback...
  }

/**
 * Processa mensagens do fluxo de FAQ
 * @param {Object} message - Mensagem recebida do WhatsApp
 * @param {Object} client - Cliente WhatsApp
 * @returns {Promise<boolean>} True se a mensagem foi tratada por este fluxo
 */
async function handle(message, client) {
    try {
        const chatId = message.from;
        const messageContent = message.body.trim();
        
        // Verificar se a mensagem é uma pergunta direta para FAQ
        if (isFAQRequest(messageContent) && !conversationState.has(chatId)) {
            await startFAQFlow(client, chatId);
            return true;
        }
        
        // Verificar se estamos em um fluxo de FAQ ativo
        const state = conversationState.get(chatId);
        if (!state || state.currentFlow !== 'faq') {
            // Este não é um fluxo de FAQ ativo - tentar responder diretamente
            return await tryDirectAnswer(client, chatId, messageContent);
        }
        
        // Processar de acordo com o estágio atual
        switch (state.stage) {
            case 'waiting_question':
                return await processQuestion(client, chatId, messageContent);
                
            case 'feedback':
                return await processFeedback(client, chatId, messageContent);
                
            case 'follow_up':
                return await processFollowUp(client, chatId, messageContent);
                
            case 'category_selection':
                return await processCategorySelection(client, chatId, messageContent);
                
            default:
                // Reiniciar o fluxo
                await startFAQFlow(client, chatId);
                return true;
        }
    } catch (error) {
        logger.error(`Erro no fluxo de FAQ: ${error.message}`, error);
        
        try {
            await dialogController.sendMessage(
                client, 
                message.from, 
                "Desculpe, ocorreu um erro ao processar sua dúvida. Por favor, tente novamente ou entre em contato pelo telefone."
            );
            
            // Limpar o estado para permitir recomeçar
            conversationState.delete(message.from);
        } catch (sendError) {
            logger.error(`Erro ao enviar mensagem de erro no fluxo de FAQ: ${sendError.message}`);
        }
        
        return true;
    }
}

/**
 * Verifica se a mensagem é uma solicitação de FAQ
 * @param {string} message - Conteúdo da mensagem
 * @returns {boolean} True se for uma solicitação de FAQ
 */
function isFAQRequest(message) {
    const lowerMessage = message.toLowerCase();
    const faqTerms = [
        'dúvida', 'duvida', 'pergunta', 'faq', 'informação', 'informacao',
        'ajuda', 'auxílio', 'auxilio', 'como', 'o que', 'quando', 'onde', 'por que', 'porque',
        'qual', 'quais', 'quem', 'preciso saber', 'gostaria de saber'
    ];
    
    return faqTerms.some(term => lowerMessage.includes(term));
}

/**
 * Inicia o fluxo de FAQ
 * @param {Object} client - Cliente WhatsApp
 * @param {string} chatId - ID do chat
 * @returns {Promise<void>}
 */
async function startFAQFlow(client, chatId) {
    // Obter dados do cliente, se existente
    let customer = null;
    const phoneNumber = formatPhoneNumber(chatId);
    
    try {
        customer = await customerModel.getCustomerByPhone(phoneNumber);
        
        // Se encontrou o cliente, registrar o contato
        if (customer) {
            await customerModel.registerContact(customer.id);
        }
    } catch (error) {
        logger.error(`Erro ao buscar cliente pelo telefone ${phoneNumber}:`, error);
        // Continuar mesmo sem dados do cliente
    }
    
    // Obter categorias de FAQ
    let categories = [];
    try {
        categories = await faqService.getCategories();
    } catch (error) {
        logger.error('Erro ao buscar categorias de FAQ:', error);
        // Continuar mesmo sem categorias
    }
    
    // Verificar se temos categorias para mostrar
    if (categories && categories.length > 0) {
        // Mostrar categorias para seleção
        let categoryMessage = `Olá${customer ? ' ' + customer.name.split(' ')[0] : ''}! 👋\n\n` +
            `Para melhor atendê-lo(a), selecione a categoria da sua dúvida:\n\n`;
            
        categories.forEach((category, index) => {
            categoryMessage += `${index + 1}️⃣ *${category.name}*${category.description ? ` - ${category.description}` : ''}\n`;
        });
        
        categoryMessage += `\nOu você também pode digitar sua pergunta diretamente.`;
        
        await dialogController.sendMessage(client, chatId, categoryMessage);
        
        // Inicializar o estado da conversa com categorias
        conversationState.set(chatId, {
            currentFlow: 'faq',
            stage: 'category_selection',
            timestamp: Date.now(),
            customerData: customer,
            faqData: {
                categories: categories,
                lastAnswers: []
            }
        });
    } else {
        // Sem categorias, ir direto para perguntas
        const welcomeMessage = `Olá${customer ? ' ' + customer.name.split(' ')[0] : ''}! 👋\n\n` +
            `Estou aqui para responder suas dúvidas. Por favor, digite sua pergunta e farei o possível para ajudar.`;
        
        await dialogController.sendMessage(client, chatId, welcomeMessage);
        
        // Inicializar o estado da conversa
        conversationState.set(chatId, {
            currentFlow: 'faq',
            stage: 'waiting_question',
            timestamp: Date.now(),
            customerData: customer,
            faqData: {
                lastAnswers: []
            }
        });
    }
    
    logger.info(`Fluxo de FAQ iniciado para ${chatId}`);
}

/**
 * Processa a seleção de categoria
 * @param {Object} client - Cliente WhatsApp
 * @param {string} chatId - ID do chat
 * @param {string} message - Mensagem com a seleção
 * @returns {Promise<boolean>} True se a mensagem foi tratada
 */
async function processCategorySelection(client, chatId, message) {
    const state = conversationState.get(chatId);
    const { categories } = state.faqData;
    
    // Verificar se a mensagem é um número de categoria
    if (/^\d+$/.test(message)) {
        const categoryIndex = parseInt(message) - 1;
        
        if (categoryIndex >= 0 && categoryIndex < categories.length) {
            // Selecionou uma categoria válida
            const selectedCategory = categories[categoryIndex];
            
            // Atualizar estado com a categoria selecionada
            state.faqData.selectedCategory = selectedCategory;
            state.stage = 'waiting_question';
            
            conversationState.set(chatId, state);
            
            // Buscar perguntas frequentes da categoria
            try {
                const topQuestions = await faqService.getTopQuestionsForCategory(selectedCategory.id, 5);
                
                let responseMessage = `Categoria *${selectedCategory.name}* selecionada.\n\n`;
                
                if (topQuestions && topQuestions.length > 0) {
                    responseMessage += `Perguntas frequentes nesta categoria:\n\n`;
                    
                    topQuestions.forEach((item, index) => {
                        responseMessage += `${index + 1}. ${item.question}\n`;
                    });
                    
                    responseMessage += `\nVocê pode selecionar uma pergunta pelo número ou digitar sua própria pergunta.`;
                    
                    // Salvar perguntas para referência
                    state.faqData.topQuestions = topQuestions;
                    conversationState.set(chatId, state);
                } else {
                    responseMessage += `Por favor, digite sua pergunta sobre ${selectedCategory.name}.`;
                }
                
                await dialogController.sendMessage(client, chatId, responseMessage);
                
                logger.info(`Cliente ${chatId} selecionou categoria: ${selectedCategory.name}`);
                return true;
            } catch (error) {
                logger.error(`Erro ao buscar perguntas da categoria: ${error.message}`, error);
                
                // Continuar mesmo com erro
                await dialogController.sendMessage(
                    client, 
                    chatId, 
                    `Por favor, digite sua pergunta sobre ${selectedCategory.name}.`
                );
                return true;
            }
        }
    }
    
    // Se não for um número válido, tratar como uma pergunta direta
    state.stage = 'waiting_question';
    conversationState.set(chatId, state);
    
    return await processQuestion(client, chatId, message);
}

/**
 * Processa a pergunta e busca a resposta
 * @param {Object} client - Cliente WhatsApp
 * @param {string} chatId - ID do chat
 * @param {string} question - Pergunta do usuário
 * @returns {Promise<boolean>} True se a mensagem foi tratada
 */
async function processQuestion(client, chatId, question) {
    const state = conversationState.get(chatId);
    
    // Verificar se é uma seleção de pergunta frequente
    if (state.faqData.topQuestions && /^\d+$/.test(question)) {
        const questionIndex = parseInt(question) - 1;
        
        if (questionIndex >= 0 && questionIndex < state.faqData.topQuestions.length) {
            // Selecionou uma pergunta válida
            const selectedQuestion = state.faqData.topQuestions[questionIndex];
            question = selectedQuestion.question;
            
            // Log da seleção
            logger.info(`Cliente ${chatId} selecionou pergunta pré-definida: "${question}"`);
        }
    }
    
    // Informar que estamos processando
    await dialogController.sendMessage(client, chatId, "🔍 Buscando resposta...");
    
    // Buscar resposta
    try {
        const categoryId = state.faqData.selectedCategory ? state.faqData.selectedCategory.id : null;
        const result = await faqService.findAnswer(question, categoryId);
        
        if (result && result.answer) {
            // Registrar a consulta nas estatísticas
            try {
                const customerId = state.customerData ? state.customerData.id : null;
                await faqAnalytics.recordView(result.id, chatId, customerId, result.matchType);
                logger.debug(`Registrada visualização do FAQ ${result.id} pelo cliente ${chatId}`);
            } catch (analyticsError) {
                logger.error(`Erro ao registrar analytics do FAQ: ${analyticsError.message}`, analyticsError);
                // Continuar mesmo com erro
            }
            
            // Formatar e enviar a resposta
            const categoryName = result.categoryName || (state.faqData.selectedCategory ? state.faqData.selectedCategory.name : null);
            
            let answerMessage = `*Pergunta:* ${result.question}\n\n` +
                `*Resposta:*\n${result.answer}\n`;
                
            // Adicionar categoria se disponível
            if (categoryName) {
                answerMessage += `\n*Categoria:* ${categoryName}`;
            }
            
            // Salvar a resposta no histórico
            state.faqData.lastAnswers.unshift({
                id: result.id,
                question: result.question,
                answer: result.answer,
                matchType: result.matchType
            });
            
            // Manter apenas as últimas 3 respostas
            if (state.faqData.lastAnswers.length > 3) {
                state.faqData.lastAnswers.pop();
            }
            
            // Atualizar o estado para feedback
            state.stage = 'feedback';
            state.faqData.lastQuestionAnswered = question;
            state.faqData.lastAnswerId = result.id;
            
            conversationState.set(chatId, state);
            
            // Enviar a resposta
            await dialogController.sendMessage(client, chatId, answerMessage);
            
            // Solicitar feedback após um breve delay
            setTimeout(async () => {
                try {
                    await dialogController.sendMessage(
                        client, 
                        chatId, 
                        "Esta resposta foi útil?\n\n1️⃣ Sim\n2️⃣ Não"
                    );
                } catch (error) {
                    logger.error(`Erro ao solicitar feedback: ${error.message}`, error);
                }
            }, 1500);
            
            logger.info(`Resposta de FAQ enviada para ${chatId} (FAQ #${result.id})`);
            return true;
        } else {
            // Não encontrou resposta
            await handleNoAnswer(client, chatId, question);
            return true;
        }
    } catch (error) {
        logger.error(`Erro ao buscar resposta para pergunta: ${error.message}`, error);
        
        await dialogController.sendMessage(
            client, 
            chatId, 
            "Desculpe, ocorreu um erro ao processar sua pergunta. Por favor, tente formular de outra maneira ou entre em contato pelo telefone."
        );
        
        return true;
    }
}

/**
 * Processa o feedback da resposta
 * @param {Object} client - Cliente WhatsApp
 * @param {string} chatId - ID do chat
 * @param {string} message - Feedback do usuário
 * @returns {Promise<boolean>} True se a mensagem foi tratada
 */
async function processFeedback(client, chatId, message) {
    const state = conversationState.get(chatId);
    const isPositiveFeedback = message === '1' || message.toLowerCase() === 'sim';
    
    // Registrar o feedback
    try {
        if (state.faqData.lastAnswerId) {
            await faqAnalytics.recordFeedback(
                state.faqData.lastAnswerId, 
                chatId, 
                isPositiveFeedback ? 1 : 0
            );
            
            logger.info(`Feedback ${isPositiveFeedback ? 'positivo' : 'negativo'} registrado para FAQ #${state.faqData.lastAnswerId}`);
        }
    } catch (error) {
        logger.error(`Erro ao registrar feedback: ${error.message}`, error);
        // Continuar mesmo com erro
    }
    
    if (isPositiveFeedback) {
        // Feedback positivo
        await dialogController.sendMessage(
            client, 
            chatId, 
            "Fico feliz em ajudar! Posso responder mais alguma dúvida?"
        );
    } else {
        // Feedback negativo
        await dialogController.sendMessage(
            client, 
            chatId, 
            "Lamento que a resposta não tenha ajudado. Você gostaria de:\n\n" +
            "1️⃣ Reformular sua pergunta\n" +
            "2️⃣ Falar com um atendente\n" +
            "3️⃣ Fazer outra pergunta"
        );
    }
    
    // Atualizar o estado
    state.stage = 'follow_up';
    state.faqData.lastFeedback = isPositiveFeedback;
    conversationState.set(chatId, state);
    
    return true;
}

/**
 * Processa o follow-up após o feedback
 * @param {Object} client - Cliente WhatsApp
 * @param {string} chatId - ID do chat
 * @param {string} message - Resposta do usuário
 * @returns {Promise<boolean>} True se a mensagem foi tratada
 */
async function processFollowUp(client, chatId, message) {
    const state = conversationState.get(chatId);
    const lastFeedbackPositive = state.faqData.lastFeedback;
    
    if (lastFeedbackPositive) {
        // Após feedback positivo, qualquer mensagem é tratada como nova pergunta
        state.stage = 'waiting_question';
        conversationState.set(chatId, state);
        
        return await processQuestion(client, chatId, message);
    } else {
        // Após feedback negativo, precisamos verificar a opção selecionada
        if (message === '1') {
            // Reformular pergunta
            await dialogController.sendMessage(
                client, 
                chatId, 
                "Por favor, reformule sua pergunta com mais detalhes para que eu possa ajudar melhor."
            );
            
            state.stage = 'waiting_question';
            conversationState.set(chatId, state);
            return true;
        } else if (message === '2') {
            // Falar com atendente
            await dialogController.sendMessage(
                client, 
                chatId, 
                "Entendido! Estou transferindo você para um atendente humano. Por favor, aguarde um momento."
            );
            
            // Notificar sistema de atendimento humano
            try {
                const lastName = state.customerData ? state.customerData.name : 'Cliente não identificado';
                const lastQuestion = state.faqData.lastQuestionAnswered || 'Pergunta não registrada';
                
                await dialogController.notifyHumanAgent(
                    chatId,
                    lastName,
                    `Cliente não ficou satisfeito com a resposta da FAQ. Última pergunta: "${lastQuestion}"`
                );
                
                logger.info(`Cliente ${chatId} transferido para atendente após feedback negativo`);
            } catch (error) {
                logger.error(`Erro ao notificar atendente: ${error.message}`, error);
            }
            
            // Atualizar o estado para human_agent
            conversationState.set(chatId, {
                currentFlow: 'human_agent',
                stage: 'waiting',
                timestamp: Date.now(),
                customerData: state.customerData,
                previousState: {
                    flow: 'faq',
                    lastQuestion: state.faqData.lastQuestionAnswered
                }
            });
            
            return true;
        } else if (message === '3') {
            // Nova pergunta
            await dialogController.sendMessage(
                client, 
                chatId, 
                "Certo! Por favor, faça sua nova pergunta."
            );
            
            state.stage = 'waiting_question';
            conversationState.set(chatId, state);
            return true;
        } else {
            // Opção inválida, tratar como nova pergunta
            await dialogController.sendMessage(
                client, 
                chatId, 
                "Vou considerar isso como uma nova pergunta."
            );
            
            state.stage = 'waiting_question';
            conversationState.set(chatId, state);
            return await processQuestion(client, chatId, message);
        }
    }
}

/**
 * Trata o caso quando não há resposta disponível
 * @param {Object} client - Cliente WhatsApp
 * @param {string} chatId - ID do chat
 * @param {string} question - Pergunta do usuário
 * @returns {Promise<void>}
 */
async function handleNoAnswer(client, chatId, question) {
    const state = conversationState.get(chatId);
    
    // Registrar pergunta sem resposta
    try {
        const customerId = state.customerData ? state.customerData.id : null;
        await faqService.recordUnansweredQuestion(question, chatId, customerId);
        logger.info(`Pergunta sem resposta registrada: "${question}" de ${chatId}`);
    } catch (error) {
        logger.error(`Erro ao registrar pergunta sem resposta: ${error.message}`, error);
        // Continuar mesmo com erro
    }
    
    const noAnswerMessage = "Desculpe, não encontrei uma resposta específica para sua pergunta. Você gostaria de:\n\n" +
        "1️⃣ Reformular sua pergunta\n" +
        "2️⃣ Ver as perguntas mais frequentes\n" +
        "3️⃣ Falar com um atendente";
    
    await dialogController.sendMessage(client, chatId, noAnswerMessage);
    
    // Atualizar o estado
    state.stage = 'no_answer_follow_up';
    state.faqData.lastQuestionUnanswered = question;
    conversationState.set(chatId, state);
}

/**
 * Tenta responder diretamente uma pergunta sem iniciar o fluxo completo
 * @param {Object} client - Cliente WhatsApp
 * @param {string} chatId - ID do chat
 * @param {string} question - Pergunta do usuário
 * @returns {Promise<boolean>} True se a pergunta foi respondida
 */
async function tryDirectAnswer(client, chatId, question) {
    // Apenas tentar responder se parecer uma pergunta
    if (!isFAQRequest(question)) {
        return false;
    }
    
    try {
        // Tentar encontrar uma resposta com alta confiança
        const result = await faqService.findAnswer(question, null, 0.8);
        
        if (result && result.answer && (result.matchType === 'exact' || result.matchType === 'high')) {
            // Registrar a consulta nas estatísticas
            try {
                await faqAnalytics.recordView(result.id, chatId, null, result.matchType);
            } catch (analyticsError) {
                logger.error(`Erro ao registrar analytics: ${analyticsError.message}`, analyticsError);
                // Continuar mesmo com erro
            }
            
            // Formatar e enviar a resposta
            let answerMessage = `*Resposta:*\n${result.answer}`;
            
            // Enviar a resposta
            await dialogController.sendMessage(client, chatId, answerMessage);
            
            logger.info(`Resposta direta de FAQ enviada para ${chatId} (FAQ #${result.id})`);
            return true;
        }
    } catch (error) {
        logger.error(`Erro ao tentar resposta direta: ${error.message}`, error);
    }
    
    return false;
}

module.exports = {
    handle,
    isFAQRequest
};



//Melhorias Implementadas
//Estrutura Completa do Fluxo FAQ

//Implementação do fluxo de perguntas, respostas e feedback
//Tratamento de cenários sem resposta
//Suporte a categorias de dúvidas para melhor organização
//Tratamento Assíncrono

//Uso consistente de async/await para todas as operações
//Promises para operações de banco de dados e envio de mensagens
//Tratamento de Erros Robusto

//Try/catch em todas as operações críticas
//Logging detalhado de erros
//Mensagens de fallback para os usuários
//Sistema de Estados Conversacionais

//Gerenciamento do estado da conversa entre mensagens
//Transições suaves entre diferentes estágios do fluxo
//Preservação do contexto para melhor experiência do usuário
//Detecção de Intenção

//Identificação automática de perguntas e solicitações de FAQ
//Processamento de linguagem natural básico
//Suporte a diferentes formas de fazer perguntas
//Integração de Analytics

//Registro de visualizações de respostas
//Coleta de feedback (útil/não útil)
//Rastreamento de perguntas sem resposta
//Categorias de FAQ

//Suporte para agrupar perguntas por categorias
//Interface para seleção de categorias
//Filtros de busca por categoria
//Formatação e Personalização

//Mensagens bem formatadas com markdown
//Uso do nome do cliente quando disponível
//Estrutura clara das perguntas e respostas
//Logging Abrangente

//Registro detalhado de cada etapa do fluxo
//Tracking de perguntas e respostas
//Informações para análise e melhoria do sistema
//Resposta Direta para Perguntas Simples

//Sistema inteligente que responde perguntas óbvias diretamente
//Evita iniciar o fluxo completo quando não necessário
//Melhora a experiência do usuário com respostas rápidas
//Feedback e Loop de Melhoria

//Coleta de feedback sobre a qualidade das respostas
//Opções para reencaminhar quando a resposta não ajuda
//Registro para uso em melhorias futuras do sistema FAQ
//Integração com Sistema de Atendimento Humano

//Transferência para atendentes quando o bot não consegue ajudar
//Fornecimento de contexto ao atendente humano
//Transição suave entre atendimento automatizado e humano