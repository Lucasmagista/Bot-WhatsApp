function formatPhoneNumber(phone) {
    // Implementação da função
    return phone.replace(/\D/g, '').replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
}
module.exports = { formatPhoneNumber };
