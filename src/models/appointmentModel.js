/**
 * Modelo para gerenciamento de agendamentos
 * Responsável por todas as operações relacionadas aos agendamentos de serviços
 */
const db = require('../utils/database');
const logger = require('../utils/logger');
const { promisify } = require('util');

// Converter operações de banco de dados para promises
const dbRun = promisify(db.run.bind(db));
const dbGet = promisify(db.get.bind(db));
const dbAll = promisify(db.all.bind(db));

class Appointment {
    /**
     * Inicializa a tabela de agendamentos no banco de dados
     * @returns {Promise<void>}
     */
    static async initTable() {
        try {
            const query = `
                CREATE TABLE IF NOT EXISTS appointments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    customer_id INTEGER NOT NULL,
                    service_id INTEGER NOT NULL,
                    date TEXT NOT NULL,
                    time TEXT NOT NULL,
                    duration INTEGER DEFAULT 60,
                    notes TEXT,
                    status TEXT DEFAULT 'scheduled',
                    reminder_sent BOOLEAN DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (customer_id) REFERENCES customers (id),
                    FOREIGN KEY (service_id) REFERENCES services (id)
                )
            `;
            
            await dbRun(query);
            logger.info('Tabela de agendamentos inicializada');
        } catch (error) {
            logger.error('Erro ao inicializar tabela de agendamentos:', error);
            throw error;
        }
    }

    /**
     * Agenda um novo horário de atendimento
     * @param {Object} appointmentData - Dados do agendamento
     * @param {number} appointmentData.customerId - ID do cliente
     * @param {number} appointmentData.serviceId - ID do serviço
     * @param {string} appointmentData.date - Data do agendamento (formato YYYY-MM-DD)
     * @param {string} appointmentData.time - Hora do agendamento (formato HH:MM)
     * @param {number} [appointmentData.duration=60] - Duração em minutos
     * @param {string} [appointmentData.notes] - Observações sobre o agendamento
     * @returns {Promise<number>} ID do agendamento criado
     */
    static async scheduleAppointment(appointmentData) {
        try {
            // Validação básica
            if (!appointmentData.customerId || !appointmentData.serviceId || 
                !appointmentData.date || !appointmentData.time) {
                throw new Error('Cliente, serviço, data e hora são campos obrigatórios');
            }
            
            // Validar formato de data (YYYY-MM-DD)
            if (!/^\d{4}-\d{2}-\d{2}$/.test(appointmentData.date)) {
                throw new Error('Formato de data inválido. Use YYYY-MM-DD');
            }
            
            // Validar formato de hora (HH:MM)
            if (!/^\d{2}:\d{2}$/.test(appointmentData.time)) {
                throw new Error('Formato de hora inválido. Use HH:MM');
            }
            
            // Verificar disponibilidade do horário
            const isAvailable = await this.checkAvailability(
                appointmentData.date, 
                appointmentData.time,
                appointmentData.duration || 60
            );
            
            if (!isAvailable) {
                throw new Error('Horário não disponível');
            }
            
            // Construir query
            const fields = ['customer_id', 'service_id', 'date', 'time'];
            const placeholders = ['?', '?', '?', '?'];
            const values = [
                appointmentData.customerId,
                appointmentData.serviceId,
                appointmentData.date,
                appointmentData.time
            ];
            
            // Adicionar campos opcionais
            if (appointmentData.duration) {
                fields.push('duration');
                placeholders.push('?');
                values.push(appointmentData.duration);
            }
            
            if (appointmentData.notes) {
                fields.push('notes');
                placeholders.push('?');
                values.push(appointmentData.notes);
            }
            
            // Adicionar timestamps
            fields.push('created_at', 'updated_at');
            placeholders.push('datetime("now")', 'datetime("now")');
            
            const query = `
                INSERT INTO appointments (${fields.join(', ')})
                VALUES (${placeholders.join(', ')})
            `;
            
            const result = await dbRun(query, values);
            
            logger.info(`Novo agendamento criado: ${appointmentData.date} ${appointmentData.time} (ID: ${result.lastID})`);
            return result.lastID;
        } catch (error) {
            logger.error(`Erro ao agendar horário: ${error.message}`, error);
            throw error;
        }
    }

