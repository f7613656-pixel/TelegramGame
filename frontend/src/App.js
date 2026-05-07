import React, { useState, useEffect, useCallback } from 'react';
import './App.css';

// Инициализация Telegram WebApp SDK
const tg = window.Telegram.WebApp;
const API_URL = 'https://твой-бэкенд.onrender.com'; // ЗАМЕНИ НА СВОЮ ССЫЛКУ

function App() {
    // Данные пользователя из Telegram
    const [user] = useState(tg.initDataUnsafe?.user || { id: 'test_user', first_name: 'Игрок' });
    
    // Состояние игры
    const [balance, setBalance] = useState(0);
    const [clickPower, setClickPower] = useState(1);
    const [passiveIncome, setPassiveIncome] = useState(0);
    const [clicks, setClicks] = useState([]); // Для анимации вылетающих цифр

    // 1. Загрузка данных при старте
    useEffect(() => {
        tg.ready();
        tg.expand(); // Развернуть на весь экран
        
        const loadUserData = async () => {
            try {
                const res = await fetch(`${API_URL}/api/user/${user.id}`);
                const data = await res.json();
                setBalance(Number(data.balance));
                setClickPower(Number(data.clickPower));
                setPassiveIncome(Number(data.passiveIncome));
            } catch (err) {
                console.error("Ошибка при загрузке данных:", err);
            }
        };
        loadUserData();
    }, [user.id]);

    // 2. Логика тапа (клика)
    const handleTap = (e) => {
        // Виброотклик
        if (tg.HapticFeedback) {
            tg.HapticFeedback.impactOccurred('medium');
        }

        const newBalance = balance + clickPower;
        setBalance(newBalance);

        // Анимация "+1" в месте клика
        const id = Date.now();
        const x = e.pageX || (e.touches && e.touches[0].pageX);
        const y = e.pageY || (e.touches && e.touches[0].pageY);
        
        setClicks((prev) => [...prev, { id, x, y }]);
        setTimeout(() => {
            setClicks((prev) => prev.filter(c => c.id !== id));
        }, 800);

        // Синхронизация с сервером (отправляем новый баланс)
        fetch(`${API_URL}/api/tap`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id, clientBalance: newBalance })
        }).catch(err => console.error("Ошибка синхронизации тапа"));
    };

    // 3. Покупка улучшений
    const buyUpgrade = async (type) => {
        try {
            const res = await fetch(`${API_URL}/api/upgrade/${type}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id })
            });

            if (res.ok) {
                const data = await res.json();
                setBalance(Number(data.balance));
                setClickPower(Number(data.clickPower));
                setPassiveIncome(Number(data.passiveIncome));
                tg.HapticFeedback.notificationOccurred('success');
            } else {
                const errorText = await res.text();
                tg.showAlert(`Недостаточно монет!`);
            }
        } catch (err) {
            console.error("Ошибка при покупке:", err);
        }
    };

    // 4. Пассивный доход (визуальное обновление каждую секунду)
    useEffect(() => {
        const interval = setInterval(() => {
            setBalance((prev) => prev + (passiveIncome / 10));
        }, 100); // Обновляем раз в 0.1 сек для плавности
        return () => clearInterval(interval);
    }, [passiveIncome]);

    return (
        <div className="App">
            {/* Шапка профиля */}
            <div className="header">
                <div className="user-info">
                    {user.photo_url && <img src={user.photo_url} alt="avatar" className="avatar" />}
                    <span>{user.first_name} {user.last_name || ''}</span>
                </div>
                <div className="stats">
                    <span>⚡ {clickPower}</span>
                    <span>⏳ {passiveIncome}/с</span>
                </div>
            </div>

            {/* Основная зона клика */}
            <div className="clicker-container">
                <div className="balance-display">
                    <img src="https://cdn-icons-png.flaticon.com/512/290/290836.png" alt="coin" width="40" />
                    <h1>{Math.floor(balance).toLocaleString()}</h1>
                </div>

                <div className="main-button" onClick={handleTap}>
                    <img 
                        src="https://img.freepik.com/free-vector/banana-cartoon-style_1308-100234.jpg" 
                        alt="banana" 
                        className="banana-img"
                    />
                </div>
            </div>

            {/* Магазин улучшений */}
            <div className="shop">
                <button className="upgrade-btn" onClick={() => buyUpgrade('click')}>
                    <div className="btn-text">
                        <b>Улучшить тап</b>
                        <span>Цена: {clickPower * 100} 🍌</span>
                    </div>
                </button>

                <button className="upgrade-btn" onClick={() => buyUpgrade('passive')}>
                    <div className="btn-text">
                        <b>Видеокарта</b>
                        <span>Цена: {(Math.floor(passiveIncome / 5) + 1) * 150} 🍌</span>
                    </div>
                </button>
            </div>

            {/* Слой для анимаций клика */}
            {clicks.map(click => (
                <div 
                    key={click.id} 
                    className="click-animation" 
                    style={{ left: click.x, top: click.y }}
                >
                    +{clickPower}
                </div>
            ))}
        </div>
    );
}

export default App;