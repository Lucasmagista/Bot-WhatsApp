// ...existing code...

function processMessage(message) {
    try {
        if (message.type === 'album') {
            console.warn('Mensagem do tipo "album" não é suportada:', message.id?._serialized);
            return;
        }

        if (message.hasMedia && !message.mediaKey) {
            console.warn('Mensagem de mídia sem mediaKey:', message.id?._serialized);
            return;
        }

        // Processar a mensagem normalmente
        // ...existing code...

        console.info('Mensagem processada com sucesso:', message.id?._serialized);
    } catch (error) {
        console.error('Erro ao processar mensagem:', message.id?._serialized || 'ID desconhecido', error);
    } finally {
        // Ações finais, se necessário
        console.debug('Finalizando processamento da mensagem:', message.id?._serialized || 'ID desconhecido');
    }
}

// ...existing code...
