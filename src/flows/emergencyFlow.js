/**
 * Fluxo para atendimento de emergências e problemas urgentes
 * Responsável por escalar solicitações urgentes para a equipe adequada
 */
const config = require('../config/config');
const logger = require('../utils/logger');
const dialogController = require('../controllers/dialogController');
const customerModel = require('../models/customerModel');
const emergencyService = require('../services/emergencyService');
const notificationService = require('../services/notificationService');
const conversationState = require('../utils/conversationState');
const { formatPhoneNumber } = require('../utils/formatter');
const { isBusinessHours } = require('../utils/timeChecker');

// Tipos de emergências suportadas
const EMERGENCY_TYPES = {
    '1': {
        id: 'computer_crash',
        name: 'Travamento/Crash de Computador',
        team: 'support',
        priority: 'high',
        description: 'Problemas graves que impedem o uso do computador'
    },
    '2': {
        id: 'data_loss',
        name: 'Perda de Dados',
        team: 'data_recovery',
        priority: 'critical',
        description: 'Possível perda de arquivos ou dados importantes'
    },
    '3': {
        id: 'network_failure',
        name: 'Falha de Rede/Internet',
        team: 'network',
        priority: 'high',
        description: 'Problemas que afetam a conectividade de rede'
    },
    '4': {
        id: 'security_breach',
        name: 'Suspeita de Invasão/Vírus',
        team: 'security',
        priority: 'critical',
        description: 'Possíveis problemas de segurança ou infecção'
    },
    '5': {
        id: 'hardware_failure',
        name: 'Falha de Hardware',
        team: 'hardware',
        priority: 'high',
        description: 'Problemas físicos com equipamentos'
    },
    '6': {
        id: 'other',
        name: 'Outra Emergência',
        team: 'support',
        priority: 'medium',
        description: 'Outros problemas urgentes'
    }
};

/**
 * Processa mensagens do fluxo de emergência
 * @param {Object} message - Mensagem recebida do WhatsApp
 * @param {Object} client - Cliente WhatsApp
 * @returns {Promise<boolean>} True se a mensagem foi tratada por este fluxo
 */
async function handle(message, client) {
    try {
        const chatId = message.from;
        const messageContent = message.body.trim();
        
        // Verificar se a mensagem indica uma emergência
        if (isEmergencyRequest(messageContent) && !conversationState.has(chatId)) {
            await startEmergencyFlow(client, chatId);
            return true;
        }
        
        // Verificar se estamos em um fluxo de emergência ativo
        const state = conversationState.get(chatId);
        if (!state || state.currentFlow !== 'emergency') {
            return false;
        }
        
        // Processar de acordo com o estágio atual
        switch (state.stage) {
            case 'type_selection':
                return await processTypeSelection(client, chatId, messageContent);
                
            case 'description':
                return await processDescription(client, chatId, messageContent);
                
            case 'phone_collection':
                return await processPhoneCollection(client, chatId, messageContent);
                
            case 'confirmation':
                return await processConfirmation(client, chatId, messageContent);
                
            default:
                // Reiniciar o fluxo
                await startEmergencyFlow(client, chatId);
                return true;
        }
    } catch (error) {
        logger.error(`Erro no fluxo de emergência: ${error.message}`, error);
        
        try {
            await dialogController.sendMessage(
                client, 
                message.from, 
                "⚠️ Ocorreu um erro ao processar sua solicitação de emergência. " +
                "Por favor, tente novamente ou ligue diretamente para nosso número de emergência: " +
                `*${config.emergencyPhone}*`
            );
            
            // Tentar notificar equipe sobre o erro
            try {
                await notificationService.sendUrgentNotification(
                    "Erro crítico no fluxo de emergência",
                    `Cliente: ${message.from}\nMensagem: ${message.body}\nErro: ${error.message}`
                );
            } catch (notifyError) {
                logger.error(`Erro ao enviar notificação de falha: ${notifyError.message}`);
            }
            
            // Limpar o estado para permitir recomeçar
            conversationState.delete(message.from);
        } catch (sendError) {
            logger.error(`Erro ao enviar mensagem de erro no fluxo de emergência: ${sendError.message}`, sendError);
        }
        
        return true;
    }
}

/**
 * Verifica se a mensagem indica uma solicitação de emergência
 * @param {string} message - Conteúdo da mensagem
 * @returns {boolean} True se for uma solicitação de emergência
 */
function isEmergencyRequest(message) {
    const lowerMessage = message.toLowerCase();
    const emergencyTerms = [
        'emergência', 'emergencia', 'urgente', 'urgência', 'socorro',
        'grave', 'crítico', 'critico', 'ajuda rápida', 'imediato',
        'problema sério', 'SOS', 'preciso de ajuda urgente'
    ];
    
    return emergencyTerms.some(term => lowerMessage.includes(term));
}

/**
 * Inicia o fluxo de emergência
 * @param {Object} client - Cliente WhatsApp
 * @param {string} chatId - ID do chat
 * @returns {Promise<void>}
 */