    /**
     * Verifica se um horário está disponível
     * @param {string} date - Data do agendamento (YYYY-MM-DD)
     * @param {string} time - Hora do agendamento (HH:MM)
     * @param {number} [duration=60] - Duração em minutos
     * @returns {Promise<boolean>} True se o horário estiver disponível
     */
    static async checkAvailability(date, time, duration = 60) {
        try {
            // Converter hora para minutos desde o início do dia
            const [hours, minutes] = time.split(':').map(Number);
            const startMinutes = hours * 60 + minutes;
            const endMinutes = startMinutes + duration;
            
            // Buscar agendamentos para a mesma data
            const query = `
                SELECT time, duration
                FROM appointments
                WHERE date = ? AND status != 'cancelled'
            `;
            
            const appointments = await dbAll(query, [date]);
            
            // Verificar sobreposição
            for (const appointment of appointments) {
                const [appHours, appMinutes] = appointment.time.split(':').map(Number);
                const appStartMinutes = appHours * 60 + appMinutes;
                const appEndMinutes = appStartMinutes + (appointment.duration || 60);
                
                // Verificar sobreposição
                if ((startMinutes >= appStartMinutes && startMinutes < appEndMinutes) ||
                    (endMinutes > appStartMinutes && endMinutes <= appEndMinutes) ||
                    (startMinutes <= appStartMinutes && endMinutes >= appEndMinutes)) {
                    return false; // Sobreposição detectada
                }
            }
            
            return true; // Nenhuma sobreposição
        } catch (error) {
            logger.error(`Erro ao verificar disponibilidade: ${error.message}`, error);
            throw error;
        }
    }

    /**
     * Obtém os horários disponíveis para uma data
     * @param {string} date - Data para verificar (YYYY-MM-DD)
     * @param {number} [duration=60] - Duração do serviço em minutos
     * @param {string} [startTime='09:00'] - Hora de início do expediente
     * @param {string} [endTime='18:00'] - Hora de fim do expediente
     * @param {number} [interval=30] - Intervalo entre horários em minutos
     * @returns {Promise<Array<string>>} Lista de horários disponíveis
     */
    static async getAvailableSlots(date, duration = 60, startTime = '09:00', endTime = '18:00', interval = 30) {
        try {
            // Converter horas para minutos
            const [startHours, startMinutes] = startTime.split(':').map(Number);
            const [endHours, endMinutes] = endTime.split(':').map(Number);
            const dayStartMinutes = startHours * 60 + startMinutes;
            const dayEndMinutes = endHours * 60 + endMinutes;
            
            // Gerar todos os slots possíveis
            const slots = [];
            for (let time = dayStartMinutes; time <= dayEndMinutes - duration; time += interval) {
                const hours = Math.floor(time / 60).toString().padStart(2, '0');
                const minutes = (time % 60).toString().padStart(2, '0');
                slots.push(`${hours}:${minutes}`);
            }
            
            // Filtrar slots disponíveis
            const availableSlots = [];
            for (const slot of slots) {
                const isAvailable = await this.checkAvailability(date, slot, duration);
                if (isAvailable) {
                    availableSlots.push(slot);
                }
            }
            
            return availableSlots;
        } catch (error) {
            logger.error(`Erro ao obter slots disponíveis: ${error.message}`, error);
            throw error;
        }
    }

    /**
     * Busca um agendamento pelo ID
     * @param {number} id - ID do agendamento
     * @returns {Promise<Object|null>} Dados do agendamento ou null
     */
    static async getAppointmentById(id) {
        try {
            const query = `
                SELECT a.*, c.name as customer_name, c.phone as customer_phone,
                       s.name as service_name, s.price as service_price
                FROM appointments a
                JOIN customers c ON a.customer_id = c.id
                JOIN services s ON a.service_id = s.id
                WHERE a.id = ?
            `;
            
            const appointment = await dbGet(query, [id]);
            return appointment || null;
        } catch (error) {
            logger.error(`Erro ao buscar agendamento ${id}: ${error.message}`, error);
            throw error;
        }
    }

