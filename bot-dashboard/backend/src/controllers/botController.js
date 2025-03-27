const Bot = require('../models/botModel');
const botService = require('../services/botService');

// Inicia o bot
exports.startBot = async (req, res) => {
    const { botId } = req.body;
    try {
        const bot = await botService.startBot(botId);
        res.status(200).json({ message: 'Bot iniciado com sucesso', bot });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao iniciar o bot', error: error.message });
    }
};

// Para o bot
exports.stopBot = async (req, res) => {
    const { botId } = req.body;
    try {
        const bot = await botService.stopBot(botId);
        res.status(200).json({ message: 'Bot parado com sucesso', bot });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao parar o bot', error: error.message });
    }
};

// Obtém o status do bot
exports.getBotStatus = async (req, res) => {
    const { botId } = req.params;
    try {
        const status = await botService.getBotStatus(botId);
        res.status(200).json({ status });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao obter o status do bot', error: error.message });
    }
};

// Atualiza as configurações do bot
exports.updateBotSettings = async (req, res) => {
    const settings = req.body;
    try {
        const updatedBot = await botService.updateBotSettings(settings);
        res.status(200).json({ message: 'Configurações do bot atualizadas com sucesso', updatedBot });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao atualizar as configurações do bot', error: error.message });
    }
};

exports.someMethod = (req, res) => {
    // ...implemente a lógica aqui...
    res.send('Rota funcionando!');
};