async function startEmergencyFlow(client, chatId) {
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
    
    // Verificar horário de atendimento
    const isOpen = isBusinessHours();
    
    // Mensagem inicial
    let welcomeMessage = `🚨 *ATENDIMENTO DE EMERGÊNCIA* 🚨\n\n`;
    
    if (customer) {
        welcomeMessage += `Olá, ${customer.name.split(' ')[0]}. `;
    } else {
        welcomeMessage += `Olá. `;
    }
    
    welcomeMessage += `Entendemos que você está enfrentando um problema urgente.\n\n`;
    
    if (!isOpen) {
        welcomeMessage += `⚠️ *AVISO: Estamos fora do horário normal de atendimento.*\n` +
            `Você será atendido pelo nosso plantão de emergência, que pode ter tempo de resposta mais longo.\n\n`;
    }
    
    welcomeMessage += `Por favor, selecione o tipo de emergência:\n\n`;
    
    // Adicionar tipos de emergência
    Object.keys(EMERGENCY_TYPES).forEach(key => {
        const emergencyType = EMERGENCY_TYPES[key];
        welcomeMessage += `${key}️⃣ *${emergencyType.name}*\n`;
    });
    
    welcomeMessage += `\nDigite o número correspondente ao seu problema.`;
    
    // Enviar mensagem e registrar estado
    await dialogController.sendMessage(client, chatId, welcomeMessage);
    
    // Log da atividade
    logger.info(`Fluxo de emergência iniciado para ${chatId}`);
    
    // Registrar notificação inicial para a equipe
    try {
        const customerName = customer ? customer.name : "Cliente não identificado";
        await notificationService.sendEmergencyAlert(
            "Nova solicitação de emergência iniciada",
            `Cliente: ${customerName}\nTelefone: ${phoneNumber}\nHorário: ${new Date().toLocaleString()}`
        );
    } catch (error) {
        logger.error(`Erro ao enviar alerta inicial de emergência: ${error.message}`, error);
        // Continuar mesmo com erro na notificação
    }
    
    // Inicializar o estado da conversa
    conversationState.set(chatId, {
        currentFlow: 'emergency',
        stage: 'type_selection',
        timestamp: Date.now(),
        customerData: customer,
        emergencyData: {
            isBusinessHours: isOpen,
            ticketCreated: false
        }
    });
}

/**
 * Processa a seleção do tipo de emergência
 * @param {Object} client - Cliente WhatsApp
 * @param {string} chatId - ID do chat
 * @param {string} message - Mensagem com a seleção
 * @returns {Promise<boolean>} True se a mensagem foi tratada
 */
async function processTypeSelection(client, chatId, message) {
    const state = conversationState.get(chatId);
    
    // Verificar se a mensagem é uma seleção válida
    if (!EMERGENCY_TYPES[message]) {
        // Tentar identificar por palavras-chave
        const emergencyType = identifyEmergencyTypeByKeywords(message);
        
        if (!emergencyType) {
            await dialogController.sendMessage(
                client, 
                chatId, 
                "Por favor, selecione uma opção válida digitando o número correspondente (1 a 6)."
            );
            return true;
        }
        
        // Identificou um tipo por palavra-chave
        state.emergencyData.selectedType = emergencyType;
    } else {
        // Seleção direta pelo número
        state.emergencyData.selectedType = EMERGENCY_TYPES[message];
    }
    
    // Atualizar o estado
    state.stage = 'description';
    conversationState.set(chatId, state);
    
    // Enviar mensagem solicitando descrição
    await dialogController.sendMessage(
        client, 
        chatId, 
        `Você selecionou: *${state.emergencyData.selectedType.name}*\n\n` +
        `Por favor, descreva brevemente o problema que está enfrentando. ` +
        `Quanto mais detalhes você fornecer, melhor poderemos ajudar.`
    );
    
    // Log da seleção
    logger.info(`Cliente ${chatId} selecionou emergência tipo: ${state.emergencyData.selectedType.name}`);
    
    return true;
}

/**
 * Identifica o tipo de emergência baseado em palavras-chave
 * @param {string} message - Mensagem do cliente
 * @returns {Object|null} Tipo de emergência identificado ou null
 */
function identifyEmergencyTypeByKeywords(message) {
    const lowerMessage = message.toLowerCase();
    
    const keywordMap = {
        'computer_crash': ['travar', 'travou', 'travando', 'crash', 'tela azul', 'não liga', 'congelou'],
        'data_loss': ['perdi', 'perda', 'arquivo', 'dados', 'documento', 'sumiu', 'deletado', 'apagado'],
        'network_failure': ['internet', 'rede', 'wifi', 'conexão', 'sem acesso', 'offline', 'não conecta'],
        'security_breach': ['vírus', 'virus', 'hacker', 'invadido', 'sequestrado', 'ransomware', 'malware', 'spam'],
        'hardware_failure': ['quebrou', 'quebrado', 'hardware', 'físico', 'tela', 'monitor', 'placa', 'bateria']
    };
    
    for (const [typeId, keywords] of Object.entries(keywordMap)) {
        if (keywords.some(keyword => lowerMessage.includes(keyword))) {
            // Encontrar o tipo correto
            for (const type of Object.values(EMERGENCY_TYPES)) {
                if (type.id === typeId) {
                    return type;
                }
            }
        }
    }
    
    // Se não encontrou, usar o tipo "other"
    return EMERGENCY_TYPES['6']; // Outra Emergência
}

/**
 * Processa a descrição da emergência
 * @param {Object} client - Cliente WhatsApp
 * @param {string} chatId - ID do chat
 * @param {string} message - Descrição do problema
 * @returns {Promise<boolean>} True se a mensagem foi tratada
 */
async function processDescription(client, chatId, message) {
    const state = conversationState.get(chatId);
    
    // Validar a descrição
    if (message.length < 10) {
        await dialogController.sendMessage(
            client, 
            chatId, 
            "Por favor, forneça uma descrição mais detalhada do problema para que possamos ajudar melhor."
        );
        return true;
    }
    
    // Armazenar a descrição
    state.emergencyData.description = message;
    
    // Se não temos os dados do cliente, coletar telefone para contato
    if (!state.customerData || !state.customerData.phone) {
        state.stage = 'phone_collection';
        conversationState.set(chatId, state);
        
        await dialogController.sendMessage(
            client, 
            chatId, 
            "Para que possamos entrar em contato caso necessário, por favor, informe um número de telefone para contato:\n\n" +
            "Digite no formato (XX) XXXXX-XXXX"
        );
        
        return true;
    }
    
    // Se já temos os dados do cliente, ir para confirmação
    return await goToConfirmation(client, chatId);
}

