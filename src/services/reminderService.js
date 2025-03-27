/**
 * Serviço para agendamento e envio de lembretes e follow-ups
 */
const db = require('../utils/database');
const logger = require('../utils/logger');
const formatter = require('../utils/formatter');
const { v4: uuidv4 } = require('uuid');

// Map para armazenar os timers ativos em memória
const activeReminders = new Map();

/**
 * Inicializa as tabelas necessárias para o serviço de lembretes
 */
const initializeDatabase = () => {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Tabela de lembretes
            db.run(`CREATE TABLE IF NOT EXISTS reminders (
                id TEXT PRIMARY KEY,
                phone TEXT NOT NULL,
                message TEXT NOT NULL,
                scheduled_time TIMESTAMP NOT NULL,
                status TEXT DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`, (err) => {
                if (err) {
                    logger.error('Erro ao criar tabela de lembretes:', err);
                    reject(err);
                } else {
                    logger.info('Tabela de lembretes verificada/criada com sucesso');
                    resolve();
                }
            });
        });
    });
};

/**
 * Carrega os lembretes pendentes do banco de dados ao iniciar o serviço
 * @param {Object} client - Cliente WhatsApp
 */
const loadPendingReminders = async (client) => {
    try {
        // Buscar todos os lembretes pendentes
        const pendingReminders = await new Promise((resolve, reject) => {
            const query = `
                SELECT * FROM reminders 
                WHERE status = 'pending' 
                AND scheduled_time > datetime('now')
                ORDER BY scheduled_time ASC
            `;
            
            db.all(query, [], (err, rows) => {
                if (err) {
                    logger.error('Erro ao carregar lembretes pendentes:', err);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
        
        logger.info(`Carregados ${pendingReminders.length} lembretes pendentes`);
        
        // Agendar cada lembrete
        pendingReminders.forEach(reminder => {
            scheduleReminder(client, reminder);
        });
        
        return pendingReminders.length;
    } catch (error) {
        logger.error('Falha ao carregar lembretes pendentes:', error);
        return 0;
    }
};

/**
 * Agenda um lembrete para envio no horário especificado
 * @param {Object} client - Cliente WhatsApp
 * @param {Object} reminder - Objeto de lembrete
 */
const scheduleReminder = (client, reminder) => {
    try {
        const now = new Date();
        const scheduledTime = new Date(reminder.scheduled_time);

        // Evitar lembretes atrasados na inicialização
        if (scheduledTime < now) {
            logger.warn(`Lembrete ${reminder.id} ignorado: horário já passou.`);
            return;
        }
        
        // Calcular diferença em milissegundos
        const timeoutMs = Math.max(0, scheduledTime.getTime() - now.getTime());
        
        if (timeoutMs <= 0) {
            logger.warn(`Lembrete ${reminder.id} já deveria ter sido enviado`);
            return;
        }
        
        // Criar o timer para envio no horário agendado
        const timerId = setTimeout(async () => {
            try {
                await sendReminderMessage(client, reminder);
            } catch (error) {
                logger.error(`Erro ao enviar lembrete ${reminder.id}:`, error);
                
                // Marcar como falha no banco
                updateReminderStatus(reminder.id, 'failed');
            } finally {
                // Limpar da memória
                activeReminders.delete(reminder.id);
            }
        }, timeoutMs);
        
        // Armazenar o timer para possível cancelamento futuro
        activeReminders.set(reminder.id, {
            timerId,
            reminder
        });
        
        const minutesToSend = Math.round(timeoutMs / 60000);
        logger.debug(`Lembrete ${reminder.id} agendado para daqui a ${minutesToSend} minutos`);
        
    } catch (error) {
        logger.error(`Erro ao agendar lembrete ${reminder.id}:`, error);
    }
};

/**
 * Envia a mensagem de lembrete
 * @param {Object} client - Cliente WhatsApp
 * @param {Object} reminder - Objeto de lembrete
 */
const sendReminderMessage = async (client, reminder) => {
    try {
        await client.sendMessage(reminder.phone, `🔔 Lembrete: ${reminder.message}`);
        logger.info(`Lembrete ${reminder.id} enviado com sucesso para ${reminder.phone}`);
        
        // Atualizar status no banco
        await updateReminderStatus(reminder.id, 'sent');
        return true;
    } catch (error) {
        logger.error(`Falha ao enviar lembrete ${reminder.id}:`, error);
        await updateReminderStatus(reminder.id, 'failed');
        throw error;
    }
};

/**
 * Atualiza o status de um lembrete no banco de dados
 * @param {string} id - ID do lembrete
 * @param {string} status - Novo status ('pending', 'sent', 'failed', 'cancelled')
 */
const updateReminderStatus = (id, status) => {
    return new Promise((resolve, reject) => {
        const query = `
            UPDATE reminders 
            SET status = ?, updated_at = datetime('now') 
            WHERE id = ?
        `;
        
        db.run(query, [status, id], function(err) {
            if (err) {
                logger.error(`Erro ao atualizar status do lembrete ${id}:`, err);
                reject(err);
            } else {
                logger.debug(`Status do lembrete ${id} atualizado para ${status}`);
                resolve(this.changes);
            }
        });
    });
};

/**
 * Cria um novo lembrete agendado
 * @param {Object} client - Cliente WhatsApp
 * @param {string} to - Número do destinatário no formato WhatsApp
 * @param {string} message - Mensagem do lembrete
 * @param {Date|string} scheduledTime - Data e hora agendada (objeto Date ou string ISO)
 * @param {Object} options - Opções adicionais
 * @returns {Promise<string>} ID do lembrete criado
 */
const createReminder = async (client, to, message, scheduledTime, options = {}) => {
    try {
        // Validar parâmetros
        if (!to || typeof to !== 'string') {
            throw new Error('Número de telefone inválido');
        }
        
        if (!message || typeof message !== 'string') {
            throw new Error('Mensagem inválida');
        }
        
        // Normalizar número de telefone (remover formatação)
        const phone = to.replace(/\D/g, '');
        
        // Gerar ID único
        const id = uuidv4();
        
        // Converter scheduledTime para objeto Date se for string
        let scheduledDate;
        if (typeof scheduledTime === 'string') {
            scheduledDate = new Date(scheduledTime);
        } else if (scheduledTime instanceof Date) {
            scheduledDate = scheduledTime;
        } else {
            throw new Error('Data agendada inválida');
        }
        
        // Verificar se a data é futura
        if (scheduledDate <= new Date()) {
            throw new Error('A data agendada deve ser no futuro');
        }
        
        // Inserir no banco de dados
        await new Promise((resolve, reject) => {
            const query = `
                INSERT INTO reminders (id, phone, message, scheduled_time)
                VALUES (?, ?, ?, datetime(?))
            `;
            
            db.run(query, [
                id, 
                phone, 
                message, 
                scheduledDate.toISOString()
            ], function(err) {
                if (err) {
                    logger.error('Erro ao inserir lembrete:', err);
                    reject(err);
                } else {
                    logger.info(`Lembrete ${id} criado com sucesso para ${phone}`);
                    resolve(this.lastID);
                }
            });
        });
        
        // Criar o lembrete na memória
        const reminder = {
            id,
            phone,
            message,
            scheduled_time: scheduledDate.toISOString(),
            status: 'pending'
        };
        
        // Agendar o envio
        scheduleReminder(client, reminder);
        
        return id;
    } catch (error) {
        logger.error('Erro ao criar lembrete:', error);
        throw error;
    }
};

/**
 * Cancela um lembrete agendado
 * @param {string} id - ID do lembrete
 * @returns {Promise<boolean>} true se cancelado com sucesso
 */
const cancelReminder = async (id) => {
    try {
        // Verificar se o lembrete existe na memória
        if (activeReminders.has(id)) {
            // Cancelar o timer
            clearTimeout(activeReminders.get(id).timerId);
            activeReminders.delete(id);
        }
        
        // Atualizar o status no banco de dados
        const result = await updateReminderStatus(id, 'cancelled');
        return result > 0;
    } catch (error) {
        logger.error(`Erro ao cancelar lembrete ${id}:`, error);
        throw error;
    }
};

/**
 * Obtém todos os lembretes de um número
 * @param {string} phone - Número de telefone
 * @returns {Promise<Array>} Lista de lembretes
 */
const getRemindersForPhone = async (phone) => {
    try {
        // Normalizar número
        const normalizedPhone = phone.replace(/\D/g, '');
        
        return new Promise((resolve, reject) => {
            const query = `
                SELECT * FROM reminders
                WHERE phone = ?
                ORDER BY scheduled_time DESC
            `;
            
            db.all(query, [normalizedPhone], (err, rows) => {
                if (err) {
                    logger.error('Erro ao buscar lembretes:', err);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    } catch (error) {
        logger.error('Erro ao buscar lembretes por telefone:', error);
        throw error;
    }
};

/**
 * Cria lembretes para follow-up após atendimento
 * @param {Object} client - Cliente WhatsApp
 * @param {string} to - Número do destinatário
 * @param {string} service - Serviço realizado
 */
const createFollowUpReminders = async (client, to, service) => {
    try {
        // Lembrete para 24h após
        const tomorrow = new Date();
        tomorrow.setHours(tomorrow.getHours() + 24);
        
        await createReminder(
            client,
            to,
            `Olá! Como está o seu equipamento após o serviço de ${service}? Estamos à disposição para qualquer dúvida.`,
            tomorrow
        );
        
        // Lembrete para 7 dias após
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        
        await createReminder(
            client,
            to,
            `Olá! Já faz uma semana desde o serviço de ${service}. Está tudo funcionando bem? Ficaríamos felizes em receber seu feedback.`,
            nextWeek
        );
        
        logger.info(`Follow-ups agendados com sucesso para ${to}`);
        return true;
    } catch (error) {
        logger.error('Erro ao criar lembretes de follow-up:', error);
        throw error;
    }
};

// Exportar funcionalidades
module.exports = {
    // Função simples (compatibilidade com versão anterior)
    sendReminder: (client, to, message) => {
        logger.info(`Enviando lembrete simples para ${to}`);
        return client.sendMessage(to, `🔔 Lembrete: ${message}`);
    },
    
    // Funções avançadas
    initialize: async (client) => {
        try {
            await initializeDatabase();
            await loadPendingReminders(client);
            logger.info('Serviço de lembretes inicializado com sucesso');
            return true;
        } catch (error) {
            logger.error('Falha ao inicializar serviço de lembretes:', error);
            return false;
        }
    },
    createReminder,
    cancelReminder,
    getRemindersForPhone,
    createFollowUpReminders
};