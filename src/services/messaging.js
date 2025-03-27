const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

/**
 * Serviço para gerenciar interações com a API do WhatsApp
 */
class MessagingService {
  constructor(config = {}) {
    this.client = null;
    this.isReady = false;
    this.config = {
      sessionPath: './sessions',
      ...config
    };
    this.messageHandlers = [];
  }

  /**
   * Inicializa o cliente WhatsApp e configura os eventos
   */
  initialize() {
    try {
      this.client = new Client({
        authStrategy: new LocalAuth({
          dataPath: this.config.sessionPath
        }),
        puppeteer: {
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
      });

      this._setupEventListeners();
      this.client.initialize();
      
      return this.client;
    } catch (error) {
      logger.error('Erro ao inicializar o serviço de mensagens:', error);
      throw error;
    }
  }

  /**
   * Configura os listeners de eventos do cliente
   */
  _setupEventListeners() {
    this.client.on('qr', (qr) => {
      qrcode.generate(qr, { small: true });
      logger.info('QR Code gerado. Escaneie com seu WhatsApp.');
    });

    this.client.on('ready', () => {
      this.isReady = true;
      logger.info('Cliente WhatsApp está pronto!');
    });

    this.client.on('authenticated', () => {
      logger.info('Autenticação bem-sucedida!');
    });

    this.client.on('auth_failure', (error) => {
      logger.error('Falha na autenticação:', error);
    });

    this.client.on('disconnected', (reason) => {
      this.isReady = false;
      logger.warn('Cliente desconectado:', reason);
    });

    this.client.on('message', async (message) => {
      try {
        for (const handler of this.messageHandlers) {
          await handler(message);
        }
      } catch (error) {
        logger.error('Erro ao processar mensagem:', error);
      }
    });
  }

  /**
   * Adiciona um manipulador para processar mensagens recebidas
   * @param {Function} handler - Função que recebe uma mensagem como parâmetro
   */
  onMessage(handler) {
    if (typeof handler === 'function') {
      this.messageHandlers.push(handler);
    }
  }

  /**
   * Envia uma mensagem de texto para um contato
   * @param {string} to - Número do destinatário no formato 5511999999999@c.us
   * @param {string} text - Texto a ser enviado
   * @returns {Promise} Promessa resolvida com o objeto de mensagem enviada
   */
  async sendText(to, text) {
    if (!this.isReady) {
      throw new Error('Cliente não está pronto. Aguarde a inicialização.');
    }

    // Evitar envios automáticos indesejados
    if (process.env.NODE_ENV === 'production' && !to.startsWith('55')) {
      logger.warn(`Envio bloqueado para número não autorizado: ${to}`);
      return;
    }

    try {
      const response = await this.client.sendMessage(to, text);
      logger.debug(`Mensagem enviada para ${to}`);
      return response;
    } catch (error) {
      logger.error(`Erro ao enviar mensagem para ${to}:`, error);
      throw error;
    }
  }

  /**
   * Envia uma imagem para um contato
   * @param {string} to - Número do destinatário no formato 5511999999999@c.us
   * @param {string} imagePath - Caminho local da imagem ou URL
   * @param {string} caption - Legenda opcional para a imagem
   * @returns {Promise} Promessa resolvida com o objeto de mensagem enviada
   */
  async sendImage(to, imagePath, caption = '') {
    if (!this.isReady) {
      throw new Error('Cliente não está pronto. Aguarde a inicialização.');
    }

    try {
      let media;
      
      if (imagePath.startsWith('http')) {
        media = await MessageMedia.fromUrl(imagePath);
      } else {
        const absolutePath = path.resolve(imagePath);
        if (!fs.existsSync(absolutePath)) {
          throw new Error(`Arquivo não encontrado: ${absolutePath}`);
        }
        media = MessageMedia.fromFilePath(absolutePath);
      }
      
      const response = await this.client.sendMessage(to, media, { caption });
      logger.debug(`Imagem enviada para ${to}`);
      return response;
    } catch (error) {
      logger.error(`Erro ao enviar imagem para ${to}:`, error);
      throw error;
    }
  }

  /**
   * Envia um arquivo para um contato
   * @param {string} to - Número do destinatário no formato 5511999999999@c.us
   * @param {string} filePath - Caminho local do arquivo ou URL
   * @param {string} filename - Nome do arquivo a ser exibido
   * @param {string} caption - Legenda opcional para o arquivo
   * @returns {Promise} Promessa resolvida com o objeto de mensagem enviada
   */
  async sendFile(to, filePath, filename = '', caption = '') {
    if (!this.isReady) {
      throw new Error('Cliente não está pronto. Aguarde a inicialização.');
    }

    try {
      let media;
      
      if (filePath.startsWith('http')) {
        media = await MessageMedia.fromUrl(filePath, { filename });
      } else {
        const absolutePath = path.resolve(filePath);
        if (!fs.existsSync(absolutePath)) {
          throw new Error(`Arquivo não encontrado: ${absolutePath}`);
        }
        media = MessageMedia.fromFilePath(absolutePath, filename);
      }
      
      const response = await this.client.sendMessage(to, media, { caption });
      logger.debug(`Arquivo enviado para ${to}`);
      return response;
    } catch (error) {
      logger.error(`Erro ao enviar arquivo para ${to}:`, error);
      throw error;
    }
  }

  /**
   * Obtém informações de um chat pelo ID
   * @param {string} chatId - ID do chat no formato 5511999999999@c.us
   * @returns {Promise<Chat>} Promessa resolvida com o objeto Chat
   */
  async getChat(chatId) {
    if (!this.isReady) {
      throw new Error('Cliente não está pronto. Aguarde a inicialização.');
    }

    try {
      return await this.client.getChatById(chatId);
    } catch (error) {
      logger.error(`Erro ao obter chat ${chatId}:`, error);
      throw error;
    }
  }

  /**
   * Desconecta o cliente WhatsApp
   */
  async disconnect() {
    if (this.client) {
      try {
        await this.client.destroy();
        this.isReady = false;
        logger.info('Cliente WhatsApp desconectado.');
      } catch (error) {
        logger.error('Erro ao desconectar cliente:', error);
        throw error;
      }
    }
  }
}

module.exports = new MessagingService();