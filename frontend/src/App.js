import React, { useState, useEffect } from 'react';
import './App.css';

const tg = window.Telegram.WebApp;
const API_URL = 'https://твой-бэкенд.onrender.com'; // СЮДА ВСТАВЬ ССЫЛКУ ИЗ RENDER

function App() {
    const [user] = useState(tg.initDataUnsafe?.user || { id: '000000', first_name: 'User' });
    const [balance, setBalance] = useState(0);
    const [clickPower, setClickPower] = useState(1);
    const [passiveIncome, setPassiveIncome] = useState(0);
    const [clicks, setClicks] = useState([]);
    const [activeTab, setActiveTab] = useState('home');

    // Загрузка данных
    useEffect(() => {
        tg.ready();
        tg.expand();
        
        const loadData = async () => {
            try {
                const res = await fetch(`${API_URL}/api/user/${user.id}`);
                const data = await res.json();
                setBalance(Number(data.balance));
                setClickPower(Number(data.clickPower));
                setPassiveIncome(Number(data.passiveIncome));
            } catch (e) {
                console.error("Ошибка при связи с сервером");
            }
        };
        loadData();
    }, [user.id]);

    // Пассивный доход (начисление на клиенте для визуала)
    useEffect(() => {
        if (passiveIncome > 0) {
            const interval = setInterval(() => {
                setBalance(prev => prev + (passiveIncome / 10));
            }, 100);
            return () => clearInterval(interval);
        }
    }, [passiveIncome]);

    const handleTap = (e) => {
        if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
        const newBalance = balance + clickPower;
        setBalance(newBalance);

        // Анимация +X
        const id = Date.now();
        const x = e.clientX || (e.touches && e.touches[0].clientX);
        const y = e.clientY || (e.touches && e.touches[0].clientY);
        setClicks((prev) => [...prev, { id, x, y, value: clickPower }]);
        setTimeout(() => setClicks((prev) => prev.filter(c => c.id !== id)), 800);

        fetch(`${API_URL}/api/tap`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id, clientBalance: newBalance })
        }).catch(() => {});
    };

    const buyUpgrade = async (type) => {
        try {
            const res = await fetch(`${API_URL}/api/upgrade/${type}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id })
            });

            const data = await res.json();

            if (res.ok) {
                setBalance(Number(data.balance));
                setClickPower(Number(data.clickPower));
                setPassiveIncome(Number(data.passiveIncome));
                if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
            } else {
                tg.showAlert("Недостаточно средств");
            }
        } catch (err) {
            console.error("Ошибка покупки");
        }
    };

    return (
        <div className="App">
            {/* ШАПКА */}
            <header className="main-header">
                <div className="header-user">
                    <div className="mini-avatar">
                        {user.photo_url ? <img src={user.photo_url} alt="" /> : user.first_name[0]}
                    </div>
                    <span>{user.first_name}</span>
                </div>
                <div className="header-balance">
                    <span className="balance-value">{Math.floor(balance).toLocaleString()}</span>
                    <div className="coin-icon"></div>
                </div>
            </header>

            <div className="content">
                {activeTab === 'home' && (
                    <div className="tab-home">
                        <div className="stats-grid">
                            <div className="stat-item">
                                <span className="stat-label">КЛИК</span>
                                <span className="stat-val">+{clickPower}</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-label">ДОХОД / С</span>
                                <span className="stat-val">+{passiveIncome}</span>
                            </div>
                        </div>

                        <div className="click-area">
                            <div className="click-circle" onClick={handleTap}>
                                <div className="click-inner">
                                    <svg viewBox="0 0 24 24" width="80" height="80" fill="var(--accent-color)">
                                        <path d="M12 2L4.5 20.29L5.21 21L12 18L18.79 21L19.5 20.29L12 2Z" />
                                    </svg>
                                </div>
                            </div>
                        </div>

                        {clicks.map(c => (
                            <div key={c.id} className="tap-anim" style={{ left: c.x, top: c.y }}>
                                +{c.value}
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'shop' && (
                    <div className="tab-shop">
                        <h2 className="tab-title">Улучшения</h2>
                        <div className="upgrade-list">
                            <div className="upg-card" onClick={() => buyUpgrade('click')}>
                                <div className="upg-text">
                                    <span className="upg-name">Мультитап</span>
                                    <span className="upg-desc">Увеличить силу клика</span>
                                </div>
                                <div className="upg-price">{clickPower * 100}</div>
                            </div>
                            <div className="upg-card" onClick={() => buyUpgrade('passive')}>
                                <div className="upg-text">
                                    <span className="upg-name">Авто-майнинг</span>
                                    <span className="upg-desc">Пассивный доход в сек.</span>
                                </div>
                                <div className="upg-price">{(Math.floor(passiveIncome / 5) + 1) * 150}</div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'profile' && (
                    <div className="tab-profile">
                        <div className="profile-card">
                            <div className="big-avatar">
                                {user.photo_url ? <img src={user.photo_url} alt="" /> : user.first_name[0]}
                            </div>
                            <h1 className="profile-name">{user.first_name}</h1>
                            <p className="profile-id">ID: {user.id}</p>
                        </div>
                    </div>
                )}
            </div>

            {/* НАВИГАЦИЯ */}
            <nav className="bottom-nav">
                <button className={activeTab === 'home' ? 'active' : ''} onClick={() => setActiveTab('home')}>
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
                    <span>Главная</span>
                </button>
                <button className={activeTab === 'shop' ? 'active' : ''} onClick={() => setActiveTab('shop')}>
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/></svg>
                    <span>Магазин</span>
                </button>
                <button className={activeTab === 'profile' ? 'active' : ''} onClick={() => setActiveTab('profile')}>
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                    <span>Профиль</span>
                </button>
            </nav>
        </div>
    );
}

export default App;