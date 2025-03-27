/**
 * Utilitário para verificação de tempo e horários
 */

/**
 * Obtém a data e hora atual
 * @returns {Date} Objeto Date representando o momento atual
 * @private
 */
function _getCurrentDateTime() {
    return new Date();
  }
  
  /**
   * Verifica se o horário atual está dentro do horário comercial
   * @param {Object} [options] Opções de configuração
   * @param {number} [options.startHour=8] Hora de início do expediente (0-23)
   * @param {number} [options.endHour=18] Hora de término do expediente (0-23)
   * @param {Array<number>} [options.workDays=[1,2,3,4,5]] Dias de trabalho (0=domingo, 6=sábado)
   * @returns {boolean} Verdadeiro se estiver em horário comercial
   * @example
   * // Verifica usando configuração padrão (seg-sex, 8h-18h)
   * isBusinessHours();
   * 
   * // Verifica usando configuração personalizada (seg-sáb, 9h-19h)
   * isBusinessHours({ startHour: 9, endHour: 19, workDays: [1,2,3,4,5,6] });
   */
  function isBusinessHours(options = {}) {
    const { 
      startHour = 8, 
      endHour = 18, 
      workDays = [1, 2, 3, 4, 5] 
    } = options;
    
    // Validação de parâmetros
    if (startHour < 0 || startHour > 23 || endHour < 0 || endHour > 23) {
      throw new Error('As horas devem estar entre 0 e 23');
    }
    
    if (!Array.isArray(workDays) || workDays.some(day => day < 0 || day > 6)) {
      throw new Error('Os dias de trabalho devem ser um array com valores entre 0 e 6');
    }
    
    const now = _getCurrentDateTime();
    const hours = now.getHours();
    const day = now.getDay();
    
    return workDays.includes(day) && isTimeBetween(startHour, endHour);
  }
  
  /**
   * Verifica se a hora atual está entre determinados horários
   * @param {number} startHour Hora inicial (0-23)
   * @param {number} endHour Hora final (0-23)
   * @param {Date} [customDate] Data personalizada para verificação (opcional)
   * @returns {boolean} Verdadeiro se a hora atual estiver no intervalo
   * @example
   * // Verifica se o horário atual está entre 9h e 17h
   * isTimeBetween(9, 17);
   * 
   * // Verifica se o horário está entre 22h e 6h (período noturno)
   * isTimeBetween(22, 6);
   */
  function isTimeBetween(startHour, endHour, customDate) {
    // Validação de parâmetros
    if (startHour < 0 || startHour > 23 || endHour < 0 || endHour > 23) {
      throw new Error('As horas devem estar entre 0 e 23');
    }
    
    const date = customDate || _getCurrentDateTime();
    const currentHour = date.getHours();
    
    // Caso especial: período que cruza a meia-noite
    if (startHour > endHour) {
      return currentHour >= startHour || currentHour < endHour;
    }
    
    // Caso normal: startHour <= endHour
    return currentHour >= startHour && currentHour < endHour;
  }
  
  /**
   * Retorna uma saudação baseada no horário atual
   * @param {string} [language='pt-BR'] Código do idioma para a saudação
   * @param {Date} [customDate] Data personalizada para saudação (opcional)
   * @returns {string} Saudação apropriada para o horário
   * @example
   * // Retorna saudação em português
   * getGreetingByTime(); // "Bom dia", "Boa tarde" ou "Boa noite"
   * 
   * // Retorna saudação em inglês
   * getGreetingByTime('en-US'); // "Good morning", "Good afternoon" ou "Good evening"
   */
  function getGreetingByTime(language = 'pt-BR', customDate) {
    const date = customDate || _getCurrentDateTime();
    const hours = date.getHours();
    
    const greetings = {
      'pt-BR': {
        morning: 'Bom dia',
        afternoon: 'Boa tarde',
        evening: 'Boa noite'
      },
      'en-US': {
        morning: 'Good morning',
        afternoon: 'Good afternoon',
        evening: 'Good evening'
      },
      'es-ES': {
        morning: 'Buenos días',
        afternoon: 'Buenas tardes',
        evening: 'Buenas noches'
      }
    };
    
    // Fallback para pt-BR se o idioma não for suportado
    const selectedLanguage = greetings[language] ? language : 'pt-BR';
    
    if (hours < 12) return greetings[selectedLanguage].morning;
    if (hours < 18) return greetings[selectedLanguage].afternoon;
    return greetings[selectedLanguage].evening;
  }
  
  /**
   * Verifica se a data atual é um dia útil (segunda a sexta)
   * @param {Date} [customDate] Data personalizada para verificação (opcional)
   * @returns {boolean} Verdadeiro se for um dia útil
   */
  function isWeekday(customDate) {
    const date = customDate || _getCurrentDateTime();
    const day = date.getDay();
    
    return day >= 1 && day <= 5;
  }
  
  /**
   * Verifica se a data atual é um fim de semana (sábado ou domingo)
   * @param {Date} [customDate] Data personalizada para verificação (opcional)
   * @returns {boolean} Verdadeiro se for um fim de semana
   */
  function isWeekend(customDate) {
    const date = customDate || _getCurrentDateTime();
    const day = date.getDay();
    
    return day === 0 || day === 6;
  }
  
  /**
   * Formata a hora atual ou uma data específica em um formato amigável
   * @param {Date} [customDate] Data personalizada para formatação (opcional)
   * @param {string} [format='HH:MM'] Formato de saída (HH:MM, HH:MM:SS)
   * @returns {string} Hora formatada
   */
  function formatTime(customDate, format = 'HH:MM') {
    const date = customDate || _getCurrentDateTime();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    
    if (format === 'HH:MM') {
      return `${hours}:${minutes}`;
    } else if (format === 'HH:MM:SS') {
      const seconds = date.getSeconds().toString().padStart(2, '0');
      return `${hours}:${minutes}:${seconds}`;
    }
    
    return `${hours}:${minutes}`;
  }
  
  module.exports = {
    isBusinessHours,
    isTimeBetween,
    getGreetingByTime,
    isWeekday,
    isWeekend,
    formatTime
  };