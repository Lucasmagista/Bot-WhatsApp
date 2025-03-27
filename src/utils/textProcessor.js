/**
 * Modelo para gerenciamento de perguntas frequentes (FAQ)
 */
const db = require('../utils/database');
const logger = require('../utils/logger');

class FAQ {
    /**
     * Busca uma resposta para uma pergunta específica
     * @param {string} question - Pergunta normalizada
     * @returns {Promise<string|null>} Resposta encontrada ou null
     */
    static async getAnswerByQuestion(question) {
        return new Promise((resolve, reject) => {
            db.get(
                'SELECT answer FROM faq WHERE normalized_question = ? AND active = 1',
                [question],
                (err, row) => {
                    if (err) {
                        logger.error('Erro ao buscar resposta:', err);
                        reject(err);
                    } else {
                        resolve(row ? row.answer : null);
                    }
                }
            );
        });
    }
    
    /**
     * Busca informações de uma pergunta pela resposta
     * @param {string} answer - Resposta para buscar a pergunta
     * @returns {Promise<Object|null>} Objeto da pergunta ou null
     */
    static async getQuestionByAnswer(answer) {
        return new Promise((resolve, reject) => {
            db.get(
                'SELECT id, question, category_id FROM faq WHERE answer = ? AND active = 1',
                [answer],
                (err, row) => {
                    if (err) {
                        logger.error('Erro ao buscar pergunta pela resposta:', err);
                        reject(err);
                    } else {
                        resolve(row || null);
                    }
                }
            );
        });
    }
    
    /**
     * Busca todas as perguntas ativas
     * @returns {Promise<Array>} Lista de perguntas e respostas
     */
    static async getAllQuestions() {
        return new Promise((resolve, reject) => {
            db.all(
                'SELECT id, question, answer, category_id FROM faq WHERE active = 1',
                [],
                (err, rows) => {
                    if (err) {
                        logger.error('Erro ao buscar todas as perguntas:', err);
                        reject(err);
                    } else {
                        resolve(rows || []);
                    }
                }
            );
        });
    }
    
    /**
     * Busca perguntas da mesma categoria
     * @param {number} questionId - ID da pergunta atual
     * @returns {Promise<Array>} Lista de perguntas relacionadas
     */
    static async getQuestionsByCategory(questionId) {
        return new Promise((resolve, reject) => {
            // Primeiro buscar a categoria da pergunta atual
            db.get(
                'SELECT category_id FROM faq WHERE id = ? AND active = 1',
                [questionId],
                (err, row) => {
                    if (err) {
                        logger.error('Erro ao buscar categoria da pergunta:', err);
                        reject(err);
                        return;
                    }
                    
                    if (!row || !row.category_id) {
                        resolve([]);
                        return;
                    }
                    
                    // Depois buscar outras perguntas da mesma categoria
                    db.all(
                        'SELECT id, question FROM faq WHERE category_id = ? AND id != ? AND active = 1 LIMIT 5',
                        [row.category_id, questionId],
                        (err, rows) => {
                            if (err) {
                                logger.error('Erro ao buscar perguntas da categoria:', err);
                                reject(err);
                            } else {
                                resolve(rows || []);
                            }
                        }
                    );
                }
            );
        });
    }
    
