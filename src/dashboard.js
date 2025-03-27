const util = require('util');
const defaultConfig = require('./config/defaultConfig'); // Certifique-se de que o arquivo existe

let userConfig = {};
try {
    userConfig = require('./config/userConfig'); // Tenta carregar o arquivo userConfig.js
} catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
        console.warn('Aviso: Arquivo userConfig.js não encontrado. Usando configurações padrão.');
    } else {
        throw error; // Relança outros erros
    }
}

const config = Object.assign({}, defaultConfig, userConfig);
