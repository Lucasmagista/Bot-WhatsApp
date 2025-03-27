const dialogflow = require('@google-cloud/dialogflow');
const uuid = require('uuid');

class NLPService {
    constructor() {
        this.projectId = process.env.DIALOGFLOW_PROJECT_ID;
        this.sessionClient = new dialogflow.SessionsClient();
    }

    async detectIntent(text, sessionId = uuid.v4()) {
        const sessionPath = this.sessionClient.projectAgentSessionPath(this.projectId, sessionId);

        const request = {
            session: sessionPath,
            queryInput: {
                text: {
                    text,
                    languageCode: 'pt-BR',
                },
            },
        };

        const responses = await this.sessionClient.detectIntent(request);
        return responses[0].queryResult;
    }
}

module.exports = new NLPService();
