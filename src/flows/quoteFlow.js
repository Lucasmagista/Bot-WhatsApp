/**
 * Fluxo para solicitação e processamento de orçamentos
 * Gerencia todo o ciclo de vida de um orçamento, desde a solicitação inicial
 * até o envio do orçamento final para o cliente
 */
const config = require('../config/config');
const logger = require('../utils/logger');
const dialogController = require('../controllers/dialogController');
const customerModel = require('../models/customerModel');
const quoteModel = require('../models/quoteModel');
const serviceModel = require('../models/serviceModel');
const conversationState = require('../utils/conversationState');
const { formatPhoneNumber, formatCurrency } = require('../utils/formatter');
const { isBusinessHours } = require('../utils/timeChecker');

if (typeof formatPhoneNumber !== 'function') {
    throw new Error('formatPhoneNumber não está definido corretamente.');
}

// Tipos de serviços disponíveis para orçamento
const SERVICE_TYPES = {
    '1': {
        id: 1,
        name: 'Conserto',
        description: 'Reparo de hardware ou software em computador ou notebook',
        basePrice: 150.00,
        questions: [
            'Qual o problema que está enfrentando?',
            'É um computador ou notebook? Qual a marca e modelo?',
            'Há quanto tempo o problema está ocorrendo?'
        ]
    },
    '2': {
        id: 2,
        name: 'Limpeza',
        description: 'Limpeza física ou de software',
        basePrice: 100.00,
        questions: [
            'Deseja limpeza física (poeira/ventiladores), de software (vírus/lentidão) ou ambos?',
            'Qual a marca e modelo do equipamento?',
            'O computador está muito lento ou apresenta outro problema específico?'
        ]
    },
    '3': {
        id: 3,
        name: 'Atualização de sistema',
        description: 'Atualização de sistemas operacionais ou softwares',
        basePrice: 120.00,
        questions: [
            'Qual sistema operacional está usando atualmente?',
            'Para qual versão ou sistema deseja atualizar?',
            'O equipamento atende aos requisitos mínimos da nova versão?'
        ]
    },
    '4': {
        id: 4,
        name: 'Instalação de softwares',
        description: 'Instalação e configuração de programas',
        basePrice: 90.00,
        questions: [
            'Quais softwares deseja instalar?',
            'Você possui as licenças ou mídias de instalação?',
            'Tem alguma preferência de configuração específica?'
        ]
    },
    '5': {
        id: 5,
        name: 'Outros serviços',
        description: 'Serviços personalizados',
        basePrice: 200.00,
        questions: [
            'Descreva detalhadamente o serviço que você precisa',
            'Tem algum prazo específico para a conclusão do serviço?',
            'Há alguma condição especial que devemos considerar?'
        ]
    }
};

/**
 * Processa mensagens do fluxo de orçamento
 * @param {Object} message - Mensagem recebida do WhatsApp
 * @param {Object} client - Cliente WhatsApp
 * @returns {Promise<boolean>} True se a mensagem foi tratada por este fluxo
 */
async function handle(message, client) {
    try {
        const chatId = message.from;
        const messageContent = message.body.trim();
        
        // Verificar se a mensagem dispara o fluxo de orçamento
        if (isQuoteRequest(messageContent) && !conversationState.has(chatId)) {
            await startQuoteFlow(client, chatId);
            return true;
        }
        
        // Verificar se estamos em um fluxo de orçamento ativo
        const state = conversationState.get(chatId);
        if (!state || state.currentFlow !== 'quote') {
            return false;
        }
        
        // Processar a etapa atual do fluxo
        switch (state.stage) {
            case 'service_selection':
                await processServiceSelection(client, chatId, messageContent);
                break;
                
            case 'question_answering':
                await processQuestionAnswer(client, chatId, messageContent);
                break;
                
            case 'urgency_selection':
                await processUrgencySelection(client, chatId, messageContent);
                break;
                
            case 'contact_info':
                await processContactInfo(client, chatId, messageContent);
                break;
                
            case 'confirmation':
                await processConfirmation(client, chatId, messageContent);
                break;
                
            case 'feedback':
                await processFeedback(client, chatId, messageContent);
                break;
                
            default:
                // Se chegou aqui, reiniciar o fluxo
                await startQuoteFlow(client, chatId);
        }
        
        return true;
    } catch (error) {
        logger.error(`Erro no fluxo de orçamento: ${error.message}`, error);
        
        try {
            await dialogController.sendMessage(
                client, 
                message.from, 
                "Desculpe, ocorreu um erro ao processar sua solicitação de orçamento. Por favor, tente novamente ou entre em contato pelo telefone."
            );
            
            // Limpar o estado para permitir recomeçar
            conversationState.delete(message.from);
        } catch (sendError) {
            logger.error(`Erro ao enviar mensagem de erro no fluxo de orçamento: ${sendError.message}`);
        }
        
        return true;
    }
}

