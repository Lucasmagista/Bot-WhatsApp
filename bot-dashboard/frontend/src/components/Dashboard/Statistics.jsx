import React, { useEffect, useState } from 'react';
import axios from 'axios';

const Statistics = () => {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchStatistics = async () => {
            try {
                const response = await axios.get('/api/dashboard/statistics');
                setStats(response.data);
            } catch (err) {
                setError('Erro ao carregar estatísticas');
            } finally {
                setLoading(false);
            }
        };

        fetchStatistics();
    }, []);

    if (loading) {
        return <div>Carregando...</div>;
    }

    if (error) {
        return <div>{error}</div>;
    }

    return (
        <div>
            <h2>Estatísticas do Bot</h2>
            <ul>
                <li>Usuários Ativos: {stats.activeUsers}</li>
                <li>Comandos Executados: {stats.commandsExecuted}</li>
                <li>Tempo de Atividade: {stats.uptime}</li>
            </ul>
        </div>
    );
};

export default Statistics;