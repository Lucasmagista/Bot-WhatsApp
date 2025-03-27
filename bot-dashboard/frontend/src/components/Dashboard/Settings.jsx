import React, { useState, useEffect } from 'react';
import { getBotSettings, updateBotSettings } from '../../services/api'; // Corrigido o caminho

const Settings = () => {
    const [settings, setSettings] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isSaving, setIsSaving] = useState(false); // Adicionado

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const response = await getBotSettings();
                setSettings(response.data);
            } catch (err) {
                setError('Failed to load settings');
            } finally {
                setLoading(false);
            }
        };

        fetchSettings();
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setSettings((prevSettings) => ({
            ...prevSettings,
            [name]: value,
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSaving(true); // Adicionado
        try {
            await updateBotSettings(settings);
            alert('Settings updated successfully');
        } catch (err) {
            setError('Failed to update settings');
        } finally {
            setIsSaving(false); // Adicionado
        }
    };

    if (loading) return <div>Loading...</div>;
    if (error) return <div>{error}</div>;

    return (
        <div>
            <h2>Bot Settings</h2>
            <form onSubmit={handleSubmit}>
                <div>
                    <label>
                        Bot Name:
                        <input
                            type="text"
                            name="botName"
                            value={settings.botName || ''}
                            onChange={handleChange}
                        />
                    </label>
                </div>
                <div>
                    <label>
                        Bot Token:
                        <input
                            type="text"
                            name="botToken"
                            value={settings.botToken || ''}
                            onChange={handleChange}
                        />
                    </label>
                </div>
                <div>
                    <label>
                        Status:
                        <select
                            name="status"
                            value={settings.status || ''}
                            onChange={handleChange}
                        >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                        </select>
                    </label>
                </div>
                <button type="submit" disabled={isSaving}>
                    {isSaving ? 'Salvando...' : 'Salvar Configurações'}
                </button>
            </form>
        </div>
    );
};

export default Settings;