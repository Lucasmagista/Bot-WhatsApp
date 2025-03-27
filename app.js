/**
 * Aplicação principal do bot de WhatsApp
 * Responsável por inicializar o cliente, configurar eventos e gerenciar fluxos
 */
require('dotenv').config();
const { Client, LocalAuth, MessageTypes } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const config = require('./src/config/config');
const logger = require('./src/utils/logger');
const reminderService = require('./src/services/reminderService');
const notificationService = require('./src/services/notificationService');
const FAQ = require('./src/models/faqModel');
const seedFAQ = require('./src/utils/seedFAQ');
const messageController = require('./src/controllers/messageController');
const { exec } = require('child_process');
const responseService = require('./src/services/responseService');

// Importação dos fluxos
const welcomeFlow = require('./src/flows/welcomeFlow');
const quoteFlow = require('./src/flows/quoteFlow');
const schedulingFlow = require('./src/flows/schedulingFlow');
const faqFlow = require('./src/flows/faqFlow');
const emergencyFlow = require('./src/flows/emergencyFlow');
const humanAgentFlow = require('./src/flows/humanAgentFlow');

// Melhoria 1: Gerenciador de conversações mais robusto
const conversationManager = {
    activeConversations: new Map(),
    
    startConversation(userId, flow) {
        this.activeConversations.set(userId, {
            flow,
            state: 'active',
            startedAt: new Date(),
            steps: [],
            lastActivity: Date.now()
        });
        return this.activeConversations.get(userId);
    },
    
    getConversation(userId) {
        return this.activeConversations.get(userId);
    },
    
    updateConversation(userId, data) {
        if (this.activeConversations.has(userId)) {
            const conversation = this.activeConversations.get(userId);
            const updated = {...conversation, ...data, lastActivity: Date.now()};
            this.activeConversations.set(userId, updated);
            return updated;
        }
        return null;
    },
    
    endConversation(userId) {
        const result = this.activeConversations.delete(userId);
        return result;
    },
    
    cleanupInactiveConversations(maxInactivityMs = 30 * 60 * 1000) {
        const now = Date.now();
        let cleaned = 0;
        
        for (const [userId, conversation] of this.activeConversations.entries()) {
            if (now - conversation.lastActivity > maxInactivityMs) {
                this.activeConversations.delete(userId);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            logger.info(`Limpeza de conversas: ${cleaned} conversas inativas removidas`);
        }
        
        return cleaned;
    }
};

// Melhoria 4: Limitador de taxa
const rateLimiter = {
    timestamps: {},
    
    check(userId, limit = 15, period = 60000) {
        const now = Date.now();
        if (!this.timestamps[userId]) {
            this.timestamps[userId] = [now];
            return true;
        }
        
        // Limpar timestamps antigos
        this.timestamps[userId] = this.timestamps[userId].filter(
            time => now - time < period
        );
        
        // Verificar limite
        if (this.timestamps[userId].length < limit) {
            this.timestamps[userId].push(now);
            return true;
        }
        
        return false;
    },
    
    cleanup() {
        const now = Date.now();
        let cleaned = 0;
        for (const userId in this.timestamps) {
            const oldLength = this.timestamps[userId].length;
            this.timestamps[userId] = this.timestamps[userId].filter(
                time => now - time < 3600000 // limpar mais de 1 hora
            );
            if (this.timestamps[userId].length === 0) {
                delete this.timestamps[userId];
                cleaned++;
            }
        }
        return cleaned;
    }
};

// Melhoria 6: Sistema de métricas
const metrics = {
    messagesProcessed: 0,
    messagesFailed: 0,
    messagesByType: {},
    messagesByFlow: {},
    responseTimes: [],
    errors: {},
    
    trackMessage(type = 'text') {
        this.messagesProcessed++;
        this.messagesByType[type] = (this.messagesByType[type] || 0) + 1;
    },
    
    trackFlow(flow) {
        this.messagesByFlow[flow] = (this.messagesByFlow[flow] || 0) + 1;
    },
    
    trackResponseTime(startTime) {
        const responseTime = Date.now() - startTime;
        this.responseTimes.push(responseTime);
        if (this.responseTimes.length > 100) {
            this.responseTimes.shift(); // manter apenas as 100 últimas
        }
    },
    
    trackError(errorType) {
        this.messagesFailed++;
        this.errors[errorType] = (this.errors[errorType] || 0) + 1;
    },
    
    getAverageResponseTime() {
        if (this.responseTimes.length === 0) return 0;
        const sum = this.responseTimes.reduce((acc, time) => acc + time, 0);
        return sum / this.responseTimes.length;
    },
    
    getMetricsReport() {
        return {
            total: this.messagesProcessed,
            failed: this.messagesFailed,
            successRate: this.messagesProcessed ? ((this.messagesProcessed - this.messagesFailed) / this.messagesProcessed * 100).toFixed(2) + '%' : '0%',
            averageResponseTime: this.getAverageResponseTime().toFixed(2) + 'ms',
            messagesByType: this.messagesByType,
            messagesByFlow: this.messagesByFlow,
            errors: this.errors
        };
    },
    
    logMetrics() {
        logger.info('Métricas do bot:', this.getMetricsReport());
    }
};

// Melhoria 3: Preparação para detecção de intenção (placeholder)
const nlpService = require('./src/services/nlpService');

const intentDetector = {
    async detectIntent(message) {
        try {
            const result = await nlpService.detectIntent(message);
            return result.intent.displayName || 'unknown';
        } catch (error) {
            logger.error('Erro ao detectar intenção:', error);
            return 'unknown';
        }
    },
};

const healthMonitor = {
    lastMessageProcessed: null,
    lastError: null,
    reconnections: 0,

    updateLastMessage() {
        this.lastMessageProcessed = new Date();
    },

    logError(error) {
        this.lastError = { error, timestamp: new Date() };
    },

    incrementReconnections() {
        this.reconnections++;
    },

    getHealthStatus() {
        return {
            lastMessageProcessed: this.lastMessageProcessed,
            lastError: this.lastError,
            reconnections: this.reconnections,
        };
    },

    logHealthStatus() {
        logger.info('Status de saúde do bot:', this.getHealthStatus());
    },
};

const appState = {
    initialized: false,
    processingUsers: new Map(), // Melhoria 2: Controle por usuário
};

/**
 * Inicializa os componentes da aplicação
 * @param {Client} client - Cliente do WhatsApp
 */
async function initializeComponents(client) {
    try {
        logger.info('Inicializando componentes da aplicação...');
        
        // Inicializar as tabelas do FAQ
        logger.info('Inicializando tabelas do sistema FAQ...');
        await FAQ.initializeTables();
        
        // Popular o banco de dados com perguntas e respostas iniciais
        logger.info('Populando banco de dados com FAQs iniciais...');
        await seedFAQ();
        
        // Inicializar o serviço de lembretes
        logger.info('Inicializando serviço de lembretes...');
        await reminderService.initialize(client);
        
        // Configurar limpezas periódicas
        setInterval(() => {
            conversationManager.cleanupInactiveConversations();
            rateLimiter.cleanup();
            metrics.logMetrics();
        }, 30 * 60 * 1000); // A cada 30 minutos
        
        appState.initialized = true;
        logger.info('Todos os componentes foram inicializados com sucesso!');
    } catch (error) {
        logger.error('Erro ao inicializar componentes da aplicação:', error);
        process.exit(1);
    }
}

/**
 * Processa uma mensagem recebida, roteando para o fluxo adequado
 * @param {Object} message - Mensagem recebida
 * @param {Client} client - Cliente do WhatsApp
 */
async function processMessage(message, client) {
    try {
        logger.debug(`Nova mensagem de ${message.from}: ${message.body || 'Mídia recebida'}`);
        const intent = await intentDetector.detectIntent(message.body);
        const response = responseService.getPersonalizedResponse(message.from, intent);
        await client.sendMessage(message.from, response);
        metrics.trackFlow(intent);
    } catch (error) {
        logger.error(`Erro ao processar mensagem: ${error.message}`, error);
    }
}

/**
 * Trata mensagens de mídia (imagens, áudio, vídeo, etc)
 * @param {Object} message - Mensagem recebida
 * @param {Client} client - Cliente do WhatsApp
 */
async function handleMediaMessage(message, client) {
    try {
        let response;
        switch (message.type) {
            case MessageTypes.IMAGE:
                response = 'Recebi sua imagem! Em que posso ajudar?';
                metrics.trackFlow('image_received');
                break;

            case MessageTypes.AUDIO:
                response = 'Recebi seu áudio! Em que posso ajudar?';
                metrics.trackFlow('audio_received');
                break;

            case MessageTypes.VIDEO:
                response = 'Recebi seu vídeo! Em que posso ajudar?';
                metrics.trackFlow('video_received');
                break;

            case MessageTypes.DOCUMENT:
                response = 'Recebi seu documento! Em que posso ajudar?';
                metrics.trackFlow('document_received');
                break;

            case MessageTypes.LOCATION:
                response = 'Recebi sua localização! Em que posso ajudar?';
                metrics.trackFlow('location_received');
                break;

            case MessageTypes.CONTACT_CARD:
                response = 'Recebi seu contato! Em que posso ajudar?';
                metrics.trackFlow('contact_received');
                break;

            case MessageTypes.STICKER:
                response = 'Recebi seu sticker! Em que posso ajudar?';
                metrics.trackFlow('sticker_received');
                break;

            default:
                response = 'Recebi sua mensagem! Como posso ajudar?';
                metrics.trackFlow('other_media_received');
        }

        await client.sendMessage(message.from, response);
        logger.debug(`Mensagem de mídia (${message.type}) processada para ${message.from}`);
    } catch (error) {
        logger.error(`Erro ao processar mensagem de mídia: ${error.message}`);
        metrics.trackError('media_processing');
        healthMonitor.logError(error);
    }
}

// ========== INICIALIZAÇÃO DO CLIENTE ==========

logger.info('Iniciando bot de WhatsApp...');

// Cria o cliente do WhatsApp com opções configuráveis
const clientOptions = {
    authStrategy: new LocalAuth({ clientId: "whatsapp-bot" }),
    puppeteer: {
        args: config.puppeteerArgs || ['--no-sandbox']
    }
};
const client = new Client(clientOptions);

// Inicializar o dashboard (backend e frontend)
exec('npm run dashboard', { cwd: './bot-dashboard' }, (error, stdout, stderr) => {
    if (error) {
        logger.error('Erro ao iniciar o dashboard:', error.message);
        return;
    }
    if (stderr) {
        logger.warn('Aviso ao iniciar o dashboard:', stderr);
    }
    logger.info('Dashboard iniciado com sucesso:', stdout);
});

// ========== EVENTOS DO CLIENTE ==========

// Evento: QR Code recebido
client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    logger.info('QR Code recebido, por favor escaneie-o com o WhatsApp.');
});

