import React, { useState, useEffect, useCallback } from 'react';
import './App.css';

const tg = window.Telegram.WebApp;
const API_URL = 'https://telegramgame-1.onrender.com';

function App() {
    // Основные состояния
    const [user] = useState(tg.initDataUnsafe?.user || { id: '000000', first_name: 'Игрок' });
    const [activeTab, setActiveTab] = useState('home');
    const [modal, setModal] = useState({ show: false, message: '' });
    
    // Игровые характеристики
    const [clickPower, setClickPower] = useState(1);
    const [passiveIncome, setPassiveIncome] = useState(0);
    
    // Синхронизация и визуализация баланса
    const [serverData, setServerData] = useState({ balance: 0, lastSync: Date.now() });
    const [unprocessedClicks, setUnprocessedClicks] = useState(0);
    const [visualBalance, setVisualBalance] = useState(0);
    const [clicks, setClicks] = useState([]); // Для анимации вылетающих цифр

    // Функция для уведомлений
    const showNotice = (msg) => {
        setModal({ show: true, message: msg });
        setTimeout(() => setModal({ show: false, message: '' }), 2500);
    };

    // Защищенный запрос к серверу
    const authorizedFetch = useCallback(async (endpoint, options = {}) => {
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `tma ${tg.initData}`
        };
        return fetch(`${API_URL}${endpoint}`, { ...options, headers });
    }, []);

    // 1. ПЕРВАЯ ЗАГРУЗКА
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
            } catch (e) {
                console.error("Ошибка загрузки:", e);
            }
        };
        loadData();
    }, [user.id, authorizedFetch]);

    // 2. ПЛАВНЫЙ СЧЕТЧИК (60 кадров в секунду)
    useEffect(() => {
        let animationFrame;
        const updateVisual = () => {
            const now = Date.now();
            const elapsed = Math.max(0, (now - serverData.lastSync) / 1000);
            
            // Текущий баланс = Что сказал сервер + Пассив за время ожидания + Клики в буфере
            const currentTotal = serverData.balance + (elapsed * passiveIncome) + (unprocessedClicks * clickPower);
            
            setVisualBalance(currentTotal);
            animationFrame = requestAnimationFrame(updateVisual);
        };
        animationFrame = requestAnimationFrame(updateVisual);
        return () => cancelAnimationFrame(animationFrame);
    }, [serverData, passiveIncome, unprocessedClicks, clickPower]);

    // 3. ФОНОВАЯ СИНХРОНИЗАЦИЯ (раз в 2 секунды)
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
                    // Вычитаем только те клики, которые отправили
                    setUnprocessedClicks(prev => Math.max(0, prev - clicksToSend));
                    setServerData({ balance: data.balance, lastSync: data.serverTime });
                }
            } catch (err) {
                console.error("Ошибка синхронизации, пробуем позже");
            }
        }, 2000);

        return () => clearInterval(syncInterval);
    }, [unprocessedClicks, user.id, authorizedFetch]);

    // ОБРАБОТКА КЛИКА
    const handleTap = (e) => {
        setUnprocessedClicks(prev => prev + 1);

        const id = Date.now();
        const x = e.clientX || (e.touches && e.touches[0].clientX);
        const y = e.clientY || (e.touches && e.touches[0].clientY);
        
        setClicks((prev) => [...prev, { id, x, y, value: clickPower }]);
        setTimeout(() => setClicks((prev) => prev.filter(c => c.id !== id)), 800);
    };

    // ПОКУПКА УЛУЧШЕНИЙ
    const buyUpgrade = async (type) => {
        try {
            const pending = unprocessedClicks; // Передаем на сервер неучтенные клики перед покупкой
            const res = await authorizedFetch(`/api/upgrade/${type}`, {
                method: 'POST',
                body: JSON.stringify({ userId: user.id, pendingClicks: pending })
            });

            if (res.ok) {
                const data = await res.json();
                setUnprocessedClicks(0); // Очищаем локальные клики, так как сервер их учел
                setServerData({ balance: data.balance, lastSync: data.serverTime });
                setClickPower(data.clickPower);
                setPassiveIncome(data.passiveIncome);
            } else {
                const errorData = await res.json();
                showNotice(errorData.message || "Ошибка сервера");
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
                        {/* Выводим визуальный баланс с округлением */}
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
                            <div key={c.id} className="tap-particle" style={{ left: c.x, top: c.y }}>
                                +{c.value}
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'shop' && (
                    <div className="tab-shop">
                        <h2 className="title">Магазин</h2>
                        <div className="upg-list">
                            <div className="upg-item" onClick={() => buyUpgrade('click')}>
                                <div>
                                    <p className="upg-title">Мультитап</p>
                                    <small>Сила: {clickPower}</small>
                                </div>
                                <div className="upg-cost">{clickPower * 100}</div>
                            </div>
                            <div className="upg-item" onClick={() => buyUpgrade('passive')}>
                                <div>
                                    <p className="upg-title">Авто-майнинг</p>
                                    <small>Доход: {passiveIncome}/с</small>
                                </div>
                                <div className="upg-cost">{(Math.floor(passiveIncome / 5) + 1) * 150}</div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {modal.show && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-icon">!</div>
                        <p>{modal.message}</p>
                    </div>
                </div>
            )}

            <nav className="navbar-container">
                <div className="navbar">
                    <button className={activeTab === 'home' ? 'active' : ''} onClick={() => setActiveTab('home')}>
                        <svg viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" fill="currentColor"/></svg>
                        <span>Дом</span>
                    </button>
                    <button className={activeTab === 'shop' ? 'active' : ''} onClick={() => setActiveTab('shop')}>
                        <svg viewBox="0 0 24 24"><path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z" fill="currentColor"/></svg>
                        <span>Цех</span>
                    </button>
                </div>
            </nav>
        </div>
    );
}

export default App;