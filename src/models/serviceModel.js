const db = require('../utils/database');

/**
 * 📌 Busca um serviço pelo nome ou tipo
 * @param {string} serviceType - Nome ou categoria do serviço
 * @returns {Promise<Object|null>} - Retorna o serviço ou null se não encontrado
 */
const findByType = (serviceType) => {
    return new Promise((resolve, reject) => {
        db.get(`SELECT * FROM services WHERE name LIKE ? OR description LIKE ?`, [`%${serviceType}%`, `%${serviceType}%`], (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
};

/**
 * 📌 Retorna todos os serviços disponíveis
 * @returns {Promise<Array>} - Lista de serviços
 */
const getAllServices = () => {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM services`, [], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
};

/**
 * 📌 Adiciona um novo serviço
 * @param {string} name - Nome do serviço
 * @param {string} description - Descrição
 * @param {number} price - Preço estimado
 */
const createService = (name, description, price) => {
    return new Promise((resolve, reject) => {
        db.run(`INSERT INTO services (name, description, price) VALUES (?, ?, ?)`, [name, description, price], function (err) {
            if (err) {
                reject(err);
            } else {
                resolve(this.lastID);
            }
        });
    });
};

/**
 * 📌 Atualiza um serviço existente
 * @param {number} id - ID do serviço
 * @param {string} name - Nome atualizado
 * @param {string} description - Descrição atualizada
 * @param {number} price - Preço atualizado
 * @returns {Promise<boolean>} - Retorna true se atualizado com sucesso
 */
const updateService = (id, name, description, price) => {
    return new Promise((resolve, reject) => {
        db.run(`UPDATE services SET name = ?, description = ?, price = ? WHERE id = ?`, [name, description, price, id], function (err) {
            if (err) {
                reject(err);
            } else {
                resolve(this.changes > 0);
            }
        });
    });
};

/**
 * 📌 Remove um serviço pelo ID
 * @param {number} id - ID do serviço
 * @returns {Promise<boolean>} - Retorna true se removido com sucesso
 */
const deleteService = (id) => {
    return new Promise((resolve, reject) => {
        db.run(`DELETE FROM services WHERE id = ?`, [id], function (err) {
            if (err) {
                reject(err);
            } else {
                resolve(this.changes > 0);
            }
        });
    });
};

module.exports = {
    findByType,
    getAllServices,
    createService,
    updateService,
    deleteService
};