// Evento: Cliente autenticado
client.on('authenticated', () => {
    logger.info('Autenticação realizada com sucesso!');
});

// Evento: Falha na autenticação
client.on('auth_failure', (error) => {
    logger.error('Falha na autenticação:', error);
    metrics.trackError('auth_failure');
    process.exit(1);
});

// Evento: Cliente pronto
client.on('ready', async () => {
    logger.info('Cliente está pronto! Bot ativo e funcionando.');

    // Inicializar componentes após o cliente estar pronto
    await initializeComponents(client);

    // Garantir que nenhum envio automático ocorra na inicialização
    if (process.env.NODE_ENV === 'production') {
        logger.info('Modo produção: Nenhuma mensagem será enviada automaticamente.');
    }
});

// Evento: Mensagem recebida
client.on('message', async (message) => {
    healthMonitor.updateLastMessage();
    await processMessage(message, client);
});

// Evento: Desconexão
client.on('disconnected', (reason) => {
    logger.warn(`Cliente desconectado: ${reason}`);
    metrics.trackError('disconnection');
    healthMonitor.incrementReconnections();

    // Tentar reconectar com lógica aprimorada
    const reconnectInterval = 10000; // 10 segundos
    const maxAttempts = 5;
    let attempts = 0;

    const reconnect = () => {
        if (attempts >= maxAttempts) {
            logger.error('Máximo de tentativas de reconexão atingido. Encerrando...');
            process.exit(1);
        }

        attempts++;
        logger.info(`Tentativa de reconexão (${attempts}/${maxAttempts})...`);
        client.initialize().catch((error) => {
            logger.error(`Erro ao tentar reconectar: ${error.message}`);
            setTimeout(reconnect, reconnectInterval);
        });
    };

    setTimeout(reconnect, reconnectInterval);
});

// ========== INICIALIZAÇÃO ==========

// Inicializar o cliente
client.initialize()
    .then(() => {
        logger.info('Cliente inicializado');
    })
    .catch(error => {
        logger.error('Erro ao inicializar cliente:', error);
        metrics.trackError('initialization_failure');
        process.exit(1);
    });

// Configurar monitoramento periódico de saúde
setInterval(() => {
    healthMonitor.logHealthStatus();
}, 15 * 60 * 1000); // A cada 15 minutos

// Tratamento de desligamento gracioso
process.on('SIGINT', async () => {
    logger.info('Encerrando aplicação...');
    try {
        // Registrar métricas finais e status de saúde antes de encerrar
        metrics.logMetrics();
        healthMonitor.logHealthStatus();
        await client.destroy();
        logger.info('Cliente encerrado com sucesso');
    } catch (error) {
        logger.error('Erro ao encerrar cliente:', error);
    }
    process.exit(0);
});

// Exportar cliente e gerenciadores para uso em outros módulos
module.exports = { client, conversationManager, metrics };