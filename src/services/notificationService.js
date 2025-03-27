/**
 * Serviço para envio de notificações via WhatsApp
 * Centraliza envio de mensagens formatadas e diferentes tipos de notificações
 */
const logger = require('../utils/logger');
const formatter = require('../utils/formatter');
const fs = require('fs').promises;
const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');
const config = require('../config/config');

// Cache para controle de frequência de envio
const notificationCache = new Map();
const THROTTLE_PERIOD_MS = 4 * 60 * 60 * 1000; // 4 horas para notificações do mesmo tipo

// Tipos de notificações
const NOTIFICATION_TYPES = {
    INFO: 'info',
    WARNING: 'warning',
    ALERT: 'alert',
    PROMOTION: 'promotion',
    APPOINTMENT: 'appointment',
    PAYMENT: 'payment',
    SYSTEM: 'system',
    FEEDBACK: 'feedback'
};

// Templates de notificações
const TEMPLATES = {
    [NOTIFICATION_TYPES.INFO]: {
        prefix: 'ℹ️ *Informação*\n\n',
        suffix: '\n\nResponda qualquer mensagem para falar com um atendente.'
    },
    [NOTIFICATION_TYPES.WARNING]: {
        prefix: '⚠️ *Aviso Importante*\n\n',
        suffix: '\n\nResponda esta mensagem caso precise de assistência.'
    },
    [NOTIFICATION_TYPES.ALERT]: {
        prefix: '🚨 *ALERTA*\n\n',
        suffix: '\n\nEste é um alerta que requer sua atenção imediata.'
    },
    [NOTIFICATION_TYPES.PROMOTION]: {
        prefix: '🎁 *Oferta Especial*\n\n',
        suffix: '\n\nOferta válida por tempo limitado. Responda "EU QUERO" para aproveitar.'
    },
    [NOTIFICATION_TYPES.APPOINTMENT]: {
        prefix: '📅 *Lembrete de Agendamento*\n\n',
        suffix: '\n\nResponda "CONFIRMAR" para confirmar sua presença ou "REAGENDAR" para alterar.'
    },
    [NOTIFICATION_TYPES.PAYMENT]: {
        prefix: '💰 *Informação de Pagamento*\n\n',
        suffix: '\n\nEm caso de dúvidas, responda esta mensagem.'
    },
    [NOTIFICATION_TYPES.SYSTEM]: {
        prefix: '🔧 *Sistema*\n\n',
        suffix: ''
    },
    [NOTIFICATION_TYPES.FEEDBACK]: {
        prefix: '⭐ *Feedback*\n\n',
        suffix: '\n\nSua opinião é muito importante para melhorarmos nossos serviços.'
    }
};

/**
 * Verifica se um número está no formato correto para WhatsApp
 * @param {string} number - Número a ser validado
 * @returns {string} Número formatado para WhatsApp
 */
const validateAndFormatNumber = (number) => {
    // Remover caracteres não numéricos
    let cleaned = number.replace(/\D/g, '');
    
    // Verificar se já tem o sufixo do WhatsApp
    if (cleaned.endsWith('@c.us')) {
        return cleaned;
    }
    
    // Verificar se tem o formato correto
    if (cleaned.length < 10) {
        throw new Error(`Número de telefone inválido: ${number}`);
    }
    
    // Adicionar sufixo do WhatsApp
    return `${cleaned}@c.us`;
};

/**
 * Verifica se uma notificação deve ser throttled com base no receptor e tipo
 * @param {string} to - Destinatário
 * @param {string} type - Tipo de notificação
 * @returns {boolean} Verdadeiro se deve ser throttled
 */
const shouldThrottle = (to, type) => {
    // Verificar se existem notificações recentes para este número+tipo
    const cacheKey = `${to}_${type}`;
    const lastNotification = notificationCache.get(cacheKey);
    
    if (lastNotification) {
        const elapsed = Date.now() - lastNotification;
        // Se já enviou uma notificação deste tipo há menos de X horas
        return elapsed < THROTTLE_PERIOD_MS;
    }
    
    return false;
};

/**
 * Registra o envio de uma notificação para controle de throttling
 * @param {string} to - Destinatário
 * @param {string} type - Tipo de notificação
 */
const registerNotification = (to, type) => {
    const cacheKey = `${to}_${type}`;
    notificationCache.set(cacheKey, Date.now());
    
    // Limpar cache periodicamente
    if (notificationCache.size > 1000) {
        // Remover entradas antigas
        const now = Date.now();
        for (const [key, timestamp] of notificationCache.entries()) {
            if (now - timestamp > THROTTLE_PERIOD_MS) {
                notificationCache.delete(key);
            }
        }
    }
};

/**
 * Carrega uma imagem como MessageMedia
 * @param {string} filename - Nome do arquivo
 * @returns {Promise<MessageMedia>} Objeto MessageMedia
 */
