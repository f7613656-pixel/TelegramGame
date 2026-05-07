import React, { useState, useEffect } from 'react';
import './App.css';

const tg = window.Telegram.WebApp;
// ВАЖНО: Замени на свою актуальную ссылку с Render!
const API_URL = 'https://telegramgame-1.onrender.com'; 

function App() {
    const [user] = useState(tg.initDataUnsafe?.user || { id: '000000', first_name: 'User' });
    const [balance, setBalance] = useState(0);
    const [clickPower, setClickPower] = useState(1);
    const [passiveIncome, setPassiveIncome] = useState(0);
    const [clicks, setClicks] = useState([]);
    const [activeTab, setActiveTab] = useState('home');

    useEffect(() => {
        tg.ready();
        tg.expand();
        
        const loadData = async () => {
            try {
                console.log("Запрос данных для пользователя:", user.id);
                const res = await fetch(`${API_URL}/api/user/${user.id}`);
                const data = await res.json();
                setBalance(Number(data.balance));
                setClickPower(Number(data.clickPower));
                setPassiveIncome(Number(data.passiveIncome));
            } catch (e) {
                console.error("Ошибка при получении данных:", e);
            }
        };
        loadData();
    }, [user.id]);

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

        const id = Date.now();
        const x = e.clientX || (e.touches && e.touches[0].clientX);
        const y = e.clientY || (e.touches && e.touches[0].clientY);
        setClicks((prev) => [...prev, { id, x, y, value: clickPower }]);
        setTimeout(() => setClicks((prev) => prev.filter(c => c.id !== id)), 800);

        fetch(`${API_URL}/api/tap`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id, clientBalance: newBalance })
        }).catch(err => console.error("Ошибка сохранения тапа:", err));
    };

    const buyUpgrade = async (type) => {
        console.log("Попытка покупки апгрейда:", type);
        try {
            const res = await fetch(`${API_URL}/api/upgrade/${type}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id })
            });

            if (res.ok) {
                const data = await res.json();
                console.log("Апгрейд успешен:", data);
                setBalance(Number(data.balance));
                setClickPower(Number(data.clickPower));
                setPassiveIncome(Number(data.passiveIncome));
                if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
            } else {
                const error = await res.json();
                tg.showAlert(error.message || "Не хватает монет");
            }
        } catch (err) {
            console.error("Ошибка соединения с сервером:", err);
            tg.showAlert("Сервер не отвечает. Проверь API_URL.");
        }
    };

    return (
        <div className="App">
            <header className="main-header">
    <div className="header-glass">
        <div className="user-pill">
            <div className="mini-avatar">
                {user.photo_url ? <img src={user.photo_url} alt="" /> : user.first_name[0]}
            </div>
            <span className="user-name">{user.first_name}</span>
        </div>
        
        <div className="balance-pill">
    <div className="crystal-icon"></div>
    <span className="balance-value">{Math.floor(balance).toLocaleString()}</span>
</div>
    </div>
</header>

            <div className="content">
                {activeTab === 'home' && (
                    <div className="tab-home">
                        <div className="stats-grid">
    <div className="stat-card tap-style">
        <div className="stat-indicator"></div>
        <div className="stat-info">
            <small>КЛИК</small>
            <strong>+{clickPower}</strong>
        </div>
    </div>
    <div className="stat-card passive-style">
        <div className="stat-indicator"></div>
        <div className="stat-info">
            <small>ДОХОД / С</small>
            <strong>+{passiveIncome}</strong>
        </div>
    </div>
</div>

                        <div className="click-zone">
                            <div className="old-school-button" onClick={handleTap}>
                                <div className="button-inner">
                                    <span>TAP</span>
                                </div>
                            </div>
                        </div>

                        {clicks.map(c => (
                            <div key={c.id} className="tap-particle" style={{ left: c.x, top: c.y }}>
                                +{c.value}
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'shop' && (
                    <div className="tab-shop">
                        <h2 className="title">МАГАЗИН</h2>
                        <div className="upg-list">
                            <div className="upg-item" onClick={() => buyUpgrade('click')}>
                                <div>
                                    <p className="upg-title">Мультитап</p>
                                    <small>Ур. {clickPower}</small>
                                </div>
                                <div className="upg-cost">{clickPower * 100}</div>
                            </div>
                            <div className="upg-item" onClick={() => buyUpgrade('passive')}>
                                <div>
                                    <p className="upg-title">Авто-доход</p>
                                    <small>Майнинг: {passiveIncome}/с</small>
                                </div>
                                <div className="upg-cost">{(Math.floor(passiveIncome / 5) + 1) * 150}</div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'top' && (
                    <div className="tab-placeholder">
                        <h2>ТОП ИГРОКОВ</h2>
                        <p>В разработке...</p>
                    </div>
                )}

                {activeTab === 'profile' && (
                    <div className="tab-profile">
                        <div className="profile-hero">
                            <div className="profile-avatar">
                                {user.photo_url ? <img src={user.photo_url} alt="" /> : user.first_name[0]}
                            </div>
                            <h1>{user.first_name}</h1>
                            <div className="id-container">
                                <code className="user-id-badge">ID: {user.id}</code>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ОБНОВЛЕННАЯ НАВИГАЦИЯ */}
            <nav className="navbar-container">
                <div className="navbar">
                    <button className={activeTab === 'home' ? 'active' : ''} onClick={() => setActiveTab('home')}>
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
                        <span>Главная</span>
                    </button>
                    <button className={activeTab === 'shop' ? 'active' : ''} onClick={() => setActiveTab('shop')}>
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/></svg>
                        <span>Магазин</span>
                    </button>
                    <button className={activeTab === 'top' ? 'active' : ''} onClick={() => setActiveTab('top')}>
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M16 11V3H8v8H2v10h20V11h-6zM10 5h4v14h-4V5zm-6 8h4v6H4v-6zm16 6h-4v-6h4v6z"/></svg>
                        <span>Топы</span>
                    </button>
                    <button className={activeTab === 'profile' ? 'active' : ''} onClick={() => setActiveTab('profile')}>
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                        <span>Профиль</span>
                    </button>
                </div>
            </nav>
        </div>
    );
}

export default App;