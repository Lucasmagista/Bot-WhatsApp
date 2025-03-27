const winston = require('winston');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console({
            format: winston.format.simple(),
        }),
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
    ],
});

const logInfo = (message) => {
    logger.info(message);
};

const logError = (message) => {
    logger.error(message);
};

const logDebug = (message) => {
    logger.debug(message);
};

module.exports = {
    logInfo,
    logError,
    logDebug,
};