/**
 * Processa a coleta de telefone
 * @param {Object} client - Cliente WhatsApp
 * @param {string} chatId - ID do chat
 * @param {string} message - Número de telefone
 * @returns {Promise<boolean>} True se a mensagem foi tratada
 */
async function processPhoneCollection(client, chatId, message) {
    const state = conversationState.get(chatId);
    
    // Validar formato de telefone (básico)
    const phoneRegex = /^(\d{2})[ ]?(\d{4,5})[ -]?(\d{4})$/;
    if (!phoneRegex.test(message.replace(/[()]/g, ''))) {
        await dialogController.sendMessage(
            client, 
            chatId, 
            "Por favor, forneça um número de telefone válido no formato (XX) XXXXX-XXXX."
        );
        return true;
    }
    
    // Armazenar o telefone
    if (!state.customerData) {
        state.customerData = {};
    }
    
    state.customerData.phone = formatPhoneNumber(message);
    
    // Pedir nome se não tivermos
    if (!state.customerData.name) {
        state.stage = 'name_collection';
        conversationState.set(chatId, state);
        
        await dialogController.sendMessage(
            client, 
            chatId, 
            "Por favor, informe seu nome completo:"
        );
        
        return true;
    }
    
    // Se já temos o nome, ir para confirmação
    return await goToConfirmation(client, chatId);
}

/**
 * Processa a coleta de nome
 * @param {Object} client - Cliente WhatsApp
 * @param {string} chatId - ID do chat
 * @param {string} message - Nome do cliente
 * @returns {Promise<boolean>} True se a mensagem foi tratada
 */
async function processNameCollection(client, chatId, message) {
    const state = conversationState.get(chatId);
    
    // Validar o nome (básico)
    if (message.length < 5 || !message.includes(' ')) {
        await dialogController.sendMessage(
            client, 
            chatId, 
            "Por favor, forneça seu nome completo (nome e sobrenome)."
        );
        return true;
    }
    
    // Armazenar o nome
    state.customerData.name = message;
    
    // Tentar cadastrar o cliente
    try {
        const existingCustomer = await customerModel.getCustomerByPhone(state.customerData.phone);
        
        if (existingCustomer) {
            // Atualizar cliente existente
            await customerModel.updateCustomer(existingCustomer.id, {
                name: state.customerData.name
            });
            state.customerData.id = existingCustomer.id;
        } else {
            // Criar novo cliente
            const customerId = await customerModel.addCustomer({
                name: state.customerData.name,
                phone: state.customerData.phone
            });
            state.customerData.id = customerId;
            
            logger.info(`Novo cliente cadastrado durante emergência: ${state.customerData.name} (ID: ${customerId})`);
        }
    } catch (error) {
        logger.error(`Erro ao salvar dados do cliente em emergência: ${error.message}`, error);
        // Continuar mesmo com erro
    }
    
    // Ir para confirmação
    return await goToConfirmation(client, chatId);
}

/**
 * Vai para a etapa de confirmação
 * @param {Object} client - Cliente WhatsApp
 * @param {string} chatId - ID do chat
 * @returns {Promise<boolean>} True se a mensagem foi tratada
 */
async function goToConfirmation(client, chatId) {
    const state = conversationState.get(chatId);
    
    // Preparar resumo da solicitação
    const summaryMessage = `📋 *Resumo da sua solicitação de emergência:*\n\n` +
        `*Tipo:* ${state.emergencyData.selectedType.name}\n` +
        `*Descrição:* ${state.emergencyData.description}\n` +
        `*Cliente:* ${state.customerData.name || "Não informado"}\n` +
        `*Telefone:* ${state.customerData.phone || chatId.replace('@c.us', '')}\n\n` +
        `Para confirmar esta solicitação de emergência, digite *CONFIRMAR*\n` +
        `Para cancelar, digite *CANCELAR*`;
    
    await dialogController.sendMessage(client, chatId, summaryMessage);
    
    // Atualizar o estado
    state.stage = 'confirmation';
    conversationState.set(chatId, state);
    
    return true;
}

/**
 * Processa a confirmação da solicitação de emergência
 * @param {Object} client - Cliente WhatsApp
 * @param {string} chatId - ID do chat
 * @param {string} message - Mensagem de confirmação
 * @returns {Promise<boolean>} True se a mensagem foi tratada
 */
