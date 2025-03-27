const db = require('../database')();
const logger = require('../utils/logger');

class BotService {
    async startBot(botId) {
        if (!botId) {
            throw new Error('O ID do bot é obrigatório.');
        }
        try {
            const query = `UPDATE bots SET status = 'running' WHERE id = ?`;
            db.run(query, [botId], function (err) {
                if (err) throw new Error('Erro ao iniciar o bot: ' + err.message);
            });
            logger.info(`Bot ${botId} started successfully.`);
            return { id: botId, status: 'running' };
        } catch (error) {
            logger.error(`Error starting bot: ${error.message}`);
            throw new Error('Erro interno ao iniciar o bot.');
        }
    }

    async stopBot(botId) {
        if (!botId) {
            throw new Error('O ID do bot é obrigatório.');
        }
        try {
            const query = `UPDATE bots SET status = 'stopped' WHERE id = ?`;
            db.run(query, [botId], function (err) {
                if (err) throw new Error('Erro ao parar o bot: ' + err.message);
            });
            logger.info(`Bot ${botId} stopped successfully.`);
            return { id: botId, status: 'stopped' };
        } catch (error) {
            logger.error(`Error stopping bot: ${error.message}`);
            throw error;
        }
    }

    async getBotStatus(botId) {
        try {
            const query = `SELECT status FROM bots WHERE id = ?`;
            return new Promise((resolve, reject) => {
                db.get(query, [botId], (err, row) => {
                    if (err) reject('Erro ao obter status do bot: ' + err.message);
                    resolve(row?.status || 'unknown');
                });
            });
        } catch (error) {
            logger.error(`Error retrieving bot status: ${error.message}`);
            throw error;
        }
    }

    async getAllBots(page = 1, limit = 10) {
        try {
            const offset = (page - 1) * limit;
            const query = `SELECT * FROM bots LIMIT ? OFFSET ?`;
            return new Promise((resolve, reject) => {
                db.all(query, [limit, offset], (err, rows) => {
                    if (err) reject('Erro ao obter todos os bots: ' + err.message);
                    resolve(rows);
                });
            });
        } catch (error) {
            logger.error(`Error retrieving bots: ${error.message}`);
            throw error;
        }
    }

    async updateBotSettings(botId, settings) {
        try {
            const query = `UPDATE bots SET settings = ? WHERE id = ?`;
            db.run(query, [JSON.stringify(settings), botId], function (err) {
                if (err) throw new Error('Erro ao atualizar configurações do bot: ' + err.message);
            });
            logger.info(`Updated settings for bot ${botId}.`);
            return { id: botId, settings };
        } catch (error) {
            logger.error(`Error updating bot settings: ${error.message}`);
            throw error;
        }
    }
}

module.exports = new BotService();