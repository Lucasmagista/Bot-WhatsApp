const express = require('express');
const router = express.Router();
const botController = require('../controllers/botController');
const authMiddleware = require('../middleware/auth'); // Corrigido

// Route to start the bot
router.post('/start', authMiddleware, botController.startBot);

// Route to stop the bot
router.post('/stop', authMiddleware, botController.stopBot);

// Route to get the status of the bot
router.get('/status', authMiddleware, botController.getBotStatus);

// Route to get bot statistics
// router.get('/statistics', authMiddleware, botController.getBotStatistics); // Removido ou comentado

router.post('/your-route', (req, res) => {
    // Callback válido para a rota POST
    res.send('Rota POST funcionando corretamente!');
});

router.post('/some-endpoint', botController.someMethod); // Certifique-se de que 'someMethod' está definido no controlador

module.exports = router;