    /**
     * Registra uma pergunta sem resposta para análise
     * @param {string} question - Pergunta original
     * @returns {Promise<void>}
     */
    static async logUnansweredQuestion(question) {
        return new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO faq_unanswered (question, created_at) VALUES (?, datetime("now"))',
                [question],
                function(err) {
                    if (err) {
                        logger.error('Erro ao registrar pergunta sem resposta:', err);
                        reject(err);
                    } else {
                        resolve();
                    }
                }
            );
        });
    }
    
    /**
     * Registra uma pergunta respondida para análise
     * @param {string} question - Pergunta original
     * @param {number} questionId - ID da pergunta correspondente
     * @param {string} matchType - Tipo de correspondência (exact, similar, fallback)
     * @param {number} similarityScore - Pontuação de similaridade (0-1)
     * @returns {Promise<void>}
     */
    static async logAnsweredQuestion(question, questionId, matchType, similarityScore) {
        return new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO faq_analytics 
                (original_question, faq_id, match_type, similarity, created_at) 
                VALUES (?, ?, ?, ?, datetime("now"))`,
                [question, questionId, matchType, similarityScore],
                function(err) {
                    if (err) {
                        logger.error('Erro ao registrar pergunta respondida:', err);
                        reject(err);
                    } else {
                        resolve();
                    }
                }
            );
        });
    }
    
    /**
     * Salva feedback do usuário sobre uma resposta
     * @param {number} questionId - ID da pergunta
     * @param {boolean} helpful - Se a resposta foi útil
     * @param {string} userComment - Comentário opcional do usuário
     * @returns {Promise<void>}
     */
    static async saveFeedback(questionId, helpful, userComment = null) {
        return new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO faq_feedback 
                (faq_id, helpful, comment, created_at) 
                VALUES (?, ?, ?, datetime("now"))`,
                [questionId, helpful ? 1 : 0, userComment],
                function(err) {
                    if (err) {
                        logger.error('Erro ao salvar feedback:', err);
                        reject(err);
                    } else {
                        resolve();
                    }
                }
            );
        });
    }
    
    /**
     * Busca as perguntas mais frequentes
     * @param {number} limit - Limite de resultados
     * @returns {Promise<Array>} Lista de perguntas frequentes
     */
    static async getTopQuestions(limit = 10) {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT f.id, f.question, COUNT(a.id) as count
                FROM faq f
                JOIN faq_analytics a ON f.id = a.faq_id
                WHERE f.active = 1
                GROUP BY f.id
                ORDER BY count DESC
                LIMIT ?`,
                [limit],
                (err, rows) => {
                    if (err) {
                        logger.error('Erro ao buscar perguntas frequentes:', err);
                        reject(err);
                    } else {
                        resolve(rows || []);
                    }
                }
            );
        });
    }
    
    /**
     * Cria tabelas necessárias para o sistema de FAQ se não existirem
     * @returns {Promise<void>}
     */
    static async initializeTables() {
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                // Tabela principal de FAQ
                db.run(`CREATE TABLE IF NOT EXISTS faq (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    question TEXT NOT NULL,
                    normalized_question TEXT NOT NULL,
                    answer TEXT NOT NULL,
                    category_id INTEGER,
                    keywords TEXT,
                    active INTEGER DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )`, err => {
                    if (err) {
                        logger.error('Erro ao criar tabela faq:', err);
                        reject(err);
                        return;
                    }
                });
                
                // Tabela de categorias
                db.run(`CREATE TABLE IF NOT EXISTS faq_categories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    description TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )`, err => {
                    if (err) {
                        logger.error('Erro ao criar tabela faq_categories:', err);
                        reject(err);
                        return;
                    }
                });
                
                // Tabela para perguntas sem resposta
                db.run(`CREATE TABLE IF NOT EXISTS faq_unanswered (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    question TEXT NOT NULL,
                    resolved INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )`, err => {
                    if (err) {
                        logger.error('Erro ao criar tabela faq_unanswered:', err);
                        reject(err);
                        return;
                    }
                });
                
                // Tabela de analytics
                db.run(`CREATE TABLE IF NOT EXISTS faq_analytics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    original_question TEXT NOT NULL,
                    faq_id INTEGER,
                    match_type TEXT NOT NULL,
                    similarity REAL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (faq_id) REFERENCES faq (id)
                )`, err => {
                    if (err) {
                        logger.error('Erro ao criar tabela faq_analytics:', err);
                        reject(err);
                        return;
                    }
                });
                
                // Tabela de feedback
                db.run(`CREATE TABLE IF NOT EXISTS faq_feedback (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    faq_id INTEGER NOT NULL,
                    helpful INTEGER NOT NULL,
                    comment TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (faq_id) REFERENCES faq (id)
                )`, err => {
                    if (err) {
                        logger.error('Erro ao criar tabela faq_feedback:', err);
                        reject(err);
                        return;
                    }
                    
                    // Todas as tabelas foram criadas com sucesso
                    logger.info('Tabelas do sistema de FAQ inicializadas com sucesso');
                    resolve();
                });
            });
        });
    }
}

module.exports = FAQ;