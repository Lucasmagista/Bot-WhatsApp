/**
 * Fluxo de boas-vindas e menu principal do bot
 * Responsável pela primeira interação e direcionamento do usuário
 */
const config = require('../config/config');
const logger = require('../utils/logger');
const dialogController = require('../controllers/dialogController');
const customerModel = require('../models/customerModel');
const conversationState = require('../utils/conversationState');
const { formatPhoneNumber, getHourMinuteFromDate } = require('../utils/formatter');
const { isBusinessHours } = require('../utils/timeChecker');

// Adicionar verificação para evitar erros
if (typeof formatPhoneNumber !== 'function') {
    throw new Error('formatPhoneNumber não está definido corretamente.');
}

/**
 * Processa mensagens do fluxo de boas-vindas
 * @param {Object} message - Mensagem recebida do WhatsApp
 * @param {Object} client - Cliente WhatsApp
 * @returns {Promise<boolean>} True se a mensagem foi tratada por este fluxo
 */
const handle = async (message, client) => {
    try {
        const from = message.from;
        const chatId = from;
        const messageContent = message.body.trim().toLowerCase();

        // Validação inicial da mensagem
        if (!messageContent) {
            logger.warn(`Mensagem vazia recebida de ${chatId}`);
            return false;
        }

        // Verificar se é uma saudação
        const isGreeting = checkIfGreeting(messageContent);

        // Se não for uma saudação e não for uma resposta ao menu, passar para outro fluxo
        if (!isGreeting && !isMenuResponse(messageContent)) {
            const state = conversationState.get(chatId);
            if (!state || state.currentFlow !== 'welcome') {
                return false;
            }
        }

        // Obter dados do cliente
        const phoneNumber = formatPhoneNumber(from);
        let customer = await fetchCustomerData(phoneNumber);

        // Verificar se é o horário de funcionamento
        const isOpen = isBusinessHours();

        // Processar resposta ao menu ou enviar mensagem de boas-vindas
        if (isMenuResponse(messageContent)) {
            return await handleMenuSelection(messageContent, chatId, client, customer);
        }

        await sendWelcomeMessage(client, chatId, customer, isOpen);

        // Registrar estado da conversa
        conversationState.set(chatId, {
            currentFlow: 'welcome',
            stage: 'menu',
            timestamp: Date.now(),
            customerData: customer
        });

        return true;
    } catch (error) {
        logger.error(`Erro no welcomeFlow: ${error.message}`, error);
        await sendErrorMessage(client, message.from);
        return true;
    }
};

/**
 * Busca dados do cliente pelo número de telefone
 * @param {string} phoneNumber - Número de telefone do cliente
 * @returns {Promise<Object|null>} Dados do cliente ou null se não encontrado
 */
async function fetchCustomerData(phoneNumber) {
    try {
        const customer = await customerModel.getCustomerByPhone(phoneNumber);
        if (customer) {
            await customerModel.registerContact(customer.id);
        }
        return customer;
    } catch (error) {
        logger.error(`Erro ao buscar cliente pelo telefone ${phoneNumber}:`, error);
        return null;
    }
}

/**
 * Envia uma mensagem de erro genérica ao cliente
 * @param {Object} client - Cliente WhatsApp
 * @param {string} chatId - ID do chat
 * @returns {Promise<void>}
 */
async function sendErrorMessage(client, chatId) {
    try {
        await dialogController.sendMessage(
            client,
            chatId,
            "Desculpe, ocorreu um erro ao processar sua solicitação. Por favor, tente novamente."
        );
    } catch (sendError) {
        logger.error(`Erro ao enviar mensagem de erro: ${sendError.message}`);
    }
}

/**
 * Envia a mensagem de boas-vindas com o menu principal
 * @param {Object} client - Cliente WhatsApp
 * @param {string} chatId - ID do chat
 * @param {Object} customer - Dados do cliente (opcional)
 * @param {boolean} isOpen - Se está no horário de funcionamento
 * @returns {Promise<void>}
 */