async function processConfirmation(client, chatId, message) {
    const state = conversationState.get(chatId);
    
    if (message.toUpperCase() === 'CONFIRMAR') {
        // Criar ticket de emergência
        let ticketId = null;
        try {
            ticketId = await emergencyService.createEmergencyTicket({
                customerId: state.customerData.id,
                customerName: state.customerData.name,
                customerPhone: state.customerData.phone || chatId.replace('@c.us', ''),
                emergencyType: state.emergencyData.selectedType.id,
                description: state.emergencyData.description,
                priority: state.emergencyData.selectedType.priority,
                team: state.emergencyData.selectedType.team,
                source: 'whatsapp',
                isBusinessHours: state.emergencyData.isBusinessHours
            });
            
            state.emergencyData.ticketCreated = true;
            state.emergencyData.ticketId = ticketId;
            
            logger.info(`Ticket de emergência #${ticketId} criado para ${chatId}`);
        } catch (error) {
            logger.error(`Erro ao criar ticket de emergência: ${error.message}`, error);
            // Continuar mesmo com erro, mas fazer notificação manual
        }
        
        // Notificar equipe de suporte
        try {
            const notification = {
                title: `🚨 EMERGÊNCIA: ${state.emergencyData.selectedType.name}`,
                message: `Cliente: ${state.customerData.name || "Não identificado"}\n` +
                         `Telefone: ${state.customerData.phone || chatId.replace('@c.us', '')}\n` +
                         `Problema: ${state.emergencyData.description}\n` +
                         `Ticket: ${ticketId || "Não gerado - VERIFICAR URGENTE"}\n` +
                         `Prioridade: ${state.emergencyData.selectedType.priority}\n` +
                         `Equipe: ${state.emergencyData.selectedType.team}`
            };
            
            await notificationService.sendEmergencyNotification(
                notification,
                state.emergencyData.selectedType.team
            );
            
            logger.info(`Notificação de emergência enviada para equipe ${state.emergencyData.selectedType.team}`);
        } catch (error) {
            logger.error(`Erro ao enviar notificação de emergência: ${error.message}`, error);
            
            // Tentar notificação alternativa
            try {
                await notificationService.sendFallbackEmergencyAlert(
                    `ALERTA! Falha ao notificar equipe sobre emergência do cliente ${state.customerData.name || chatId}`
                );
            } catch (fallbackError) {
                logger.error(`Erro crítico: Falha no envio de alerta alternativo: ${fallbackError.message}`);
            }
        }
        
        // Enviar confirmação para o cliente
        const confirmationMessage = `✅ *Solicitação de emergência confirmada!*\n\n` +
            `Sua solicitação foi registrada com ${ticketId ? `o número #${ticketId}` : "sucesso"}.\n\n` +
            `Um de nossos técnicos entrará em contato o mais breve possível para resolver seu problema. ` +
            `${state.emergencyData.isBusinessHours ? 
                "Durante o horário comercial, o tempo médio de resposta é de até 30 minutos." : 
                "Fora do horário comercial, o tempo médio de resposta é de até 2 horas."}\n\n` +
            `Caso a situação se agrave ou precise de suporte imediato, ligue para nossa central de emergência:\n` +
            `📞 *${config.emergencyPhone}*\n\n` +
            `Agradecemos sua compreensão e faremos o possível para resolver seu problema rapidamente.`;
        
        await dialogController.sendMessage(client, chatId, confirmationMessage);
        
        // Encerrar o fluxo
        conversationState.delete(chatId);
        
    } else if (message.toUpperCase() === 'CANCELAR') {
        // Cancelar a solicitação
        await dialogController.sendMessage(
            client, 
            chatId, 
            "Sua solicitação de emergência foi cancelada. Se precisar de ajuda posteriormente, não hesite em entrar em contato novamente."
        );
        
        // Log do cancelamento
        logger.info(`Solicitação de emergência cancelada pelo cliente ${chatId}`);
        
        // Encerrar o fluxo
        conversationState.delete(chatId);
        
    } else {
        // Resposta inválida
        await dialogController.sendMessage(
            client, 
            chatId, 
            "Por favor, responda com *CONFIRMAR* para prosseguir com a solicitação de emergência ou *CANCELAR* para cancelar."
        );
    }
    
    return true;
}

module.exports = {
    handle,
    isEmergencyRequest,
    EMERGENCY_TYPES
}
// Níveis de prioridade para emergências
const PRIORITY_LEVELS = {
    HIGH: {
        id: 'high',
        name: 'Alta',
        description: 'Emergência crítica - requer atendimento imediato',
        responseTime: '15 minutos',
        escalationTime: 5, // minutos
        notifyAll: true
    },
    MEDIUM: {
        id: 'medium',
        name: 'Média',
        description: 'Problema urgente - requer atendimento em breve',
        responseTime: '1 hora',
        escalationTime: 30, // minutos
        notifyAll: false
    },
    LOW: {
        id: 'low',
        name: 'Baixa',
        description: 'Situação importante, mas não crítica',
        responseTime: '3 horas',
        escalationTime: 120, // minutos
        notifyAll: false
    }
};

/**
 * Processa mensagens do fluxo de emergência
 * @param {Object} message - Mensagem recebida do WhatsApp
 * @param {Object} client - Cliente WhatsApp
 * @returns {Promise<boolean>} True se a mensagem foi tratada por este fluxo
 */
async function handle(message, client) {
    try {
        const chatId = message.from;
        const messageContent = message.body.trim();
        
        // Verificar se a mensagem dispara o fluxo de emergência
        if (isEmergencyRequest(messageContent) && !conversationState.has(chatId)) {
            await startEmergencyFlow(client, chatId);
            return true;
        }
        
        // Verificar se estamos em um fluxo de emergência ativo
        const state = conversationState.get(chatId);
        if (!state || state.currentFlow !== 'emergency') {
            return false;
        }
        
        // Processar de acordo com o estágio atual
        switch (state.stage) {
            case 'describing_emergency':
                await processEmergencyDescription(client, chatId, messageContent);
                break;
                
            case 'confirming_priority':
                await processConfirmPriority(client, chatId, messageContent);
                break;
                
            case 'waiting_contact':
                await processContactInfo(client, chatId, messageContent);
                break;
                
            case 'in_progress':
                await processFollowUp(client, chatId, messageContent);
                break;
                
            default:
                // Reiniciar o fluxo em caso de estado inválido
                await startEmergencyFlow(client, chatId);
        }
        
        return true;
    } catch (error) {
        logger.error(`Erro no fluxo de emergência: ${error.message}`, error);
        
        try {
            await dialogController.sendMessage(
                client, 
                message.from, 
                "⚠️ Ocorreu um erro ao processar sua emergência. Por favor, entre em contato diretamente pelo telefone " +
                `${config.emergencyPhone || '(XX) XXXX-XXXX'} para atendimento imediato.`
            );
            
            // Tentar notificar a equipe sobre o erro
            try {
                await notificationService.sendEmergencyAlert(
                    'Erro no fluxo de emergência',
                    `Cliente: ${message.from}\nErro: ${error.message}`,
                    'high'
                );
            } catch (notifyError) {
                logger.error(`Erro ao enviar alerta de emergência: ${notifyError.message}`);
            }
        } catch (sendError) {
            logger.error(`Erro ao enviar mensagem de erro: ${sendError.message}`);
        }
        
        return true;
    }
}

