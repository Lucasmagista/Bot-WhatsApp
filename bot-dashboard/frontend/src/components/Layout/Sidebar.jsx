import React from 'react';
import { NavLink } from 'react-router-dom';
import './Sidebar.css'; // Certifique-se de que o arquivo Sidebar.css exista

const Sidebar = () => {
    return (
        <div className="sidebar">
            <h2>Bot Dashboard</h2>
            <nav>
                <ul>
                    <li>
                        <NavLink to="/dashboard" activeClassName="active">
                            Dashboard
                        </NavLink>
                    </li>
                    <li>
                        <NavLink to="/dashboard/bot-status" activeClassName="active">
                            Status do Bot
                        </NavLink>
                    </li>
                    <li>
                        <NavLink to="/dashboard/commands" activeClassName="active">
                            Lista de Comandos
                        </NavLink>
                    </li>
                    <li>
                        <NavLink to="/dashboard/statistics" activeClassName="active">
                            Estatísticas
                        </NavLink>
                    </li>
                    <li>
                        <NavLink to="/dashboard/settings" activeClassName="active">
                            Configurações
                        </NavLink>
                    </li>
                </ul>
            </nav>
        </div>
    );
};

export default Sidebar;