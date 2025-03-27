import React from 'react';
import { Link } from 'react-router-dom';
import './Header.css'; // Certifique-se de criar o arquivo Header.css com os estilos necessários.

const Header = () => {
    return (
        <header className="header">
            <div className="logo">
                <h1>Bot Dashboard</h1>
            </div>
            <nav className="navigation">
                <ul>
                    <li>
                        <Link to="/dashboard">Dashboard</Link>
                    </li>
                    <li>
                        <Link to="/settings">Settings</Link>
                    </li>
                    <li>
                        <Link to="/login">Login</Link>
                    </li>
                </ul>
            </nav>
        </header>
    );
};

export default Header;