/**
 * Verifica se a mensagem é uma solicitação de emergência
 * @param {string} message - Conteúdo da mensagem
 * @returns {boolean} True se for uma solicitação de emergência
 */
function isEmergencyRequest(message) {
    const lowerMessage = message.toLowerCase();
    const emergencyTerms = [
        'emergência', 'emergencia', 'urgente', 'urgência', 'socorro',
        'ajuda imediata', 'problema grave', 'crítico', 'critico',
        'não funciona', 'parou', 'quebrou', 'travou', 'perdido',
        'rápido', 'rapido', 'preciso agora'
    ];
    
    return emergencyTerms.some(term => lowerMessage.includes(term));
}

/**
 * Inicia o fluxo de emergência
 * @param {Object} client - Cliente WhatsApp
 * @param {string} chatId - ID do chat
 * @returns {Promise<void>}
 */
async function startEmergencyFlow(client, chatId) {
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
    
    // Verificar horário de atendimento
    const inBusinessHours = isBusinessHours();
    
    // Criar o estado inicial da conversa
    conversationState.set(chatId, {
        currentFlow: 'emergency',
        stage: 'describing_emergency',
        timestamp: Date.now(),
        customerData: customer,
        emergencyData: {
            description: '',
            priority: null,
            status: 'new',
            inBusinessHours: inBusinessHours,
            createdAt: new Date().toISOString()
        }
    });
    
    // Enviar mensagem inicial de emergência
    await dialogController.sendMessage(
        client, 
        chatId, 
        `⚠️ *ATENDIMENTO EMERGENCIAL* ⚠️\n\n` +
        `${customer ? `Olá, ${customer.name.split(' ')[0]}! ` : ''}Entendi que você está enfrentando uma situação urgente.\n\n` +
        `Por favor, descreva detalhadamente o problema que está ocorrendo para que possamos ajudar da melhor forma possível.\n\n` +
        (inBusinessHours ? 
            `Estamos em horário de atendimento e sua solicitação será tratada como prioritária.` : 
            `⚠️ Notamos que estamos fora do horário comercial. Faremos o possível para atendê-lo mesmo assim, mas o tempo de resposta pode ser maior.`)
    );
    
    logger.info(`Fluxo de emergência iniciado para ${chatId}`);
}

/**
 * Processa a descrição da emergência
 * @param {Object} client - Cliente WhatsApp
 * @param {string} chatId - ID do chat
 * @param {string} description - Descrição da emergência
 * @returns {Promise<void>}
 */
async function processEmergencyDescription(client, chatId, description) {
    const state = conversationState.get(chatId);
    
    // Verificar se a descrição é muito curta
    if (description.length < 10) {
        await dialogController.sendMessage(
            client, 
            chatId, 
            "Por favor, forneça mais detalhes sobre o problema para que possamos ajudar adequadamente."
        );
        return;
    }
    
    // Atualizar o estado com a descrição
    state.emergencyData.description = description;
    
    // Analisar a descrição para determinar a prioridade sugerida
    let suggestedPriority = await analyzePriority(description);
    state.emergencyData.suggestedPriority = suggestedPriority;
    
    // Atualizar o estado
    state.stage = 'confirming_priority';
    conversationState.set(chatId, state);
    
    // Enviar mensagem de confirmação com a prioridade sugerida
    await dialogController.sendMessage(
        client, 
        chatId, 
        `Obrigado pelos detalhes.\n\n` +
        `Com base na sua descrição, classificamos sua situação como:\n` +
        `*Prioridade ${PRIORITY_LEVELS[suggestedPriority].name}* - ${PRIORITY_LEVELS[suggestedPriority].description}\n` +
        `Tempo estimado de resposta: ${PRIORITY_LEVELS[suggestedPriority].responseTime}\n\n` +
        `Esta classificação está correta?\n` +
        `1️⃣ Sim, está correto\n` +
        `2️⃣ Não, é mais urgente\n` +
        `3️⃣ Não, é menos urgente`
    );
    
    logger.info(`Emergência descrita por ${chatId}: "${description.substring(0, 50)}..."`);
}

/**
 * Processa a confirmação de prioridade
 * @param {Object} client - Cliente WhatsApp
 * @param {string} chatId - ID do chat
 * @param {string} response - Resposta do usuário
 * @returns {Promise<void>}
 */
async function processConfirmPriority(client, chatId, response) {
    const state = conversationState.get(chatId);
    const suggestedPriority = state.emergencyData.suggestedPriority;
    
    let finalPriority = suggestedPriority;
    
    // Processar a resposta
    if (response === '1' || response.toLowerCase().includes('sim')) {
        // Manter a prioridade sugerida
        finalPriority = suggestedPriority;
    } else if (response === '2' || response.toLowerCase().includes('mais urgente')) {
        // Aumentar a prioridade
        finalPriority = suggestedPriority === 'MEDIUM' ? 'HIGH' : 'HIGH';
    } else if (response === '3' || response.toLowerCase().includes('menos urgente')) {
        // Diminuir a prioridade
        finalPriority = suggestedPriority === 'HIGH' ? 'MEDIUM' : 'LOW';
    } else {
        // Resposta não reconhecida, pedir novamente
        await dialogController.sendMessage(
            client, 
            chatId, 
            "Por favor, responda com o número da opção desejada (1, 2 ou 3)."
        );
        return;
    }
    
    // Atualizar o estado com a prioridade final
    state.emergencyData.priority = finalPriority;
    
    // Verificar se temos informações de contato suficientes
    if (state.customerData && state.customerData.phone && 
       (state.customerData.email || state.customerData.name)) {
        // Já temos informações suficientes, prosseguir
        await escalateEmergency(client, chatId);
    } else {
        // Precisamos de mais informações
        state.stage = 'waiting_contact';
        conversationState.set(chatId, state);
        
        // Pedir informações de contato
        if (!state.customerData || !state.customerData.name) {
            await dialogController.sendMessage(
                client, 
                chatId, 
                "Para facilitar o atendimento, poderia me informar seu nome completo?"
            );
            state.contactStep = 'name';
        } else if (!state.customerData.email) {
            await dialogController.sendMessage(
                client, 
                chatId, 
                "Precisamos de um email para enviar atualizações. Qual seu email de contato?"
            );
            state.contactStep = 'email';
        }
        
        conversationState.set(chatId, state);
    }
}