    /**
     * Busca todos os agendamentos de um cliente
     * @param {number} customerId - ID do cliente
     * @param {boolean} [includeCompleted=true] - Incluir agendamentos concluídos
     * @param {boolean} [includeCancelled=false] - Incluir agendamentos cancelados
     * @returns {Promise<Array>} Lista de agendamentos
     */
    static async getAppointmentsByCustomer(customerId, includeCompleted = true, includeCancelled = false) {
        try {
            let query = `
                SELECT a.*, s.name as service_name, s.price as service_price
                FROM appointments a
                JOIN services s ON a.service_id = s.id
                WHERE a.customer_id = ?
            `;
            
            const params = [customerId];
            
            // Filtros de status
            const statusFilters = [];
            statusFilters.push("a.status = 'scheduled'");
            
            if (includeCompleted) {
                statusFilters.push("a.status = 'completed'");
            }
            
            if (includeCancelled) {
                statusFilters.push("a.status = 'cancelled'");
            }
            
            if (statusFilters.length > 0) {
                query += ` AND (${statusFilters.join(' OR ')})`;
            }
            
            query += ' ORDER BY a.date, a.time';
            
            const appointments = await dbAll(query, params);
            logger.debug(`Encontrados ${appointments.length} agendamentos para o cliente ${customerId}`);
            
            return appointments;
        } catch (error) {
            logger.error(`Erro ao buscar agendamentos do cliente ${customerId}: ${error.message}`, error);
            throw error;
        }
    }

    /**
     * Busca agendamentos para uma data específica
     * @param {string} date - Data dos agendamentos (YYYY-MM-DD)
     * @param {boolean} [onlyActive=true] - Se true, retorna apenas agendamentos não cancelados
     * @returns {Promise<Array>} Lista de agendamentos
     */
    static async getAppointmentsByDate(date, onlyActive = true) {
        try {
            let query = `
                SELECT a.*, c.name as customer_name, c.phone as customer_phone,
                       s.name as service_name, s.price as service_price
                FROM appointments a
                JOIN customers c ON a.customer_id = c.id
                JOIN services s ON a.service_id = s.id
                WHERE a.date = ?
            `;
            
            const params = [date];
            
            if (onlyActive) {
                query += ` AND a.status != 'cancelled'`;
            }
            
            query += ' ORDER BY a.time';
            
            const appointments = await dbAll(query, params);
            logger.debug(`Encontrados ${appointments.length} agendamentos para ${date}`);
            
            return appointments;
        } catch (error) {
            logger.error(`Erro ao buscar agendamentos para a data ${date}: ${error.message}`, error);
            throw error;
        }
    }

    /**
     * Atualiza um agendamento
     * @param {number} id - ID do agendamento
     * @param {Object} updateData - Dados a serem atualizados
     * @returns {Promise<boolean>} True se atualizado com sucesso
     */
    static async updateAppointment(id, updateData) {
        try {
            // Verificar se o agendamento existe
            const appointment = await this.getAppointmentById(id);
            if (!appointment) {
                throw new Error(`Agendamento ${id} não encontrado`);
            }
            
            // Verificar se o agendamento já foi concluído ou cancelado
            if (['completed', 'cancelled'].includes(appointment.status) && 
                !updateData.hasOwnProperty('status')) {
                throw new Error(`Não é possível atualizar um agendamento ${appointment.status}`);
            }
            
            // Construir campos para atualização
            const updates = [];
            const values = [];
            
            // Campos permitidos para atualização
            const allowedFields = ['date', 'time', 'duration', 'notes', 'status', 'reminder_sent'];
            
            for (const field of allowedFields) {
                if (updateData.hasOwnProperty(field)) {
                    updates.push(`${field} = ?`);
                    values.push(updateData[field]);
                }
            }
            
            // Se não houver atualizações, retornar
            if (updates.length === 0) {
                return false;
            }
            
            // Adicionar timestamp de atualização
            updates.push('updated_at = datetime("now")');
            
            // Construir query
            const query = `
                UPDATE appointments
                SET ${updates.join(', ')}
                WHERE id = ?
            `;
            
            values.push(id);
            
            const result = await dbRun(query, values);
            
            logger.info(`Agendamento ${id} atualizado com sucesso`);
            return result.changes > 0;
        } catch (error) {
            logger.error(`Erro ao atualizar agendamento ${id}: ${error.message}`, error);
            throw error;
        }
    }

