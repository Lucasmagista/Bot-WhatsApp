/**
 * Fluxo para agendamento de atendimento
 * Gerencia toda a conversa de agendamento de serviços
 */
const { sendMessage } = require('../controllers/dialogController');
const logger = require('../utils/logger');
const formatter = require('../utils/formatter');
const reminderService = require('../services/reminderService');
const db = require('../utils/database');
const config = require('../config/config');

// Cache de serviços para evitar consultas repetidas
let servicesCache = null;
let lastCacheTime = null;
const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutos

// Estados da conversa de agendamento
const STATES = {
    INITIAL: 'initial',
    WAITING_SERVICE: 'waiting_service',
    WAITING_TYPE: 'waiting_type',
    WAITING_DATE: 'waiting_date',
    WAITING_TIME: 'waiting_time',
    WAITING_NAME: 'waiting_name',
    WAITING_PHONE: 'waiting_phone',
    WAITING_ADDRESS: 'waiting_address',
    WAITING_CONFIRMATION: 'waiting_confirmation',
    COMPLETED: 'completed'
};

// Map para armazenar o estado da conversa por usuário
const conversationStates = new Map();

// Tempos limite para expiração das conversas (em minutos)
const TIMEOUT_MINUTES = 30;
// Limite de agendamentos por período
const MAX_APPOINTMENTS_PER_SLOT = 3;

// Tipos de atendimento
const APPOINTMENT_TYPES = {
    PRESENCIAL: 'presencial',
    REMOTO: 'remoto',
    LOJA: 'loja'
};

// Períodos do dia
const PERIODS = {
    MANHA: { label: 'Manhã', start: '08:00', end: '12:00' },
    TARDE: { label: 'Tarde', start: '13:00', end: '17:00' },
    NOITE: { label: 'Noite', start: '18:00', end: '21:00' }
};

// Dias da semana
const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

// Feriados nacionais fixos (formato MM-DD)
const HOLIDAYS = [
    '01-01', // Ano Novo
    '04-21', // Tiradentes
    '05-01', // Dia do Trabalho
    '09-07', // Independência
    '10-12', // Nossa Senhora Aparecida
    '11-02', // Finados
    '11-15', // Proclamação da República
    '12-25'  // Natal
];

/**
 * Verifica se uma data é feriado
 * @param {Date} date - Data a verificar
 * @returns {boolean} Verdadeiro se for feriado
 */
const isHoliday = (date) => {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const monthDay = `${month}-${day}`;
    return HOLIDAYS.includes(monthDay);
};

/**
 * Verifica se é dia útil
 * @param {Date} date - Data a verificar
 * @returns {boolean} Verdadeiro se for dia útil
 */
const isWorkDay = (date) => {
    const dayOfWeek = date.getDay();
    return dayOfWeek > 0 && dayOfWeek < 6 && !isHoliday(date);
};

/**
 * Encontra o próximo dia útil a partir de uma data
 * @param {Date} date - Data inicial
 * @returns {Date} Próximo dia útil
 */
const getNextWorkDay = (date) => {
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    
    while (!isWorkDay(nextDay)) {
        nextDay.setDate(nextDay.getDate() + 1);
    }
    
    return nextDay;
};

/**
 * Salva o agendamento no banco de dados
 * @param {Object} appointment - Objeto com os dados do agendamento
 * @returns {Promise<number>} ID do agendamento
 */
