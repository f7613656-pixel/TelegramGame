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
    const [shopCategory, setShopCategory] = useState('clicks'); // категории: clicks, passive, boxes
    const [leaderboardCategory, setLeaderboardCategory] = useState('all'); // 'all' или 'month'
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
// Обновленная функция синхронизации
  const syncWithServer = useCallback(async (forcedClicks = null) => {
    // 1. Проверяем, есть ли у нас ID пользователя и клики для отправки
    const clicksToSend = forcedClicks !== null ? forcedClicks : unprocessedClicks;
    
    if (!user?.id || clicksToSend <= 0) {
        // Если юзера нет или кликов 0 — просто выходим, не мучая сервер
        return; 
    }

    try {
        const res = await authorizedFetch('/api/sync', {
            method: 'POST',
            body: JSON.stringify({ 
                userId: user.id.toString(), // Принудительно в строку
                clicks: Number(clicksToSend) 
            })
        });

        const data = await res.json();

        if (res.ok) {
            setServerData({ balance: data.balance, lastSync: Date.now() });
            if (forcedClicks === null) setUnprocessedClicks(0);
        } else {
            console.error("Сервер ответил ошибкой:", data.error);
        }
    } catch (err) {
        console.error("Ошибка сети при синхронизации:", err);
    }
}, [user, unprocessedClicks, authorizedFetch]);

    // Обновленная функция покупки
    const buyUpgrade = async (type) => {
        try {
            if (unprocessedClicks > 0) {
                await syncWithServer(); 
            }

            const res = await authorizedFetch(`/api/upgrade/${type}`, {
                method: 'POST',
                body: JSON.stringify({ userId: user.id })
            });

            if (res.ok) {
                const data = await res.json();
                setServerData({ balance: Number(data.balance), lastSync: data.serverTime });
                setClickPower(Number(data.clickPower));
                setPassiveIncome(Number(data.passiveIncome));
                showNotice("Улучшение куплено!");
            } else if (res.status === 400) {
                const errorData = await res.json();
                showNotice(errorData.message || "Недостаточно средств");
            } else {
                showNotice("Ошибка базы данных");
            }
        } catch (err) {
            console.error("Сетевая ошибка при покупке:", err);
            showNotice("Ошибка соединения с сервером"); // Изменили текст для понятности
        }
    };

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
    // Запрашиваем данные только если выбрана вкладка топов
    if (activeTab === 'leaderboard') {
        const fetchTops = async () => {
            try {
                console.log("Запрос топов для категории:", leaderboardCategory); // Отладка
                
                // Пробуем отправить запрос. Если бэкенд еще не фильтрует по type, 
                // он просто вернет общий список, что нам и нужно для начала.
                const res = await authorizedFetch(`/api/leaderboard?type=${leaderboardCategory}`);
                
                if (res.ok) {
                    const data = await res.json();
                    console.log("Получены данные топов:", data); // Проверь это в консоли F12
                    
                    // Проверяем, что пришел массив, прежде чем записывать
                    if (Array.isArray(data)) {
                        setLeaderboard(data);
                    } else {
                        console.error("Бэкенд вернул не массив:", data);
                        setLeaderboard([]); 
                    }
                } else {
                    console.error("Ошибка сервера при загрузке топов. Статус:", res.status);
                    setLeaderboard([]);
                }
            } catch (e) { 
                console.error("Сетевая ошибка при загрузке топов:", e);
                setLeaderboard([]);
            }
        };
        fetchTops();
    }
}, [activeTab, leaderboardCategory, authorizedFetch]);

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

                {activeTab === 'inventory' && (
    <div className="tab-inventory">
        <header className="inventory-header">
            <h2 className="title">ИНВЕНТАРЬ</h2>
            <div className="inventory-stats">
                <small>ПРЕДМЕТОВ: 0</small>
            </div>
        </header>
        
        <div className="inventory-content">
            <div className="empty-state">
                <div className="empty-icon-frame">
                    <div className="icon-ghost"></div>
                </div>
                <p>Здесь пока пусто</p>
                <span>Выигрывайте предметы в боксах или покупайте в маркете</span>
            </div>

            {/* Пример сетки предметов, когда они появятся */}
            <div className="item-grid">
                {/* Предметы будут рендериться здесь */}
            </div>
        </div>
    </div>
)}

                {activeTab === 'shop' && (
    <div className="tab-shop">
        <header className="shop-header">
            <h2 className="title">Магазин</h2>
            <div className="shop-tabs">
                <button 
                    className={shopCategory === 'clicks' ? 'active' : ''} 
                    onClick={() => setShopCategory('clicks')}
                >КЛИК</button>
                <button 
                    className={shopCategory === 'passive' ? 'active' : ''} 
                    onClick={() => setShopCategory('passive')}
                >ДОХОД</button>
                <button 
                    className={shopCategory === 'boxes' ? 'active' : ''} 
                    onClick={() => setShopCategory('boxes')}
                >БОКСЫ</button>
            </div>
        </header>

        <div className="shop-content">
            {/* КАТЕГОРИЯ: КЛИКИ */}
            {shopCategory === 'clicks' && (
                <div className="upg-list">
                    <div className="upg-card" onClick={() => buyUpgrade('click')}>
                        <div className="upg-icon-frame">
                            <div className="icon-bolt"></div>
                        </div>
                        <div className="upg-details">
                            <h3>Мультитап</h3>
                            <p>Увеличение силы нажатия</p>
                            <small>Текущий уровень: {clickPower}</small>
                        </div>
                        <div className="upg-buy">
                            <span>{clickPower * 100}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* КАТЕГОРИЯ: ДОХОД */}
            {shopCategory === 'passive' && (
                <div className="upg-list">
                    <div className="upg-card" onClick={() => buyUpgrade('passive')}>
                        <div className="upg-icon-frame">
                            <div className="icon-gear"></div>
                        </div>
                        <div className="upg-details">
                            <h3>Авто-майнер</h3>
                            <p>Прибыль в автоматическом режиме</p>
                            <small>Сейчас: {passiveIncome}/сек</small>
                        </div>
                        <div className="upg-buy">
                            <span>{(Math.floor(passiveIncome / 5) + 1) * 150}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* КАТЕГОРИЯ: БОКСЫ */}
            {shopCategory === 'boxes' && (
                <div className="upg-list">
                    <div className="upg-card locked">
                        <div className="upg-icon-frame">
                            <div className="icon-box"></div>
                        </div>
                        <div className="upg-details">
                            <h3>Секретный кейс</h3>
                            <p>Случайные бонусы и награды</p>
                        </div>
                        <div className="upg-buy">
                            <span>BLOCKED</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    </div>
)}

                {activeTab === 'leaderboard' && (
    <div className="tab-leaderboard">
        <header className="leader-header">
            <h2 className="title">ТОП ИГРОКОВ</h2>
            <div className="leader-tabs">
                <button 
                    className={leaderboardCategory === 'all' ? 'active' : ''} 
                    onClick={() => setLeaderboardCategory('all')}
                >ВСЕ ВРЕМЯ</button>
                <button 
                    className={leaderboardCategory === 'month' ? 'active' : ''} 
                    onClick={() => setLeaderboardCategory('month')}
                >ЗА МЕСЯЦ</button>
            </div>
        </header>

        <div className="leader-content">
            <div className="leader-list">
                {leaderboard.length > 0 ? (
                    leaderboard.map((player, index) => (
                        <div key={index} className={`leader-card ${index === 0 ? 'top-1' : ''}`}>
                            <div className="player-rank">
                                {index + 1 <= 3 ? (
                                    <div className={`rank-badge rank-${index + 1}`}></div>
                                ) : (
                                    <span>{index + 1}</span>
                                )}
                            </div>
                            <div className="player-info">
                                <span className="player-name">{player.name}</span>
                                <span className="player-score">{Math.floor(player.balance).toLocaleString()}</span>
                            </div>
                            <div className="player-medal">
                                {index === 0 && <div className="glow-crown"></div>}
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="loading-state">Загрузка данных...</div>
                )}
            </div>
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
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
        <polyline points="9 22 9 12 15 12 15 22"></polyline>
    </svg>
    <span>Главная</span>
</button>

<button className={activeTab === 'inventory' ? 'active' : ''} onClick={() => handleTabChange('inventory')}>
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
        <rect x="2" y="8" width="20" height="12" rx="2"></rect>
        <line x1="2" y1="14" x2="22" y2="14"></line>
    </svg>
    <span>Инвентарь</span>
</button>

<button className={activeTab === 'shop' ? 'active' : ''} onClick={() => handleTabChange('shop')}>
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="21" r="1"></circle>
        <circle cx="20" cy="21" r="1"></circle>
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
    </svg>
    <span>Магазин</span>
</button>

<button className={activeTab === 'leaderboard' ? 'active' : ''} onClick={() => handleTabChange('leaderboard')}>
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
        <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
        <path d="M4 22h16"></path>
        <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path>
        <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path>
        <rect x="6" y="4" width="12" height="11" rx="2"></rect>
    </svg>
    <span>Топы</span>
</button>

<button className={activeTab === 'profile' ? 'active' : ''} onClick={() => handleTabChange('profile')}>
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
        <circle cx="12" cy="7" r="4"></circle>
    </svg>
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