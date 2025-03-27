/**
 * Rotas de API para administração do sistema de FAQ
 * Fornece endpoints para gerenciar perguntas, respostas, categorias e estatísticas
 * 
 * @version 1.1.0
 * @author Seu Nome
 */
const express = require('express');
const router = express.Router();
const db = require('../utils/database');
const { removeAccents } = require('../utils/textProcessor');
const logger = require('../utils/logger');
const FAQService = require('../services/faqService');
const { body, param, validationResult } = require('express-validator');
const { promisify } = require('util');

// Converte operações do banco de dados para Promise
const dbGetAll = promisify(db.all.bind(db));
const dbGet = promisify(db.get.bind(db));
const dbRun = promisify(db.run.bind(db));

// Middleware de autenticação
const authenticateAdmin = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    
    // Chave de API definida no ambiente ou configuração
    const validApiKey = process.env.ADMIN_API_KEY || 'sua-chave-secreta-aqui';
    
    if (!apiKey || apiKey !== validApiKey) {
        logger.warn(`Tentativa de acesso não autorizado à API admin de: ${req.ip}`);
        return res.status(401).json({ error: 'Não autorizado' });
    }
    
    next();
};

// Middleware para validação de entrada
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    next();
};

// Normalizar pergunta para armazenamento
function normalizeQuestion(question) {
    if (!question) return '';
    
    let normalized = question.toLowerCase();
    normalized = removeAccents(normalized);
    normalized = normalized.replace(/[^\w\s]/g, '');
    normalized = normalized.replace(/\s+/g, ' ').trim();
    return normalized;
}

// Aplicar autenticação em todas as rotas admin
router.use(authenticateAdmin);

/**
 * @api {get} /faqs Listar todas as perguntas e respostas
 * @apiName GetFAQs
 * @apiGroup FAQ
 * @apiParam {Number} [page=1] Número da página
 * @apiParam {Number} [limit=20] Itens por página
 * @apiParam {String} [search] Texto para busca
 * @apiParam {Number} [category] ID da categoria
 * @apiSuccessExample {json} Sucesso:
 *     HTTP/1.1 200 OK
 *     {
 *       "data": [...],
 *       "pagination": {
 *         "page": 1,
 *         "limit": 20,
 *         "total": 50,
 *         "pages": 3
 *       }
 *     }
 */
