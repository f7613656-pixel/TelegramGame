import React, { useState, useEffect } from 'react';
import './App.css';

const tg = window.Telegram.WebApp;
const API_URL = 'https://твой-бэкенд.onrender.com'; // ЗАМЕНИ НА СВОЮ ССЫЛКУ

function App() {
    const [user] = useState(tg.initDataUnsafe?.user || { id: 'test_user', first_name: 'BANANEZLAL' });
    const [balance, setBalance] = useState(0);
    const [clickPower, setClickPower] = useState(1);
    const [passiveIncome, setPassiveIncome] = useState(0);
    const [clicks, setClicks] = useState([]); // Для вылетающих цифр

    useEffect(() => {
        tg.ready();
        tg.expand();
        
        const loadData = async () => {
            try {
                const res = await fetch(`${API_URL}/api/user/${user.id}`);
                const data = await res.json();
                setBalance(data.balance);
                setClickPower(data.clickPower);
                setPassiveIncome(data.passiveIncome);
            } catch (e) { console.error("Ошибка загрузки"); }
        };
        loadData();
    }, [user.id]);

    const handleTap = (e) => {
        // Виброотклик
        if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');

        const newBalance = balance + clickPower;
        setBalance(newBalance);

        // Создаем анимацию цифр
        const id = Date.now();
        const x = e.clientX || e.touches[0].clientX;
        const y = e.clientY || e.touches[0].clientY;
        
        setClicks((prev) => [...prev, { id, x, y, value: clickPower }]);
        setTimeout(() => {
            setClicks((prev) => prev.filter(c => c.id !== id));
        }, 800);

        // Отправка на сервер
        fetch(`${API_URL}/api/tap`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id, clientBalance: newBalance })
        });
    };

    return (
        <div className="App">
            {/* ВЕРХНЕЕ МЕНЮ (КАК НА СКРИНШОТЕ) */}
            <header className="top-header">
                <div className="user-block">
                    <div className="avatar-container">
                        {user.photo_url ? (
                            <img src={user.photo_url} alt="" className="user-photo" />
                        ) : (
                            <div className="user-photo-stub">{user.first_name[0]}</div>
                        )}
                    </div>
                    <span className="user-name">{user.first_name.toUpperCase()}</span>
                </div>
                
                <div className="currency-pill">
                    <div className="balance-item">
                        <span className="val">{Math.floor(balance).toLocaleString()}</span>
                        <img src="https://cdn-icons-png.flaticon.com/512/290/290836.png" width="16" alt="" />
                    </div>
                    <div className="divider">|</div>
                    <div className="balance-item">
                        <span className="val">0</span>
                        <span className="star-icon">⭐</span>
                    </div>
                </div>
            </header>

            {/* СТАТИСТИКА КЛИКА */}
            <div className="stats-container">
                <div className="stat-card">
                    <small>За клик</small>
                    <p>+{clickPower}</p>
                </div>
                <div className="stat-card">
                    <small>В секунду</small>
                    <p>+{passiveIncome}</p>
                </div>
            </div>

            {/* ИГРОВАЯ ЗОНА */}
            <main className="click-zone">
                <div className="main-circle" onClick={handleTap}>
                    <div className="inner-circle">
                        <img src="https://cdn-icons-png.flaticon.com/512/290/290836.png" alt="coin" />
                    </div>
                </div>
            </main>

            {/* ВЫЛЕТАЮЩИЕ ЦИФРЫ */}
            {clicks.map(c => (
                <div key={c.id} className="floating-number" style={{ left: c.x, top: c.y }}>
                    +{c.value}
                </div>
            ))}

            {/* НИЖНЕЕ МЕНЮ (КАК НА СКРИНШОТЕ) */}
            <nav className="bottom-nav">
                <div className="nav-item active">
                    <span className="nav-icon">🏠</span>
                    <span className="nav-label">ГЛАВНАЯ</span>
                </div>
                <div className="nav-item">
                    <span className="nav-icon">🛒</span>
                    <span className="nav-label">МАГАЗИН</span>
                </div>
                <div className="nav-item">
                    <span className="nav-icon">🏆</span>
                    <span className="nav-label">ТОПЫ</span>
                </div>
                <div className="nav-item">
                    <span className="nav-icon">👤</span>
                    <span className="nav-label">ПРОФИЛЬ</span>
                </div>
            </nav>
        </div>
    );
}

export default App;