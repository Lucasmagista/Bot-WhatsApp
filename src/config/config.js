/**
 * Configurações globais do aplicativo WhatsApp Bot
 * Incorpora todas as configurações do arquivo .env com valores padrão
 */
module.exports = {
    // Configurações de ambiente
    environment: {
        nodeEnv: process.env.NODE_ENV || 'development',
        debugMode: process.env.DEBUG_MODE === 'true',
        port: parseInt(process.env.PORT || '3000', 10)
    },
    
    // Configurações de logging
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        filePath: process.env.LOG_FILE_PATH || './logs/whatsapp-bot.log',
        fileMaxSize: parseInt(process.env.LOG_FILE_MAX_SIZE || '10485760', 10),
        retentionDays: parseInt(process.env.LOG_RETENTION_DAYS || '30', 10)
    },
    
    // Configurações do WhatsApp
    whatsapp: {
        sessionPath: process.env.WHATSAPP_SESSION_PATH || './session.json',
        clientId: process.env.WHATSAPP_CLIENT_ID || 'whatsapp-bot',
        puppeteerArgs: ['--no-sandbox', '--disable-setuid-sandbox']
    },
    
    // Configurações da empresa
    company: {
        name: process.env.COMPANY_NAME || 'Sua Empresa de Informática',
        phone: process.env.COMPANY_PHONE || '(11) 99999-9999',
        email: process.env.COMPANY_EMAIL || 'atendimento@suaempresa.com.br',
        address: process.env.COMPANY_ADDRESS || 'Rua Exemplo, 123 - São Paulo/SP'
    },
    
    // Contatos de emergência e administração
    emergency: {
        phone: process.env.EMERGENCY_PHONE || '(11) 98888-7777',
        adminNumber: process.env.ADMIN_NOTIFICATION_NUMBER || '(11) 97777-6666'
    },
    
    // Configurações do banco de dados
    database: {
        path: process.env.DB_PATH || './database.sqlite'
    },
    
    // Configurações de atendimento
    businessHours: {
        start: process.env.BUSINESS_HOURS_START || '08:00',
        end: process.env.BUSINESS_HOURS_END || '18:00',
        weekdays: process.env.BUSINESS_DAYS || '1,2,3,4,5' // Segunda a Sexta
    },
    
    // Configurações de timeouts e sessões
    timeouts: {
        session: parseInt(process.env.SESSION_TIMEOUT || '30', 10), // em minutos
        conversationInactive: parseInt(process.env.CONVERSATION_INACTIVE_TIMEOUT_MS || '1800000', 10), // 30 minutos
        messageProcessing: parseInt(process.env.MESSAGE_PROCESSING_TIMEOUT_MS || '5000', 10), // 5 segundos
        cache: parseInt(process.env.CACHE_TTL_MS || '60000', 10) // 1 minuto
    },
    
    // Configurações de reconexão
    reconnection: {
        interval: parseInt(process.env.RECONNECT_INTERVAL_MS || '10000', 10), // 10 segundos
        maxAttempts: parseInt(process.env.MAX_RECONNECT_ATTEMPTS || '5', 10)
    },
    
    // Configurações de limitação de taxa (rate limiting)
    rateLimit: {
        maxMessages: parseInt(process.env.RATE_LIMIT_MAX_MESSAGES || '15', 10),
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10), // 1 minuto
        cleanupIntervalMs: parseInt(process.env.RATE_LIMIT_CLEANUP_INTERVAL_MS || '3600000', 10) // 1 hora
    },
    
    // Configurações de métricas e monitoramento
    metrics: {
        logIntervalMs: parseInt(process.env.METRICS_LOG_INTERVAL_MS || '1800000', 10), // 30 minutos
        retentionCount: parseInt(process.env.METRICS_RETENTION_COUNT || '100', 10)
    },
    
    // Mensagens padrão
    messages: {
        welcome: process.env.DEFAULT_WELCOME_MESSAGE || 'Olá! Bem-vindo à {companyName}. Como posso ajudar?',
        outOfHours: process.env.OUT_OF_HOURS_MESSAGE || 'Nosso horário de atendimento é de {start} às {end}, de segunda a sexta-feira.',
        error: process.env.ERROR_MESSAGE || 'Desculpe, ocorreu um erro. Por favor, tente novamente.',
        rateLimit: process.env.RATE_LIMIT_MESSAGE || 'Estamos recebendo muitas mensagens suas em um curto período. Por favor, aguarde um momento.',
        afterHoursInstruction: process.env.AFTER_HOURS_INSTRUCTION || 'Deixe sua mensagem e retornaremos no próximo dia útil. Para emergências, ligue para {emergencyPhone}.',
        defaultOptions: process.env.DEFAULT_OPTIONS_MESSAGE || 'Como posso ajudar? Digite: "orçamento", "agendamento", "dúvida", "emergência" ou "atendente".',
        mediaReceived: process.env.MEDIA_RECEIVED_MESSAGE || 'Recebi seu {mediaType}! Como posso ajudar com isso?'
    }
};

/**
 * Valida as configurações críticas e formatos
 * @returns {boolean} True se todas as configurações são válidas
 * @throws {Error} Se alguma configuração crítica for inválida
 */
const validateConfig = () => {
    const config = module.exports;
    
    // Validar configurações críticas da empresa
    if (!config.company.name) {
        throw new Error('Nome da empresa não configurado');
    }
    
    // Validar formato de horário de funcionamento
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(config.businessHours.start) || 
        !timeRegex.test(config.businessHours.end)) {
        throw new Error('Formato de horário de funcionamento inválido');
    }
    
    // Validar números de telefone
    const phoneRegex = /^\(\d{2}\) \d{4,5}-\d{4}$/;
    if (!phoneRegex.test(config.company.phone)) {
        throw new Error('Formato de telefone da empresa inválido');
    }
    
    if (!phoneRegex.test(config.emergency.phone)) {
        throw new Error('Formato de telefone de emergência inválido');
    }
    
    // Validar email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(config.company.email)) {
        throw new Error('Formato de email da empresa inválido');
    }
    
    // Validar timeouts (garantir que são números positivos)
    Object.entries(config.timeouts).forEach(([key, value]) => {
        if (typeof value !== 'number' || value <= 0) {
            throw new Error(`Timeout inválido para ${key}: deve ser um número positivo`);
        }
    });
    
    // Validar configurações de rate limiting
    if (config.rateLimit.maxMessages <= 0) {
        throw new Error('O limite máximo de mensagens deve ser positivo');
    }
    
    if (config.rateLimit.windowMs <= 0) {
        throw new Error('A janela de tempo para rate limit deve ser positiva');
    }
    
    return true;
};

// Executar validação com tratamento de erro
try {
    validateConfig();
    console.log('Configuração validada com sucesso');
} catch (error) {
    console.error(`ERRO DE CONFIGURAÇÃO: ${error.message}`);
    process.exit(1);
}

// Exibir modo de ambiente atual
if (module.exports.environment.debugMode) {
    console.log(`Bot em execução em modo ${module.exports.environment.nodeEnv} com debug ativado`);
}