async function sendWelcomeMessage(client, chatId, customer, isOpen) {
    const greeting = getGreetingMessage();
    const customerName = customer ? customer.name.split(' ')[0] : '';
    const personalizedGreeting = customerName
        ? `${greeting}, ${customerName}! 👋`
        : `${greeting}! 👋 Seja bem-vindo(a)`;

    let welcomeMessage = `${personalizedGreeting} à *${config.companyName}* - Especialistas em Soluções de Informática.\n\n`;

    if (!isOpen) {
        welcomeMessage += `*⏰ AVISO: Estamos fora do horário de atendimento agora.*\n` +
            `Nosso horário de funcionamento é:\n` +
            `Segunda a Sexta: ${config.businessHours.weekdays.start} às ${config.businessHours.weekdays.end}\n` +
            `Sábado: ${config.businessHours.saturday.start} às ${config.businessHours.saturday.end}\n\n` +
            `Você pode deixar sua mensagem e retornaremos no próximo horário de atendimento.\n\n`;
    }

    welcomeMessage += `Como posso ajudar você hoje?\n\n` +
        `1️⃣ *Orçamento de serviços*\n` +
        `2️⃣ *Agendamento de atendimento*\n` +
        `3️⃣ *Dúvidas sobre serviços*\n` +
        `4️⃣ *Problemas emergenciais*\n` +
        `5️⃣ *Falar com atendente humano*\n\n` +
        `Digite o número da opção desejada.`;

    if (customer && customer.total_services > 0) {
        welcomeMessage = `${personalizedGreeting} de volta à *${config.companyName}*!\n\n` +
            `É sempre um prazer atender você. Como podemos ajudar hoje?\n\n` +
            `1️⃣ *Orçamento de serviços*\n` +
            `2️⃣ *Agendamento de atendimento*\n` +
            `3️⃣ *Dúvidas sobre serviços*\n` +
            `4️⃣ *Problemas emergenciais*\n` +
            `5️⃣ *Falar com atendente humano*\n\n` +
            `Digite o número da opção desejada.`;
    }

    await dialogController.sendMessage(client, chatId, welcomeMessage);

    if (!customer) {
        setTimeout(async () => {
            try {
                await dialogController.sendMessage(
                    client,
                    chatId,
                    "Para melhor atendê-lo(a), poderia nos informar seu nome completo?"
                );
                const currentState = conversationState.get(chatId) || {};
                conversationState.set(chatId, {
                    ...currentState,
                    stage: 'collecting_name',
                    timestamp: Date.now()
                });
            } catch (error) {
                logger.error(`Erro ao solicitar nome do cliente ${chatId}:`, error);
            }
        }, 2000);
    }
}

/**
 * Retorna uma saudação com base no horário atual
 * @returns {string} Saudação apropriada
 */
function getGreetingMessage() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Bom dia';
    if (hour >= 12 && hour < 18) return 'Boa tarde';
    return 'Boa noite';
}

/**
 * Verifica se a mensagem é uma saudação
 * @param {string} message - Conteúdo da mensagem
 * @returns {boolean} True se for uma saudação
 */
function checkIfGreeting(message) {
    const greetings = [
        'oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 
        'hi', 'hello', 'hey', 'inicio', 'início', 'começar', 'iniciar',
        'menu', 'help', 'ajuda'
    ];
    
    return greetings.some(greeting => 
        message === greeting || 
        message.startsWith(`${greeting} `) || 
        message.endsWith(` ${greeting}`) ||
        message.includes(` ${greeting} `)
    );
}

/**
 * Verifica se a mensagem é uma resposta ao menu principal
 * @param {string} message - Conteúdo da mensagem
 * @returns {boolean} True se for uma resposta ao menu
 */
function isMenuResponse(message) {
    // Respostas numéricas
    if (/^[1-5]$/.test(message)) {
        return true;
    }
    
    // Respostas por palavras-chave
    const keywords = {
        '1': ['orçamento', 'orcamento', 'orcar', 'valor', 'preço', 'preco', 'custo'],
        '2': ['agenda', 'marcar', 'agendar', 'horário', 'horario', 'atendimento'],
        '3': ['dúvida', 'duvida', 'pergunta', 'informação', 'informacao', 'ajuda'],
        '4': ['emergência', 'emergencia', 'urgente', 'urgência', 'problema', 'socorro'],
        '5': ['humano', 'pessoa', 'atendente', 'funcionário', 'funcionario', 'real']
    };
    
    for (const [option, terms] of Object.entries(keywords)) {
        if (terms.some(term => message.includes(term))) {
            return true;
        }
    }
    
    return false;
}

