import React from 'react';
import './Footer.css'; // Certifique-se de que o arquivo Footer.css exista

const Footer = () => {
    return (
        <footer className="footer">
            <div className="footer-content">
                <p>&copy; {new Date().getFullYear()} Meu Bot Dashboard. Todos os direitos reservados.</p>
                <div className="footer-links">
                    <a href="/privacy-policy">Política de Privacidade</a>
                    <a href="/terms-of-service">Termos de Serviço</a>
                </div>
            </div>
        </footer>
    );
};

export default Footer;