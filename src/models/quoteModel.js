/**
 * Modelo para gerenciamento de orçamentos
 * Responsável por todas as operações relacionadas a orçamentos
 */
const db = require('../utils/database');
const logger = require('../utils/logger');
const { promisify } = require('util');

// Converter operações de banco de dados para promises
const dbRun = promisify(db.run.bind(db));
const dbGet = promisify(db.get.bind(db));
const dbAll = promisify(db.all.bind(db));

class Quote {
    /**
     * Inicializa a tabela de orçamentos no banco de dados
     * @returns {Promise<void>}
     */
    static async initTable() {
        try {
            const query = `
                CREATE TABLE IF NOT EXISTS quotes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    customer_id INTEGER NOT NULL,
                    service_id INTEGER,
                    description TEXT NOT NULL,
                    urgency TEXT DEFAULT 'normal',
                    details TEXT,
                    estimated_value REAL DEFAULT 0,
                    final_value REAL,
                    status TEXT DEFAULT 'draft',
                    feedback_rating INTEGER,
                    feedback_comment TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP,
                    FOREIGN KEY (customer_id) REFERENCES customers (id),
                    FOREIGN KEY (service_id) REFERENCES services (id)
                )
            `;
            
            await dbRun(query);
            logger.info('Tabela de orçamentos inicializada');
        } catch (error) {
            logger.error('Erro ao inicializar tabela de orçamentos:', error);
            throw error;
        }
    }

    /**
     * Cria um novo orçamento
     * @param {Object} quoteData - Dados do orçamento
     * @param {number} quoteData.customerId - ID do cliente
     * @param {number} [quoteData.serviceId] - ID do serviço (opcional)
     * @param {string} quoteData.description - Descrição do orçamento
     * @param {string} [quoteData.urgency='normal'] - Urgência (normal, priority, urgent)
     * @param {string} [quoteData.details] - Detalhes adicionais (JSON)
     * @param {number} [quoteData.estimatedValue=0] - Valor estimado
     * @param {string} [quoteData.status='draft'] - Status (draft, pending, approved, rejected, completed)
     * @returns {Promise<number>} ID do orçamento criado
     */
    static async createQuote(quoteData) {
        try {
            // Validação básica
            if (!quoteData.customerId || !quoteData.description) {
                throw new Error('Cliente e descrição são campos obrigatórios');
            }
            
            // Preparar dados
            const fields = ['customer_id', 'description'];
            const placeholders = ['?', '?'];
            const values = [quoteData.customerId, quoteData.description];
            
            // Adicionar campos opcionais
            if (quoteData.serviceId) {
                fields.push('service_id');
                placeholders.push('?');
                values.push(quoteData.serviceId);
            }
            
            if (quoteData.urgency) {
                fields.push('urgency');
                placeholders.push('?');
                values.push(quoteData.urgency);
            }
            
            if (quoteData.details) {
                fields.push('details');
                placeholders.push('?');
                values.push(quoteData.details);
            }
            
            if (quoteData.estimatedValue) {
                fields.push('estimated_value');
                placeholders.push('?');
                values.push(quoteData.estimatedValue);
            }
            
            if (quoteData.status) {
                fields.push('status');
                placeholders.push('?');
                values.push(quoteData.status);
            }
            
            // Definir data de expiração (30 dias por padrão)
            fields.push('expires_at');
            placeholders.push('datetime("now", "+30 days")');
            
            // Adicionar timestamps
            fields.push('created_at', 'updated_at');
            placeholders.push('datetime("now")', 'datetime("now")');
            
            const query = `
                INSERT INTO quotes (${fields.join(', ')})
                VALUES (${placeholders.join(', ')})
            `;
            
            const result = await dbRun(query, values);
            
            logger.info(`Novo orçamento criado para cliente ${quoteData.customerId} (ID: ${result.lastID})`);
            return result.lastID;
        } catch (error) {
            logger.error(`Erro ao criar orçamento: ${error.message}`, error);
            throw error;
        }
    }

