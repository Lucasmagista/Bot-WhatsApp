const db = require('../database')();

class BotModel {
    static async createBot(name, status = 'offline') {
        return new Promise((resolve, reject) => {
            const query = `INSERT INTO bots (name, status) VALUES (?, ?)`;
            db.run(query, [name, status], function (err) {
                if (err) reject(err);
                resolve({ id: this.lastID, name, status });
            });
        });
    }

    static async getBotById(id) {
        return new Promise((resolve, reject) => {
            const query = `SELECT * FROM bots WHERE id = ?`;
            db.get(query, [id], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });
    }

    static async updateBotStatus(id, status) {
        return new Promise((resolve, reject) => {
            const query = `UPDATE bots SET status = ? WHERE id = ?`;
            db.run(query, [status, id], function (err) {
                if (err) reject(err);
                resolve({ id, status });
            });
        });
    }
}

module.exports = BotModel;