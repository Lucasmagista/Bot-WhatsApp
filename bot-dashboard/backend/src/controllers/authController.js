const db = require('../database')();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { body, validationResult } = require('express-validator');

module.exports = {
    login: [
        body('email').isEmail().withMessage('Email inválido').normalizeEmail(),
        body('password').isLength({ min: 6 }).withMessage('Senha deve ter pelo menos 6 caracteres'),
        async (req, res) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { email, password } = req.body;
            try {
                const query = `SELECT * FROM users WHERE email = ?`;
                db.get(query, [email], async (err, user) => {
                    if (err || !user || !(await bcrypt.compare(password, user.password))) {
                        return res.status(401).json({ message: 'Credenciais inválidas' });
                    }
                    const token = jwt.sign({ id: user.id }, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRATION });
                    res.status(200).json({ token });
                });
            } catch (error) {
                res.status(500).json({ message: 'Erro ao realizar login', error });
            }
        }
    ],

    register: [
        body('name').notEmpty().withMessage('Nome é obrigatório'),
        body('email').isEmail().withMessage('Email inválido').normalizeEmail(),
        body('password').isLength({ min: 6 }).withMessage('Senha deve ter pelo menos 6 caracteres'),
        async (req, res) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { name, email, password } = req.body;
            try {
                const hashedPassword = await bcrypt.hash(password, 10);
                const query = `INSERT INTO users (name, email, password) VALUES (?, ?, ?)`;
                db.run(query, [name, email, hashedPassword], function (err) {
                    if (err) {
                        return res.status(400).json({ message: 'Erro ao registrar usuário', error: err.message });
                    }
                    res.status(201).json({ message: 'Usuário registrado com sucesso' });
                });
            } catch (error) {
                res.status(500).json({ message: 'Erro ao registrar usuário', error });
            }
        }
    ],

    logout: (req, res) => {
        // Lógica para logout (se necessário)
        res.status(200).json({ message: 'Logout realizado com sucesso' });
    },

    getMe: async (req, res) => {
        try {
            const user = req.user; // Usuário já autenticado pelo middleware
            if (!user) {
                return res.status(404).json({ message: 'Usuário não encontrado' });
            }
            res.status(200).json({ user });
        } catch (error) {
            res.status(500).json({ message: 'Erro ao obter informações do usuário', error });
        }
    }
};