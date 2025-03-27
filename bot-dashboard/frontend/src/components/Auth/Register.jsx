import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom'; // Substituído useHistory
import { registerUser } from '../../services/auth';

const Register = () => {
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        password: '',
    });
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false); // Adicionado
    const navigate = useNavigate(); // Substituído useHistory

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData({ ...formData, [name]: value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoading(true); // Adicionado

        try {
            await registerUser(formData);
            navigate('/login'); // Substituído history.push
        } catch (err) {
            setError(err.response?.data?.message || 'Erro ao registrar. Tente novamente.');
        } finally {
            setIsLoading(false); // Adicionado
        }
    };

    return (
        <div className="register-container">
            <h2>Registrar</h2>
            {error && <p className="error-message" aria-live="polite">{error}</p>} {/* Adicionado aria-live */}
            <form onSubmit={handleSubmit}>
                <div>
                    <label htmlFor="username">Nome de Usuário</label>
                    <input
                        type="text"
                        id="username"
                        name="username"
                        value={formData.username}
                        onChange={handleChange}
                        required
                    />
                </div>
                <div>
                    <label htmlFor="email">Email</label>
                    <input
                        type="email"
                        id="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        required
                    />
                </div>
                <div>
                    <label htmlFor="password">Senha</label>
                    <input
                        type="password"
                        id="password"
                        name="password"
                        value={formData.password}
                        onChange={handleChange}
                        required
                    />
                </div>
                <button type="submit" disabled={isLoading}>
                    {isLoading ? 'Registrando...' : 'Registrar'} {/* Adicionado feedback visual */}
                </button>
            </form>
            <p>Já tem uma conta? <a href="/login">Faça login</a></p>
        </div>
    );
};

export default Register;