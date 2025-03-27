module.exports = {
    PORT: process.env.PORT || 5000,
    JWT_SECRET: process.env.JWT_SECRET || 'default_secret',
    JWT_EXPIRATION: '1h',
    DATABASE_URL: process.env.DATABASE_URL || 'sqlite://:memory:',
};