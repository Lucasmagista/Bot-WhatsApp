const db = require('../database')();
const bcrypt = require('bcryptjs');

class UserModel {
    static async createUser(username, email, password) {
        const hashedPassword = await bcrypt.hash(password, 10);
        return new Promise((resolve, reject) => {
            const query = `INSERT INTO users (username, email, password) VALUES (?, ?, ?)`;
            db.run(query, [username, email, hashedPassword], function (err) {
                if (err) reject(err);
                resolve({ id: this.lastID, username, email });
            });
        });
    }

    static async getUserByEmail(email) {
        return new Promise((resolve, reject) => {
            const query = `SELECT * FROM users WHERE email = ?`;
            db.get(query, [email], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });
    }

    static async isValidPassword(user, password) {
        return await bcrypt.compare(password, user.password);
    }
}

module.exports = UserModel;