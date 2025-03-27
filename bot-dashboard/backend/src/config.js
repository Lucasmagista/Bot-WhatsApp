module.exports = {
    PORT: process.env.PORT || 5000,
    DB_URI: process.env.DB_URI || 'mongodb://localhost:27017/bot-dashboard',
    JWT_SECRET: process.env.JWT_SECRET || 'your_jwt_secret',
    JWT_EXPIRATION: process.env.JWT_EXPIRATION || '1h',
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    API_URL: process.env.API_URL || 'http://localhost:5000/api',
};