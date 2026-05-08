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

    const handleTap = (e) => {
        setUnprocessedClicks(prev => prev + 1);
        const id = Date.now();
        const x = e.clientX || (e.touches && e.touches[0].clientX);
        const y = e.clientY || (e.touches && e.touches[0].clientY);
        setClicks((prev) => [...prev, { id, x, y, value: clickPower }]);
        setTimeout(() => setClicks((prev) => prev.filter(c => c.id !== id)), 800);
    };

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
            <header className="main-header">
                <div className="header-glass">
                    <div className="user-pill">
                        <div className="mini-avatar-wrap">
                            {user.photo_url ? <img src={user.photo_url} alt="" /> : user.first_name[0]}
                        </div>
                        <span className="user-name-top">{user.first_name}</span>
                    </div>
                    <div className="balance-pill-premium">
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
                                    <div className="bolt-container">
                                        <svg viewBox="0 0 24 24" className="svg-bolt-main">
                                            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="#00f2ff" />
                                        </svg>
                                    </div>
                                </div>
                                <div className="ring-inner"></div>
                                <div className="ring-outer"></div>
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
                                <div className="upg-txt"><p>Мультитап</p><small>Lvl {clickPower}</small></div>
                                <div className="upg-cost">{clickPower * 100}</div>
                            </div>
                            <div className="upg-item" onClick={() => buyUpgrade('passive')}>
                                <div className="upg-txt"><p>Майнинг</p><small>+{passiveIncome}/с</small></div>
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
                                    <span className="rank">#{i + 1}</span>
                                    <span className="name">{p.name}</span>
                                    <span className="score">{Math.floor(p.balance).toLocaleString()}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === 'profile' && (
                    <div className="tab-profile">
                        <h2 className="title">ПРОФИЛЬ</h2>
                        <div className="profile-container">
                            <div className="profile-avatar-circle">
                                {user.photo_url ? <img src={user.photo_url} alt="" /> : user.first_name[0]}
                            </div>
                            <div className="profile-info-frame">
                                <h3 className="prof-name">{user.first_name}</h3>
                                <p className="prof-id">ID: {user.id}</p>
                            </div>
                            <div className="profile-stats-box">
                                <div className="p-stat"><span>Сила клика:</span> <strong>{clickPower}</strong></div>
                                <div className="p-stat"><span>Пассив:</span> <strong>{passiveIncome}/с</strong></div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <nav className="navbar-container">
                <div className="navbar">
                    <button className={activeTab === 'home' ? 'active' : ''} onClick={() => setActiveTab('home')}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                        <span>Главная</span>
                    </button>
                    <button className={activeTab === 'shop' ? 'active' : ''} onClick={() => setActiveTab('shop')}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
                        <span>Магазин</span>
                    </button>
                    <button className={activeTab === 'leaderboard' ? 'active' : ''} onClick={() => setActiveTab('leaderboard')}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
                        <span>Топы</span>
                    </button>
                    <button className={activeTab === 'profile' ? 'active' : ''} onClick={() => setActiveTab('profile')}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        <span>Профиль</span>
                    </button>
                </div>
            </nav>

            {modal.show && (
                <div className="modal-overlay">
                    <div className="modal-content"><p>{modal.message}</p></div>
                </div>
            )}
        </div>
    );
}

export default App;