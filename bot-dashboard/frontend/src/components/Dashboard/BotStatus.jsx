import React, { useEffect, useState } from 'react';
import axios from 'axios';

const BotStatus = () => {
    const [status, setStatus] = useState('Loading...');
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchBotStatus = async () => {
            try {
                const response = await axios.get('/api/bot/status');
                setStatus(response.data.status);
            } catch (err) {
                setError('Error fetching bot status');
            }
        };

        fetchBotStatus();
    }, []);

    return (
        <div className="bot-status">
            <h2>Bot Status</h2>
            {error ? (
                <p className="error">{error}</p>
            ) : (
                <p className="status">{status}</p>
            )}
        </div>
    );
};

export default BotStatus;