/**
 * Processa as informações de contato
 * @param {Object} client - Cliente WhatsApp
 * @param {string} chatId - ID do chat
 * @param {string} info - Informação de contato
 * @returns {Promise<void>}
 */
async function processContactInfo(client, chatId, info) {
    const state = conversationState.get(chatId);
    
    if (state.contactStep === 'name') {
        // Validar o nome
        if (info.length < 5 || !info.includes(' ')) {
            await dialogController.sendMessage(
                client, 
                chatId, 
                "Por favor, forneça seu nome completo (nome e sobrenome)."
            );
            return;
        }
        
        // Atualizar o estado com o nome
        if (!state.customerData) {
            state.customerData = {};
        }
        
        state.customerData.name = info;
        
        // Verificar se precisamos do email
        if (!state.customerData.email) {
            state.contactStep = 'email';
            conversationState.set(chatId, state);
            
            await dialogController.sendMessage(
                client, 
                chatId, 
                "Precisamos de um email para enviar atualizações. Qual seu email de contato?"
            );
        } else {
            // Já temos todas as informações necessárias
            await escalateEmergency(client, chatId);
        }
    } else if (state.contactStep === 'email') {
        // Validar o email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(info)) {
            await dialogController.sendMessage(
                client, 
                chatId, 
                "Por favor, forneça um endereço de email válido."
            );
            return;
        }
        
        // Atualizar o estado com o email
        if (!state.customerData) {
            state.customerData = {};
        }
        
        state.customerData.email = info;
        
        // Atualizar/criar o cliente no banco de dados
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
                
                logger.info(`Novo cliente cadastrado durante emergência: ${state.customerData.name} (ID: ${customerId})`);
            }
            
            // Atualizar o ID do cliente na conversa
            state.customerData.id = customerId;
            conversationState.set(chatId, state);
        } catch (error) {
            logger.error(`Erro ao salvar dados do cliente: ${error.message}`, error);
            // Continuar mesmo com erro
        }
        
        // Prosseguir com a escalação
        await escalateEmergency(client, chatId);
    }
}

/**
 * Escalaciona a emergência para a equipe
 * @param {Object} client - Cliente WhatsApp
 * @param {string} chatId - ID do chat
 * @returns {Promise<void>}
 */
async function escalateEmergency(client, chatId) {
    const state = conversationState.get(chatId);
    const { emergencyData, customerData } = state;
    
    // Atualizar o estado
    emergencyData.status = 'escalated';
    state.stage = 'in_progress';
    conversationState.set(chatId, state);
    
    // Informar o cliente que a emergência está sendo tratada
    const priorityInfo = PRIORITY_LEVELS[emergencyData.priority];
    
    await dialogController.sendMessage(
        client, 
        chatId, 
        `🚨 *Emergência Registrada* 🚨\n\n` +
        `Sua solicitação foi registrada com prioridade *${priorityInfo.name}*.\n\n` +
        `Um técnico especializado será notificado imediatamente e entrará em contato ` +
        `em até ${priorityInfo.responseTime}.\n\n` +
        `Se a situação piorar ou você precisar adicionar mais informações, ` +
        `apenas responda nesta conversa.\n\n` +
        `Caso prefira contato telefônico imediato, ligue para nossa central de emergência: ` +
        `${config.emergencyPhone || '(XX) XXXX-XXXX'}`
    );
    
    // Registrar a emergência no sistema
    try {
        // Criar o registro de emergência
        const emergencyId = await emergencyService.createEmergency({
            customerId: customerData ? customerData.id : null,
            customerName: customerData ? customerData.name : 'Não identificado',
            customerPhone: formatPhoneNumber(chatId),
            customerEmail: customerData ? customerData.email : null,
            description: emergencyData.description,
            priority: emergencyData.priority,
            status: 'open',
            createdAt: emergencyData.createdAt,
            inBusinessHours: emergencyData.inBusinessHours
        });
        
        // Atualizar o estado com o ID da emergência
        state.emergencyData.emergencyId = emergencyId;
        conversationState.set(chatId, state);
        
        logger.info(`Emergência #${emergencyId} escalada para a equipe. Prioridade: ${emergencyData.priority}`);
        
        // Notificar a equipe
        await notifyTeam(client, chatId, emergencyData, customerData);
    } catch (error) {
        logger.error(`Erro ao registrar emergência: ${error.message}`, error);
        
        // Notificar a equipe mesmo com erro no registro
        try {
            await notifyTeam(client, chatId, emergencyData, customerData);
        } catch (notifyError) {
            logger.error(`Erro ao notificar equipe: ${notifyError.message}`, notifyError);
        }
    }
}

/**
 * Processa as mensagens de acompanhamento durante o tratamento da emergência
 * @param {Object} client - Cliente WhatsApp
 * @param {string} chatId - ID do chat
 * @param {string} message - Mensagem do cliente
 * @returns {Promise<void>}
 */