    /**
     * Atualiza um orçamento existente
     * @param {number} id - ID do orçamento
     * @param {Object} updateData - Dados a serem atualizados
     * @returns {Promise<boolean>} True se atualizado com sucesso
     */
    static async updateQuote(id, updateData) {
        try {
            // Verificar se o orçamento existe
            const quote = await this.getQuoteById(id);
            if (!quote) {
                throw new Error(`Orçamento ${id} não encontrado`);
            }
            
            // Construir campos para atualização
            const updates = [];
            const values = [];
            
            // Campos permitidos para atualização
            const allowedFields = [
                'service_id', 'description', 'urgency', 'details', 
                'estimated_value', 'final_value', 'status', 
                'feedback_rating', 'feedback_comment', 'expires_at'
            ];
            
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
                UPDATE quotes
                SET ${updates.join(', ')}
                WHERE id = ?
            `;
            
            values.push(id);
            
            const result = await dbRun(query, values);
            
            logger.info(`Orçamento ${id} atualizado com sucesso`);
            return result.changes > 0;
        } catch (error) {
            logger.error(`Erro ao atualizar orçamento ${id}: ${error.message}`, error);
            throw error;
        }
    }

    /**
     * Busca um orçamento pelo ID
     * @param {number} id - ID do orçamento
     * @returns {Promise<Object|null>} Dados do orçamento ou null
     */
    static async getQuoteById(id) {
        try {
            const query = `
                SELECT q.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email,
                       s.name as service_name
                FROM quotes q
                LEFT JOIN customers c ON q.customer_id = c.id
                LEFT JOIN services s ON q.service_id = s.id
                WHERE q.id = ?
            `;
            
            const quote = await dbGet(query, [id]);
            return quote || null;
        } catch (error) {
            logger.error(`Erro ao buscar orçamento ${id}: ${error.message}`, error);
            throw error;
        }
    }

    /**
     * Busca todos os orçamentos de um cliente
     * @param {number} customerId - ID do cliente
     * @param {string} [status=null] - Filtrar por status
     * @returns {Promise<Array>} Lista de orçamentos
     */
    static async getQuotesByCustomer(customerId, status = null) {
        try {
            let query = `
                SELECT q.*, s.name as service_name
                FROM quotes q
                LEFT JOIN services s ON q.service_id = s.id
                WHERE q.customer_id = ?
            `;
            
            const params = [customerId];
            
            if (status) {
                query += ` AND q.status = ?`;
                params.push(status);
            }
            
            query += ` ORDER BY q.created_at DESC`;
            
            const quotes = await dbAll(query, params);
            return quotes;
        } catch (error) {
            logger.error(`Erro ao buscar orçamentos do cliente ${customerId}: ${error.message}`, error);
            throw error;
        }
    }

    /**
     * Busca orçamentos por status
     * @param {string} status - Status dos orçamentos
     * @param {number} [limit=50] - Limite de resultados
     * @returns {Promise<Array>} Lista de orçamentos
     */
    static async getQuotesByStatus(status, limit = 50) {
        try {
            const query = `
                SELECT q.*, c.name as customer_name, c.phone as customer_phone,
                       s.name as service_name
                FROM quotes q
                JOIN customers c ON q.customer_id = c.id
                LEFT JOIN services s ON q.service_id = s.id
                WHERE q.status = ?
                ORDER BY q.created_at DESC
                LIMIT ?
            `;
            
            const quotes = await dbAll(query, [status, limit]);
            return quotes;
        } catch (error) {
            logger.error(`Erro ao buscar orçamentos com status ${status}: ${error.message}`, error);
            throw error;
        }
    }

    /**
     * Cancela um orçamento
     * @param {number} id - ID do orçamento
     * @param {string} [reason] - Motivo do cancelamento
     * @returns {Promise<boolean>} True se cancelado com sucesso
     */
    static async cancelQuote(id, reason = '') {
        try {
            // Verificar se o orçamento existe
            const quote = await this.getQuoteById(id);
            if (!quote) {
                throw new Error(`Orçamento ${id} não encontrado`);
            }
            
            // Atualizar campos
            let details = {};
            try {
                details = JSON.parse(quote.details || '{}');
            } catch (e) {
                details = {};
            }
            
            details.cancellation_reason = reason;
            details.cancelled_at = new Date().toISOString();
            
            // Executar atualização
            const query = `
                UPDATE quotes
                SET status = 'cancelled',
                    details = ?,
                    updated_at = datetime("now")
                WHERE id = ?
            `;
            
            const result = await dbRun(query, [JSON.stringify(details), id]);
            
            logger.info(`Orçamento ${id} cancelado. Motivo: ${reason || 'Não informado'}`);
            return result.changes > 0;
        } catch (error) {
            logger.error(`Erro ao cancelar orçamento ${id}: ${error.message}`, error);
            throw error;
        }
    }

    /**
     * Aprova um orçamento
     * @param {number} id - ID do orçamento
     * @param {number} [finalValue] - Valor final (se diferente do estimado)
     * @returns {Promise<boolean>} True se aprovado com sucesso
     */
    static async approveQuote(id, finalValue = null) {
        try {
            // Verificar se o orçamento existe
            const quote = await this.getQuoteById(id);
            if (!quote) {
                throw new Error(`Orçamento ${id} não encontrado`);
            }
            
            // Se o valor final não foi informado, usar o estimado
            if (finalValue === null) {
                finalValue = quote.estimated_value;
            }
            
            // Executar atualização
            const query = `
                UPDATE quotes
                SET status = 'approved',
                    final_value = ?,
                    updated_at = datetime("now")
                WHERE id = ?
            `;
            
            const result = await dbRun(query, [finalValue, id]);
            
            logger.info(`Orçamento ${id} aprovado com valor final ${finalValue}`);
            return result.changes > 0;
        } catch (error) {
            logger.error(`Erro ao aprovar orçamento ${id}: ${error.message}`, error);
            throw error;
        }
    }

    /**
     * Salva feedback de um orçamento
     * @param {number} id - ID do orçamento
     * @param {Object} feedbackData - Dados do feedback
     * @param {number} feedbackData.rating - Avaliação (1-5)
     * @param {string} [feedbackData.comment] - Comentário
     * @returns {Promise<boolean>} True se salvo com sucesso
     */
    static async saveFeedback(id, feedbackData) {
        try {
            // Validar rating
            if (!feedbackData.rating || feedbackData.rating < 1 || feedbackData.rating > 5) {
                throw new Error('Avaliação deve ser um número entre 1 e 5');
            }
            
            // Executar atualização
            const query = `
                UPDATE quotes
                SET feedback_rating = ?,
                    feedback_comment = ?,
                    updated_at = datetime("now")
                WHERE id = ?
            `;
            
            const result = await dbRun(query, [
                feedbackData.rating,
                feedbackData.comment || '',
                id
            ]);
            
            logger.info(`Feedback registrado para orçamento ${id}: ${feedbackData.rating}/5`);
            return result.changes > 0;
        } catch (error) {
            logger.error(`Erro ao salvar feedback para orçamento ${id}: ${error.message}`, error);
            throw error;
        }
    }

    /**
     * Obtém estatísticas de orçamentos
     * @returns {Promise<Object>} Estatísticas
     */
    static async getQuoteStats() {
        try {
            const stats = {};
            
            // Total de orçamentos
            const totalQuery = 'SELECT COUNT(*) as total FROM quotes';
            const totalResult = await dbGet(totalQuery);
            stats.total = totalResult.total;
            
            // Orçamentos por status
            const statusQuery = `
                SELECT status, COUNT(*) as count
                FROM quotes
                GROUP BY status
            `;
            
            const statusResults = await dbAll(statusQuery);
            stats.byStatus = {
                draft: 0,
                pending: 0,
                approved: 0,
                rejected: 0,
                completed: 0,
                cancelled: 0
            };
            
            statusResults.forEach(result => {
                stats.byStatus[result.status] = result.count;
            });
            
            // Valor médio
            const avgQuery = `
                SELECT AVG(estimated_value) as avg_value,
                       AVG(final_value) as avg_final_value
                FROM quotes
                WHERE status != 'draft' AND status != 'cancelled'
            `;
            
            const avgResult = await dbGet(avgQuery);
            stats.averageValue = avgResult.avg_value || 0;
            stats.averageFinalValue = avgResult.avg_final_value || 0;
            
            // Taxa de conversão (aprovados / total não-rascunhos)
            const conversionQuery = `
                SELECT 
                    COUNT(*) as total_non_draft,
                    SUM(CASE WHEN status = 'approved' OR status = 'completed' THEN 1 ELSE 0 END) as approved
                FROM quotes
                WHERE status != 'draft'
            `;
            
            const conversionResult = await dbGet(conversionQuery);
            stats.conversionRate = conversionResult.total_non_draft > 0 ? 
                (conversionResult.approved / conversionResult.total_non_draft * 100).toFixed(2) + '%' : '0%';
            
            return stats;
        } catch (error) {
            logger.error(`Erro ao obter estatísticas de orçamentos: ${error.message}`, error);
            throw error;
        }
    }
}

module.exports = Quote;