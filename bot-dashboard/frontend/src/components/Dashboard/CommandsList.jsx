import React, { useEffect, useState } from 'react';
import { fetchCommands } from '../../services/api'; // Corrigido o caminho

const CommandsList = () => {
    const [commands, setCommands] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const getCommands = async () => {
            try {
                const data = await fetchCommands();
                setCommands(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        getCommands();
    }, []);

    if (loading) {
        return <div>Loading commands...</div>;
    }

    if (error) {
        return <div>Error fetching commands: {error}</div>;
    }

    return (
        <div>
            <h2>Commands List</h2>
            <ul>
                {commands.map((command) => (
                    <li key={command.id}>
                        <strong>{command.name}</strong>: {command.description}
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default CommandsList;