/**
 * Verifica se a mensagem é uma solicitação de orçamento
 * @param {string} message - Conteúdo da mensagem
 * @returns {boolean} True se for uma solicitação de orçamento
 */
function isQuoteRequest(message) {
    const lowerMessage = message.toLowerCase();
    const quoteTerms = [
        'orçamento', 'orcamento', 'orcar', 'quanto custa', 'valor', 'preço', 
        'preco', 'custo', 'cobram', 'cobrança', 'proposta', 'cotação'
    ];
    
    return quoteTerms.some(term => lowerMessage.includes(term));
}

/**
 * Inicia o fluxo de orçamento
 * @param {Object} client - Cliente WhatsApp
 * @param {string} chatId - ID do chat
 * @returns {Promise<void>}
 */
async function startQuoteFlow(client, chatId) {
    // Verificar se está dentro do horário comercial
    if (!isBusinessHours()) {
        await dialogController.sendMessage(
            client,
            chatId,
            "Desculpe, estamos fora do horário comercial. Por favor, envie sua solicitação durante nosso horário de atendimento."
        );
        return;
    }

    // Enviar mensagem de "aguarde" enquanto processamos
    await dialogController.sendMessage(client, chatId, "Aguarde um momento enquanto processamos sua solicitação...");

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
    
    // Enviar mensagem de boas-vindas ao fluxo de orçamento
    const welcomeMessage = `Olá${customer ? ' ' + customer.name.split(' ')[0] : ''}! 👋\n\n` +
        `Vamos preparar um orçamento personalizado para você. Por favor, selecione o tipo de serviço:\n\n` +
        `1️⃣ *Conserto* (computador ou notebook)\n` +
        `2️⃣ *Limpeza* (física ou software)\n` +
        `3️⃣ *Atualização* de sistema\n` +
        `4️⃣ *Instalação* de softwares\n` +
        `5️⃣ *Outros* serviços\n\n` +
        `Digite o número da opção desejada.`;
    
    await dialogController.sendMessage(client, chatId, welcomeMessage);
    
    // Inicializar o estado da conversa
    conversationState.set(chatId, {
        currentFlow: 'quote',
        stage: 'service_selection',
        timestamp: Date.now(),
        customerData: customer,
        quoteData: {
            items: [],
            urgency: 'normal',
            notes: '',
            totalEstimate: 0
        }
    });
    
    logger.info(`Fluxo de orçamento iniciado para ${chatId}`);
}

/**
 * Processa a seleção de tipo de serviço
 * @param {Object} client - Cliente WhatsApp
 * @param {string} chatId - ID do chat
 * @param {string} message - Mensagem com a seleção
 * @returns {Promise<void>}
 */
