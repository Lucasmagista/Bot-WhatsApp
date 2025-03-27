const serviceModel = require('../models/serviceModel');

/**
 * 📌 Obtém detalhes de um serviço pelo nome ou tipo
 * @param {string} serviceType - Nome ou categoria do serviço
 * @returns {Promise<Object|null>} - Retorna os detalhes do serviço ou null se não encontrado
 */
const getServiceDetails = async (serviceType) => {
    try {
        const service = await serviceModel.findByType(serviceType);
        if (!service) {
            return `❌ Serviço "${serviceType}" não encontrado.`;
        }
        return `🛠️ *Serviço:* ${service.name}\n📋 *Descrição:* ${service.description}\n💰 *Preço médio:* R$ ${service.price}`;
    } catch (error) {
        return `❌ Erro ao buscar serviço: ${error.message}`;
    }
};

/**
 * 📌 Retorna a lista de todos os serviços disponíveis
 * @returns {Promise<string>} - Lista formatada de serviços
 */
const listServices = async () => {
    try {
        const services = await serviceModel.getAllServices();
        if (services.length === 0) {
            return "⚠️ Nenhum serviço disponível no momento.";
        }
        
        let response = "📌 *Serviços Disponíveis:*\n";
        services.forEach(service => {
            response += `\n🔹 ${service.name} - R$ ${service.price}\n📋 ${service.description}\n`;
        });

        return response;
    } catch (error) {
        return `❌ Erro ao listar serviços: ${error.message}`;
    }
};

/**
 * 📌 Adiciona um novo serviço ao banco de dados
 * @param {string} name - Nome do serviço
 * @param {string} description - Descrição do serviço
 * @param {number} price - Preço estimado
 * @returns {Promise<string>} - Mensagem de confirmação
 */
const addService = async (name, description, price) => {
    try {
        await serviceModel.createService(name, description, price);
        return `✅ Serviço "${name}" adicionado com sucesso!`;
    } catch (error) {
        return `❌ Erro ao adicionar serviço: ${error.message}`;
    }
};

/**
 * 📌 Atualiza um serviço existente
 * @param {number} id - ID do serviço
 * @param {string} name - Nome atualizado
 * @param {string} description - Descrição atualizada
 * @param {number} price - Preço atualizado
 * @returns {Promise<string>} - Mensagem de confirmação
 */
const updateService = async (id, name, description, price) => {
    try {
        const updated = await serviceModel.updateService(id, name, description, price);
        if (!updated) {
            return `⚠️ Serviço com ID ${id} não encontrado.`;
        }
        return `✅ Serviço "${name}" atualizado com sucesso!`;
    } catch (error) {
        return `❌ Erro ao atualizar serviço: ${error.message}`;
    }
};

/**
 * 📌 Remove um serviço pelo ID
 * @param {number} id - ID do serviço
 * @returns {Promise<string>} - Mensagem de confirmação
 */
const deleteService = async (id) => {
    try {
        const deleted = await serviceModel.deleteService(id);
        if (!deleted) {
            return `⚠️ Serviço com ID ${id} não encontrado.`;
        }
        return `✅ Serviço removido com sucesso!`;
    } catch (error) {
        return `❌ Erro ao remover serviço: ${error.message}`;
    }
};

module.exports = {
    getServiceDetails,
    listServices,
    addService,
    updateService,
    deleteService
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