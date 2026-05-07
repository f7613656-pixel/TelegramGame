import React, { useState, useEffect } from 'react';
import './App.css';

const tg = window.Telegram.WebApp;
const API_URL = 'https://твой-бэкенд.onrender.com'; // НЕ ЗАБУДЬ ВСТАВИТЬ СВОЮ ССЫЛКУ

function App() {
    const [user] = useState(tg.initDataUnsafe?.user || { id: 'test_user', first_name: 'Игрок' });
    const [balance, setBalance] = useState(0);
    const [clickPower, setClickPower] = useState(1);
    const [passiveIncome, setPassiveIncome] = useState(0);
    const [clicks, setClicks] = useState([]);
    
    // Состояние для навигации (активная вкладка)
    const [activeTab, setActiveTab] = useState('home');
    // Состояние для ошибки загрузки фото
    const [photoError, setPhotoError] = useState(false);

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

    // Пассивный доход
    useEffect(() => {
        const interval = setInterval(() => {
            setBalance(prev => prev + (passiveIncome / 10));
        }, 100);
        return () => clearInterval(interval);
    }, [passiveIncome]);

    const handleTap = (e) => {
        if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');

        const newBalance = balance + clickPower;
        setBalance(newBalance);

        const id = Date.now();
        const x = e.clientX || (e.touches && e.touches[0].clientX);
        const y = e.clientY || (e.touches && e.touches[0].clientY);
        
        setClicks((prev) => [...prev, { id, x, y, value: clickPower }]);
        setTimeout(() => {
            setClicks((prev) => prev.filter(c => c.id !== id));
        }, 800);

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

            if (res.ok) {
                const data = await res.json();
                setBalance(data.balance);
                setClickPower(data.clickPower);
                setPassiveIncome(data.passiveIncome);
                if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
            } else {
                tg.showAlert(`Недостаточно монет!`);
            }
        } catch (err) { console.error("Ошибка при покупке"); }
    };

    return (
        <div className="App">
            {/* ВЕРХНЕЕ МЕНЮ */}
            <header className="top-header">
                <div className="user-block">
                    <div className="avatar-container">
                        {user.photo_url && !photoError ? (
                            <img 
                                src={user.photo_url} 
                                alt="" 
                                className="user-photo" 
                                onError={() => setPhotoError(true)} // Если фото не грузится, включаем заглушку
                            />
                        ) : (
                            <div className="user-photo-stub">{user.first_name[0].toUpperCase()}</div>
                        )}
                    </div>
                    <span className="user-name">{user.first_name}</span>
                </div>
                
                <div className="currency-pill">
                    <span className="val">{Math.floor(balance).toLocaleString()}</span>
                    {/* SVG Иконка монеты */}
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="#f1c40f">
                        <circle cx="12" cy="12" r="10" stroke="#d4ac0d" strokeWidth="2"/>
                        <text x="12" y="16" fontSize="14" fontWeight="bold" textAnchor="middle" fill="#fff">B</text>
                    </svg>
                </div>
            </header>

            {/* ОСНОВНОЙ КОНТЕНТ (меняется от кнопок) */}
            <div className="content-area">
                {activeTab === 'home' && (
                    <>
                        <div className="stats-container">
                            <div className="stat-card">
                                <small>СИЛА КЛИКА</small>
                                <p>+{clickPower}</p>
                            </div>
                            <div className="stat-card">
                                <small>В СЕКУНДУ</small>
                                <p>+{passiveIncome}</p>
                            </div>
                        </div>

                        <main className="click-zone">
                            <div className="main-circle" onClick={handleTap}>
                                <div className="inner-circle">
                                    <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#f1c40f" strokeWidth="2">
                                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                                    </svg>
                                </div>
                            </div>
                        </main>

                        {clicks.map(c => (
                            <div key={c.id} className="floating-number" style={{ left: c.x, top: c.y }}>
                                +{c.value}
                            </div>
                        ))}
                    </>
                )}

                {activeTab === 'shop' && (
                    <div className="shop-zone">
                        <h2>Магазин улучшений</h2>
                        <div className="upgrade-card" onClick={() => buyUpgrade('click')}>
                            <div className="upg-info">
                                <h3>Мультитап</h3>
                                <p>Увеличивает силу клика</p>
                            </div>
                            <button className="buy-btn">{clickPower * 100} 💰</button>
                        </div>
                        <div className="upgrade-card" onClick={() => buyUpgrade('passive')}>
                            <div className="upg-info">
                                <h3>Авто-майнер</h3>
                                <p>Увеличивает пассивный доход</p>
                            </div>
                            <button className="buy-btn">{(Math.floor(passiveIncome / 5) + 1) * 150} 💰</button>
                        </div>
                    </div>
                )}

                {activeTab === 'top' && (
                    <div className="placeholder-zone"><h2>Рейтинг игроков в разработке... 🏆</h2></div>
                )}

                {activeTab === 'profile' && (
                    <div className="placeholder-zone"><h2>Твой профиль 👤</h2><p>ID: {user.id}</p></div>
                )}
            </div>

            {/* НИЖНЕЕ МЕНЮ (КАСТОМНЫЕ SVG ИКОНКИ) */}
            <nav className="bottom-nav">
                <div className={`nav-item ${activeTab === 'home' ? 'active' : ''}`} onClick={() => setActiveTab('home')}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                    <span className="nav-label">ГЛАВНАЯ</span>
                </div>
                <div className={`nav-item ${activeTab === 'shop' ? 'active' : ''}`} onClick={() => setActiveTab('shop')}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
                    <span className="nav-label">МАГАЗИН</span>
                </div>
                <div className={`nav-item ${activeTab === 'top' ? 'active' : ''}`} onClick={() => setActiveTab('top')}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 21h8m-4-4v4M5 3h14M5 3v4c0 3.866 3.134 7 7 7s7-3.134 7-7V3M5 3l-2 2v2c0 2.21 1.79 4 4 4m12-8l2 2v2c0 2.21-1.79 4-4 4"></path></svg>
                    <span className="nav-label">ТОПЫ</span>
                </div>
                <div className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                    <span className="nav-label">ПРОФИЛЬ</span>
                </div>
            </nav>
        </div>
    );
}

export default App;