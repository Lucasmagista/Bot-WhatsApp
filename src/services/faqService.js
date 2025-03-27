/**
 * Serviço de FAQ aprimorado para fornecer respostas às perguntas dos usuários
 * com processamento inteligente, cache, análise e feedback
 */
const FAQ = require('../models/faqModel');
const logger = require('../utils/logger');
const NodeCache = require('node-cache');
const { removeAccents, similarity } = require('../utils/textProcessor');

// Cache para armazenar respostas frequentes (30 minutos de TTL)
const faqCache = new NodeCache({ stdTTL: 1800, checkperiod: 300 });

// Limiar de similaridade para considerar uma correspondência (0-1)
const SIMILARITY_THRESHOLD = 0.75;

// Quantidade máxima de perguntas relacionadas a sugerir
const MAX_RELATED_QUESTIONS = 3;

class FAQService {
    /**
     * Obtém a resposta para uma pergunta do usuário
     * @param {string} userQuestion - Pergunta do usuário
     * @param {boolean} trackAnalytics - Se deve registrar para análise
     * @returns {Promise<Object>} Objeto com resposta e metadados
     */
    static async getFAQResponse(userQuestion, trackAnalytics = true) {
        if (!userQuestion || typeof userQuestion !== 'string') {
            throw new Error('A pergunta do usuário deve ser uma string válida.');
        }
        try {
            if (!userQuestion || typeof userQuestion !== 'string') {
                return { 
                    success: false,
                    error: 'Pergunta inválida',
                    answer: null
                };
            }

            // Normalizar a pergunta (remover acentos, converter para minúsculas, etc)
            const normalizedQuestion = this.normalizeQuestion(userQuestion);
            
            // Verificar cache
            const cacheKey = `faq:${normalizedQuestion}`;
            const cachedResponse = faqCache.get(cacheKey);
            
            if (cachedResponse) {
                logger.debug(`Resposta para "${userQuestion}" encontrada no cache`);
                return {
                    ...cachedResponse,
                    fromCache: true
                };
            }
            
            // Buscar resposta exata
            let answer = await FAQ.getAnswerByQuestion(normalizedQuestion);
            let matchType = 'exact';
            let similarityScore = 1.0;
            let questionId = null;
            
            // Se não encontrou resposta exata, tentar busca por similaridade
            if (!answer) {
                const result = await this.findSimilarQuestion(normalizedQuestion);
                
                if (result) {
                    answer = result.answer;
                    matchType = 'similar';
                    similarityScore = result.similarity;
                    questionId = result.questionId;
                    
                    logger.info(`Correspondência similar encontrada para "${userQuestion}" com ${Math.round(similarityScore * 100)}% de similaridade`);
                }
            } else {
                // Se encontrou resposta exata, obter o ID da pergunta
                const exactQuestion = await FAQ.getQuestionByAnswer(answer);
                if (exactQuestion) {
                    questionId = exactQuestion.id;
                }
            }
            
            // Se ainda não encontrou resposta, buscar resposta de fallback
            if (!answer) {
                answer = await this.getFallbackResponse(normalizedQuestion);
                matchType = 'fallback';
                similarityScore = 0;
                
                // Registrar pergunta sem resposta para análise
                if (trackAnalytics) {
                    await this.trackUnansweredQuestion(userQuestion);
                }
            } else if (trackAnalytics) {
                // Registrar uma resposta bem-sucedida
                await this.trackAnsweredQuestion(userQuestion, questionId, matchType, similarityScore);
            }
            
            // Buscar perguntas relacionadas
            let relatedQuestions = [];
            if (questionId) {
                relatedQuestions = await this.getRelatedQuestions(questionId, normalizedQuestion);
            }
            
            // Preparar resultado
            const result = {
                success: !!answer,
                answer,
                matchType,
                similarityScore,
                questionId,
                relatedQuestions,
                fromCache: false
            };
            
            // Armazenar em cache se a resposta foi bem-sucedida
            if (result.success) {
                faqCache.set(cacheKey, { ...result, fromCache: false });
            }
            
            return result;
            
        } catch (error) {
            logger.error(`Erro ao processar pergunta "${userQuestion}":`, error);
            return {
                success: false,
                error: 'Erro ao processar pergunta',
                answer: null
            };
        }
    }
    