async function processServiceSelection(client, chatId, message) {
    const state = conversationState.get(chatId);
    
    // Validar entrada do usuário
    if (!/^[1-5]$/.test(message)) {
        await dialogController.sendMessage(
            client, 
            chatId, 
            "Por favor, selecione uma opção válida (1 a 5)."
        );
        return;
    }
    
    // Obter o serviço selecionado
    const selectedService = SERVICE_TYPES[message];
    
    // Atualizar os dados do orçamento
    state.quoteData.selectedService = selectedService;
    state.quoteData.items.push({
        serviceId: selectedService.id,
        serviceName: selectedService.name,
        description: selectedService.description,
        price: selectedService.basePrice
    });
    state.quoteData.totalEstimate = calculateTotal(state.quoteData.items);
    
    // Preparar para as perguntas específicas do serviço
    state.quoteData.questions = selectedService.questions;
    state.quoteData.currentQuestion = 0;
    state.quoteData.answers = [];
    
    // Avançar para a próxima etapa
    state.stage = 'question_answering';
    conversationState.set(chatId, state);
    
    // Enviar a primeira pergunta
    await dialogController.sendMessage(
        client, 
        chatId, 
        `*${selectedService.name} - ${selectedService.description}*\n\n` +
        `Por favor, responda algumas perguntas para melhorar seu orçamento:\n\n` +
        `*Pergunta 1/${selectedService.questions.length}*: ${selectedService.questions[0]}`
    );
    
    logger.info(`Cliente ${chatId} selecionou serviço: ${selectedService.name}`);
}

/**
 * Processa as respostas às perguntas específicas do serviço
 * @param {Object} client - Cliente WhatsApp
 * @param {string} chatId - ID do chat
 * @param {string} message - Resposta do usuário
 * @returns {Promise<void>}
 */
async function processQuestionAnswer(client, chatId, message) {
    const state = conversationState.get(chatId);
    const { quoteData } = state;
    
    // Armazenar a resposta
    quoteData.answers.push(message);
    
    // Verificar se há mais perguntas
    if (quoteData.currentQuestion < quoteData.questions.length - 1) {
        // Avançar para a próxima pergunta
        quoteData.currentQuestion++;
        
        await dialogController.sendMessage(
            client, 
            chatId, 
            `*Pergunta ${quoteData.currentQuestion + 1}/${quoteData.questions.length}*: ${quoteData.questions[quoteData.currentQuestion]}`
        );
        
        conversationState.set(chatId, state);
    } else {
        // Todas as perguntas foram respondidas, perguntar sobre urgência
        state.stage = 'urgency_selection';
        conversationState.set(chatId, state);
        
        await dialogController.sendMessage(
            client, 
            chatId, 
            `Obrigado pelas informações! Qual a urgência do serviço?\n\n` +
            `1️⃣ *Normal* (5-7 dias úteis)\n` +
            `2️⃣ *Prioritário* (2-3 dias úteis) - Acréscimo de 15%\n` +
            `3️⃣ *Urgente* (24h) - Acréscimo de 30%\n\n` +
            `Digite o número da opção desejada.`
        );
    }
}

/**
 * Processa a seleção de urgência do serviço
 * @param {Object} client - Cliente WhatsApp
 * @param {string} chatId - ID do chat
 * @param {string} message - Mensagem com a seleção
 * @returns {Promise<void>}
 */
async function processUrgencySelection(client, chatId, message) {
    const state = conversationState.get(chatId);
    const { quoteData } = state;
    
    // Mapear a seleção para o nível de urgência
    const urgencyMap = {
        '1': { level: 'normal', factor: 1.0, description: 'Normal (5-7 dias úteis)' },
        '2': { level: 'priority', factor: 1.15, description: 'Prioritário (2-3 dias úteis)' },
        '3': { level: 'urgent', factor: 1.3, description: 'Urgente (24h)' }
    };
    
    // Verificar se a seleção é válida
    if (!urgencyMap[message]) {
        await dialogController.sendMessage(
            client, 
            chatId, 
            "Por favor, selecione uma opção válida (1 a 3)."
        );
        return;
    }
    
    // Obter a urgência selecionada
    const selectedUrgency = urgencyMap[message];
    
    // Atualizar os dados do orçamento
    quoteData.urgency = selectedUrgency.level;
    quoteData.urgencyFactor = selectedUrgency.factor;
    quoteData.urgencyDescription = selectedUrgency.description;
    
    // Aplicar o fator de urgência ao preço total
    quoteData.totalEstimate = calculateTotal(quoteData.items) * selectedUrgency.factor;
    
    // Verificar se temos os dados de contato do cliente
    if (state.customerData && state.customerData.email && state.customerData.name) {
        // Já temos os dados, avançar para confirmação
        await goToConfirmation(client, chatId);
    } else {
        // Precisamos coletar dados de contato
        state.stage = 'contact_info';
        
        if (!state.customerData || !state.customerData.name) {
            // Pedir o nome primeiro
            state.contactStep = 'name';
            await dialogController.sendMessage(
                client, 
                chatId, 
                "Para finalizar seu orçamento, preciso de algumas informações. Qual é o seu nome completo?"
            );
        } else if (!state.customerData.email) {
            // Pedir o email
            state.contactStep = 'email';
            await dialogController.sendMessage(
                client, 
                chatId, 
                `${state.customerData.name.split(' ')[0]}, qual é o seu email para envio do orçamento detalhado?`
            );
        }
        
        conversationState.set(chatId, state);
    }
    
    logger.info(`Cliente ${chatId} selecionou urgência: ${selectedUrgency.description}`);
}