router.get('/faqs', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const search = req.query.search ? `%${req.query.search}%` : null;
        const categoryId = req.query.category ? parseInt(req.query.category) : null;
        
        // Construir query base
        let query = `
            SELECT f.id, f.question, f.answer, f.category_id, f.active, 
                   c.name as category_name,
                   (SELECT COUNT(*) FROM faq_analytics WHERE faq_id = f.id) as view_count
            FROM faq f
            LEFT JOIN faq_categories c ON f.category_id = c.id
        `;
        
        // Adicionar condições
        const conditions = [];
        const params = [];
        
        if (search) {
            conditions.push(`(f.question LIKE ? OR f.answer LIKE ?)`);
            params.push(search, search);
        }
        
        if (categoryId) {
            conditions.push(`f.category_id = ?`);
            params.push(categoryId);
        }
        
        if (conditions.length > 0) {
            query += ` WHERE ${conditions.join(' AND ')}`;
        }
        
        // Adicionar ordenação e paginação
        query += ` ORDER BY f.id DESC LIMIT ? OFFSET ?`;
        params.push(limit, offset);
        
        // Executar query principal
        const rows = await dbGetAll(query, params);
        
        // Contar total para paginação
        let countQuery = `SELECT COUNT(*) as total FROM faq f`;
        if (conditions.length > 0) {
            countQuery += ` WHERE ${conditions.join(' AND ')}`;
        }
        
        const countResult = await dbGet(countQuery, params.slice(0, params.length - 2));
        const total = countResult.total;
        
        res.json({
            data: rows,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        logger.error('Erro na rota GET /faqs:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

/**
 * @api {get} /faqs/:id Obter detalhes de uma pergunta
 * @apiName GetFAQ
 * @apiGroup FAQ
 * @apiParam {Number} id ID da pergunta
 */
router.get('/faqs/:id', [
    param('id').isInt().withMessage('ID deve ser um número inteiro'),
    validate
], async (req, res) => {
    try {
        const { id } = req.params;
        
        const query = `
            SELECT f.id, f.question, f.normalized_question, f.answer, 
                   f.category_id, f.active, f.created_at, f.updated_at,
                   c.name as category_name,
                   (SELECT COUNT(*) FROM faq_analytics WHERE faq_id = f.id) as view_count
            FROM faq f
            LEFT JOIN faq_categories c ON f.category_id = c.id
            WHERE f.id = ?
        `;
        
        const faq = await dbGet(query, [id]);
        
        if (!faq) {
            return res.status(404).json({ error: 'FAQ não encontrado' });
        }
        
        // Buscar análises
        const analytics = await dbGetAll(
            `SELECT match_type, COUNT(*) as count 
             FROM faq_analytics 
             WHERE faq_id = ? 
             GROUP BY match_type`,
            [id]
        );
        
        // Buscar feedback
        const feedback = await dbGetAll(
            `SELECT helpful, COUNT(*) as count
             FROM faq_feedback
             WHERE faq_id = ?
             GROUP BY helpful`,
            [id]
        );
        
        // Formatar feedback
        const helpfulCount = feedback.find(f => f.helpful === 1)?.count || 0;
        const notHelpfulCount = feedback.find(f => f.helpful === 0)?.count || 0;
        const totalFeedback = helpfulCount + notHelpfulCount;
        
        // Incluir dados adicionais
        faq.analytics = {
            matchTypes: analytics.reduce((acc, curr) => {
                acc[curr.match_type] = curr.count;
                return acc;
            }, {})
        };
        
        faq.feedback = {
            helpful: helpfulCount,
            notHelpful: notHelpfulCount,
            total: totalFeedback,
            helpfulPercentage: totalFeedback > 0 ? Math.round((helpfulCount / totalFeedback) * 100) : 0
        };
        
        res.json(faq);
    } catch (error) {
        logger.error(`Erro na rota GET /faqs/${req.params.id}:`, error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

/**
 * @api {get} /categories Listar categorias
 * @apiName GetCategories
 * @apiGroup Categories
 */
router.get('/categories', async (req, res) => {
    try {
        const query = `
            SELECT c.*, 
                   (SELECT COUNT(*) FROM faq WHERE category_id = c.id) as faq_count
            FROM faq_categories c
            ORDER BY c.name
        `;
        
        const categories = await dbGetAll(query);
        res.json(categories);
    } catch (error) {
        logger.error('Erro na rota /categories:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

/**
 * @api {post} /categories Adicionar nova categoria
 * @apiName CreateCategory
 * @apiGroup Categories
 */
router.post('/categories', [
    body('name').notEmpty().withMessage('Nome da categoria é obrigatório'),
    validate
], async (req, res) => {
    try {
        const { name, description } = req.body;
        
        const result = await dbRun(
            'INSERT INTO faq_categories (name, description, created_at) VALUES (?, ?, datetime("now"))',
            [name, description || '']
        );
        
        res.status(201).json({
            id: result.lastID,
            name,
            description,
            success: true
        });
    } catch (error) {
        logger.error('Erro ao criar categoria:', error);
        res.status(500).json({ error: 'Erro ao criar categoria' });
    }
});

/**
 * @api {put} /categories/:id Atualizar categoria
 * @apiName UpdateCategory
 * @apiGroup Categories
 */
router.put('/categories/:id', [
    param('id').isInt().withMessage('ID deve ser um número inteiro'),
    body('name').notEmpty().withMessage('Nome da categoria é obrigatório'),
    validate
], async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description } = req.body;
        
        const result = await dbRun(
            'UPDATE faq_categories SET name = ?, description = ? WHERE id = ?',
            [name, description || '', id]
        );
        
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Categoria não encontrada' });
        }
        
        res.json({
            id: parseInt(id),
            name,
            description,
            success: true
        });
    } catch (error) {
        logger.error(`Erro ao atualizar categoria ${req.params.id}:`, error);
        res.status(500).json({ error: 'Erro ao atualizar categoria' });
    }
});

/**
 * @api {delete} /categories/:id Excluir categoria
 * @apiName DeleteCategory
 * @apiGroup Categories
 */
router.delete('/categories/:id', [
    param('id').isInt().withMessage('ID deve ser um número inteiro'),
    validate
], async (req, res) => {
    try {
        const { id } = req.params;
        
        // Verificar se há FAQs usando esta categoria
        const faqsWithCategory = await dbGet(
            'SELECT COUNT(*) as count FROM faq WHERE category_id = ?',
            [id]
        );
        
        if (faqsWithCategory.count > 0) {
            return res.status(400).json({ 
                error: 'Não é possível excluir categoria em uso',
                faqCount: faqsWithCategory.count 
            });
        }
        
        const result = await dbRun('DELETE FROM faq_categories WHERE id = ?', [id]);
        
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Categoria não encontrada' });
        }
        
        res.status(204).end();
    } catch (error) {
        logger.error(`Erro ao excluir categoria ${req.params.id}:`, error);
        res.status(500).json({ error: 'Erro ao excluir categoria' });
    }
});

/**
 * @api {post} /faqs Adicionar nova pergunta
 * @apiName CreateFAQ
 * @apiGroup FAQ
 */
router.post('/faqs', [
    body('question').notEmpty().withMessage('Pergunta é obrigatória'),
    body('answer').notEmpty().withMessage('Resposta é obrigatória'),
    body('category_id').optional().isInt().withMessage('ID da categoria deve ser um número inteiro'),
    validate
], async (req, res) => {
    try {
        const { question, answer, category_id, keywords } = req.body;
        const normalizedQuestion = normalizeQuestion(question);
        
        // Verificar se categoria existe (se fornecida)
        if (category_id) {
            const category = await dbGet('SELECT id FROM faq_categories WHERE id = ?', [category_id]);
            if (!category) {
                return res.status(400).json({ error: 'Categoria não existe' });
            }
        }
        
        // Verificar se pergunta já existe
        const existingFaq = await dbGet(
            'SELECT id FROM faq WHERE normalized_question = ?',
            [normalizedQuestion]
        );
        
        if (existingFaq) {
            return res.status(409).json({ 
                error: 'Pergunta similar já existe',
                existingId: existingFaq.id 
            });
        }
        
        const result = await dbRun(
            `INSERT INTO faq 
                (question, normalized_question, answer, category_id, keywords, active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`,
            [question, normalizedQuestion, answer, category_id || null, keywords || null]
        );
        
        // Limpar cache após adicionar
        FAQService.clearCache();
        
        logger.info(`Nova FAQ adicionada com ID ${result.lastID}: "${question}"`);
        
        res.status(201).json({ 
            id: result.lastID,
            question,
            answer,
            category_id,
            keywords,
            active: 1,
            success: true
        });
    } catch (error) {
        logger.error('Erro na rota POST /faqs:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

/**
 * @api {put} /faqs/:id Atualizar pergunta
 * @apiName UpdateFAQ
 * @apiGroup FAQ
 */
router.put('/faqs/:id', [
    param('id').isInt().withMessage('ID deve ser um número inteiro'),
    body('question').notEmpty().withMessage('Pergunta é obrigatória'),
    body('answer').notEmpty().withMessage('Resposta é obrigatória'),
    body('category_id').optional().isInt().withMessage('ID da categoria deve ser um número inteiro'),
    validate
], async (req, res) => {
    try {
        const { id } = req.params;
        const { question, answer, category_id, keywords, active } = req.body;
        const normalizedQuestion = normalizeQuestion(question);
        const isActive = active === undefined ? 1 : (active ? 1 : 0);
        
        // Verificar se FAQ existe
        const existingFaq = await dbGet('SELECT id FROM faq WHERE id = ?', [id]);
        if (!existingFaq) {
            return res.status(404).json({ error: 'FAQ não encontrado' });
        }
        
        // Verificar se categoria existe (se fornecida)
        if (category_id) {
            const category = await dbGet('SELECT id FROM faq_categories WHERE id = ?', [category_id]);
            if (!category) {
                return res.status(400).json({ error: 'Categoria não existe' });
            }
        }
        
        // Verificar se pergunta já existe (exceto a atual)
        const duplicateFaq = await dbGet(
            'SELECT id FROM faq WHERE normalized_question = ? AND id != ?',
            [normalizedQuestion, id]
        );
        
        if (duplicateFaq) {
            return res.status(409).json({ 
                error: 'Pergunta similar já existe com outro ID',
                duplicateId: duplicateFaq.id 
            });
        }
        
        await dbRun(
            `UPDATE faq 
             SET question = ?, 
                 normalized_question = ?,
                 answer = ?, 
                 category_id = ?,
                 keywords = ?,
                 active = ?,
                 updated_at = datetime('now')
             WHERE id = ?`,
            [question, normalizedQuestion, answer, category_id || null, keywords || null, isActive, id]
        );
        
        // Limpar cache após atualizar
        FAQService.clearCache();
        
        logger.info(`FAQ ${id} atualizada: "${question}"`);
        
        res.json({ 
            id: parseInt(id),
            question,
            answer,
            category_id,
            keywords,
            active: isActive,
            success: true
        });
    } catch (error) {
        logger.error(`Erro na rota PUT /faqs/${req.params.id}:`, error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

/**
 * @api {delete} /faqs/:id Excluir pergunta
 * @apiName DeleteFAQ
 * @apiGroup FAQ
 */
router.delete('/faqs/:id', [
    param('id').isInt().withMessage('ID deve ser um número inteiro'),
    validate
], async (req, res) => {
    try {
        const { id } = req.params;
        
        // Verificar se faq existe
        const faq = await dbGet('SELECT question FROM faq WHERE id = ?', [id]);
        if (!faq) {
            return res.status(404).json({ error: 'FAQ não encontrado' });
        }
        
        // Excluir FAQ
        await dbRun('DELETE FROM faq WHERE id = ?', [id]);
        
        // Limpar cache após excluir
        FAQService.clearCache();
        
        logger.info(`FAQ ${id} excluída: "${faq.question}"`);
        
        res.status(204).end();
    } catch (error) {
        logger.error(`Erro na rota DELETE /faqs/${req.params.id}:`, error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

/**
 * @api {get} /unanswered Listar perguntas sem resposta
 * @apiName GetUnansweredQuestions
 * @apiGroup FAQ
 */
router.get('/unanswered', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        
        const rows = await dbGetAll(
            'SELECT * FROM faq_unanswered WHERE resolved = 0 ORDER BY created_at DESC LIMIT ? OFFSET ?',
            [limit, offset]
        );
        
        const countResult = await dbGet(
            'SELECT COUNT(*) as total FROM faq_unanswered WHERE resolved = 0',
            []
        );
        
        res.json({
            data: rows,
            pagination: {
                page,
                limit,
                total: countResult.total,
                pages: Math.ceil(countResult.total / limit)
            }
        });
    } catch (error) {
        logger.error('Erro na rota /unanswered:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

/**
 * @api {put} /unanswered/:id/resolve Marcar pergunta sem resposta como resolvida
 * @apiName ResolveUnanswered
 * @apiGroup FAQ
 */
router.put('/unanswered/:id/resolve', [
    param('id').isInt().withMessage('ID deve ser um número inteiro'),
    validate
], async (req, res) => {
    try {
        const { id } = req.params;
        const { faqId } = req.body; // ID da FAQ criada para resolver esta pergunta
        
        const result = await dbRun(
            'UPDATE faq_unanswered SET resolved = 1, resolved_faq_id = ?, resolved_at = datetime("now") WHERE id = ?',
            [faqId || null, id]
        );
        
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Pergunta não encontrada' });
        }
        
        logger.info(`Pergunta sem resposta ${id} marcada como resolvida`);
        
        res.json({ success: true });
    } catch (error) {
        logger.error(`Erro na rota PUT /unanswered/${req.params.id}/resolve:`, error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

/**
 * @api {post} /unanswered/:id/convert Converter pergunta sem resposta em FAQ
 * @apiName ConvertUnanswered
 * @apiGroup FAQ
 */
router.post('/unanswered/:id/convert', [
    param('id').isInt().withMessage('ID deve ser um número inteiro'),
    body('answer').notEmpty().withMessage('Resposta é obrigatória'),
    validate
], async (req, res) => {
    try {
        const { id } = req.params;
        const { answer, category_id } = req.body;
        
        // Obter a pergunta
        const unanswered = await dbGet('SELECT question FROM faq_unanswered WHERE id = ?', [id]);
        
        if (!unanswered) {
            return res.status(404).json({ error: 'Pergunta não encontrada' });
        }
        
        // Iniciar uma transação
        await dbRun('BEGIN TRANSACTION');
        
        try {
            // Criar nova FAQ
            const normalizedQuestion = normalizeQuestion(unanswered.question);
            
            const insertResult = await dbRun(
                `INSERT INTO faq 
                    (question, normalized_question, answer, category_id, active, created_at, updated_at)
                 VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))`,
                [unanswered.question, normalizedQuestion, answer, category_id || null]
            );
            
            const faqId = insertResult.lastID;
            
            // Marcar como resolvida
            await dbRun(
                'UPDATE faq_unanswered SET resolved = 1, resolved_faq_id = ?, resolved_at = datetime("now") WHERE id = ?',
                [faqId, id]
            );
            
            // Commit da transação
            await dbRun('COMMIT');
            
            // Limpar cache
            FAQService.clearCache();
            
            logger.info(`Pergunta sem resposta ${id} convertida em FAQ ${faqId}`);
            
            res.status(201).json({ 
                success: true,
                faqId,
                question: unanswered.question,
                answer
            });
        } catch (error) {
            // Rollback em caso de erro
            await dbRun('ROLLBACK');
            throw error;
        }
    } catch (error) {
        logger.error(`Erro ao converter pergunta ${req.params.id} em FAQ:`, error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

/**
 * @api {get} /stats Estatísticas do sistema de FAQ
 * @apiName GetStats
 * @apiGroup FAQ
 */
router.get('/stats', async (req, res) => {
    try {
        const stats = {};
        
        // Total de perguntas
        const faqsResult = await dbGet('SELECT COUNT(*) as count FROM faq WHERE active = 1');
        stats.totalFaqs = faqsResult.count;
        
        // Total de categorias
        const categoriesResult = await dbGet('SELECT COUNT(*) as count FROM faq_categories');
        stats.totalCategories = categoriesResult.count;
        
        // Total de perguntas sem resposta
        const unansweredResult = await dbGet('SELECT COUNT(*) as count FROM faq_unanswered WHERE resolved = 0');
        stats.totalUnanswered = unansweredResult.count;
        
        // Total de visualizações
        const viewsResult = await dbGet('SELECT COUNT(*) as count FROM faq_analytics');
        stats.totalViews = viewsResult.count;
        
        // Distribuição de tipos de correspondência
        const matchTypes = await dbGetAll(
            'SELECT match_type, COUNT(*) as count FROM faq_analytics GROUP BY match_type'
        );
        
        stats.matchTypes = {};
        matchTypes.forEach(row => {
            stats.matchTypes[row.match_type] = row.count;
        });
        
        // FAQs mais visualizadas
        const topFaqs = await dbGetAll(`
            SELECT f.id, f.question, COUNT(a.id) as views
            FROM faq f
            JOIN faq_analytics a ON f.id = a.faq_id
            GROUP BY f.id
            ORDER BY views DESC
            LIMIT 5
        `);
        stats.topFaqs = topFaqs;
        
        // Distribuição de feedback
        const feedback = await dbGetAll(`
            SELECT helpful, COUNT(*) as count
            FROM faq_feedback
            GROUP BY helpful
        `);
        
        const helpfulCount = feedback.find(f => f.helpful === 1)?.count || 0;
        const notHelpfulCount = feedback.find(f => f.helpful === 0)?.count || 0;
        const totalFeedback = helpfulCount + notHelpfulCount;
        
        stats.feedback = {
            helpful: helpfulCount,
            notHelpful: notHelpfulCount,
            total: totalFeedback,
            helpfulPercentage: totalFeedback > 0 ? Math.round((helpfulCount / totalFeedback) * 100) : 0
        };
        
        // Estatísticas por categoria
        const categoriesStats = await dbGetAll(`
            SELECT c.id, c.name, COUNT(f.id) as faq_count
            FROM faq_categories c
            LEFT JOIN faq f ON c.id = f.category_id
            GROUP BY c.id
            ORDER BY faq_count DESC
        `);
        stats.categories = categoriesStats;
        
        // Atividade recente
        const recentActivity = await dbGetAll(`
            SELECT 
                'analytics' as type,
                a.created_at as timestamp,
                f.question as description
            FROM faq_analytics a
            JOIN faq f ON a.faq_id = f.id
            UNION ALL
            SELECT 
                'feedback' as type,
                fb.created_at as timestamp,
                f.question as description
            FROM faq_feedback fb
            JOIN faq f ON fb.faq_id = f.id
            ORDER BY timestamp DESC
            LIMIT 10
        `);
        stats.recentActivity = recentActivity;
        
        res.json(stats);
    } catch (error) {
        logger.error('Erro na rota /stats:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

/**
 * @api {post} /clear-cache Limpar cache do FAQ
 * @apiName ClearCache
 * @apiGroup FAQ
 */
router.post('/clear-cache', (req, res) => {
    try {
        FAQService.clearCache();
        logger.info('Cache do FAQ limpo manualmente');
        res.json({ success: true, message: 'Cache limpo com sucesso' });
    } catch (error) {
        logger.error('Erro ao limpar cache:', error);
        res.status(500).json({ error: 'Erro ao limpar cache' });
    }
});

/**
 * @api {post} /import-faqs Importar perguntas e respostas
 * @apiName ImportFAQs
 * @apiGroup FAQ
 */
router.post('/import-faqs', [
    body('faqs').isArray().withMessage('O campo faqs deve ser um array'),
    validate
], async (req, res) => {
    try {
        const { faqs } = req.body;
        
        if (!Array.isArray(faqs) || faqs.length === 0) {
            return res.status(400).json({ error: 'Nenhuma FAQ para importar' });
        }
        
        // Iniciar transação
        await dbRun('BEGIN TRANSACTION');
        
        try {
            const results = {
                total: faqs.length,
                imported: 0,
                skipped: 0,
                errors: []
            };
            
            for (const faq of faqs) {
                if (!faq.question || !faq.answer) {
                    results.errors.push({
                        question: faq.question || 'Vazia',
                        error: 'Pergunta ou resposta ausente'
                    });
                    results.skipped++;
                    continue;
                }
                
                const normalizedQuestion = normalizeQuestion(faq.question);
                
                // Verificar se já existe
                const existing = await dbGet(
                    'SELECT id FROM faq WHERE normalized_question = ?',
                    [normalizedQuestion]
                );
                
                if (existing) {
                    results.errors.push({
                        question: faq.question,
                        error: 'Pergunta similar já existe',
                        existingId: existing.id
                    });
                    results.skipped++;
                    continue;
                }
                
                // Inserir nova FAQ
                await dbRun(
                    `INSERT INTO faq 
                        (question, normalized_question, answer, category_id, keywords, active, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`,
                    [faq.question, normalizedQuestion, faq.answer, faq.category_id || null, faq.keywords || null]
                );
                
                results.imported++;
            }
            
            // Commit da transação
            await dbRun('COMMIT');
            
            // Limpar cache
            FAQService.clearCache();
            
            logger.info(`Importação concluída: ${results.imported} FAQs importadas, ${results.skipped} ignoradas`);
            
            res.json(results);
            
        } catch (error) {
            // Rollback em caso de erro
            await dbRun('ROLLBACK');
            throw error;
        }
    } catch (error) {
        logger.error('Erro na importação de FAQs:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

/**
 * @api {get} /export-faqs Exportar perguntas e respostas
 * @apiName ExportFAQs
 * @apiGroup FAQ
 */
router.get('/export-faqs', async (req, res) => {
    try {
        const categoryId = req.query.category ? parseInt(req.query.category) : null;
        
        let query = `
            SELECT f.id, f.question, f.answer, f.category_id, c.name as category_name,
                   f.keywords, f.active, f.created_at, f.updated_at
            FROM faq f
            LEFT JOIN faq_categories c ON f.category_id = c.id
        `;
        
        const params = [];
        
        if (categoryId) {
            query += ` WHERE f.category_id = ?`;
            params.push(categoryId);
        }
        
        query += ` ORDER BY f.id`;
        
        const faqs = await dbGetAll(query, params);
        
        // Formatação da data
        const formattedFaqs = faqs.map(faq => ({
            ...faq,
            active: faq.active === 1,
            created_at: new Date(faq.created_at).toISOString(),
            updated_at: new Date(faq.updated_at).toISOString()
        }));
        
        // Definir headers para download
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=faqs-export-${new Date().toISOString().split('T')[0]}.json`);
        
        res.json({
            exported_at: new Date().toISOString(),
            version: '1.0',
            total: formattedFaqs.length,
            faqs: formattedFaqs
        });
        
    } catch (error) {
        logger.error('Erro na exportação de FAQs:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

module.exports = router;



//Principais Melhorias Implementadas
//Autenticação via API Key

//Adicionado middleware de autenticação para proteger as rotas administrativas
//Verifica token de API para controlar o acesso
//Validação mais robusta

//Adicionado express-validator para validar entradas
//Mensagens de erro específicas para campos inválidos
//Promisificação das operações de banco

//Convertidas callbacks para promises usando o utilitário promisify
//Código mais limpo e legível com async/await
//Paginação nas listagens

//Adicionado suporte para paginação nos endpoints de listagem
//Inclui metadados de paginação nas respostas
//Documentação da API

//Adicionados comentários formatados para JSDoc
//Informações sobre parâmetros, respostas e erros
//Verificações de segurança adicionais

//Verificação de existência de registros antes de atualizações
//Prevenção de duplicatas em perguntas
//Novas funcionalidades

//Endpoint para importação em massa
//Endpoint para exportação de dados
//Estatísticas mais detalhadas
//Conversão de perguntas sem resposta em FAQs
//Transações para operações complexas

//Uso de transações SQL para garantir integridade dos dados
//Rollback automático em caso de erro
//Respostas mais ricas

//Detalhes adicionais nos endpoints de visualização
//Estatísticas de uso para cada FAQ
//Dados de feedback dos usuários
//Logs mais informativos

//Registro detalhado de operações importantes
//Identificação clara dos objetos afetados