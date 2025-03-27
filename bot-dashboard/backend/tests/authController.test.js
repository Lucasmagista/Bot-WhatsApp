const request = require('supertest');
const app = require('../src/server'); // Certifique-se de exportar o app no server.js

describe('Auth Controller', () => {
    it('should register a new user', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ name: 'Test User', email: 'test@example.com', password: 'password123' });

        expect(res.statusCode).toEqual(201);
        expect(res.body).toHaveProperty('message', 'Usuário registrado com sucesso');
    });

    it('should not register a user with an existing email', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ name: 'Test User', email: 'test@example.com', password: 'password123' });

        expect(res.statusCode).toEqual(400);
        expect(res.body).toHaveProperty('message');
    });

    it('should return validation error for missing fields', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ email: 'test@example.com' }); // Nome e senha ausentes

        expect(res.statusCode).toEqual(400);
        expect(res.body).toHaveProperty('errors');
    });
});
