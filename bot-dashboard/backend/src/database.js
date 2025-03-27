const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const connectDB = () => {
    return new Promise((resolve, reject) => {
        const dbPath = path.resolve(__dirname, 'database.sqlite');
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('Erro ao conectar ao SQLite:', err.message);
                reject(err);
            } else {
                console.log('Conexão com SQLite estabelecida com sucesso.');

                // Criar tabelas se não existirem
                db.serialize(() => {
                    db.run(`
                        CREATE TABLE IF NOT EXISTS users (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            name TEXT NOT NULL,
                            email TEXT UNIQUE NOT NULL,
                            password TEXT NOT NULL,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        )
                    `);
                    db.run(`
                        CREATE TABLE IF NOT EXISTS bots (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            name TEXT NOT NULL,
                            status TEXT NOT NULL,
                            settings TEXT,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        )
                    `);
                    db.run(`
                        CREATE TABLE IF NOT EXISTS usage_statistics (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            bot_id INTEGER NOT NULL,
                            active_users INTEGER DEFAULT 0,
                            commands_executed INTEGER DEFAULT 0,
                            uptime TEXT,
                            FOREIGN KEY (bot_id) REFERENCES bots (id)
                        )
                    `);
                    db.run(`
                        CREATE TABLE IF NOT EXISTS commands (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            bot_id INTEGER NOT NULL,
                            command_name TEXT NOT NULL,
                            description TEXT,
                            FOREIGN KEY (bot_id) REFERENCES bots (id)
                        )
                    `);
                    db.run(`
                        CREATE TABLE IF NOT EXISTS user_feedback (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            bot_id INTEGER NOT NULL,
                            user_id INTEGER NOT NULL,
                            feedback TEXT NOT NULL,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            FOREIGN KEY (bot_id) REFERENCES bots (id),
                            FOREIGN KEY (user_id) REFERENCES users (id)
                        )
                    `);
                });

                resolve(db);
            }
        });
    });
};

module.exports = connectDB;