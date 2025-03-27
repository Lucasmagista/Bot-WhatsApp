/**
 * Gerenciador de estado de conversação
 * Mantém o controle do estado das conversas ativas com usuários
 */
const logger = require('./logger');

// Mapa que armazena os estados de conversação
// A chave é o ID do chat (chatId) e o valor é o objeto de estado
const conversationStates = new Map();

// Configuração do tempo máximo de inatividade (2 horas em milissegundos)
const MAX_INACTIVITY_TIME = 2 * 60 * 60 * 1000;

class ConversationState {
    /**
     * Configura um estado de conversação para um chat
     * @param {string} chatId - ID do chat
     * @param {Object} state - Estado a ser armazenado
     */
    set(chatId, state) {
        // Garantir que o estado tenha um timestamp
        if (!state.timestamp) {
            state.timestamp = Date.now();
        } else {
            // Atualizar o timestamp existente
            state.timestamp = Date.now();
        }
        
        conversationStates.set(chatId, state);
        
        // Debug log
        logger.debug(`Estado definido para ${chatId}: ${JSON.stringify(state)}`);
        
        return state;
    }

    /**
     * Obtém o estado atual de uma conversação
     * @param {string} chatId - ID do chat
     * @returns {Object|null} Estado da conversação ou null se não existir
     */
    get(chatId) {
        // Verificar se existe um estado para este chat
        if (!conversationStates.has(chatId)) {
            return null;
        }
        
        const state = conversationStates.get(chatId);
        
        // Verificar se o estado expirou por inatividade
        if (this.isStateExpired(state)) {
            logger.info(`Estado do chat ${chatId} expirou por inatividade. Removendo.`);
            this.delete(chatId);
            return null;
        }
        
        return state;
    }

    /**
     * Verifica se existe um estado de conversação para o chat
     * @param {string} chatId - ID do chat
     * @returns {boolean} True se o estado existir e não estiver expirado
     */
    has(chatId) {
        if (!conversationStates.has(chatId)) {
            return false;
        }
        
        const state = conversationStates.get(chatId);
        
        // Verificar se expirou
        if (this.isStateExpired(state)) {
            logger.info(`Estado do chat ${chatId} expirou por inatividade. Removendo durante verificação.`);
            this.delete(chatId);
            return false;
        }
        
        return true;
    }

    /**
     * Remove o estado de uma conversação
     * @param {string} chatId - ID do chat
     * @returns {boolean} True se o estado existia e foi removido
     */
    delete(chatId) {
        const hadState = conversationStates.has(chatId);
        
        if (hadState) {
            conversationStates.delete(chatId);
            logger.debug(`Estado removido para ${chatId}`);
        }
        
        return hadState;
    }

    /**
     * Atualiza parcialmente o estado de uma conversação
     * @param {string} chatId - ID do chat
     * @param {Object} updates - Atualizações a serem aplicadas
     * @returns {Object|null} Estado atualizado ou null se não existir
     */
    update(chatId, updates) {
        if (!this.has(chatId)) {
            return null;
        }
        
        const currentState = this.get(chatId);
        const updatedState = { ...currentState, ...updates, timestamp: Date.now() };
        
        conversationStates.set(chatId, updatedState);
        logger.debug(`Estado atualizado para ${chatId}: ${JSON.stringify(updatedState)}`);
        
        return updatedState;
    }

    /**
     * Verifica se um estado expirou pelo tempo de inatividade
     * @param {Object} state - Estado a ser verificado
     * @returns {boolean} True se o estado expirou
     * @private
     */
    isStateExpired(state) {
        if (!state || !state.timestamp) {
            return true;
        }
        
        const currentTime = Date.now();
        const elapsedTime = currentTime - state.timestamp;
        
        return elapsedTime > MAX_INACTIVITY_TIME;
    }

    /**
     * Limpa estados expirados periodicamente
     * @private
     */
    startCleanupInterval() {
        // Limpar estados a cada 30 minutos
        setInterval(() => {
            try {
                let expiredCount = 0;
                const currentTime = Date.now();
                
                // Verificar todos os estados
                for (const [chatId, state] of conversationStates.entries()) {
                    const elapsedTime = currentTime - (state.timestamp || 0);
                    
                    if (elapsedTime > MAX_INACTIVITY_TIME) {
                        conversationStates.delete(chatId);
                        expiredCount++;
                    }
                }
                
                if (expiredCount > 0) {
                    logger.info(`Limpeza automática: ${expiredCount} estados de conversação expirados foram removidos`);
                }
                
                // Log do número total de conversas ativas
                logger.debug(`Total de conversas ativas: ${conversationStates.size}`);
            } catch (error) {
                logger.error('Erro durante limpeza de estados expirados:', error);
            }
        }, 30 * 60 * 1000); // 30 minutos
    }

    /**
     * Obtém estatísticas sobre os estados de conversação
     * @returns {Object} Estatísticas
     */
    getStats() {
        const stats = {
            totalStates: conversationStates.size,
            byFlow: {},
            byStage: {}
        };
        
        // Contar por fluxo e estágio
        for (const state of conversationStates.values()) {
            // Contar por fluxo
            if (state.currentFlow) {
                stats.byFlow[state.currentFlow] = (stats.byFlow[state.currentFlow] || 0) + 1;
            }
            
            // Contar por estágio
            if (state.stage) {
                stats.byStage[state.stage] = (stats.byStage[state.stage] || 0) + 1;
            }
        }
        
        return stats;
    }

    /**
     * Obtém todos os estados de conversação ativos
     * @returns {Array} Lista de estados ativos
     */
    getAllActiveStates() {
        const result = [];
        const currentTime = Date.now();
        
        for (const [chatId, state] of conversationStates.entries()) {
            const elapsedTimeMinutes = Math.floor((currentTime - (state.timestamp || 0)) / (60 * 1000));
            
            result.push({
                chatId,
                flow: state.currentFlow,
                stage: state.stage,
                customerName: state.customerData ? state.customerData.name : 'Desconhecido',
                idleTimeMinutes: elapsedTimeMinutes
            });
        }
        
        return result;
    }
}

// Criar instância única
const conversationStateManager = new ConversationState();

// Iniciar limpeza automática
conversationStateManager.startCleanupInterval();

// Exportar instância singleton
module.exports = conversationStateManager;