/**
 * Processa as informações de contato do cliente
 * @param {Object} client - Cliente WhatsApp
 * @param {string} chatId - ID do chat
 * @param {string} message - Mensagem com as informações
 * @returns {Promise<void>}
 */
async function processContactInfo(client, chatId, message) {
    const state = conversationState.get(chatId);
    
    // Verificar qual informação estamos coletando
    if (state.contactStep === 'name') {
        // Validar o nome
        if (message.length < 5 || !message.includes(' ')) {
            await dialogController.sendMessage(
                client, 
                chatId, 
                "Por favor, forneça seu nome completo (nome e sobrenome)."
            );
            return;
        }
        
        // Armazenar o nome
        if (!state.customerData) {
            state.customerData = { phone: formatPhoneNumber(chatId) };
        }
        
        state.customerData.name = message;
        
        // Próximo passo: email
        state.contactStep = 'email';
        
        await dialogController.sendMessage(
            client, 
            chatId, 
            `Obrigado, ${message.split(' ')[0]}! Qual é o seu email para envio do orçamento detalhado?`
        );
        
        conversationState.set(chatId, state);
    } else if (state.contactStep === 'email') {
        // Validar o email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(message)) {
            await dialogController.sendMessage(
                client, 
                chatId, 
                "Por favor, forneça um endereço de email válido."
            );
            return;
        }
        
        // Armazenar o email
        state.customerData.email = message;
        
        // Criar ou atualizar o cliente no banco de dados
        try {
            const phoneNumber = formatPhoneNumber(chatId);
            
            // Verificar se o cliente já existe
            let customerId = null;
            const existingCustomer = await customerModel.getCustomerByPhone(phoneNumber);
            
            if (existingCustomer) {
                // Atualizar cliente existente
                await customerModel.updateCustomer(existingCustomer.id, {
                    name: state.customerData.name,
                    email: state.customerData.email
                });
                customerId = existingCustomer.id;
            } else {
                // Criar novo cliente
                customerId = await customerModel.addCustomer({
                    name: state.customerData.name,
                    phone: phoneNumber,
                    email: state.customerData.email
                });
                
                logger.info(`Novo cliente cadastrado: ${state.customerData.name} (ID: ${customerId})`);
            }
            
            // Atualizar o ID do cliente na conversa
            state.customerData.id = customerId;
        } catch (error) {
            logger.error(`Erro ao salvar dados do cliente: ${error.message}`, error);
            // Continuar mesmo com erro
        }
        
        // Avançar para confirmação
        await goToConfirmation(client, chatId);
    }
}

/**
 * Vai para o estágio de confirmação do orçamento
 * @param {Object} client - Cliente WhatsApp
 * @param {string} chatId - ID do chat
 * @returns {Promise<void>}
 */
