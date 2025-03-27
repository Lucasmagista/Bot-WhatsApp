const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const authMiddleware = require('../middleware/auth');

// Middleware de autenticação aplicado a todas as rotas

// Rota para obter estatísticas de uso do bot
// Retorna dados estatísticos como número de usuários, mensagens enviadas, etc.
router.get('/statistics', authMiddleware, dashboardController.getStatistics);

// Rota para obter o status do bot
// Retorna informações sobre o estado atual do bot (online/offline, uptime, etc.)
router.get('/status', authMiddleware, dashboardController.getBotStatus);

// Rota para obter dados gerais da dashboard
// Retorna informações gerais para exibição na dashboard
router.get('/data', authMiddleware, dashboardController.getDashboardData);

// Rota para tratar endpoints não encontrados
// Garante que requisições para rotas inexistentes sejam tratadas adequadamente
router.use((req, res) => {
    res.status(404).json({ error: 'Rota não encontrada' });
});

// Middleware para tratamento de erros gerais
// Captura erros e retorna uma resposta padronizada
router.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Erro interno do servidor' });
});

module.exports = router;