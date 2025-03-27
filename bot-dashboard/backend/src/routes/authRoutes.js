const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth'); // Corrigido

// Rota para registro de usuário
router.post('/register', authController.register);

// Rota para login de usuário
router.post('/login', authController.login);

// Rota para obter informações do usuário autenticado
router.get('/me', authMiddleware, authController.getMe); // Corrigido

module.exports = router;