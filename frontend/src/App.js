import React, { useState, useEffect, useCallback } from 'react';
import './App.css';

const tg = window.Telegram.WebApp;
const API_URL = 'https://telegramgame-1.onrender.com'; 

function App() {
    const [user] = useState(tg.initDataUnsafe?.user || { id: '000000', first_name: 'Игрок', photo_url: '' });
    const [activeTab, setActiveTab] = useState('home');
    const [modal, setModal] = useState({ show: false, message: '' });
    
    const [clickPower, setClickPower] = useState(1);
    const [passiveIncome, setPassiveIncome] = useState(0);
    const [serverData, setServerData] = useState({ balance: 0, lastSync: Date.now() });
    const [unprocessedClicks, setUnprocessedClicks] = useState(0);
    const [visualBalance, setVisualBalance] = useState(0);
    
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

    // Функция синхронизации кликов
    const syncWithServer = useCallback(async (forcedClicks = null) => {
        const clicksToSend = forcedClicks !== null ? forcedClicks : unprocessedClicks;
        if (clicksToSend === 0) return;

        try {
            const res = await authorizedFetch('/api/sync', {
                method: 'POST',
                body: JSON.stringify({ userId: user.id, clicksCount: clicksToSend })
            });

            if (res.ok) {
                const data = await res.json();
                setUnprocessedClicks(prev => Math.max(0, prev - clicksToSend));
                setServerData({
                    balance: data.balance,
                    lastSync: data.serverTime
                });
                return data;
            }
        } catch (err) {
            console.error("Ошибка синхронизации");
        }
    }, [unprocessedClicks, user.id, authorizedFetch]);

    // Специальная функция для смены вкладки с принудительным сохранением
    const handleTabChange = async (tab) => {
        if (tab === 'shop' && unprocessedClicks > 0) {
            // Если идем в магазин, сначала сохраняем всё
            await syncWithServer();
        }
        setActiveTab(tab);
    };

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

    // Анимация баланса
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

    // Фоновая синхронизация каждые 2 секунды
    useEffect(() => {
        const interval = setInterval(syncWithServer, 2000);
        return () => clearInterval(interval);
    }, [syncWithServer]);

    const handleTap = (e) => {
        const tapId = Date.now();
        const posX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
        const posY = e.clientY || (e.touches && e.touches[0].clientY) || 0;
        
        setUnprocessedClicks(prev => prev + 1);
        setClicks((prev) => [...prev, { id: tapId, x: posX, y: posY, value: clickPower }]);
        setTimeout(() => setClicks((prev) => prev.filter(c => c.id !== tapId)), 800);
    };

    const buyUpgrade = async (type) => {
        try {
            // Перед покупкой тоже полезно синхронизировать остаток кликов
            if (unprocessedClicks > 0) await syncWithServer();

            const res = await authorizedFetch(`/api/upgrade/${type}`, {
                method: 'POST',
                body: JSON.stringify({ userId: user.id })
            });

            if (res.ok) {
                const data = await res.json();
                setServerData({ balance: data.balance, lastSync: data.serverTime });
                setClickPower(Number(data.clickPower));
                setPassiveIncome(Number(data.passiveIncome));
            } else if (res.status === 400) {
                showNotice("Недостаточно средств");
            } else {
                showNotice("Ошибка сервера");
            }
        } catch (err) {
            showNotice("Сервер недоступен");
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
                        <span className="balance-value">{Math.floor(visualBalance).toLocaleString()}</span>
                    </div>
                </div>
            </header>

            <div className="content">
                {activeTab === 'home' && (
                    <div className="tab-home">
                        <div className="stats-grid">
                            <div className="stat-card tap-style">
                                <div className="stat-indicator"></div>
                                <div className="stat-info"><small>КЛИК</small><strong>+{clickPower}</strong></div>
                            </div>
                            <div className="stat-card passive-style">
                                <div className="stat-indicator"></div>
                                <div className="stat-info"><small>ДОХОД / С</small><strong>+{passiveIncome}</strong></div>
                            </div>
                        </div>

                        <div className="game-area">
                            <div className="click-wrapper" onClick={handleTap}>
                                <div className="neo-circle-button">
                                    <div className="core-icon">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="#00f2ff" strokeWidth="2">
                                            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round"/>
                                        </svg>
                                    </div>
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
                                <div><p className="upg-title">Мультитап</p><small>Ур. {clickPower}</small></div>
                                <div className="upg-cost">{clickPower * 100}</div>
                            </div>
                            <div className="upg-item" onClick={() => buyUpgrade('passive')}>
                                <div><p className="upg-title">Авто-доход</p><small>Майнинг: {passiveIncome}/с</small></div>
                                <div className="upg-cost">{(Math.floor(passiveIncome / 5) + 1) * 150}</div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'leaderboard' && (
                    <div className="tab-leaderboard">
                        <h2 className="title">ТОП ИГРОКОВ</h2>
                        <div className="leader-list">
                            {leaderboard.map((p, i) => (
                                <div key={i} className="leader-item">
                                    <span>#{i + 1} {p.name}</span>
                                    <span>{Math.floor(p.balance).toLocaleString()}</span>
                                </div>
                            ))}
                        </div>
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

            <nav className="navbar-container">
                <div className="navbar">
                    <button className={activeTab === 'home' ? 'active' : ''} onClick={() => handleTabChange('home')}>
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
                        <span>Главная</span>
                    </button>
                    <button className={activeTab === 'shop' ? 'active' : ''} onClick={() => handleTabChange('shop')}>
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/></svg>
                        <span>Магазин</span>
                    </button>
                    <button className={activeTab === 'leaderboard' ? 'active' : ''} onClick={() => handleTabChange('leaderboard')}>
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M16 11V3H8v8H2v10h20V11h-6zM10 5h4v14h-4V5zm-6 8h4v6H4v-6zm16 6h-4v-6h4v6z"/></svg>
                        <span>Топы</span>
                    </button>
                    <button className={activeTab === 'profile' ? 'active' : ''} onClick={() => handleTabChange('profile')}>
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                        <span>Профиль</span>
                    </button>
                </div>
            </nav>

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