    /**
     * Normaliza a pergunta para melhorar a correspondência
     * @param {string} question - Pergunta original
     * @returns {string} Pergunta normalizada
     */
    static normalizeQuestion(question) {
        // Converter para minúsculas
        let normalized = question.toLowerCase();
        
        // Remover acentos
        normalized = removeAccents(normalized);
        
        // Remover pontuação
        normalized = normalized.replace(/[^\w\s]/g, '');
        
        // Remover espaços extras
        normalized = normalized.replace(/\s+/g, ' ').trim();
        
        // Remover palavras comuns que não agregam valor semântico
        const stopwords = ['o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'de', 'do', 'da', 'dos', 'das', 'no', 'na', 'nos', 'nas', 'ao', 'aos', 'à', 'às', 'pelo', 'pela', 'pelos', 'pelas', 'como', 'que', 'quando', 'onde', 'quem', 'qual'];
        
        let words = normalized.split(' ');
        words = words.filter(word => !stopwords.includes(word));
        
        return words.join(' ');
    }
    
    /**
     * Busca uma pergunta similar no banco de dados
     * @param {string} normalizedQuestion - Pergunta normalizada
     * @returns {Promise<Object|null>} Objeto com resposta e similaridade
     */
    static async findSimilarQuestion(normalizedQuestion) {
        if (!normalizedQuestion || typeof normalizedQuestion !== 'string') {
            throw new Error('A pergunta normalizada deve ser uma string válida.');
        }
        try {
            // Obter todas as perguntas do banco de dados
            const allQuestions = await FAQ.getAllQuestions();
            
            if (!allQuestions || allQuestions.length === 0) {
                return null;
            }
            
            let bestMatch = null;
            let bestSimilarity = SIMILARITY_THRESHOLD;
            
            // Calcular similaridade com cada pergunta
            for (const question of allQuestions) {
                const normalizedDbQuestion = this.normalizeQuestion(question.question);
                const currentSimilarity = similarity(normalizedQuestion, normalizedDbQuestion);
                
                // Atualizar se encontrou similaridade maior
                if (currentSimilarity > bestSimilarity) {
                    bestSimilarity = currentSimilarity;
                    bestMatch = {
                        questionId: question.id,
                        answer: question.answer,
                        similarity: currentSimilarity
                    };
                }
            }
            
            return bestMatch;
            
        } catch (error) {
            logger.error('Erro ao buscar pergunta similar:', error);
            return null;
        }
    }
    
    /**
     * Obtém resposta de fallback quando nenhuma correspondência é encontrada
     * @param {string} normalizedQuestion - Pergunta normalizada
     * @returns {Promise<string>} Resposta de fallback
     */
    static async getFallbackResponse(normalizedQuestion) {
        try {
            // Verificar se há palavras-chave que podem indicar uma categoria
            const keywords = {
                'preço': 'Temos diversos preços dependendo do serviço. Por favor, especifique qual serviço você deseja saber o preço ou envie "tabela de preços".',
                'valor': 'Temos diversos valores dependendo do serviço. Por favor, especifique qual serviço você deseja saber o valor ou envie "tabela de preços".',
                'horario': 'Nosso horário de funcionamento é de segunda a sexta das 8h às 18h e aos sábados das 9h às 13h.',
                'prazo': 'O prazo varia conforme o serviço. Por favor, especifique qual serviço você deseja saber o prazo.',
                'endereço': 'Estamos localizados na Rua Exemplo, 123 - Centro. Você pode nos visitar ou agendar um atendimento em domicílio.',
                'garantia': 'Oferecemos garantia de 90 dias para todos os nossos serviços.'
            };
            
            // Verificar se a pergunta contém alguma das palavras-chave
            for (const [keyword, response] of Object.entries(keywords)) {
                if (normalizedQuestion.includes(keyword)) {
                    return response;
                }
            }
            
            // Resposta padrão se nenhuma palavra-chave for encontrada
            return 'Desculpe, não encontrei uma resposta específica para sua pergunta. Você pode reformular ou falar com um de nossos atendentes digitando "falar com atendente".';
            
        } catch (error) {
            logger.error('Erro ao gerar resposta de fallback:', error);
            return 'Desculpe, não consegui processar sua pergunta. Por favor, tente novamente mais tarde ou fale com um de nossos atendentes.';
        }
    }
    
    /**
     * Registra perguntas sem resposta para análise futura
     * @param {string} question - Pergunta original
     * @returns {Promise<void>}
     */
    static async trackUnansweredQuestion(question) {
        try {
            await FAQ.logUnansweredQuestion(question);
            logger.info(`Pergunta sem resposta registrada: "${question}"`);
        } catch (error) {
            logger.error('Erro ao registrar pergunta sem resposta:', error);
        }
    }
    
    /**
     * Registra perguntas respondidas para análise
     * @param {string} question - Pergunta original
     * @param {number} questionId - ID da pergunta correspondente
     * @param {string} matchType - Tipo de correspondência (exact, similar, fallback)
     * @param {number} similarityScore - Pontuação de similaridade (0-1)
     * @returns {Promise<void>}
     */
    static async trackAnsweredQuestion(question, questionId, matchType, similarityScore) {
        try {
            await FAQ.logAnsweredQuestion(question, questionId, matchType, similarityScore);
        } catch (error) {
            logger.error('Erro ao registrar pergunta respondida:', error);
        }
    }
    
    /**
     * Obtém perguntas relacionadas com base na pergunta atual
     * @param {number} questionId - ID da pergunta atual
     * @param {string} normalizedQuestion - Pergunta normalizada
     * @returns {Promise<Array>} Lista de perguntas relacionadas
     */
    static async getRelatedQuestions(questionId, normalizedQuestion) {
        try {
            // Buscar perguntas na mesma categoria
            const categoryQuestions = await FAQ.getQuestionsByCategory(questionId);
            
            // Se não houver perguntas na mesma categoria, buscar por similaridade
            if (!categoryQuestions || categoryQuestions.length === 0) {
                const allQuestions = await FAQ.getAllQuestions();
                
                // Filtrar perguntas diferentes da atual e calcular similaridade
                const questions = allQuestions
                    .filter(q => q.id !== questionId)
                    .map(q => ({
                        id: q.id,
                        question: q.question,
                        similarity: similarity(normalizedQuestion, this.normalizeQuestion(q.question))
                    }))
                    .filter(q => q.similarity > 0.4) // Mínimo de similaridade
                    .sort((a, b) => b.similarity - a.similarity)
                    .slice(0, MAX_RELATED_QUESTIONS);
                
                return questions.map(q => q.question);
            }
            
            // Limitar quantidade e retornar apenas o texto das perguntas
            return categoryQuestions
                .filter(q => q.id !== questionId)
                .slice(0, MAX_RELATED_QUESTIONS)
                .map(q => q.question);
                
        } catch (error) {
            logger.error('Erro ao buscar perguntas relacionadas:', error);
            return [];
        }
    }
    
    /**
     * Registra feedback do usuário sobre uma resposta
     * @param {number} questionId - ID da pergunta
     * @param {boolean} helpful - Se a resposta foi útil
     * @param {string} userComment - Comentário opcional do usuário
     * @returns {Promise<boolean>} Sucesso da operação
     */
    static async registerFeedback(questionId, helpful, userComment = null) {
        try {
            await FAQ.saveFeedback(questionId, helpful, userComment);
            logger.info(`Feedback registrado para pergunta ${questionId}: ${helpful ? 'útil' : 'não útil'}`);
            return true;
        } catch (error) {
            logger.error('Erro ao registrar feedback:', error);
            return false;
        }
    }
    
    /**
     * Busca as perguntas mais frequentes
     * @param {number} limit - Limite de resultados
     * @returns {Promise<Array>} Lista de perguntas frequentes
     */
    static async getTopQuestions(limit = 10) {
        try {
            return await FAQ.getTopQuestions(limit);
        } catch (error) {
            logger.error('Erro ao buscar perguntas frequentes:', error);
            return [];
        }
    }
    
    /**
     * Limpa o cache de respostas
     */
    static clearCache() {
        faqCache.flushAll();
        logger.info('Cache de FAQ limpo');
    }
}

module.exports = FAQService;