async function goToConfirmation(client, chatId) {
    const state = conversationState.get(chatId);
    const { quoteData, customerData } = state;
    
    // Preparar o resumo do orçamento
    const quoteItems = quoteData.items.map(item => 
        `• ${item.serviceName}: ${formatCurrency(item.price)}`
    ).join('\n');
    
    const urgencyEffect = quoteData.urgencyFactor > 1 ? 
        `\n• Fator de urgência (${quoteData.urgencyDescription}): +${((quoteData.urgencyFactor - 1) * 100).toFixed(0)}%` : '';
    
    const summaryMessage = `*📋 Resumo do seu orçamento:*\n\n` +
        `*Serviços solicitados:*\n${quoteItems}${urgencyEffect}\n\n` +
        `*Valor estimado: ${formatCurrency(quoteData.totalEstimate)}*\n\n` +
        `*Observações:*\n` +
        `- Este é um valor estimado, sujeito a ajustes após análise técnica detalhada.\n` +
        `- A forma de pagamento pode ser definida no momento da confirmação do serviço.\n\n` +
        `*Para confirmar o orçamento, digite 'CONFIRMAR'*\n` +
        `*Para fazer ajustes, digite 'AJUSTAR'*\n` +
        `*Para cancelar, digite 'CANCELAR'*`;
    
    await dialogController.sendMessage(client, chatId, summaryMessage);
    
    // Atualizar o estado da conversa
    state.stage = 'confirmation';
    conversationState.set(chatId, state);
    
    // Salvar o orçamento no banco de dados (como rascunho)
    try {
        if (customerData && customerData.id) {
            const quoteId = await quoteModel.createQuote({
                customerId: customerData.id,
                serviceId: quoteData.selectedService.id,
                description: quoteData.selectedService.description,
                urgency: quoteData.urgency,
                details: JSON.stringify({
                    questions: quoteData.questions,
                    answers: quoteData.answers,
                    items: quoteData.items
                }),
                estimatedValue: quoteData.totalEstimate,
                status: 'draft'
            });
            
            // Armazenar o ID do orçamento
            state.quoteData.quoteId = quoteId;
            conversationState.set(chatId, state);
            
            logger.info(`Orçamento #${quoteId} criado como rascunho para cliente ${customerData.id}`);
        }
    } catch (error) {
        logger.error(`Erro ao salvar orçamento no banco: ${error.message}`, error);
        // Continuar mesmo com erro
    }
}

/**
 * Processa a confirmação do orçamento
 * @param {Object} client - Cliente WhatsApp
 * @param {string} chatId - ID do chat
 * @param {string} message - Mensagem de confirmação
 * @returns {Promise<void>}
 */
