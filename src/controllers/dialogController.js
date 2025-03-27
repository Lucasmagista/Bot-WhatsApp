const { sendMessage } = require('../utils/formatter');
const welcomeFlow = require('../flows/welcomeFlow');
const quoteFlow = require('../flows/quoteFlow');
const schedulingFlow = require('../flows/schedulingFlow');
const faqFlow = require('../flows/faqFlow');
const emergencyFlow = require('../flows/emergencyFlow');
const humanAgentFlow = require('../flows/humanAgentFlow');
const FAQService = require('../services/faqService');

/**
 * Envia uma mensagem ao usuário com atraso opcional.
 */
async function sendDelayedMessage(client, to, message, delay = 0) {
    setTimeout(async () => {
        try {
            await client.sendMessage(to, message);
        } catch (error) {
            console.error(`Erro ao enviar mensagem: ${error.message}`);
        }
    }, delay);
}

/**
 * Processa mensagens relacionadas ao FAQ.
 * Agora captura números de perguntas relacionadas.
 */
async function handleFAQ(message, client) {
    try {
        const response = await FAQService.getFAQResponse(message.body);

        if (response.success) {
            await sendMessage(client, message.from, response.answer);

            if (response.relatedQuestions?.length > 0) {
                const relatedMsg = '📌 *Perguntas relacionadas:*\n\n' +
                    response.relatedQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n') +
                    '\n\nDigite o número para saber mais.';
                await sendDelayedMessage(client, message.from, relatedMsg, 1000);

                // Armazena as perguntas relacionadas no objeto da mensagem
                message.relatedQuestions = response.relatedQuestions;
            }

            await sendDelayedMessage(client, message.from, 'Esta resposta foi útil? Responda com SIM ou NÃO', 5000);
            return true;
        }
    } catch (error) {
        console.error(`Erro ao processar FAQ: ${error.message}`);
    }
    return false;
}

/**
 * Processa feedback do usuário.
 * Agora captura o questionId corretamente.
 */
async function handleFeedback(message, client) {
    const feedback = message.body.toLowerCase();
    if (feedback === 'sim' || feedback === 'não') {
        const isHelpful = feedback === 'sim';
        const questionId = message.questionId || null; // Certifique-se de que o questionId está sendo passado corretamente.
        try {
            if (questionId) {
                await FAQService.registerFeedback(questionId, isHelpful);
            }
            const response = isHelpful ? '😊 Obrigado pelo seu feedback!' : '🙁 Obrigado pelo seu feedback!';
            await sendMessage(client, message.from, response);
        } catch (error) {
            console.error(`Erro ao registrar feedback: ${error.message}`);
        }
        return true;
    }

    // Verifica se o usuário respondeu com um número relacionado a perguntas
    if (!isNaN(feedback) && message.relatedQuestions) {
        const index = parseInt(feedback, 10) - 1;
        if (index >= 0 && index < message.relatedQuestions.length) {
            const selectedQuestion = message.relatedQuestions[index];
            const relatedResponse = await FAQService.getFAQResponse(selectedQuestion);
            if (relatedResponse.success) {
                await sendMessage(client, message.from, relatedResponse.answer);
            }
            return true;
        }
    }

    return false;
}

/**
 * Identifica a intenção do usuário com base em palavras-chave.
 * Agora normaliza as palavras-chave para evitar problemas de case sensitivity.
 */
function identifyIntent(userMessage) {
    const intentKeywords = {
        welcome: ['olá', 'menu', 'início', 'oi', 'bom dia', 'boa tarde', 'boa noite'],
        quote: ['orçamento', 'preço', 'valor', 'quanto custa', 'quanto é', 'cotação'],
        scheduling: ['agendar', 'marcar', 'agendamento', 'horário', 'disponível', 'agenda'],
        faq: ['faq', 'pergunta', 'dúvida', 'informação', 'como funciona', 'garantia', 'tempo'],
        emergency: ['emergência', 'urgente', 'socorro', 'problema grave', 'imediato'],
        human: ['atendente', 'falar com humano', 'suporte humano', 'ajuda real', 'falar com alguém']
    };

    const normalizedMessage = userMessage.toLowerCase();
    let bestMatch = { intent: null, score: 0 };

    for (const [intent, keywords] of Object.entries(intentKeywords)) {
        const score = keywords.reduce((count, keyword) => count + (normalizedMessage.includes(keyword) ? 1 : 0), 0);
        if (score > bestMatch.score) {
            bestMatch = { intent, score };
        }
    }

    return bestMatch.intent;
}

/**
 * Processa a mensagem do usuário e redireciona para o fluxo correspondente.
 * Adicionado suporte para capturar questionId e perguntas relacionadas.
 */
async function processMessage(message, client) {
    try {
        const userMessage = message.body.toLowerCase().trim();

        // Tenta processar como FAQ
        if (await handleFAQ(message, client)) return;

        // Tenta processar como feedback
        if (await handleFeedback(message, client)) return;

        // Identifica a intenção do usuário
        const identifiedIntent = identifyIntent(userMessage);

        // Redireciona para o fluxo correspondente
        switch (identifiedIntent) {
            case 'welcome':
                await welcomeFlow.handle(message, client);
                break;
            case 'quote':
                await quoteFlow.handle(message, client);
                break;
            case 'scheduling':
                await schedulingFlow.handle(message, client);
                break;
            case 'faq':
                await faqFlow.handle(message, client);
                break;
            case 'emergency':
                await emergencyFlow.handle(message, client);
                break;
            case 'human':
                await humanAgentFlow.handle(message, client);
                break;
            default:
                const defaultMessage = "🤖 Não entendi sua solicitação. Escolha uma opção:\n\n" +
                    "1️⃣ Orçamento de serviços\n" +
                    "2️⃣ Agendamento de atendimento\n" +
                    "3️⃣ Dúvidas sobre serviços\n" +
                    "4️⃣ Problemas emergenciais\n" +
                    "5️⃣ Falar com um atendente humano\n\n" +
                    "Digite o número correspondente à opção desejada.";
                await sendMessage(client, message.from, defaultMessage);
                break;
        }
    } catch (error) {
        console.error(`Erro ao processar mensagem: ${error.message}`);
        await sendMessage(client, message.from, "⚠️ Ocorreu um erro ao processar sua solicitação. Tente novamente mais tarde.");
    }
}

module.exports = {
    processMessage,
    sendMessage,
};