    /**
     * Cancela um agendamento
     * @param {number} id - ID do agendamento
     * @param {string} [reason] - Motivo do cancelamento
     * @returns {Promise<boolean>} True se cancelado com sucesso
     */
    static async cancelAppointment(id, reason = '') {
        try {
            // Verificar se o agendamento existe
            const appointment = await this.getAppointmentById(id);
            if (!appointment) {
                throw new Error(`Agendamento ${id} não encontrado`);
            }
            
            // Verificar se já foi cancelado
            if (appointment.status === 'cancelled') {
                return true; // Já está cancelado
            }
            
            // Verificar se já foi concluído
            if (appointment.status === 'completed') {
                throw new Error('Não é possível cancelar um agendamento já concluído');
            }
            
            // Preparar notas (adicionar motivo do cancelamento)
            let notes = appointment.notes || '';
            if (reason) {
                notes = notes ? `${notes} | Cancelado: ${reason}` : `Cancelado: ${reason}`;
            }
            
            // Executar cancelamento
            const query = `
                UPDATE appointments
                SET status = 'cancelled', 
                    notes = ?,
                    updated_at = datetime("now")
                WHERE id = ?
            `;
            
            const result = await dbRun(query, [notes, id]);
            
            logger.info(`Agendamento ${id} cancelado. Motivo: ${reason || 'Não informado'}`);
            return result.changes > 0;
        } catch (error) {
            logger.error(`Erro ao cancelar agendamento ${id}: ${error.message}`, error);
            throw error;
        }
    }

    /**
     * Marca um agendamento como concluído
     * @param {number} id - ID do agendamento
     * @param {string} [notes] - Observações sobre a conclusão
     * @returns {Promise<boolean>} True se marcado como concluído com sucesso
     */
    static async completeAppointment(id, notes = '') {
        try {
            // Verificar se o agendamento existe
            const appointment = await this.getAppointmentById(id);
            if (!appointment) {
                throw new Error(`Agendamento ${id} não encontrado`);
            }
            
            // Verificar status atual
            if (appointment.status === 'completed') {
                return true; // Já está concluído
            }
            
            if (appointment.status === 'cancelled') {
                throw new Error('Não é possível concluir um agendamento cancelado');
            }
            
            // Preparar notas
            let updatedNotes = appointment.notes || '';
            if (notes) {
                updatedNotes = updatedNotes ? `${updatedNotes} | Conclusão: ${notes}` : `Conclusão: ${notes}`;
            }
            
            // Executar atualização
            const query = `
                UPDATE appointments
                SET status = 'completed', 
                    notes = ?,
                    updated_at = datetime("now")
                WHERE id = ?
            `;
            
            const result = await dbRun(query, [updatedNotes, id]);
            
            logger.info(`Agendamento ${id} marcado como concluído`);
            return result.changes > 0;
        } catch (error) {
            logger.error(`Erro ao concluir agendamento ${id}: ${error.message}`, error);
            throw error;
        }
    }