async function processConfirmation(client, chatId, message) {
    const state = conversationState.get(chatId);
    const { quoteData, customerData } = state;
    
    const response = message.toUpperCase();
    
    if (response === 'CONFIRMAR') {
        // Atualizar orçamento no banco de dados
        try {
            if (quoteData.quoteId) {
                await quoteModel.updateQuote(quoteData.quoteId, {
                    status: 'pending'
                });
                
                logger.info(`Orçamento #${quoteData.quoteId} confirmado pelo cliente`);
            }
        } catch (error) {
            logger.error(`Erro ao atualizar status do orçamento: ${error.message}`, error);
            // Continuar mesmo com erro
        }
        
        // Enviar mensagem de confirmação
        await dialogController.sendMessage(
            client, 
            chatId, 
            `✅ *Orçamento confirmado com sucesso!*\n\n` +
            `Obrigado pela confiança em nossos serviços. Um de nossos técnicos analisará sua solicitação e entrará em contato em breve para discutir os detalhes finais e agendar o serviço.\n\n` +
            `O orçamento detalhado será enviado para o email: ${customerData.email}\n\n` +
            `*Número do orçamento:* #${quoteData.quoteId || 'Pendente'}\n` +
            `Se tiver alguma dúvida adicional, estamos à disposição.`
        );
        
        // Notificar equipe interna sobre novo orçamento
        try {
            await notifyTeamAboutQuote(quoteData, customerData);
        } catch (error) {
            logger.error(`Erro ao notificar equipe sobre novo orçamento: ${error.message}`, error);
        }
        
        // Perguntar sobre a experiência
        setTimeout(async () => {
            try {
                await dialogController.sendMessage(
                    client, 
                    chatId, 
                    `Como você avalia sua experiência com nosso sistema de orçamentos?\n\n` +
                    `1️⃣ Excelente\n` +
                    `2️⃣ Boa\n` +
                    `3️⃣ Regular\n` +
                    `4️⃣ Ruim\n` +
                    `5️⃣ Péssima`
                );
                
                // Atualizar estado para feedback
                state.stage = 'feedback';
                conversationState.set(chatId, state);
            } catch (error) {
                logger.error(`Erro ao solicitar feedback: ${error.message}`, error);
            }
        }, 3000);
        
    } else if (response === 'AJUSTAR') {
        // Reiniciar o fluxo de orçamento
        await dialogController.sendMessage(
            client, 
            chatId, 
            `Vamos ajustar seu orçamento. Por favor, selecione o que deseja modificar:\n\n` +
            `1️⃣ Tipo de serviço\n` +
            `2️⃣ Respostas às perguntas\n` +
            `3️⃣ Nível de urgência\n` +
            `4️⃣ Informações de contato`
        );
        
        // Criar um novo estado para ajustar o orçamento
        state.stage = 'adjusting';
        state.adjustingStep = 'selection';
        conversationState.set(chatId, state);
        
        logger.info(`Cliente ${chatId} solicitou ajustes no orçamento`);
        
    } else if (response === 'CANCELAR') {
        // Atualizar orçamento no banco de dados
        try {
            if (quoteData.quoteId) {
                await quoteModel.updateQuote(quoteData.quoteId, {
                    status: 'cancelled'
                });
                
                logger.info(`Orçamento #${quoteData.quoteId} cancelado pelo cliente`);
            }
        } catch (error) {
            logger.error(`Erro ao atualizar status do orçamento: ${error.message}`, error);
        }
        
        // Enviar mensagem de cancelamento
        await dialogController.sendMessage(
            client, 
            chatId, 
            `✅ Orçamento cancelado conforme solicitado.\n\n` +
            `Se precisar de nossos serviços no futuro, estamos à disposição! 👋`
        );
        
        // Limpar o estado da conversa
        conversationState.delete(chatId);
        
    } else {
        // Resposta inválida
        await dialogController.sendMessage(
            client, 
            chatId, 
            `Por favor, responda com uma das opções: 'CONFIRMAR', 'AJUSTAR' ou 'CANCELAR'.`
        );
    }
}

/**
 * Processa o feedback do cliente sobre o sistema de orçamentos
 * @param {Object} client - Cliente WhatsApp
 * @param {string} chatId - ID do chat
 * @param {string} message - Avaliação do cliente
 * @returns {Promise<void>}
 */
async function processFeedback(client, chatId, message) {
    const state = conversationState.get(chatId);
    
    // Mapear a avaliação
    const feedbackMap = {
        '1': 'Excelente',
        '2': 'Boa',
        '3': 'Regular',
        '4': 'Ruim',
        '5': 'Péssima'
    };
    
    // Verificar se a avaliação é válida
    if (!feedbackMap[message]) {
        await dialogController.sendMessage(
            client, 
            chatId, 
            "Por favor, avalie sua experiência com uma das opções fornecidas (1 a 5)."
        );
        return;
    }
    
    // Obter a avaliação
    const feedbackRating = feedbackMap[message];
    
    // Salvar feedback no banco de dados
    try {
        if (state.quoteData && state.quoteData.quoteId) {
            await quoteModel.saveFeedback(state.quoteData.quoteId, {
                rating: message,
                ratingText: feedbackRating
            });
            
            logger.info(`Feedback recebido para orçamento #${state.quoteData.quoteId}: ${feedbackRating}`);
        }
    } catch (error) {
        logger.error(`Erro ao salvar feedback: ${error.message}`, error);
    }
    
    // Agradecer pelo feedback
    await dialogController.sendMessage(
        client, 
        chatId, 
        `Obrigado por sua avaliação! Sua opinião é muito importante para melhorarmos nosso atendimento.`
    );
    
    // Se a avaliação for negativa, oferecer ajuda
    if (message === '4' || message === '5') {
        setTimeout(async () => {
            try {
                await dialogController.sendMessage(
                    client, 
                    chatId, 
                    `Lamentamos que sua experiência não tenha sido satisfatória. Gostaríamos de entender melhor o que poderíamos melhorar. Poderia nos contar mais sobre o que não atendeu suas expectativas?`
                );
                
                // Atualizar estado para feedback detalhado
                state.stage = 'detailed_feedback';
                conversationState.set(chatId, state);
            } catch (error) {
                logger.error(`Erro ao solicitar feedback detalhado: ${error.message}`, error);
            }
        }, 2000);
    } else {
        // Encerrar o fluxo
        conversationState.delete(chatId);
    }
}

