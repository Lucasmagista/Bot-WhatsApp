const db = require('../utils/database');

/**
 * 📌 Verifica se há disponibilidade para o horário solicitado
 * @param {string} date - Data do agendamento (YYYY-MM-DD)
 * @param {string} time - Horário do agendamento (HH:MM)
 * @returns {Promise<boolean>} - Retorna true se estiver disponível
 */
const isAvailable = (date, time) => {
    return new Promise((resolve, reject) => {
        db.get(`
            SELECT COUNT(*) as count FROM appointments WHERE date = ? AND time = ? AND status = 'pendente'
        `, [date, time], (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row.count === 0);
            }
        });
    });
};

/**
 * 📌 Agenda um novo atendimento
 * @param {number} customerId - ID do cliente
 * @param {number} serviceId - ID do serviço
 * @param {string} date - Data do agendamento (YYYY-MM-DD)
 * @param {string} time - Horário do agendamento (HH:MM)
 * @returns {Promise<string>} - Retorna uma mensagem de confirmação
 */
const scheduleAppointment = async (customerId, serviceId, date, time) => {
    try {
        const available = await isAvailable(date, time);
        if (!available) {
            return `⚠️ O horário ${time} no dia ${date} já está ocupado. Escolha outro horário.`;
        }

        return new Promise((resolve, reject) => {
            db.run(`
                INSERT INTO appointments (customer_id, service_id, date, time) VALUES (?, ?, ?, ?)
            `, [customerId, serviceId, date, time], function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(`✅ Agendamento confirmado para ${date} às ${time}.`);
                }
            });
        });
    } catch (error) {
        return `❌ Erro ao agendar: ${error.message}`;
    }
};

/**
 * 📌 Atualiza um agendamento existente
 * @param {number} appointmentId - ID do agendamento
 * @param {string} newDate - Nova data (YYYY-MM-DD)
 * @param {string} newTime - Novo horário (HH:MM)
 * @returns {Promise<string>} - Mensagem de confirmação
 */
const updateAppointment = async (appointmentId, newDate, newTime) => {
    try {
        const available = await isAvailable(newDate, newTime);
        if (!available) {
            return `⚠️ O horário ${newTime} no dia ${newDate} já está ocupado. Escolha outro horário.`;
        }

        return new Promise((resolve, reject) => {
            db.run(`
                UPDATE appointments SET date = ?, time = ? WHERE id = ?
            `, [newDate, newTime, appointmentId], function (err) {
                if (err) {
                    reject(err);
                } else if (this.changes === 0) {
                    resolve(`⚠️ Nenhum agendamento encontrado com o ID ${appointmentId}.`);
                } else {
                    resolve(`✅ Agendamento atualizado para ${newDate} às ${newTime}.`);
                }
            });
        });
    } catch (error) {
        return `❌ Erro ao atualizar: ${error.message}`;
    }
};

/**
 * 📌 Cancela um agendamento
 * @param {number} appointmentId - ID do agendamento
 * @returns {Promise<string>} - Mensagem de confirmação
 */
const cancelAppointment = (appointmentId) => {
    return new Promise((resolve, reject) => {
        db.run(`
            UPDATE appointments SET status = 'cancelado' WHERE id = ?
        `, [appointmentId], function (err) {
            if (err) {
                reject(err);
            } else if (this.changes === 0) {
                resolve(`⚠️ Nenhum agendamento encontrado com o ID ${appointmentId}.`);
            } else {
                resolve(`✅ Agendamento cancelado com sucesso.`);
            }
        });
    });
};

/**
 * 📌 Consulta os agendamentos de um cliente
 * @param {number} customerId - ID do cliente
 * @returns {Promise<string>} - Lista de agendamentos
 */
const getCustomerAppointments = (customerId) => {
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT a.id, s.name AS service, a.date, a.time, a.status
            FROM appointments a
            JOIN services s ON a.service_id = s.id
            WHERE a.customer_id = ? AND a.status = 'pendente'
            ORDER BY a.date, a.time
        `, [customerId], (err, rows) => {
            if (err) {
                reject(err);
            } else if (rows.length === 0) {
                resolve("📅 Você não tem agendamentos futuros.");
            } else {
                let response = "📋 *Seus Agendamentos:*\n";
                rows.forEach(row => {
                    response += `🛠️ ${row.service}\n📆 ${row.date} às ${row.time}\n🔹 Status: ${row.status}\n\n`;
                });
                resolve(response);
            }
        });
    });
};

module.exports = {
    scheduleAppointment,
    updateAppointment,
    cancelAppointment,
    getCustomerAppointments
};

// Em qualquer arquivo onde tenha fluxos complexos
try {
    // Alguma operação que pode falhar
    logger.debug('Processando dados:', dados);
    const resultado = await operacaoComplexa(dados);
    logger.info('Operação concluída com sucesso');
    return resultado;
} catch (error) {
    logger.error('Falha ao processar dados:', error);
    throw error; // Relançar ou tratar conforme necessário
}