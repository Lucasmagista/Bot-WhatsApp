import React, { createContext, useContext, useState } from 'react';

const NotificationContext = createContext();

export const useNotification = () => useContext(NotificationContext);

const NotificationProvider = ({ children }) => {
    const [notifications, setNotifications] = useState([]);

    const addNotification = (message, type = 'info') => {
        setNotifications((prev) => [...prev, { id: Date.now(), message, type }]);
    };

    const removeNotification = (id) => {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
    };

    return (
        <NotificationContext.Provider value={{ addNotification }}>
            <div className="notification-container">
                {notifications.map((n) => (
                    <div key={n.id} className={`notification ${n.type}`}>
                        {n.message}
                        <button onClick={() => removeNotification(n.id)}>X</button>
                    </div>
                ))}
            </div>
            {children}
        </NotificationContext.Provider>
    );
};

export default NotificationProvider;
