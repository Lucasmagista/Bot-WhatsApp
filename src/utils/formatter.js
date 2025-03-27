/**
 * Funções utilitárias para formatação de mensagens e dados
 */
const formatUtils = {
    /**
     * Formata um valor numérico para formato de preço em Real (BRL)
     * @param {number} price - Valor a ser formatado
     * @returns {string} Valor formatado como moeda
     */
    formatPrice: (price) => {
        if (typeof price !== 'number' || isNaN(price)) return 'R$ 0,00';

        return new Intl.NumberFormat('pt-BR', {
            style: 'currency', 
            currency: 'BRL'
        }).format(price);
    },

    /**
     * Formata um objeto Date para o formato brasileiro
     * @param {Date} date - Data a ser formatada
     * @returns {string} Data formatada (DD/MM/YYYY)
     */
    formatDate: (date) => {
        if (!(date instanceof Date) || isNaN(date.getTime())) return '';

        return date.toLocaleDateString('pt-BR');
    },

    /**
     * Formata um horário para exibição
     * @param {string} time - Horário no formato HH:MM ou HH:MM:SS
     * @returns {string} Horário formatado
     */
    formatTime: (time) => {
        if (typeof time !== 'string') return '';

        const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/;
        if (!timeRegex.test(time)) return time;

        const parts = time.split(':');
        return parts.length === 3 
            ? `${parts[0]}h${parts[1]}min${parts[2]}s` 
            : `${parts[0]}h${parts[1]}min`;
    },

    /**
     * Formata um número de telefone para o padrão brasileiro
     * @param {string} phone - Número de telefone (apenas dígitos)
     * @returns {string} Telefone formatado
     */
    formatPhone: (phone) => {
        if (typeof phone !== 'string') return '';

        const digits = phone.replace(/\D/g, '');

        if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
        if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
        if (digits.length === 9) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
        if (digits.length === 8) return `${digits.slice(0, 4)}-${digits.slice(4)}`;

        return phone;
    },

    /**
     * Formata um CPF para o padrão brasileiro
     * @param {string} cpf - CPF (apenas dígitos)
     * @returns {string} CPF formatado ou erro
     */
    formatCPF: (cpf) => {
        if (typeof cpf !== 'string') throw new Error('CPF deve ser uma string.');

        const digits = cpf.replace(/\D/g, '');

        if (digits.length !== 11) throw new Error('CPF inválido.');

        return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
    },

    /**
     * Formata um CNPJ para o padrão brasileiro
     * @param {string} cnpj - CNPJ (apenas dígitos)
     * @returns {string} CNPJ formatado
     */
    formatCNPJ: (cnpj) => {
        if (typeof cnpj !== 'string') throw new Error('CNPJ deve ser uma string.');

        const digits = cnpj.replace(/\D/g, '');

        if (digits.length !== 14) throw new Error('CNPJ inválido.');

        return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
    },

    /**
     * Formata um texto para lista de opções WhatsApp
     * @param {Array<{id: number, name: string, price?: number}>} items - Array de itens
     * @param {boolean} includePrices - Se deve incluir preços na formatação
     * @returns {string} Texto formatado como lista numerada
     */
    formatOptionsList: function (items, includePrices = false) {
        if (!Array.isArray(items) || items.length === 0) return 'Nenhuma opção disponível';

        return items.map((item, index) => {
            const priceText = includePrices && item.price ? ` (${this.formatPrice(item.price)})` : '';
            return `${index + 1}. ${item.name}${priceText}`;
        }).join('\n');
    },

    /**
     * Formata o nome próprio (primeira letra de cada palavra em maiúsculo)
     * @param {string} name - Nome a ser formatado
     * @returns {string} Nome formatado
     */
    formatName: (name) => {
        if (typeof name !== 'string') throw new Error('Nome deve ser uma string.');

        return name.trim().replace(/\s+/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
    },

    /**
     * Formata um texto para limitar o número de caracteres
     * @param {string} text - Texto a ser limitado
     * @param {number} maxLength - Tamanho máximo
     * @returns {string} Texto formatado
     */
    truncateText: (text, maxLength = 100) => {
        if (typeof text !== 'string') return '';

        return text.length <= maxLength ? text : text.substring(0, maxLength) + '...';
    },

    /**
     * Formata um número de telefone para o padrão internacional
     * @param {string} phoneNumber - Número de telefone no formato bruto
     * @returns {string} Número de telefone formatado
     */
    formatPhoneNumber: (phoneNumber) => {
        if (typeof phoneNumber !== 'string') throw new Error('Número de telefone deve ser uma string.');

        const cleaned = phoneNumber.replace(/\D/g, '');

        if (cleaned.length === 12 && cleaned.startsWith('55')) {
            return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
        } else if (cleaned.length === 11) {
            return `+55 (${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
        } else if (cleaned.length === 10) {
            return `+55 (${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
        } else {
            throw new Error(`Número de telefone inválido: ${phoneNumber}`);
        }
    }
};

module.exports = formatUtils;
