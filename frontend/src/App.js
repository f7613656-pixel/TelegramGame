import React, { useState, useEffect, useCallback } from 'react';
import './App.css';

const tg = window.Telegram.WebApp;
const API_URL = 'https://telegramgame-1.onrender.com';

function App() {
    // Состояния пользователя и навигации
    const [user] = useState(tg.initDataUnsafe?.user || { id: '000000', first_name: 'Игрок', photo_url: '' });
    const [activeTab, setActiveTab] = useState('home');
    const [modal, setModal] = useState({ show: false, message: '' });
    
    // Игровые данные (логика)
    const [clickPower, setClickPower] = useState(1);
    const [passiveIncome, setPassiveIncome] = useState(0);
    const [serverData, setServerData] = useState({ balance: 0, lastSync: Date.now() });
    const [unprocessedClicks, setUnprocessedClicks] = useState(0);
    const [visualBalance, setVisualBalance] = useState(0);
    
    // Эффекты
    const [clicks, setClicks] = useState([]);
    const [leaderboard, setLeaderboard] = useState([]);

    const showNotice = (msg) => {
        setModal({ show: true, message: msg });
        setTimeout(() => setModal({ show: false, message: '' }), 2500);
    };

    const authorizedFetch = useCallback(async (endpoint, options = {}) => {
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `tma ${tg.initData}`
        };
        return fetch(`${API_URL}${endpoint}`, { ...options, headers });
    }, []);

    // 1. Инициализация при входе
    useEffect(() => {
        tg.ready();
        tg.expand();
        const loadData = async () => {
            try {
                const res = await authorizedFetch(`/api/user/${user.id}`);
                if (res.ok) {
                    const data = await res.json();
                    setServerData({ balance: data.balance, lastSync: data.serverTime });
                    setClickPower(data.clickPower);
                    setPassiveIncome(data.passiveIncome);
                }
            } catch (e) { console.error(e); }
        };
        loadData();
    }, [user.id, authorizedFetch]);

    // 2. Подгрузка топов
    useEffect(() => {
        if (activeTab === 'leaderboard') {
            const fetchTops = async () => {
                try {
                    const res = await authorizedFetch('/api/leaderboard');
                    if (res.ok) {
                        const data = await res.json();
                        setLeaderboard(data);
                    }
                } catch (e) { console.error(e); }
            };
            fetchTops();
        }
    }, [activeTab, authorizedFetch]);

    // 3. ПЛАВНЫЙ СЧЕТЧИК (Твоя валюта теперь "бежит" красиво)
    useEffect(() => {
        let animationFrame;
        const updateVisual = () => {
            const now = Date.now();
            const elapsed = Math.max(0, (now - serverData.lastSync) / 1000);
            const currentTotal = serverData.balance + (elapsed * passiveIncome) + (unprocessedClicks * clickPower);
            setVisualBalance(currentTotal);
            animationFrame = requestAnimationFrame(updateVisual);
        };
        animationFrame = requestAnimationFrame(updateVisual);
        return () => cancelAnimationFrame(animationFrame);
    }, [serverData, passiveIncome, unprocessedClicks, clickPower]);

    // 4. Синхронизация кликов
    useEffect(() => {
        const syncInterval = setInterval(async () => {
            if (unprocessedClicks === 0) return;
            const clicksToSend = unprocessedClicks;
            try {
                const res = await authorizedFetch('/api/sync', {
                    method: 'POST',
                    body: JSON.stringify({ userId: user.id, clicksCount: clicksToSend })
                });
                if (res.ok) {
                    const data = await res.json();
                    setUnprocessedClicks(prev => Math.max(0, prev - clicksToSend));
                    setServerData({ balance: data.balance, lastSync: data.serverTime });
                }
            } catch (err) { console.error(err); }
        }, 2000);
        return () => clearInterval(syncInterval);
    }, [unprocessedClicks, user.id, authorizedFetch]);

    // Клик по кнопке
    const handleTap = (e) => {
        setUnprocessedClicks(prev => prev + 1);
        const id = Date.now();
        const x = e.clientX || (e.touches && e.touches[0].clientX);
        const y = e.clientY || (e.touches && e.touches[0].clientY);
        setClicks((prev) => [...prev, { id, x, y, value: clickPower }]);
        setTimeout(() => setClicks((prev) => prev.filter(c => c.id !== id)), 800);
    };

    // Покупка улучшений
    const buyUpgrade = async (type) => {
        try {
            const res = await authorizedFetch(`/api/upgrade/${type}`, {
                method: 'POST',
                body: JSON.stringify({ userId: user.id, pendingClicks: unprocessedClicks })
            });
            if (res.ok) {
                const data = await res.json();
                setUnprocessedClicks(0);
                setServerData({ balance: data.balance, lastSync: data.serverTime });
                setClickPower(data.clickPower);
                setPassiveIncome(data.passiveIncome);
            } else {
                const errorData = await res.json();
                showNotice(errorData.message || "Ошибка");
            }
        } catch (err) { showNotice("Сервер недоступен"); }
    };

    return (
        <div className="App">
            {/* ВЕРХНЕЕ МЕНЮ С ФОТО И ИМЕНЕМ */}
            <header className="main-header">
                <div className="header-glass">
                    <div className="user-pill">
                        <div className="mini-avatar">
                            {user.photo_url ? <img src={user.photo_url} alt="" /> : user.first_name[0]}
                        </div>
                        <span className="user-name">{user.first_name}</span>
                    </div>
                    {/* КРАСИВАЯ РАМКА СЧЕТЧИКА ВАЛЮТ */}
                    <div className="balance-pill">
                        <div className="crystal-icon"></div>
                        <span className="balance-value">{Math.floor(visualBalance).toLocaleString()}</span>
                    </div>
                </div>
            </header>

            <div className="content">
                {activeTab === 'home' && (
                    <div className="tab-home">
                        {/* КРАСИВЫЕ РАМКИ СТАТИСТИКИ */}
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

                        {/* КРАСИВАЯ КНОПКА КЛИКА */}
                        <div className="game-area">
                            <div className="click-wrapper" onClick={handleTap}>
                                <div className="neo-circle-button">
                                    <div className="core-icon">⚡</div>
                                </div>
                                <div className="ring-1"></div>
                                <div className="ring-2"></div>
                            </div>
                        </div>

                        {clicks.map(c => (
                            <div key={c.id} className="tap-particle" style={{ left: c.x, top: c.y }}>+{c.value}</div>
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
                                    <small>Уровень: {clickPower}</small>
                                </div>
                                <div className="upg-cost">{clickPower * 100}</div>
                            </div>
                            <div className="upg-item" onClick={() => buyUpgrade('passive')}>
                                <div>
                                    <p className="upg-title">Авто-майнинг</p>
                                    <small>Доход: +{passiveIncome}/с</small>
                                </div>
                                <div className="upg-cost">{(Math.floor(passiveIncome / 5) + 1) * 150}</div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'leaderboard' && (
                    <div className="tab-leaderboard">
                        <h2 className="title">ТОПЫ</h2>
                        <div className="leader-list">
                            {leaderboard.map((p, i) => (
                                <div key={i} className="leader-item">
                                    <span className="leader-rank">{i + 1}</span>
                                    <span className="leader-name">{p.name}</span>
                                    <span className="leader-score">{Math.floor(p.balance).toLocaleString()}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === 'profile' && (
                    <div className="tab-profile">
                        <h2 className="title">ПРОФИЛЬ</h2>
                        <div className="profile-card">
                            <div className="profile-avatar-big">
                                {user.photo_url ? <img src={user.photo_url} alt="" /> : user.first_name[0]}
                            </div>
                            <h3 className="profile-name">{user.first_name}</h3>
                            <p className="profile-id">ID: {user.id}</p>
                            <div className="divider"></div>
                            <div className="profile-stats">
                                <div><span>Клик:</span> <strong>{clickPower}</strong></div>
                                <div><span>Доход:</span> <strong>{passiveIncome}/с</strong></div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* НАВИГАЦИЯ С ИКОНКАМИ И ПРАВИЛЬНЫМИ НАЗВАНИЯМИ */}
            <nav className="navbar-container">
                <div className="navbar">
                    <button className={activeTab === 'home' ? 'active' : ''} onClick={() => setActiveTab('home')}>
                        <svg viewBox="0 0 24 24" width="24" height="24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" fill="currentColor"/></svg>
                        <span>Главная</span>
                    </button>
                    <button className={activeTab === 'shop' ? 'active' : ''} onClick={() => setActiveTab('shop')}>
                        <svg viewBox="0 0 24 24" width="24" height="24"><path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z" fill="currentColor"/></svg>
                        <span>Магазин</span>
                    </button>
                    <button className={activeTab === 'leaderboard' ? 'active' : ''} onClick={() => setActiveTab('leaderboard')}>
                        <svg viewBox="0 0 24 24" width="24" height="24"><path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94A5.01 5.01 0 0 0 11 15.9V19H7v2h10v-2h-4v-3.1a5.01 5.01 0 0 0 3.61-2.96C19.08 10.63 21 8.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z" fill="currentColor"/></svg>
                        <span>Топы</span>
                    </button>
                    <button className={activeTab === 'profile' ? 'active' : ''} onClick={() => setActiveTab('profile')}>
                        <svg viewBox="0 0 24 24" width="24" height="24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="currentColor"/></svg>
                        <span>Профиль</span>
                    </button>
                </div>
            </nav>

            {/* КРАСИВОЕ МОДАЛЬНОЕ ОКНО */}
            {modal.show && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-icon">!</div>
                        <p>{modal.message}</p>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;