const loadMedia = async (filename) => {
    try {
        const mediaPath = path.join(__dirname, '..', '..', 'media', filename);
        const data = await fs.readFile(mediaPath);
        const mimetype = getMimeType(filename);
        
        return new MessageMedia(mimetype, data.toString('base64'), filename);
    } catch (error) {
        logger.error(`Erro ao carregar mídia ${filename}:`, error);
        throw error;
    }
};

/**
 * Obtém o MIME type com base na extensão do arquivo
 * @param {string} filename - Nome do arquivo
 * @returns {string} MIME type
 */
const getMimeType = (filename) => {
    const ext = path.extname(filename).toLowerCase();
    
    switch (ext) {
        case '.jpg':
        case '.jpeg':
            return 'image/jpeg';
        case '.png':
            return 'image/png';
        case '.gif':
            return 'image/gif';
        case '.pdf':
            return 'application/pdf';
        case '.mp4':
            return 'video/mp4';
        case '.mp3':
            return 'audio/mpeg';
        default:
            return 'application/octet-stream';
    }
};

/**
 * Envia notificação com template formatado baseado no tipo
 * @param {Object} client - Cliente WhatsApp
 * @param {string} to - Destinatário
 * @param {string} message - Corpo da mensagem
 * @param {string} type - Tipo de notificação
 * @param {Object} options - Opções adicionais
 * @returns {Promise<Object>} Resultado do envio
 */
const sendTemplateNotification = async (client, to, message, type = NOTIFICATION_TYPES.INFO, options = {}) => {
    try {
        // Validar número do destinatário
        const formattedNumber = validateAndFormatNumber(to);
        
        // Verificar throttle com base no tipo e destinatário
        if (options.throttle !== false && shouldThrottle(formattedNumber, type)) {
            logger.info(`Notificação do tipo ${type} para ${formattedNumber} throttled (já enviado recentemente)`);
            return { throttled: true };
        }
        
        // Selecionar o template com base no tipo
        const template = TEMPLATES[type] || TEMPLATES[NOTIFICATION_TYPES.INFO];
        
        // Formatação da mensagem
        let formattedMessage = `${template.prefix}${message}${template.suffix}`;
        
        // Adicionar rodapé se configurado
        if (config.messageFooter && type !== NOTIFICATION_TYPES.SYSTEM) {
            formattedMessage += `\n\n${config.messageFooter}`;
        }
        
        // Enviar a mensagem
        let result;
        
        if (options.media) {
            // Enviar com mídia
            const media = await loadMedia(options.media);
            result = await client.sendMessage(formattedNumber, media, { caption: formattedMessage });
        } else {
            // Enviar apenas texto
            result = await client.sendMessage(formattedNumber, formattedMessage);
        }
        
        // Registrar para throttle
        registerNotification(formattedNumber, type);
        
        logger.info(`Notificação do tipo ${type} enviada para ${formattedNumber}`);
        return { success: true, messageId: result.id._serialized };
        
    } catch (error) {
        logger.error(`Erro ao enviar notificação para ${to}:`, error);
        throw error;
    }
};

/**
 * Envia notificação em massa para múltiplos destinatários
 * @param {Object} client - Cliente WhatsApp
 * @param {Array<string>} recipients - Lista de destinatários
 * @param {string} message - Corpo da mensagem
 * @param {string} type - Tipo de notificação
 * @param {Object} options - Opções adicionais
 * @returns {Promise<Object>} Resultado do envio em massa
 */
const sendBulkNotification = async (client, recipients, message, type = NOTIFICATION_TYPES.INFO, options = {}) => {
    const results = {
        total: recipients.length,
        success: 0,
        failed: 0,
        throttled: 0,
        errors: []
    };
    
    // Limitar taxa de envio para evitar bloqueio
    const BATCH_SIZE = 10;
    const DELAY_BETWEEN_BATCHES_MS = 5000; // 5 segundos entre lotes
    const DELAY_BETWEEN_MESSAGES_MS = 1000; // 1 segundo entre mensagens
    
    // Dividir em lotes
    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
        const batch = recipients.slice(i, i + BATCH_SIZE);
        
        // Processar cada lote
        for (const recipient of batch) {
            try {
                const result = await sendTemplateNotification(client, recipient, message, type, options);
                
                if (result.throttled) {
                    results.throttled++;
                } else {
                    results.success++;
                }
                
                // Aguardar entre cada mensagem
                if (batch.indexOf(recipient) < batch.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_MESSAGES_MS));
                }
                
            } catch (error) {
                results.failed++;
                results.errors.push({
                    recipient,
                    error: error.message
                });
                
                logger.error(`Erro ao enviar notificação em massa para ${recipient}:`, error);
            }
        }
        
        // Aguardar entre lotes
        if (i + BATCH_SIZE < recipients.length) {
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
        }
    }
    
    logger.info(`Notificação em massa enviada: ${results.success} sucesso, ${results.failed} falhas, ${results.throttled} throttled`);
    return results;
};

