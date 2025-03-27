import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../../services/auth';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false); // Adicionado
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoading(true); // Adicionado

        try {
            await login(email, password);
            navigate('/dashboard');
        } catch (err) {
            setError('Falha ao fazer login. Verifique suas credenciais.');
        } finally {
            setIsLoading(false); // Adicionado
        }
    };

    return (
        <div className="login-container">
            <h2>Login</h2>
            {error && <p className="error" aria-live="polite">{error}</p>} {/* Adicionado aria-live */}
            <form onSubmit={handleSubmit}>
                <div>
                    <label>Email:</label>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                </div>
                <div>
                    <label>Senha:</label>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                </div>
                <button type="submit" disabled={isLoading}>
                    {isLoading ? 'Entrando...' : 'Entrar'} {/* Adicionado feedback visual */}
                </button>
            </form>
        </div>
    );
};

export default Login;