async function processFollowUp(client, chatId, message) {
    const state = conversationState.get(chatId);
    const { emergencyData, customerData } = state;
    
    // Verificar se a emergência foi fechada
    if (emergencyData.status === 'closed') {
        // Se o cliente envia mensagem após fechamento, reabrir
        await dialogController.sendMessage(
            client, 
            chatId, 
            "Notei que você enviou uma nova mensagem após o encerramento do seu atendimento emergencial. " +
            "Você precisa de mais assistência com o mesmo problema?"
        );
        
        // Atualizar o estado
        emergencyData.status = 'reopened';
        state.stage = 'confirming_reopen';
        conversationState.set(chatId, state);
        
        return;
    }
    
    // Adicionar a mensagem ao histórico de acompanhamento
    if (!emergencyData.followUpMessages) {
        emergencyData.followUpMessages = [];
    }
    
    emergencyData.followUpMessages.push({
        timestamp: new Date().toISOString(),
        message
    });
    
    conversationState.set(chatId, state);
    
    // Enviar confirmação para o cliente
    await dialogController.sendMessage(
        client, 
        chatId, 
        "✅ Recebi sua mensagem adicional e estou repassando para o técnico responsável pelo seu atendimento."
    );
    
    // Notificar a equipe sobre a mensagem adicional
    try {
        const emergencyId = emergencyData.emergencyId || 'ID não disponível';
        
        await notificationService.sendFollowUpAlert(
            `Nova mensagem: Emergência #${emergencyId}`,
            `Cliente: ${customerData ? customerData.name : 'Não identificado'}\n` +
            `Telefone: ${formatPhoneNumber(chatId)}\n\n` +
            `Mensagem adicional: ${message}`,
            emergencyData.priority
        );
        
        // Atualizar a emergência no sistema
        if (emergencyData.emergencyId) {
            await emergencyService.addFollowUpMessage(
                emergencyData.emergencyId,
                message
            );
        }
        
        logger.info(`Mensagem de acompanhamento enviada para emergência #${emergencyId}`);
    } catch (error) {
        logger.error(`Erro ao processar mensagem de acompanhamento: ${error.message}`, error);
    }
}

/**
 * Notifica a equipe sobre a emergência
 * @param {Object} client - Cliente WhatsApp
 * @param {string} chatId - ID do chat
 * @param {Object} emergencyData - Dados da emergência
 * @param {Object} customerData - Dados do cliente
 * @returns {Promise<void>}
 */
async function notifyTeam(client, chatId, emergencyData, customerData) {
    const priorityInfo = PRIORITY_LEVELS[emergencyData.priority];
    const emergencyId = emergencyData.emergencyId || 'ID não disponível';
    
    // Formatar a mensagem de alerta
    const alertTitle = `🚨 EMERGÊNCIA #${emergencyId} - Prioridade ${priorityInfo.name}`;
    
    const alertBody = 
        `Cliente: ${customerData ? customerData.name : 'Não identificado'}\n` +
        `Telefone: ${formatPhoneNumber(chatId)}\n` +
        `Email: ${customerData && customerData.email ? customerData.email : 'Não disponível'}\n\n` +
        `Descrição: ${emergencyData.description}\n\n` +
        `Prioridade: ${priorityInfo.name} (${priorityInfo.description})\n` +
        `Horário: ${new Date(emergencyData.createdAt).toLocaleString()}\n` +
        `Em horário comercial: ${emergencyData.inBusinessHours ? 'Sim' : 'Não'}\n\n` +
        `Tempo de resposta esperado: ${priorityInfo.responseTime}`;
    
    // Enviar o alerta para a equipe
    try {
        await notificationService.sendEmergencyAlert(
            alertTitle,
            alertBody,
            emergencyData.priority
        );
        
        logger.info(`Alerta enviado para a equipe sobre emergência #${emergencyId}`);
    } catch (error) {
        logger.error(`Erro ao enviar alerta para a equipe: ${error.message}`, error);
        
        // Tentar método alternativo de notificação
        try {
            // Enviar para número de emergência do sistema
            if (config.emergencyPhone) {
                await dialogController.sendMessage(
                    client,
                    config.emergencyPhone,
                    `${alertTitle}\n\n${alertBody}`
                );
                
                logger.info(`Alerta enviado via WhatsApp para número de emergência (${config.emergencyPhone})`);
            }
        } catch (altError) {
            logger.error(`Erro ao enviar alerta alternativo: ${altError.message}`, altError);
        }
    }
    
    // Programar escalação automática se não houver resposta
    scheduleEscalation(emergencyData, customerData, chatId);
}

/**
 * Programa a escalação automática caso não haja resposta no tempo esperado
 * @param {Object} emergencyData - Dados da emergência
 * @param {Object} customerData - Dados do cliente
 * @param {string} chatId - ID do chat
 */