/**
 * Processa a seleção de menu do usuário
 * @param {string} message - Mensagem do usuário
 * @param {string} chatId - ID do chat
 * @param {Object} client - Cliente WhatsApp
 * @param {Object} customer - Dados do cliente
 * @returns {Promise<boolean>} True se a mensagem foi tratada
 */
async function handleMenuSelection(message, chatId, client, customer) {
    // Identificar qual opção foi selecionada
    let selectedOption = message;
    
    // Se não for um número, tentar identificar pela keyword
    if (!/^[1-5]$/.test(message)) {
        const keywords = {
            '1': ['orçamento', 'orcamento', 'orcar', 'valor', 'preço', 'preco', 'custo'],
            '2': ['agenda', 'marcar', 'agendar', 'horário', 'horario', 'atendimento'],
            '3': ['dúvida', 'duvida', 'pergunta', 'informação', 'informacao', 'ajuda'],
            '4': ['emergência', 'emergencia', 'urgente', 'urgência', 'problema', 'socorro'],
            '5': ['humano', 'pessoa', 'atendente', 'funcionário', 'funcionario', 'real']
        };
        
        for (const [option, terms] of Object.entries(keywords)) {
            if (terms.some(term => message.includes(term))) {
                selectedOption = option;
                break;
            }
        }
    }
    
    // Responder conforme a opção selecionada
    switch (selectedOption) {
        case '1':
            // Orçamento de serviços
            await dialogController.sendMessage(
                client, 
                chatId, 
                `Ótimo! Vamos dar início ao seu orçamento.\n\n` +
                `Por favor, descreva o problema ou serviço que você precisa. Quanto mais detalhes, melhor!`
            );
            
            // Atualizar estado para o fluxo de orçamento
            conversationState.set(chatId, {
                currentFlow: 'quote',
                stage: 'description',
                timestamp: Date.now(),
                customerData: customer
            });
            
            logger.info(`Cliente ${chatId} selecionou fluxo de orçamento`);
            break;
            
        case '2':
            // Agendamento de atendimento
            await dialogController.sendMessage(
                client, 
                chatId, 
                `Vamos agendar seu atendimento!\n\n` +
                `Qual tipo de serviço você precisa agendar?\n\n` +
                `1️⃣ Manutenção de Computador/Notebook\n` +
                `2️⃣ Suporte Técnico\n` +
                `3️⃣ Instalação de Software\n` +
                `4️⃣ Montagem de Computador\n` +
                `5️⃣ Consultoria de TI\n` +
                `6️⃣ Outro (especifique)`
            );
            
            // Atualizar estado para o fluxo de agendamento
            conversationState.set(chatId, {
                currentFlow: 'scheduling',
                stage: 'service_selection',
                timestamp: Date.now(),
                customerData: customer
            });
            
            logger.info(`Cliente ${chatId} selecionou fluxo de agendamento`);
            break;
            
        case '3':
            // Dúvidas sobre serviços
            await dialogController.sendMessage(
                client, 
                chatId, 
                `Aqui estão algumas perguntas frequentes sobre nossos serviços:\n\n` +
                `1️⃣ Quais serviços vocês oferecem?\n` +
                `2️⃣ Quais são os preços médios?\n` +
                `3️⃣ Qual o prazo de entrega?\n` +
                `4️⃣ Vocês oferecem garantia?\n` +
                `5️⃣ Vocês fazem atendimento domiciliar?\n\n` +
                `Digite o número da sua dúvida ou faça uma pergunta específica.`
            );
            
            // Atualizar estado para o fluxo de FAQ
            conversationState.set(chatId, {
                currentFlow: 'faq',
                stage: 'question_selection',
                timestamp: Date.now(),
                customerData: customer
            });
            
            logger.info(`Cliente ${chatId} selecionou fluxo de dúvidas`);
            break;
            
        case '4':
            // Problemas emergenciais
            await dialogController.sendMessage(
                client, 
                chatId, 
                `🚨 Entendemos que você está com um problema urgente.\n\n` +
                `Por favor, descreva brevemente a situação emergencial que está enfrentando, e faremos o possível para ajudar o mais rápido possível!`
            );
            
            // Atualizar estado para o fluxo de emergência
            conversationState.set(chatId, {
                currentFlow: 'emergency',
                stage: 'description',
                timestamp: Date.now(),
                customerData: customer,
                priority: 'high'
            });
            
            logger.info(`Cliente ${chatId} selecionou fluxo de emergência`);
            break;
            
        case '5':
            // Falar com atendente humano
            const isBusinessHour = isBusinessHours();
            
            if (isBusinessHour) {
                await dialogController.sendMessage(
                    client, 
                    chatId, 
                    `Estamos transferindo você para um de nossos atendentes. Em instantes alguém irá continuar o atendimento.\n\n` +
                    `Por favor, aguarde um momento. Obrigado pela paciência! 👨‍💼👩‍💼`
                );
                
                // Notificar sistema de atendimento humano (implementação específica)
                // Aqui seria necessário integrar com seu sistema de atendimento
                try {
                    const agentNotificationResult = await dialogController.notifyHumanAgent(
                        chatId, 
                        customer ? customer.name : 'Cliente não identificado',
                        'Solicitação de atendimento humano'
                    );
                    
                    logger.info(`Notificação de atendente para ${chatId}: ${agentNotificationResult ? 'Sucesso' : 'Falha'}`);
                } catch (error) {
                    logger.error(`Erro ao notificar atendente sobre ${chatId}:`, error);
                }
            } else {
                // Fora do horário de atendimento
                await dialogController.sendMessage(
                    client, 
                    chatId, 
                    `Lamentamos, mas estamos fora do horário de atendimento no momento.\n\n` +
                    `Nosso horário de atendimento é:\n` +
                    `Segunda a Sexta: ${config.businessHours.weekdays.start} às ${config.businessHours.weekdays.end}\n` +
                    `Sábado: ${config.businessHours.saturday.start} às ${config.businessHours.saturday.end}\n\n` +
                    `Por favor, deixe sua mensagem e retornaremos assim que possível no próximo dia útil.`
                );
            }
            
            // Atualizar estado para o fluxo de atendimento humano
            conversationState.set(chatId, {
                currentFlow: 'human_agent',
                stage: 'waiting',
                timestamp: Date.now(),
                customerData: customer,
                isBusinessHour
            });
            
            logger.info(`Cliente ${chatId} solicitou atendente humano`);
            break;
            
        default:
            // Opção inválida
            await dialogController.sendMessage(
                client, 
                chatId, 
                `Desculpe, não entendi sua escolha. Por favor, selecione uma das opções do menu digitando o número correspondente (1 a 5).`
            );
            
            // Reenviar o menu
            await sendWelcomeMessage(client, chatId, customer, isBusinessHours());
    }
    
    return true;
}

