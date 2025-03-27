const validPhoneRegex = /^\+55\d{11}$/;

/**
 * Executa exemplos de notificações (modo desenvolvimento).
 */
function runExamples() {
    if (process.env.NODE_ENV !== 'development') {
        console.warn("runExamples só deve ser executado em ambiente de desenvolvimento.");
        return;
    }

    console.log("Executando exemplos de notificações...");

    // Exemplo 1: Notificação de boas-vindas
    console.log("Exemplo 1: Enviando notificação de boas-vindas...");
    sendNotification("Bem-vindo ao nosso serviço!", "+5511999999999");

    // Exemplo 2: Notificação de lembrete
    console.log("Exemplo 2: Enviando notificação de lembrete...");
    sendNotification("Não se esqueça do seu compromisso amanhã às 10h.", "+5511888888888");

    // Exemplo 3: Notificação de alerta
    console.log("Exemplo 3: Enviando notificação de alerta...");
    sendNotification("Alerta: Sua conta está com pagamento pendente.", "+5511777777777");
}

/**
 * Simula o envio de uma notificação.
 * @param {string} message - Mensagem da notificação.
 * @param {string} recipient - Número do destinatário.
 */
function sendNotification(message, recipient) {
    if (!message || message.trim() === "") {
        console.error("Mensagem inválida: A mensagem não pode estar vazia.");
        return;
    }

    if (!recipient || !isValidPhoneNumber(recipient)) {
        console.error(`Número inválido ou ausente: ${recipient}`);
        return;
    }

    console.log(`Enviando mensagem: "${message}" para o número: ${recipient}`);
    logNotification(message, recipient);
}

/**
 * Valida se o número de telefone está no formato correto.
 * @param {string} phoneNumber - Número de telefone a ser validado.
 * @returns {boolean} - Retorna true se o número for válido, caso contrário false.
 */
function isValidPhoneNumber(phoneNumber) {
    return validPhoneRegex.test(phoneNumber);
}

/**
 * Registra o envio de uma notificação.
 * @param {string} message - Mensagem enviada.
 * @param {string} recipient - Número do destinatário.
 */
function logNotification(message, recipient) {
    const timestamp = new Date().toISOString();
    console.log(`[LOG ${timestamp}] Mensagem: "${message}" enviada para: ${recipient}`);
}

module.exports = {
    runExamples,
    sendNotification,
    isValidPhoneNumber,
};
