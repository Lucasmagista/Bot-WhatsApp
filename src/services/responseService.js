const userPreferences = new Map();

class ResponseService {
    getPersonalizedResponse(userId, intent) {
        const preferences = userPreferences.get(userId) || {};
        switch (intent) {
            case 'greeting':
                return preferences.name
                    ? `Olá, ${preferences.name}! Como posso ajudar?`
                    : 'Olá! Como posso ajudar?';
            case 'quote_request':
                return 'Posso ajudar com um orçamento. Por favor, me diga mais detalhes.';
            // ... outras intenções ...
            default:
                return 'Desculpe, não entendi. Pode reformular?';
        }
    }

    updateUserPreferences(userId, preferences) {
        userPreferences.set(userId, { ...userPreferences.get(userId), ...preferences });
    }
}

module.exports = new ResponseService();
