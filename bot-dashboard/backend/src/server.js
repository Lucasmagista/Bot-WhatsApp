const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const apicache = require('apicache');
const config = require('./config');
const authRoutes = require('./routes/authRoutes');
const botRoutes = require('./routes/botRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const errorHandler = require('./middleware/errorHandler');
const connectDB = require('./database'); // Conexão com SQLite
const path = require('path'); // Adicione esta linha

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Muitas requisições vindas deste IP, tente novamente mais tarde.',
});
app.use(limiter);

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Muitas tentativas de login, tente novamente mais tarde.',
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Cache Middleware
const cache = apicache.middleware;
app.use('/api/dashboard/statistics', cache('5 minutes'));

// Servir arquivos estáticos do frontend
const frontendPath = path.join(__dirname, '../../frontend/build/static');
app.use(express.static(frontendPath));

// Redirecionar todas as rotas desconhecidas para o index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, '../../public/index.html'));
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/bot', botRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Error handling middleware
app.use(errorHandler);

// Database connection
connectDB()
    .then(() => {
        const PORT = config.PORT || 5000;
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    })
    .catch((err) => {
        console.error('Failed to connect to the database:', err);
        process.exit(1); // Encerra o processo em caso de erro na conexão
    });