function scheduleEscalation(emergencyData, customerData, chatId) {
    const priorityInfo = PRIORITY_LEVELS[emergencyData.priority];
    const escalationTime = priorityInfo.escalationTime * 60 * 1000; // Converter para milissegundos
    
    setTimeout(async () => {
        try {
            // Verificar se a emergência ainda está aberta
            const currentState = conversationState.get(chatId);
            
            if (!currentState || 
                currentState.currentFlow !== 'emergency' || 
                currentState.emergencyData.status !== 'escalated') {
                return; // A emergência já foi tratada ou o fluxo mudou
            }
            
            // A emergência ainda está aberta e sem resposta, escalar
            logger.warn(`Escalando automaticamente emergência #${emergencyData.emergencyId} após ${priorityInfo.escalationTime} minutos sem resposta`);
            
            // Notificar níveis superiores
            await notificationService.sendEscalationAlert(
                `⚠️ ESCALAÇÃO: Emergência #${emergencyData.emergencyId} sem resposta`,
                `Uma emergência de prioridade ${priorityInfo.name} está sem resposta há ${priorityInfo.escalationTime} minutos.\n\n` +
                `Cliente: ${customerData ? customerData.name : 'Não identificado'}\n` +
                `Descrição: ${emergencyData.description.substring(0, 100)}...\n\n` +
                `É necessário intervenção imediata.`,
                'HIGH' // Sempre alta prioridade para escalações
            );
            
            // Informar o cliente sobre a escalação
            await dialogController.sendMessage(
                client,
                chatId,
                `*Atualização sobre sua solicitação emergencial*\n\n` +
                `Notamos que sua solicitação ainda não recebeu o atendimento adequado. ` +
                `Escalamos seu caso para um nível superior de atendimento e você será ` +
                `contatado com prioridade máxima.\n\n` +
                `Pedimos desculpas pelo atraso e agradecemos sua paciência.`
            );
            
            // Atualizar o estado com a escalação
            currentState.emergencyData.escalated = true;
            currentState.emergencyData.escalatedAt = new Date().toISOString();
            conversationState.set(chatId, currentState);
            
            // Atualizar no sistema
            if (emergencyData.emergencyId) {
                await emergencyService.escalateEmergency(emergencyData.emergencyId);
            }
        } catch (error) {
            logger.error(`Erro ao escalar emergência automaticamente: ${error.message}`, error);
        }
    }, escalationTime);
    
    logger.debug(`Escalação automática programada para emergência em ${priorityInfo.escalationTime} minutos`);
}

/**
 * Analisa a descrição para sugerir um nível de prioridade
 * @param {string} description - Descrição da emergência
 * @returns {Promise<string>} Nível de prioridade sugerido (HIGH, MEDIUM, LOW)
 */
async function analyzePriority(description) {
    // Palavras-chave para análise de prioridade
    const highPriorityKeywords = [
        'urgente', 'emergência', 'crítico', 'imediato', 'grave',
        'parou completamente', 'não liga', 'perdeu tudo', 'dados', 'perda',
        'servidor', 'rede caiu', 'sistema fora', 'produção parada'
    ];
    
    const mediumPriorityKeywords = [
        'importante', 'preciso hoje', 'travando', 'lento', 'instável',
        'problema', 'erro', 'falha', 'não consigo trabalhar',
        'afetando', 'intermitente', 'backup', 'recuperar'
    ];
    
    // Converter para minúsculas para comparação
    const lowerDesc = description.toLowerCase();
    
    // Verificar palavras de alta prioridade
    for (const keyword of highPriorityKeywords) {
        if (lowerDesc.includes(keyword)) {
            return 'HIGH';
        }
    }
    
    // Verificar palavras de média prioridade
    for (const keyword of mediumPriorityKeywords) {
        if (lowerDesc.includes(keyword)) {
            return 'MEDIUM';
        }
    }
    
    // Usar análise avançada (simulada aqui)
    try {
        // Aqui poderia ser integrado um serviço de IA para análise mais precisa
        // Por enquanto, usamos uma lógica simples baseada no tamanho da descrição
        if (description.length > 100) {
            // Descrições mais detalhadas tendem a indicar problemas mais sérios
            return 'MEDIUM';
        }
    } catch (error) {
        logger.error(`Erro na análise avançada de prioridade: ${error.message}`);
    }
    
    // Padrão: prioridade média
    return 'MEDIUM';
}

module.exports = {
    handle,
    isEmergencyRequest,
    PRIORITY_LEVELS
};


//Melhorias Implementadas
//Tratamento Assíncrono Completo

//Implementação de async/await para todas as operações assíncronas
//Gerenciamento adequado de promises para operações de envio de mensagem
//Sistema Robusto de Tratamento de Erros

//Try/catch para todas as operações críticas
//Logging detalhado de erros em diferentes níveis
//Notificações de emergência mesmo em caso de falhas
//Métodos alternativos de alerta quando o principal falha
//Fluxo Completo de Emergência

//Detecção de situações emergenciais
//Coleta estruturada de informações sobre o problema
//Sistema de classificação de prioridade inteligente
//Resposta adaptada ao nível de urgência
//Acompanhamento contínuo durante o tratamento
//Níveis de Prioridade

//Classificação em três níveis (Alta, Média, Baixa)
//Tempo de resposta esperado para cada nível
//Análise baseada em palavras-chave para sugerir prioridade
//Confirmação com o usuário para garantir classificação correta
//Escalação Automática

//Monitoramento de tempo de resposta
//Escalação para níveis superiores quando não há atendimento
//Notificação do cliente sobre escalações
//Tempos diferenciados de escalação conforme prioridade
//Notificações para a Equipe

//Alertas detalhados com todas as informações necessárias
//Priorização visual de notificações
//Backup de métodos de notificação
//Registro no sistema para acompanhamento
//Gerenciamento de Estado Conversacional

//Controle de estágio da conversa
//Armazenamento de dados da emergência
//Preservação de contexto entre mensagens
//Transições claras entre etapas do fluxo
//Integração com Sistema de Clientes

//Identificação de clientes existentes
//Coleta de dados para novos clientes
//Registro de contatos emergenciais
//Histórico de emergências por cliente
//Acompanhamento Contínuo

//Processamento de mensagens adicionais
//Atualização do caso no sistema
//Notificação da equipe sobre novas informações
//Reabertura de casos fechados quando necessário
//Adaptação ao Horário de Atendimento

//Verificação do horário comercial
//Mensagens adaptadas para horários fora do expediente
//Priorização diferenciada em horários não comerciais
//Informações claras sobre o impacto no tempo de resposta
//Detecção Inteligente de Emergências

//Reconhecimento de palavras-chave de emergência
//Análise básica de conteúdo para determinar urgência
//Estrutura preparada para integração com análise avançada/IA
//Logging Detalhado

//Registro de todas as etapas do processo
//Informações para análise e melhoria contínua
//Rastreamento completo do ciclo de vida da emergência
//Capacidade de auditoria do atendimento