/**
 * Envia uma notificação de promoção com imagem
 * @param {Object} client - Cliente WhatsApp
 * @param {string} to - Destinatário
 * @param {string} title - Título da promoção
 * @param {string} description - Descrição da promoção
 * @param {string} price - Preço promocional
 * @param {string} imageFile - Nome do arquivo de imagem
 * @returns {Promise<Object>} Resultado do envio
 */
const sendPromotionNotification = async (client, to, title, description, price, imageFile) => {
    const message = `*${title}*\n\n${description}\n\n*Preço promocional:* ${formatter.formatPrice(price)}`;
    
    return sendTemplateNotification(client, to, message, NOTIFICATION_TYPES.PROMOTION, {
        media: imageFile,
        throttle: true
    });
};

/**
 * Envia uma notificação de lembrete de agendamento
 * @param {Object} client - Cliente WhatsApp
 * @param {string} to - Destinatário
 * @param {string} service - Serviço agendado
 * @param {Date} date - Data do agendamento
 * @param {string} time - Horário do agendamento
 * @returns {Promise<Object>} Resultado do envio
 */
const sendAppointmentReminder = async (client, to, service, date, time) => {
    const formattedDate = formatter.formatDate(date);
    const message = `Seu agendamento de *${service}* está confirmado para *${formattedDate}* às *${time}*.\n\nPor favor, confirme sua presença.`;
    
    return sendTemplateNotification(client, to, message, NOTIFICATION_TYPES.APPOINTMENT);
};

/**
 * Envia notificação de feedback após conclusão de serviço
 * @param {Object} client - Cliente WhatsApp
 * @param {string} to - Destinatário
 * @param {string} service - Serviço realizado
 * @returns {Promise<Object>} Resultado do envio
 */
const sendFeedbackRequest = async (client, to, service) => {
    const message = `Gostaríamos de saber sobre sua experiência com o serviço de *${service}* que realizamos.\n\nAvalie nosso atendimento de 1 a 5 estrelas (sendo 5 o melhor).\n\nSua opinião é muito importante para melhorarmos nossos serviços!`;
    
    return sendTemplateNotification(client, to, message, NOTIFICATION_TYPES.FEEDBACK);
};

/**
 * Envia notificação de informação sobre pagamento
 * @param {Object} client - Cliente WhatsApp
 * @param {string} to - Destinatário
 * @param {string} service - Serviço realizado
 * @param {number} amount - Valor do serviço
 * @param {Array} paymentOptions - Opções de pagamento
 * @returns {Promise<Object>} Resultado do envio
 */
const sendPaymentNotification = async (client, to, service, amount, paymentOptions) => {
    const formattedPaymentOptions = paymentOptions.map(option => `• ${option}`).join('\n');
    
    const message = `Informações de pagamento para o serviço: *${service}*\n\n` +
                    `*Valor:* ${formatter.formatPrice(amount)}\n\n` +
                    `*Formas de pagamento disponíveis:*\n${formattedPaymentOptions}`;
    
    return sendTemplateNotification(client, to, message, NOTIFICATION_TYPES.PAYMENT);
};

/**
 * Envia notificação de alerta técnico
 * @param {Object} client - Cliente WhatsApp
 * @param {string} to - Destinatário
 * @param {string} issue - Problema técnico
 * @param {string} solution - Solução proposta
 * @returns {Promise<Object>} Resultado do envio
 */
const sendTechnicalAlert = async (client, to, issue, solution) => {
    const message = `Detectamos um potencial problema técnico: *${issue}*\n\n` +
                    `*Solução recomendada:*\n${solution}\n\n` +
                    `Deseja agendar um atendimento para resolver este problema?`;
    
    return sendTemplateNotification(client, to, message, NOTIFICATION_TYPES.ALERT);
};

/**
 * Envia uma notificação simples (para compatibilidade com versão anterior)
 * @param {Object} client - Cliente WhatsApp
 * @param {string} to - Destinatário
 * @param {string} notification - Texto da notificação
 * @returns {Promise<Object>} Resultado do envio
 */
const sendNotification = async (client, to, notification) => {
    return sendTemplateNotification(client, to, notification, NOTIFICATION_TYPES.INFO);
};

// Exportar funções
module.exports = {
    // Função original para compatibilidade
    sendNotification,
    
    // Função principal com templates
    sendTemplateNotification,
    
    // Função para envio em massa
    sendBulkNotification,
    
    // Funções especializadas
    sendPromotionNotification,
    sendAppointmentReminder,
    sendFeedbackRequest,
    sendPaymentNotification,
    sendTechnicalAlert,
    
    // Tipos de notificações para uso externo
    NOTIFICATION_TYPES
};