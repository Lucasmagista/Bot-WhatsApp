// Fluxo para encaminhar a conversa a um atendente humano
const { sendMessage } = require('../controllers/dialogController');
const notificationService = require('../services/notificationService');

module.exports = {
    handle: async (message, client) => {
        const operatorNumber = '558195164170@c.us'; // Número do atendente humano no formato WhatsApp
        const userNumber = message.from;
        
        // Mensagem para o cliente
        const humanMessage = `👤 Você será atendido por um de nossos técnicos em instantes.\n` +
                             `Por favor, aguarde um momento...`;
        if (typeof sendMessage === 'function') {
            sendMessage(client, userNumber, humanMessage);
        } else {
            console.error('sendMessage não é uma função.');
        }

        // Notificação para o atendente humano
        const notificationMessage = `🔔 Novo atendimento solicitado!\n` +
                                    `Cliente: ${userNumber}\n` +
                                    `Mensagem original: "${message.body}"\n\n` +
                                    `Responda diretamente ao cliente para continuar o atendimento.`;
        notificationService.sendNotification(client, operatorNumber, notificationMessage);
        
        // Confirmação para o usuário
        if (typeof sendMessage === 'function') {
            sendMessage(client, userNumber, `✅ Seu atendimento foi encaminhado. Aguarde um momento.`);
        } else {
            console.error('sendMessage não é uma função.');
        }
    }
};
