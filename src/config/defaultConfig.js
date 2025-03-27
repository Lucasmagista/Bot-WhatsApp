module.exports = {
    environment: 'development',
    port: 3000,
    logging: {
        level: 'info',
        filePath: './logs/default.log'
    },
    database: {
        path: './database.sqlite'
    }
};