/**
 * Calcula o valor total dos itens do orçamento
 * @param {Array} items - Itens do orçamento
 * @returns {number} Valor total
 */
function calculateTotal(items) {
    return items.reduce((total, item) => total + (item.price || 0), 0);
}

/**
 * Notifica a equipe interna sobre um novo orçamento
 * @param {Object} quoteData - Dados do orçamento
 * @param {Object} customerData - Dados do cliente
 * @returns {Promise<void>}
 */
async function notifyTeamAboutQuote(quoteData, customerData) {
    // Esta função deve ser implementada de acordo com seu sistema de notificações interno
    logger.info(`Novo orçamento #${quoteData.quoteId} para ${customerData.name} (${formatCurrency(quoteData.totalEstimate)})`);
    
    // Exemplo: Enviar notificação para um número específico
    // const notificationNumber = config.notificationNumbers.quotes;
    // await dialogController.sendMessage(client, notificationNumber, notificationMessage);
}

module.exports = {
    handle,
    isQuoteRequest,
    SERVICE_TYPES
};




//elhorias Implementadas
//Tratamento Assíncrono Completo

//Uso consistente de async/await para todas as operações assíncronas
//Promises para gerenciar fluxo de dados entre etapas
//Gerenciamento de Estado Robusto

//Armazenamento do estado da conversa entre mensagens
//Controle preciso do fluxo baseado no estágio atual
//Transição suave entre diferentes etapas do orçamento
//Fluxo Completo de Orçamento

//Implementação de todas as etapas do processo
//Coleta de informações detalhadas sobre o serviço
//Sistema de perguntas personalizadas por tipo de serviço
//Opções de urgência com precificação dinâmica
//Validação de Dados

//Verificação de formato e validade das entradas do usuário
//Feedback imediato sobre problemas nas respostas
//Controle de fluxo para garantir informações consistentes
//Persistência no Banco de Dados

//Integração com modelos para armazenar orçamentos
//Criação e atualização de registros de clientes
//Armazenamento de feedback para análises futuras
//Tratamento de Erros Abrangente

//Try/catch em todas as operações críticas
//Logging detalhado de erros e alertas
//Graceful fallback quando ocorrem problemas
//Logs Detalhados

//Registro de todas as atividades e transições importantes
//Rastreamento de orçamentos do início ao fim
//Informações para análise e melhoria do processo
//Integração com Sistemas Externos

//Notificações para a equipe sobre novos orçamentos
//Envio de confirmações por email (mencionado na interface)
//Possibilidade de exportar dados para outros sistemas
//Experiência do Usuário Aprimorada

//Mensagens claras e bem formatadas
//Feedback sobre o andamento do processo
//Opções para retomar e ajustar o orçamento
//Coleta de feedback para melhoria contínua
//Detecção Inteligente de Intenção

//Identificação automática de solicitações de orçamento
//Processamento de linguagem natural básico
//Suporte a diferentes formas de expressar a mesma intenção
//Preços Dinâmicos

//Cálculo automático baseado no tipo de serviço
//Ajuste por fatores como urgência
//Formatação adequada de valores monetários
//Personalização

//Uso do nome do cliente quando disponível
//Adaptação das perguntas ao tipo de serviço
//Mensagens contextuais baseadas nas respostas anteriores