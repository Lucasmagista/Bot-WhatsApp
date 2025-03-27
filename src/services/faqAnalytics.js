/**
 * Serviço para análise e coleta de métricas sobre perguntas frequentes
 * Este serviço armazena e analisa dados sobre o uso do sistema de FAQ
 */

// Simulação de armazenamento em memória (em produção seria substituído por um banco de dados)
const inMemoryStorage = {
    queries: [],
    categories: {},
    userStats: {}
  };
  
  /**
   * Registra uma consulta FAQ realizada pelo usuário
   * @param {string} userId ID do usuário
   * @param {string} question Pergunta ou tópico consultado
   * @param {boolean} wasSuccessful Se a consulta foi respondida com sucesso
   * @param {string} [category='não-categorizado'] Categoria da pergunta
   * @returns {Promise<void>}
   */
  async function logFaqQuery(userId, question, wasSuccessful, category = 'não-categorizado') {
    try {
      if (!userId || !question) {
        throw new Error('ID do usuário e pergunta são campos obrigatórios');
      }
  
      const timestamp = new Date();
      
      // Registra a consulta no histórico
      const queryRecord = {
        userId,
        question,
        wasSuccessful,
        category,
        timestamp,
        dayOfWeek: timestamp.getDay(),
        hour: timestamp.getHours()
      };
      
      inMemoryStorage.queries.push(queryRecord);
      
      // Atualiza estatísticas da categoria
      if (!inMemoryStorage.categories[category]) {
        inMemoryStorage.categories[category] = {
          total: 0,
          successful: 0,
          questions: {}
        };
      }
      
      inMemoryStorage.categories[category].total++;
      if (wasSuccessful) {
        inMemoryStorage.categories[category].successful++;
      }
      
      // Contabiliza frequência das perguntas
      if (!inMemoryStorage.categories[category].questions[question]) {
        inMemoryStorage.categories[category].questions[question] = {
          count: 0,
          successful: 0
        };
      }
      
      inMemoryStorage.categories[category].questions[question].count++;
      if (wasSuccessful) {
        inMemoryStorage.categories[category].questions[question].successful++;
      }
      
      // Atualiza estatísticas do usuário
      if (!inMemoryStorage.userStats[userId]) {
        inMemoryStorage.userStats[userId] = {
          totalQueries: 0,
          successful: 0,
          lastQuery: null,
          categories: {}
        };
      }
      
      inMemoryStorage.userStats[userId].totalQueries++;
      if (wasSuccessful) {
        inMemoryStorage.userStats[userId].successful++;
      }
      inMemoryStorage.userStats[userId].lastQuery = timestamp;
      
      // Registra categorias usadas pelo usuário
      if (!inMemoryStorage.userStats[userId].categories[category]) {
        inMemoryStorage.userStats[userId].categories[category] = 0;
      }
      inMemoryStorage.userStats[userId].categories[category]++;
      
      console.log(`[FAQ Analytics] User ${userId} asked: "${question}" (${category}) - Success: ${wasSuccessful}`);
    } catch (error) {
      console.error('[FAQ Analytics] Erro ao registrar consulta:', error);
      throw error;
    }
  }
  
  /**
   * Registra feedback do usuário sobre uma resposta de FAQ
   * @param {string} userId ID do usuário
   * @param {string} question Pergunta realizada
   * @param {number} rating Avaliação (1-5)
   * @param {string} [feedback] Comentário opcional do usuário
   */
  async function logUserFeedback(userId, question, rating, feedback = '') {
    try {
      if (!userId || !question || rating < 1 || rating > 5) {
        throw new Error('Parâmetros inválidos para feedback');
      }
      
      // Encontra a consulta mais recente que corresponde a esta pergunta
      const recentQueries = inMemoryStorage.queries
        .filter(q => q.userId === userId && q.question === question)
        .sort((a, b) => b.timestamp - a.timestamp);
      
      if (recentQueries.length > 0) {
        const mostRecent = recentQueries[0];
        mostRecent.feedback = {
          rating,
          comment: feedback,
          timestamp: new Date()
        };
        
        console.log(`[FAQ Analytics] Feedback received from ${userId} for "${question}": ${rating}/5`);
      }
    } catch (error) {
      console.error('[FAQ Analytics] Erro ao registrar feedback:', error);
    }
  }
  
  /**
   * Obtém estatísticas gerais de uso do FAQ
   * @param {Object} [filters] Filtros opcionais para as estatísticas
   * @param {string} [filters.category] Filtrar por categoria
   * @param {Date} [filters.startDate] Data inicial para o período de análise
   * @param {Date} [filters.endDate] Data final para o período de análise
   * @returns {Promise<Object>} Estatísticas de uso
   */
  async function getFaqStats(filters = {}) {
    try {
      let filteredQueries = [...inMemoryStorage.queries];
      
      // Aplica filtros se fornecidos
      if (filters.category) {
        filteredQueries = filteredQueries.filter(q => q.category === filters.category);
      }
      
      if (filters.startDate) {
        filteredQueries = filteredQueries.filter(q => q.timestamp >= filters.startDate);
      }
      
      if (filters.endDate) {
        filteredQueries = filteredQueries.filter(q => q.timestamp <= filters.endDate);
      }
      
      // Calcula estatísticas básicas
      const totalQueries = filteredQueries.length;
      const successfulQueries = filteredQueries.filter(q => q.wasSuccessful).length;
      const successRate = totalQueries > 0 ? (successfulQueries / totalQueries) * 100 : 0;
      
      // Agrupa perguntas para encontrar as mais frequentes
      const questionCounts = {};
      filteredQueries.forEach(q => {
        if (!questionCounts[q.question]) {
          questionCounts[q.question] = 0;
        }
        questionCounts[q.question]++;
      });
      
      // Obtém as 10 perguntas mais frequentes
      const topQuestions = Object.entries(questionCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([question, count]) => ({ question, count }));
      
      // Cálculo de estatísticas por hora do dia
      const hourlyDistribution = Array(24).fill(0);
      filteredQueries.forEach(q => {
        hourlyDistribution[q.hour]++;
      });
      
      // Cálculo de estatísticas por dia da semana
      const weekdayDistribution = Array(7).fill(0);
      filteredQueries.forEach(q => {
        weekdayDistribution[q.dayOfWeek]++;
      });
      
      return {
        totalQueries,
        successfulQueries,
        successRate: successRate.toFixed(2) + '%',
        topQuestions,
        hourlyDistribution,
        weekdayDistribution,
        categoriesCount: Object.keys(inMemoryStorage.categories).length,
        uniqueUsers: Object.keys(inMemoryStorage.userStats).length
      };
    } catch (error) {
      console.error('[FAQ Analytics] Erro ao obter estatísticas:', error);
      return {
        error: 'Falha ao calcular estatísticas',
        totalQueries: 0,
        successRate: '0%',
        topQuestions: []
      };
    }
  }
  
  /**
   * Obtém estatísticas detalhadas para uma categoria específica
   * @param {string} category Nome da categoria
   * @returns {Promise<Object>} Estatísticas da categoria
   */
  async function getCategoryStats(category) {
    try {
      if (!inMemoryStorage.categories[category]) {
        return {
          error: `Categoria '${category}' não encontrada`,
          exists: false
        };
      }
      
      const categoryData = inMemoryStorage.categories[category];
      const successRate = categoryData.total > 0 
        ? (categoryData.successful / categoryData.total) * 100 
        : 0;
      
      // Identifica as perguntas mais frequentes desta categoria
      const topQuestions = Object.entries(categoryData.questions)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 5)
        .map(([question, stats]) => ({
          question,
          count: stats.count,
          successRate: ((stats.successful / stats.count) * 100).toFixed(2) + '%'
        }));
      
      return {
        exists: true,
        totalQueries: categoryData.total,
        successfulQueries: categoryData.successful,
        successRate: successRate.toFixed(2) + '%',
        topQuestions,
        uniqueQuestions: Object.keys(categoryData.questions).length
      };
    } catch (error) {
      console.error('[FAQ Analytics] Erro ao obter estatísticas da categoria:', error);
      return {
        error: 'Falha ao calcular estatísticas da categoria',
        exists: false
      };
    }
  }
  
  /**
   * Identifica perguntas frequentes que têm baixa taxa de sucesso
   * @param {number} [minQueryCount=5] Número mínimo de ocorrências da pergunta
   * @param {number} [maxSuccessRate=50] Taxa máxima de sucesso em porcentagem
   * @returns {Promise<Array>} Lista de perguntas problemáticas
   */
  async function identifyProblematicQuestions(minQueryCount = 5, maxSuccessRate = 50) {
    try {
      const problematicQuestions = [];
      
      // Analisa dados de todas as categorias
      Object.entries(inMemoryStorage.categories).forEach(([category, categoryData]) => {
        Object.entries(categoryData.questions).forEach(([question, stats]) => {
          if (stats.count >= minQueryCount) {
            const successRate = (stats.successful / stats.count) * 100;
            if (successRate <= maxSuccessRate) {
              problematicQuestions.push({
                question,
                category,
                count: stats.count,
                successRate: successRate.toFixed(2) + '%'
              });
            }
          }
        });
      });
      
      return problematicQuestions.sort((a, b) => {
        // Ordena por taxa de sucesso (crescente) e depois por contagem (decrescente)
        const rateA = parseFloat(a.successRate);
        const rateB = parseFloat(b.successRate);
        if (rateA !== rateB) return rateA - rateB;
        return b.count - a.count;
      });
    } catch (error) {
      console.error('[FAQ Analytics] Erro ao identificar perguntas problemáticas:', error);
      return [];
    }
  }
  
  /**
   * Limpa o armazenamento de dados em memória (útil para testes)
   */
  function clearStorage() {
    inMemoryStorage.queries = [];
    inMemoryStorage.categories = {};
    inMemoryStorage.userStats = {};
    console.log('[FAQ Analytics] Armazenamento em memória limpo');
  }
  
  module.exports = {
    logFaqQuery,
    getFaqStats,
    logUserFeedback,
    getCategoryStats,
    identifyProblematicQuestions,
    clearStorage
  };