    /**
     * Busca agendamentos para lembretes
     * @param {number} [hoursAhead=24] - Horas de antecedência para buscar
     * @returns {Promise<Array>} Agendamentos para enviar lembretes
     */
    static async getAppointmentsForReminders(hoursAhead = 24) {
        try {
            // Calcular data e hora para lembretes
            const now = new Date();
            const targetDate = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);
            const targetDateStr = targetDate.toISOString().split('T')[0];
            
            // Obter hora no formato HH:MM
            const targetHour = targetDate.getHours().toString().padStart(2, '0');
            const targetMinute = targetDate.getMinutes().toString().padStart(2, '0');
            const targetTimeStr = `${targetHour}:${targetMinute}`;
            
            // Buscar agendamentos para lembrete
            const query = `
                SELECT a.*, c.name as customer_name, c.phone as customer_phone,
                       s.name as service_name
                FROM appointments a
                JOIN customers c ON a.customer_id = c.id
                JOIN services s ON a.service_id = s.id
                WHERE a.date = ? 
                AND a.time <= ? 
                AND a.time >= ?
                AND a.status = 'scheduled'
                AND a.reminder_sent = 0
            `;
            
            // Janela de 30 minutos em torno do horário alvo
            const minTime = `${targetHour}:${(targetDate.getMinutes() - 15).toString().padStart(2, '0')}`;
            const maxTime = `${targetHour}:${(targetDate.getMinutes() + 15).toString().padStart(2, '0')}`;
            
            const appointments = await dbAll(query, [targetDateStr, maxTime, minTime]);
            
            logger.debug(`Encontrados ${appointments.length} agendamentos para lembretes (${hoursAhead}h de antecedência)`);
            return appointments;
        } catch (error) {
            logger.error(`Erro ao buscar agendamentos para lembretes: ${error.message}`, error);
            throw error;
        }
    }

    /**
     * Marca um agendamento como tendo recebido lembrete
     * @param {number} id - ID do agendamento
     * @returns {Promise<boolean>} True se marcado com sucesso
     */
    static async markReminderSent(id) {
        try {
            const query = `
                UPDATE appointments
                SET reminder_sent = 1,
                    updated_at = datetime("now")
                WHERE id = ?
            `;
            
            const result = await dbRun(query, [id]);
            
            logger.debug(`Agendamento ${id} marcado como tendo recebido lembrete`);
            return result.changes > 0;
        } catch (error) {
            logger.error(`Erro ao marcar lembrete enviado para agendamento ${id}: ${error.message}`, error);
            throw error;
        }
    }

    /**
     * Obtém estatísticas de agendamentos
     * @returns {Promise<Object>} Estatísticas
     */
    static async getAppointmentStats() {
        try {
            const stats = {};
            
            // Total de agendamentos
            const totalQuery = 'SELECT COUNT(*) as total FROM appointments';
            const totalResult = await dbGet(totalQuery);
            stats.total = totalResult.total;
            
            // Agendamentos por status
            const statusQuery = `
                SELECT status, COUNT(*) as count
                FROM appointments
                GROUP BY status
            `;
            
            const statusResults = await dbAll(statusQuery);
            stats.byStatus = {
                scheduled: 0,
                completed: 0,
                cancelled: 0
            };
            
            statusResults.forEach(result => {
                stats.byStatus[result.status] = result.count;
            });
            
            // Agendamentos para hoje
            const today = new Date().toISOString().split('T')[0];
            const todayQuery = `
                SELECT COUNT(*) as count
                FROM appointments
                WHERE date = ? AND status = 'scheduled'
            `;
            
            const todayResult = await dbGet(todayQuery, [today]);
            stats.today = todayResult.count;
            
            // Agendamentos para esta semana
            const weekQuery = `
                SELECT COUNT(*) as count
                FROM appointments
                WHERE date >= date('now', 'weekday 0')
                AND date <= date('now', 'weekday 0', '+6 days')
                AND status = 'scheduled'
            `;
            
            const weekResult = await dbGet(weekQuery);
            stats.thisWeek = weekResult.count;
            
            // Taxa de cancelamento
            stats.cancellationRate = stats.total > 0 ? 
                (stats.byStatus.cancelled / stats.total * 100).toFixed(2) + '%' : '0%';
            
            return stats;
        } catch (error) {
            logger.error(`Erro ao obter estatísticas de agendamentos: ${error.message}`, error);
            throw error;
        }
    }
}

module.exports = Appointment;




//Melhorias Implementadas
//Estrutura Completa

//Métodos para todas as operações necessárias (CRUD completo)
//Esquema de tabela avançado com campos adicionais úteis
//Inicialização de Tabela

//Método para criar a tabela automaticamente
//Tratamento de Erros Robusto

///Captura e logging de todas as exceções
//Mensagens de erro detalhadas
//Validação de Dados

//Validação de formatos de data e hora
//Verificação de disponibilidade antes de agendar
//Documentação Completa

//Comentários JSDoc detalhados para todos os métodos
//Descrição clara de parâmetros e retornos
///Operações de Negócio Avançadas

//Verificação de disponibilidade de horários
//Cancelamento e conclusão de agendamentos
//Sistema de lembretes
//Promisificação Consistente

//Conversão de todas as operações para promises
//Uso de async/await para código mais limpo
//Pesquisas Complexas

//Busca por data, cliente e status
//JOIN com tabelas relacionadas para dados completos
//Estatísticas de Negócio

//Método para obter métricas importantes
//Análise de agendamentos por período e status
//Gerenciamento de Status

//Fluxo completo do ciclo de vida de um agendamento
//Transições controladas entre estados