module.exports = {
    handle,
    checkIfGreeting,
    isMenuResponse
};



//Melhorias Implementadas
//Tratamento Assíncrono

//Uso de async/await para todas as operações assíncronas
//Promisses para processamento adequado do fluxo
//Tratamento de Erros Robusto

//Try/catch em todas as operações
//Logging detalhado de erros
//Mensagens de fallback para o usuário
//Integração com Banco de Dados

//Busca de dados do cliente pelo número de telefone
//Registro do contato no histórico do cliente
//Gerenciamento de Estado

//Armazenamento do estado da conversa
//Controle de fluxo baseado em estado
//Transição entre diferentes fluxos da aplicação
//Personalização

//Saudação personalizada com o nome do cliente
//Tratamento especial para clientes recorrentes
//Adaptação da mensagem ao horário do dia
//Verificação de Horário

//Verificação se está no horário de atendimento
//Mensagem especial fora do horário
//Informação sobre horários de funcionamento
//Interpretação Inteligente

//Reconhecimento de saudações em diferentes formatos
//Identificação de palavras-chave para as opções de menu
//Suporte a entrada textual além da numérica
//Organização Modular

//Funções específicas para cada responsabilidade
//Código organizado e de fácil manutenção
//Funções auxiliares para reuso
//Logging Detalhado

//Registro de todas as interações importantes
//Informações para debugging e análise
//Detalhes sobre escolhas do usuário
//Coleta de Dados de Novos Clientes

//Detecção de clientes não cadastrados
//Solicitação de informações básicas
//Base para cadastro automático
//Integração com Atendente Humano

//Sistema para encaminhar para atendentes
//Verificação de disponibilidade por horário
//Mensagens informativas durante a espera
//Respostas Formatadas

//Uso de formatação (negrito, listas) para melhor leitura
//Emojis para tornar a interação mais agradável
//Organização visual das informações