const saveAppointment = (appointment) => {
    return new Promise((resolve, reject) => {
        const query = `
            INSERT INTO appointments (
                phone, service_id, appointment_type, 
                appointment_date, appointment_time, status, 
                customer_name, address, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        db.run(query, [
            appointment.phone,
            appointment.serviceId,
            appointment.type,
            appointment.date.toISOString().split('T')[0], // YYYY-MM-DD
            appointment.time,
            'scheduled',
            appointment.customerName || 'Cliente',
            appointment.address || '',
            appointment.notes || ''
        ], function(err) {
            if (err) {
                logger.error('Erro ao salvar agendamento:', err);
                reject(err);
            } else {
                logger.info(`Agendamento salvo com ID ${this.lastID}`);
                resolve(this.lastID);
            }
        });
    });
};

/**
 * Obtém lista de serviços disponíveis
 * @returns {Promise<Array>} Lista de serviços
 */
const getServices = async () => {
    // Verificar se temos cache válido
    const now = new Date();
    if (servicesCache && lastCacheTime && (now - lastCacheTime < CACHE_EXPIRY_MS)) {
        logger.debug('Utilizando cache de serviços');
        return servicesCache;
    }
    
    return new Promise((resolve, reject) => {
        db.all('SELECT id, name, price FROM services ORDER BY name', [], (err, rows) => {
            if (err) {
                logger.error('Erro ao buscar serviços:', err);
                reject(err);
            } else {
                // Atualizar cache
                servicesCache = rows;
                lastCacheTime = now;
                resolve(rows);
            }
        });
    });
};

/**
 * Obtém um serviço pelo ID
 * @param {number} id - ID do serviço
 * @returns {Promise<Object>} Objeto do serviço
 */
const getServiceById = async (id) => {
    // Tentar encontrar no cache primeiro
    if (servicesCache) {
        const service = servicesCache.find(s => s.id === id);
        if (service) return service;
    }
    
    return new Promise((resolve, reject) => {
        db.get('SELECT id, name, price FROM services WHERE id = ?', [id], (err, row) => {
            if (err) {
                logger.error(`Erro ao buscar serviço ${id}:`, err);
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
};

/**
 * Verifica se há disponibilidade no horário escolhido
 * @param {Date} date - Data do agendamento
 * @param {Object} period - Período escolhido
 * @returns {Promise<boolean>} Verdadeiro se há disponibilidade
 */
const isSlotAvailable = async (date, period) => {
    return new Promise((resolve, reject) => {
        const formattedDate = date.toISOString().split('T')[0];
        const query = `
            SELECT COUNT(*) as count FROM appointments 
            WHERE appointment_date = ? 
            AND appointment_time BETWEEN ? AND ?
            AND status = 'scheduled'
        `;
        
        db.get(query, [formattedDate, period.start, period.end], (err, row) => {
            if (err) {
                logger.error('Erro ao verificar disponibilidade:', err);
                reject(err);
            } else {
                resolve(row.count < MAX_APPOINTMENTS_PER_SLOT);
            }
        });
    });
};

/**
 * Obtém agendamentos ativos do cliente
 * @param {string} phone - Número do telefone
 * @returns {Promise<Array>} Lista de agendamentos
 */
const getActiveAppointments = async (phone) => {
    return new Promise((resolve, reject) => {
        const query = `
            SELECT a.id, a.appointment_date, a.appointment_time, 
                   a.appointment_type, a.status, s.name as service_name
            FROM appointments a
            JOIN services s ON a.service_id = s.id
            WHERE a.phone = ? AND a.status = 'scheduled'
            AND a.appointment_date >= date('now')
            ORDER BY a.appointment_date, a.appointment_time
        `;
        
        db.all(query, [phone], (err, rows) => {
            if (err) {
                logger.error('Erro ao buscar agendamentos ativos:', err);
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
};

/**
 * Cancela um agendamento
 * @param {number} id - ID do agendamento
 * @returns {Promise<boolean>} Sucesso da operação
 */
const cancelAppointment = async (id) => {
    return new Promise((resolve, reject) => {
        const query = `
            UPDATE appointments 
            SET status = 'cancelled', updated_at = datetime('now')
            WHERE id = ?
        `;
        
        db.run(query, [id], function(err) {
            if (err) {
                logger.error(`Erro ao cancelar agendamento ${id}:`, err);
                reject(err);
            } else {
                logger.info(`Agendamento ${id} cancelado com sucesso`);
                resolve(this.changes > 0);
            }
        });
    });
};

/**
 * Calcula data de agendamento com base na preferência
 * @param {string} preference - Preferência (hoje, amanhã, esta semana, próxima semana)
 * @returns {Date} Data calculada
 */
const calculateAppointmentDate = (preference) => {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Domingo, 6 = Sábado
    
    // Normalizar a preferência
    preference = preference.toLowerCase().trim();
    
    if (preference.includes('hoje')) {
        // Verificar se hoje ainda é possível agendar (horário comercial)
        const now = new Date();
        const hour = now.getHours();
        
        // Se for após as 17h, sugira o próximo dia útil
        if (hour >= 17) {
            return getNextWorkDay(today);
        }
        
        return isWorkDay(today) ? today : getNextWorkDay(today);
    }
    
    if (preference.includes('amanhã') || preference.includes('amanha')) {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return isWorkDay(tomorrow) ? tomorrow : getNextWorkDay(tomorrow);
    }
    
    if (preference.includes('esta semana')) {
        // Pular para o próximo dia útil desta semana
        const thisWeek = new Date(today);
        let daysToAdd = 1;
        
        // Se já é sexta ou fim de semana, vai para segunda
        if (dayOfWeek >= 5) {
            daysToAdd = (8 - dayOfWeek); // Pula para segunda
        }
        
        thisWeek.setDate(thisWeek.getDate() + daysToAdd);
        return isWorkDay(thisWeek) ? thisWeek : getNextWorkDay(thisWeek);
    }
    
    if (preference.includes('próxima semana') || preference.includes('proxima semana')) {
        // Pular para segunda da próxima semana
        const nextWeek = new Date(today);
        const daysUntilNextMonday = (8 - dayOfWeek) % 7 + 1;
        nextWeek.setDate(nextWeek.getDate() + daysUntilNextMonday);
        return isWorkDay(nextWeek) ? nextWeek : getNextWorkDay(nextWeek);
    }
    
    // Tentar interpretar data específica (formato DD/MM)
    const dateRegex = /(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/;
    const match = preference.match(dateRegex);
    
    if (match) {
        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1; // JavaScript months are 0-indexed
        
        // Se o ano não foi especificado, usar o ano atual
        let year = match[3] ? parseInt(match[3], 10) : today.getFullYear();
        if (year < 100) year += 2000; // Convert 2-digit year to 4 digits
        
        const specificDate = new Date(year, month, day);
        
        // Verificar se é uma data válida no futuro
        if (!isNaN(specificDate.getTime()) && specificDate >= today) {
            return isWorkDay(specificDate) ? specificDate : getNextWorkDay(specificDate);
        }
    }
    
    // Default: próximo dia útil
    return getNextWorkDay(today);
};

/**
 * Inicializa ou recupera estado da conversa
 * @param {string} phone - Número do telefone
 * @returns {Object} Estado da conversa
 */
const getConversationState = (phone) => {
    if (!conversationStates.has(phone)) {
        conversationStates.set(phone, {
            state: STATES.INITIAL,
            data: {
                phone: phone,
                createdAt: new Date()
            },
            lastUpdate: new Date()
        });
    }
    
    // Atualiza timestamp para evitar timeout
    const state = conversationStates.get(phone);
    state.lastUpdate = new Date();
    
    return state;
};

/**
 * Atualiza o estado da conversa
 * @param {string} phone - Número do telefone
 * @param {string} newState - Novo estado
 * @param {Object} data - Dados adicionais
 */
const updateConversationState = (phone, newState, data = {}) => {
    const state = getConversationState(phone);
    state.state = newState;
    state.data = { ...state.data, ...data };
    state.lastUpdate = new Date();
    logger.debug(`Estado atualizado para ${phone}: ${newState}`);
};

/**
 * Limpa conversações expiradas
 */
const cleanExpiredConversations = () => {
    const now = new Date();
    const expirationMs = TIMEOUT_MINUTES * 60 * 1000;
    let count = 0;
    
    conversationStates.forEach((state, phone) => {
        const elapsed = now - state.lastUpdate;
        if (elapsed > expirationMs) {
            logger.debug(`Removendo conversa expirada para ${phone}`);
            conversationStates.delete(phone);
            count++;
        }
    });
    
    if (count > 0) {
        logger.info(`Limpeza de conversas: ${count} conversas expiradas removidas`);
    }
};

// Iniciar limpeza periódica de conversações
setInterval(cleanExpiredConversations, 5 * 60 * 1000); // A cada 5 minutos

/**
 * Envia uma mensagem com botões de opções
 * @param {Object} client - Cliente WhatsApp
 * @param {string} to - Destinatário
 * @param {string} text - Texto da mensagem
 * @param {Array} options - Opções de botões
 */
const sendOptionsMessage = async (client, to, text, options) => {
    try {
        // Verificar se estamos usando a versão com suporte a botões
        if (client.sendMessage && typeof client.sendMessage === 'function') {
            // Formatar opções como texto numerado
            const formattedOptions = options.map((opt, idx) => `${idx + 1}. ${opt}`).join('\n');
            await sendMessage(client, to, `${text}\n\n${formattedOptions}`);
        } else {
            // Fallback para mensagem simples
            await sendMessage(client, to, text);
        }
    } catch (error) {
        logger.error('Erro ao enviar mensagem com opções:', error);
        await sendMessage(client, to, text);
    }
};

/**
 * Processa mensagens do fluxo de agendamento
 */
module.exports = {
    /**
     * Manipula as mensagens do fluxo de agendamento
     * @param {Object} message - Mensagem recebida
     * @param {Object} client - Cliente WhatsApp
     */
    handle: async (message, client) => {
        try {
            const phone = message.from;
            const messageContent = message.body.trim();
            
            // Comandos especiais
            if (messageContent.toLowerCase() === 'cancelar') {
                await sendMessage(client, phone, 'Processo de agendamento cancelado. Volte quando quiser agendar novamente!');
                conversationStates.delete(phone);
                return;
            }
            
            if (messageContent.toLowerCase() === 'meus agendamentos') {
                const appointments = await getActiveAppointments(phone);
                
                if (appointments.length === 0) {
                    await sendMessage(client, phone, 'Você não possui agendamentos ativos no momento.');
                    return;
                }
                
                let messageText = '📅 *Seus agendamentos ativos:*\n\n';
                appointments.forEach((appt, idx) => {
                    const date = new Date(appt.appointment_date);
                    messageText += `*${idx + 1}.* ${appt.service_name}\n`;
                    messageText += `   📆 Data: ${formatter.formatDate(date)} (${WEEKDAYS[date.getDay()]})\n`;
                    messageText += `   🕒 Horário: ${appt.appointment_time}\n`;
                    messageText += `   🔖 Código: #${appt.id}\n\n`;
                });
                
                messageText += 'Para cancelar um agendamento, envie "cancelar #código".';
                await sendMessage(client, phone, messageText);
                return;
            }
            
            // Verificar comando de cancelamento específico (ex: "cancelar #123")
            const cancelMatch = messageContent.match(/cancelar\s+#?(\d+)/i);
            if (cancelMatch) {
                const appointmentId = parseInt(cancelMatch[1], 10);
                
                try {
                    const success = await cancelAppointment(appointmentId);
                    
                    if (success) {
                        await sendMessage(client, phone, `✅ Agendamento #${appointmentId} cancelado com sucesso.`);
                    } else {
                        await sendMessage(client, phone, `❌ Agendamento #${appointmentId} não encontrado ou já cancelado.`);
                    }
                } catch (error) {
                    logger.error(`Erro ao cancelar agendamento #${appointmentId}:`, error);
                    await sendMessage(client, phone, 'Desculpe, ocorreu um erro ao processar seu cancelamento. Por favor, tente novamente.');
                }
                return;
            }
            
            // Recuperar ou inicializar estado da conversa
            const conversation = getConversationState(phone);
            logger.debug(`Estado atual para ${phone}: ${conversation.state}`);
            
            // Processar de acordo com o estado atual
            switch (conversation.state) {
                case STATES.INITIAL:
                    // Verificar se há agendamentos ativos
                    const activeAppointments = await getActiveAppointments(phone);
                    
                    // Enviar mensagem inicial
                    let schedulingMessage = `✅ *Agendamento de Serviços*\n\n`;
                    
                    if (activeAppointments.length > 0) {
                        schedulingMessage += `Você já possui ${activeAppointments.length} agendamento(s) ativo(s). `;
                        schedulingMessage += `Envie "meus agendamentos" para ver detalhes.\n\n`;
                    }
                    
                    schedulingMessage += `Para agendar um novo atendimento, informe:\n` +
                                          `1️⃣ Serviço desejado\n` +
                                          `2️⃣ Tipo de atendimento\n` +
                                          `3️⃣ Data preferida\n` +
                                          `4️⃣ Período (Manhã, Tarde, Noite)\n\n` +
                                          `Podemos começar? Responda SIM para continuar`;
                                          
                    await sendMessage(client, phone, schedulingMessage);
                    
                    // Verificar resposta inicial
                    if (messageContent.toLowerCase().includes('sim')) {
                        // Enviar lista de serviços
                        const services = await getServices();
                        const servicesMessage = `*Serviços disponíveis:*\n${formatter.formatOptionsList(services, true)}\n\nDigite o número ou nome do serviço desejado:`;
                        await sendMessage(client, phone, servicesMessage);
                        
                        // Atualizar estado: aguardando escolha do serviço
                        updateConversationState(phone, STATES.WAITING_SERVICE);
                    }
                    break;
                
                case STATES.WAITING_SERVICE:
                    // Verificar se é um número válido de opção de serviço
                    const services = await getServices();
                    let selectedService;
                    
                    // Tentar interpretar como número da lista ou nome do serviço
                    if (/^\d+$/.test(messageContent)) {
                        const serviceIdx = parseInt(messageContent) - 1;
                        if (serviceIdx >= 0 && serviceIdx < services.length) {
                            selectedService = services[serviceIdx];
                        }
                    } else {
                        // Buscar por nome similar
                        selectedService = services.find(s => 
                            s.name.toLowerCase().includes(messageContent.toLowerCase())
                        );
                    }
                    
                    if (!selectedService) {
                        await sendMessage(client, phone, 
                            'Desculpe, não reconheci este serviço. Por favor, escolha um número da lista:');
                        const servicesMessage = formatter.formatOptionsList(services, true);
                        await sendMessage(client, phone, servicesMessage);
                        break;
                    }
                    
                    // Serviço identificado, perguntar tipo de atendimento
                    updateConversationState(phone, STATES.WAITING_TYPE, { 
                        serviceId: selectedService.id,
                        serviceName: selectedService.name 
                    });
                    
                    await sendOptionsMessage(client, phone, 
                        `Ótimo! Você escolheu *${selectedService.name}*.\n\nQual tipo de atendimento prefere?`,
                        [
                            'Presencial (vamos até você)',
                            'Remoto (atendimento online)',
                            'Trazer equipamento à loja'
                        ]
                    );
                    break;
                
                case STATES.WAITING_TYPE:
                    // Interpretar resposta para tipo de atendimento
                    let appointmentType;
                    const response = messageContent.toLowerCase();
                    
                    if (response.includes('1') || response.includes('presencial')) {
                        appointmentType = APPOINTMENT_TYPES.PRESENCIAL;
                    } else if (response.includes('2') || response.includes('remoto')) {
                        appointmentType = APPOINTMENT_TYPES.REMOTO;
                    } else if (response.includes('3') || response.includes('loja')) {
                        appointmentType = APPOINTMENT_TYPES.LOJA;
                    } else {
                        await sendOptionsMessage(client, phone,
                            'Por favor, escolha uma das opções:',
                            [
                                'Presencial (vamos até você)',
                                'Remoto (atendimento online)',
                                'Trazer equipamento à loja'
                            ]
                        );
                        break;
                    }
                    
                    // Tipo selecionado, perguntar data
                    updateConversationState(phone, STATES.WAITING_DATE, { 
                        type: appointmentType 
                    });
                    
                    // Verificar se precisamos do endereço (apenas para atendimento presencial)
                    if (appointmentType === APPOINTMENT_TYPES.PRESENCIAL) {
                        updateConversationState(phone, STATES.WAITING_ADDRESS);
                        await sendMessage(client, phone,
                            'Por favor, informe o endereço completo para atendimento presencial:'
                        );
                        break;
                    }
                    
                    await sendOptionsMessage(client, phone,
                        `Para quando você gostaria de agendar?`,
                        [
                            'Hoje',
                            'Amanhã',
                            'Esta semana',
                            'Próxima semana',
                            'Outra data (informe DD/MM)'
                        ]
                    );
                    break;
                
                case STATES.WAITING_ADDRESS:
                    // Salvar endereço e prosseguir para data
                    if (messageContent.length < 10) {
                        await sendMessage(client, phone,
                            'Por favor, informe o endereço completo (com rua, número, bairro e cidade):'
                        );
                        break;
                    }
                    
                    updateConversationState(phone, STATES.WAITING_DATE, { 
                        address: messageContent 
                    });
                    
                    await sendOptionsMessage(client, phone,
                        `Endereço registrado! Para quando você gostaria de agendar?`,
                        [
                            'Hoje',
                            'Amanhã',
                            'Esta semana',
                            'Próxima semana',
                            'Outra data (informe DD/MM)'
                        ]
                    );
                    break;
                
                case STATES.WAITING_DATE:
                    // Calcular data com base na preferência
                    const appointmentDate = calculateAppointmentDate(messageContent);
                    const today = new Date();
                    
                    // Verificar se a data não é muito distante (max 30 dias)
                    const maxDaysAhead = 30;
                    const daysDiff = Math.floor((appointmentDate - today) / (1000 * 60 * 60 * 24));
                    
                    if (daysDiff > maxDaysAhead) {
                        await sendMessage(client, phone,
                            `Desculpe, só podemos agendar para até ${maxDaysAhead} dias à frente. Por favor, escolha uma data mais próxima.`
                        );
                        break;
                    }
                    
                    const formattedDate = formatter.formatDate(appointmentDate);
                    const weekday = WEEKDAYS[appointmentDate.getDay()];
                    
                    // Data selecionada, perguntar período
                    updateConversationState(phone, STATES.WAITING_TIME, { 
                        date: appointmentDate 
                    });
                    
                    await sendOptionsMessage(client, phone,
                        `Qual período você prefere para ${formattedDate} (${weekday})?`,
                        [
                            `Manhã (${PERIODS.MANHA.start} - ${PERIODS.MANHA.end})`,
                            `Tarde (${PERIODS.TARDE.start} - ${PERIODS.TARDE.end})`,
                            `Noite (${PERIODS.NOITE.start} - ${PERIODS.NOITE.end})`
                        ]
                    );
                    break;
                
                case STATES.WAITING_TIME:
                    // Interpretar período
                    let period;
                    const timeResponse = messageContent.toLowerCase();
                    
                    if (timeResponse.includes('1') || timeResponse.includes('manhã') || timeResponse.includes('manha')) {
                        period = PERIODS.MANHA;
                    } else if (timeResponse.includes('2') || timeResponse.includes('tarde')) {
                        period = PERIODS.TARDE;
                    } else if (timeResponse.includes('3') || timeResponse.includes('noite')) {
                        period = PERIODS.NOITE;
                    } else {
                        await sendOptionsMessage(client, phone,
                            'Por favor, escolha um dos períodos:',
                            [
                                `Manhã (${PERIODS.MANHA.start} - ${PERIODS.MANHA.end})`,
                                `Tarde (${PERIODS.TARDE.start} - ${PERIODS.TARDE.end})`,
                                `Noite (${PERIODS.NOITE.start} - ${PERIODS.NOITE.end})`
                            ]
                        );
                        break;
                    }
                    
                    // Verificar disponibilidade
                    const isAvailable = await isSlotAvailable(conversation.data.date, period);
                    
                    if (!isAvailable) {
                        const nextAvailableDate = getNextWorkDay(conversation.data.date);
                        await sendMessage(client, phone,
                            `Desculpe, este horário já está com a agenda completa. ` +
                            `Temos disponibilidade no dia ${formatter.formatDate(nextAvailableDate)} (${WEEKDAYS[nextAvailableDate.getDay()]}).\n\n` +
                            `Gostaria de agendar para este dia? (Sim/Não)`
                        );
                        
                        // Salvar o período escolhido
                        updateConversationState(phone, STATES.WAITING_TIME, {
                            period: period.label,
                            time: period.start,
                            suggestedDate: nextAvailableDate
                        });
                        break;
                    }
                    
                    // Período selecionado, solicitar nome
                    updateConversationState(phone, STATES.WAITING_NAME, { 
                        period: period.label,
                        time: period.start
                    });
                    
                    await sendMessage(client, phone, 
                        'Por favor, informe seu nome completo:'
                    );
                    break;
                
                case STATES.WAITING_NAME:
                    // Resposta à sugestão de nova data se não há disponibilidade
                    if (conversation.data.suggestedDate) {
                        if (messageContent.toLowerCase().includes('sim')) {
                            // Aceita a nova data
                            updateConversationState(phone, STATES.WAITING_NAME, {
                                date: conversation.data.suggestedDate,
                                suggestedDate: null
                            });
                            
                            await sendMessage(client, phone, 
                                'Por favor, informe seu nome completo:'
                            );
                        } else {
                            // Rejeita a nova data, volta ao estado de escolha de data
                            updateConversationState(phone, STATES.WAITING_DATE, {
                                suggestedDate: null
                            });
                            
                            await sendOptionsMessage(client, phone,
                                `Entendi. Por favor, escolha outra data para agendamento:`,
                                [
                                    'Amanhã',
                                    'Esta semana',
                                    'Próxima semana',
                                    'Outra data (informe DD/MM)'
                                ]
                            );
                        }
                        break;
                    }
                    
                    // Validar nome
                    if (messageContent.length < 3) {
                        await sendMessage(client, phone, 
                            'Por favor, informe seu nome completo:'
                        );
                        break;
                    }
                    
                    // Nome registrado, pedir confirmação
                    updateConversationState(phone, STATES.WAITING_CONFIRMATION, { 
                        customerName: formatter.formatName(messageContent)
                    });
                    
                    const service = await getServiceById(conversation.data.serviceId);
                    
                    // Verificar se este é o número do cliente ou de outro contato
                    const formattedPhone = formatter.formatPhone(phone.replace('@c.us', ''));
                    
                    // Montar mensagem de confirmação com todos os detalhes
                    weekday = WEEKDAYS[conversation.data.date.getDay()];
                    const confirmationMessage = 
                        `🔍 *Resumo do agendamento:*\n\n` +
                        `👤 Nome: ${conversation.data.customerName}\n` +
                        `📱 Telefone: ${formattedPhone}\n` +
                        `📋 Serviço: ${service.name}\n` +
                        `💰 Valor: ${formatter.formatPrice(service.price)}\n` +
                        `🏠 Tipo: ${conversation.data.type === APPOINTMENT_TYPES.PRESENCIAL ? 
                            'Presencial (vamos até você)' : 
                            conversation.data.type === APPOINTMENT_TYPES.REMOTO ? 
                            'Remoto (atendimento online)' : 
                            'Na loja (traga seu equipamento)'}\n`;
                    
                    // Adicionar endereço se for presencial
                    if (conversation.data.type === APPOINTMENT_TYPES.PRESENCIAL && conversation.data.address) {
                        confirmationMessage += `📍 Endereço: ${conversation.data.address}\n`;
                    }
                    
                    confirmationMessage += 
                        `📅 Data: ${formatter.formatDate(conversation.data.date)} (${weekday})\n` +
                        `🕒 Período: ${conversation.data.period} (a partir de ${conversation.data.time})\n\n` +
                        `Confirma este agendamento? (Sim/Não)`;
                    
                    await sendMessage(client, phone, confirmationMessage);
                    break;
                
                case STATES.WAITING_CONFIRMATION:
                    // Verificar confirmação
                    const confirmed = messageContent.toLowerCase().includes('sim');
                    
                    if (!confirmed) {
                        await sendMessage(client, phone,
                            'Agendamento cancelado. Se desejar agendar novamente, digite "agendamento".');
                        conversationStates.delete(phone);
                        break;
                    }
                    
                    // Confirmado, salvar no banco
                    try {
                        const appointmentId = await saveAppointment(conversation.data);
                        
                        // Criar lembrete para um dia antes
                        const reminderDate = new Date(conversation.data.date);
                        reminderDate.setDate(reminderDate.getDate() - 1);
                        reminderDate.setHours(10, 0, 0); // 10:00 AM
                        
                        const service = await getServiceById(conversation.data.serviceId);
                        const weekday = WEEKDAYS[conversation.data.date.getDay()];
                        
                        await reminderService.createReminder(
                            client,
                            phone,
                            `Lembrete: Você tem um agendamento de ${service.name} amanhã (${weekday}) no período da ${conversation.data.period}. Responda SIM para confirmar sua presença ou NÃO para cancelar.`,
                            reminderDate
                        );
                        
                        // Lembrete adicional 2 horas antes
                        if (conversation.data.date.getTime() - Date.now() < 2 * 24 * 60 * 60 * 1000) { // Se for nas próximas 48h
                            const reminderHours = new Date(conversation.data.date);
                            
                            // Ajustar com base no período
                            if (conversation.data.period === PERIODS.MANHA.label) {
                                reminderHours.setHours(6, 0, 0); // 6:00 AM para manhã
                            } else if (conversation.data.period === PERIODS.TARDE.label) {
                                reminderHours.setHours(11, 0, 0); // 11:00 AM para tarde
                            } else {
                                reminderHours.setHours(16, 0, 0); // 4:00 PM para noite
                            }
                            
                            // Verificar se ainda está no futuro
                            if (reminderHours > new Date()) {
                                await reminderService.createReminder(
                                    client,
                                    phone,
                                    `⏰ Lembrete! Seu agendamento de ${service.name} está marcado para hoje às ${conversation.data.time}. Estamos aguardando você!`,
                                    reminderHours
                                );
                            }
                        }
                        
                        // Mensagem de confirmação
                        weekday = WEEKDAYS[conversation.data.date.getDay()];
                        
                        await sendMessage(client, phone,
                            `✅ *Agendamento confirmado!*\n\n` +
                            `Seu código de agendamento é: *#${appointmentId}*\n\n` +
                            `📅 Data: ${formatter.formatDate(conversation.data.date)} (${weekday})\n` +
                            `🕒 Período: ${conversation.data.period} (a partir de ${conversation.data.time})\n\n` +
                            `Enviaremos um lembrete um dia antes do seu atendimento.\n\n` +
                            `Para verificar seus agendamentos, envie "meus agendamentos".\n` +
                            `Para cancelar, envie "cancelar #${appointmentId}".\n\n` +
                            `Obrigado pela preferência!`
                        );
                        
                        // Enviar para email/sistema se necessário
                        if (config.notifyNewAppointments && config.adminPhone) {
                            const adminNotification = 
                                `🆕 *Novo Agendamento #${appointmentId}*\n\n` +
                                `👤 Cliente: ${conversation.data.customerName}\n` +
                                `📱 Telefone: ${formatter.formatPhone(phone.replace('@c.us', ''))}\n` +
                                `📋 Serviço: ${service.name}\n` +
                                `📅 Data: ${formatter.formatDate(conversation.data.date)} (${weekday})\n` +
                                `🕒 Período: ${conversation.data.period}`;
                            
                            // Notificar admin
                            setTimeout(() => {
                                client.sendMessage(config.adminPhone, adminNotification)
                                    .catch(err => logger.error('Erro ao notificar admin:', err));
                            }, 1000);
                        }
                        
                        // Limpar estado
                        updateConversationState(phone, STATES.COMPLETED);
                        
                        // Remover após 1 minuto para liberar memória
                        setTimeout(() => {
                            if (conversationStates.has(phone)) {
                                conversationStates.delete(phone);
                            }
                        }, 60000);
                        
                    } catch (error) {
                        logger.error('Erro ao salvar agendamento:', error);
                        await sendMessage(client, phone,
                            'Desculpe, ocorreu um erro ao salvar seu agendamento. Por favor, tente novamente mais tarde.');
                    }
                    break;
                
                default:
                    // Reiniciar fluxo
                    updateConversationState(phone, STATES.INITIAL);
                    await module.exports.handle(message, client);
            }
            
        } catch (error) {
            logger.error('Erro no fluxo de agendamento:', error);
            await client.sendMessage(message.from, 
                'Desculpe, ocorreu um erro ao processar seu agendamento. Por favor, tente novamente.');
        }
    },
    
    /**
     * Reinicia o fluxo de agendamento
     * @param {string} phone - Número do telefone
     */
    resetFlow: (phone) => {
        if (conversationStates.has(phone)) {
            conversationStates.delete(phone);
            logger.debug(`Fluxo de agendamento reiniciado para ${phone}`);
        }
    },
    
    /**
     * Registra a conclusão de um serviço
     * @param {Object} client - Cliente WhatsApp
     * @param {string} phone - Número do telefone
     * @param {string} serviceName - Nome do serviço
     * @returns {Promise<boolean>} Sucesso da operação
     */
    registerServiceCompletion: async (client, phone, serviceName) => {
        try {
            // Atualizar status no banco de dados
            await new Promise((resolve, reject) => {
                const query = `
                    UPDATE appointments 
                    SET status = 'completed', completed_at = datetime('now')
                    WHERE phone = ? AND status = 'scheduled'
                `;
                
                db.run(query, [phone], function(err) {
                    if (err) {
                        logger.error('Erro ao atualizar status do agendamento:', err);
                        reject(err);
                    } else {
                        resolve(this.changes);
                    }
                });
            });
            
            // Configurar lembretes de follow-up
            await reminderService.createFollowUpReminders(
                client,
                phone,
                serviceName
            );
            
            // Enviar mensagem de feedback
            await sendMessage(client, phone, 
                `✅ *Serviço concluído com sucesso!*\n\n` +
                `Obrigado por escolher nossos serviços! Esperamos que tenha ficado satisfeito com o resultado.\n\n` +
                `Gostaríamos de receber seu feedback sobre o atendimento. De 1 a 5 estrelas, como você avaliaria o serviço prestado?`
            );
            
            logger.info(`Serviço de ${serviceName} registrado como concluído para ${phone}`);
            return true;
        } catch (error) {
            logger.error('Erro ao registrar conclusão de serviço:', error);
            return false;
        }
    },
    
    /**
     * Obtém agendamentos ativos para um período
     * @param {Date} startDate - Data inicial
     * @param {Date} endDate - Data final
     * @returns {Promise<Array>} Lista de agendamentos
     */
    getAppointmentsForPeriod: async (startDate, endDate) => {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT a.id, a.phone, a.appointment_date, a.appointment_time, 
                       a.appointment_type, a.status, a.customer_name, 
                       a.address, s.name as service_name, s.price
                FROM appointments a
                JOIN services s ON a.service_id = s.id
                WHERE a.appointment_date BETWEEN ? AND ?
                AND a.status = 'scheduled'
                ORDER BY a.appointment_date, a.appointment_time
            `;
            
            const startFormatted = startDate.toISOString().split('T')[0];
            const endFormatted = endDate.toISOString().split('T')[0];
            
            db.all(query, [startFormatted, endFormatted], (err, rows) => {
                if (err) {
                    logger.error('Erro ao buscar agendamentos do período:', err);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }
};



//Melhorias Implementadas
//Sistema de disponibilidade: Verifica quantos agendamentos já existem em cada período para evitar overbooking

//Gerenciamento de agendamentos: Adiciona comandos para visualizar e cancelar agendamentos existentes

//Tratamento de feriados e dias não úteis: Verifica e evita agendamento em finais de semana e feriados

//Cache de serviços: Implementa um sistema de cache para evitar consultas repetitivas ao banco

//Validação de endereço: Para atendimento presencial, solicita e valida o endereço

//Confirmação de identidade: Solicita nome do cliente para melhor identificação

//Lembretes múltiplos: Cria lembretes 1 dia antes e 2 horas antes do atendimento

//Notificação para administrador: Envia mensagem para número administrativo quando há novo agendamento

//Feedback após serviço: Solicita avaliação do cliente após a conclusão do serviço

//Processamento de datas específicas: Reconhece datas no formato DD/MM informadas pelo usuário

//Gestão de estados aprimorada: Melhora o fluxo entre estados da conversa

//Comandos especiais: Adiciona comandos como "cancelar", "meus agendamentos" e "cancelar #código"

//Mensagens mais amigáveis: Aprimora as mensagens com emojis e formatação mais clara