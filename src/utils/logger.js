const fs = require('fs');
const path = require('path');
const util = require('util');

// Configurações do logger
const config = {
    // Níveis: 0=error, 1=warn, 2=info, 3=debug, 4=trace
    level: process.env.LOG_LEVEL ? parseInt(process.env.LOG_LEVEL, 10) : 3,
    logToFile: process.env.LOG_TO_FILE === 'true' || false,
    logDir: process.env.LOG_DIR || 'logs',
    logMaxSize: process.env.LOG_MAX_SIZE ? parseInt(process.env.LOG_MAX_SIZE, 10) : 5 * 1024 * 1024, // 5MB
    logMaxFiles: process.env.LOG_MAX_FILES ? parseInt(process.env.LOG_MAX_FILES, 10) : 5
};

// Criar diretório de logs se não existir
if (config.logToFile) {
    try {
        if (!fs.existsSync(config.logDir)){
            fs.mkdirSync(config.logDir, { recursive: true });
        }
    } catch (error) {
        console.error(`Não foi possível criar o diretório de logs: ${error.message}`);
        config.logToFile = false;
    }
}

// Formatação de timestamp
const getTimestamp = () => {
    const now = new Date();
    return now.toISOString().replace('T', ' ').substring(0, 23);
};

// Cores para terminal
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    green: '\x1b[32m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m'
};

// Níveis de log e cores
const LOG_LEVELS = {
    ERROR: { value: 0, color: '\x1b[31m', label: 'ERROR' },   // Vermelho
    WARN: { value: 1, color: '\x1b[33m', label: 'WARN' },     // Amarelo
    INFO: { value: 2, color: '\x1b[36m', label: 'INFO' },     // Ciano
    DEBUG: { value: 3, color: '\x1b[90m', label: 'DEBUG' }    // Cinza
};

// Gerar nome do arquivo de log com data
const getLogFilename = () => {
    const now = new Date();
    const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(config.logDir, `app-${date}.log`);
};

// Escrever no arquivo de log
const writeToFile = (message) => {
    if (!config.logToFile) return;

    const logFile = getLogFilename();
    const formattedMessage = `${message}\n`;
    
    try {
        // Verificar tamanho do arquivo
        if (fs.existsSync(logFile)) {
            const stats = fs.statSync(logFile);
            if (stats.size > config.logMaxSize) {
                // Rotacionar arquivos de log
                const files = fs.readdirSync(config.logDir)
                    .filter(file => file.startsWith('app-'))
                    .sort((a, b) => {
                        return fs.statSync(path.join(config.logDir, b)).mtime.getTime() - 
                               fs.statSync(path.join(config.logDir, a)).mtime.getTime();
                    });
                
                if (files.length >= config.logMaxFiles) {
                    for (let i = config.logMaxFiles - 1; i < files.length; i++) {
                        fs.unlinkSync(path.join(config.logDir, files[i]));
                    }
                }
            }
        }
        
        fs.appendFileSync(logFile, formattedMessage);
    } catch (error) {
        console.error(`Erro ao escrever no arquivo de log: ${error.message}`);
    }
};

// Detectar origem do log (arquivo/linha)
const getCallerInfo = () => {
    const err = new Error();
    const stack = err.stack.split('\n');
    
    // O índice 3 geralmente contém a informação de quem chamou o logger
    // (0 = Error, 1 = getCallerInfo, 2 = log method, 3 = caller)
    if (stack.length >= 4) {
        const callerLine = stack[3].trim();
        // Extrair apenas o nome do arquivo e número da linha
        const match = callerLine.match(/at\s+(.*)\s+\((.*):(\d+):(\d+)\)/) || 
                     callerLine.match(/at\s+(.*):(\d+):(\d+)/);
        
        if (match) {
            // Se temos o formato "at function (file:line:col)"
            if (match.length === 5) {
                const fileName = path.basename(match[2]);
                return `${fileName}:${match[3]}`;
            } 
            // Se temos o formato "at file:line:col"
            else if (match.length === 4) {
                const fileName = path.basename(match[1]);
                return `${fileName}:${match[2]}`;
            }
        }
    }
    
    return 'unknown';
};

// Formatar objetos/erros
const formatValue = (value) => {
    if (value instanceof Error) {
        return value.stack || `${value.name}: ${value.message}`;
    }
    
    if (typeof value === 'object') {
        return util.inspect(value, { depth: 4, colors: false });
    }
    
    return value;
};

// Função principal de log
const logMessage = (level, levelName, colorCode, ...args) => {
    // Verificar nível de log
    if (level > config.level) return;
    
    const timestamp = getTimestamp();
    const caller = getCallerInfo();
    const formattedArgs = args.map(formatValue).join(' ');
    
    // Mensagem formatada com timestamp, nível e origem
    const logEntry = `[${timestamp}] [${levelName.toUpperCase()}] [${caller}] ${formattedArgs}`;
    
    // Log no console
    console.log(`${colorCode}${logEntry}${colors.reset}`);
    
    // Log no arquivo
    writeToFile(logEntry);
};

// Exportar interface do logger
module.exports = {
    /**
     * Registra erros e exceções críticas
     * @param {...any} args - Mensagens ou objetos para log
     */
    error: (...args) => logMessage(0, 'error', colors.red, ...args),
    
    /**
     * Registra avisos e alertas importantes
     * @param {...any} args - Mensagens ou objetos para log
     */
    warn: (...args) => logMessage(1, 'warn', colors.yellow, ...args),
    
    /**
     * Registra informações gerais sobre funcionamento da aplicação
     * @param {...any} args - Mensagens ou objetos para log
     */
    info: (...args) => logMessage(2, 'info', colors.green, ...args),
    
    /**
     * Registra mensagens de depuração detalhadas
     * @param {...any} args - Mensagens ou objetos para log
     */
    debug: (...args) => logMessage(3, 'debug', colors.blue, ...args),
    
    /**
     * Registra mensagens altamente detalhadas (trace)
     * @param {...any} args - Mensagens ou objetos para log
     */
    trace: (...args) => logMessage(4, 'trace', colors.magenta, ...args)
};