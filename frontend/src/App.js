import React, { useState, useEffect } from 'react';
import './App.css';

const tg = window.Telegram.WebApp;
const API_URL = 'https://telegramgame-1.onrender.com'; 

function App() {
    const [user, setUser] = useState({ id: 'test_user', first_name: 'BANANEZLAL' });
    const [balance, setBalance] = useState(0);
    const [clickPower, setClickPower] = useState(1);
    const [passiveIncome, setPassiveIncome] = useState(0);
    const [page, setPage] = useState('main'); 
    const [topPlayers, setTopPlayers] = useState([]);
    const [clicks, setClicks] = useState([]);

    useEffect(() => {
        tg.ready();
        tg.expand();
        const tgUser = tg.initDataUnsafe?.user;
        if (tgUser) setUser(tgUser);

        const loadData = async () => {
            const userId = tgUser ? tgUser.id : 'test_user';
            try {
                const res = await fetch(`${API_URL}/api/user/${userId}?username=${tgUser?.first_name || 'BANANEZLAL'}`);
                const data = await res.json();
                // Принудительно превращаем в числа
                setBalance(Number(data.balance) || 0);
                setClickPower(Number(data.clickPower) || 1);
                setPassiveIncome(Number(data.passiveIncome) || 0);
            } catch (err) { console.error("Load error"); }
        };
        loadData();
    }, []);

    useEffect(() => {
        if (passiveIncome > 0) {
            const interval = setInterval(() => {
                setBalance(prev => prev + (Number(passiveIncome) / 10));
            }, 100);
            return () => clearInterval(interval);
        }
    }, [passiveIncome]);

    const handleTap = async (e) => {
        if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
        
        const newBalance = balance + Number(clickPower);
        setBalance(newBalance); // Сразу обновляем экран

        // Анимация цифр
        const id = Date.now();
        const x = e.pageX || (e.touches && e.touches[0].pageX);
        const y = e.pageY || (e.touches && e.touches[0].pageY);
        setClicks((prev) => [...prev, { id, x, y }]);
        setTimeout(() => setClicks((prev) => prev.filter(c => c.id !== id)), 800);

        try {
            await fetch(`${API_URL}/api/tap`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    userId: user.id, 
                    clientBalance: newBalance // ПЕРЕДАЕМ БАЛАНС ДЛЯ СИНХРОНИЗАЦИИ
                })
            });
        } catch (err) {}
    };

   const buyUpgrade = async (type) => {
        // Убедимся, что type это именно 'click' или 'passive'
        const url = `${API_URL}/api/upgrade/${type}`;
        
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id })
            });

            if (res.ok) {
                const data = await res.json();
                setBalance(Number(data.balance));
                setClickPower(Number(data.clickPower));
                setPassiveIncome(Number(data.passiveIncome));
                if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
            } else {
                const errorMsg = await res.text();
                alert("Ошибка: " + errorMsg);
            }
        } catch (err) {
            console.error("Ошибка сети:", err);
            alert("Сервер недоступен");
        }
    };

    // БЕЗОПАСНЫЙ РАСЧЕТ ЦЕН (защита от NaN)
    const currentClickPower = Number(clickPower) || 1;
    const currentPassiveIncome = Number(passiveIncome) || 0;

    const clickCost = currentClickPower * 100;
    const passiveLevel = Math.floor(currentPassiveIncome / 5);
    const passiveCost = (passiveLevel + 1) * 150;

    return (
        <div className="app">
            <header className="header-new">
                <div className="header-left">
                    <div className="avatar-placeholder">{user.first_name[0]}</div>
                    <span className="nickname">{user.first_name.toUpperCase()}</span>
                </div>
                <div className="header-right">
                    <div className="currency-capsule">
                        <div className="currency-item">
                            <span>{Math.floor(balance).toLocaleString()}</span>
                            <img src="https://cdn-icons-png.flaticon.com/512/6001/6001527.png" alt="coin" className="mini-icon" />
                        </div>
                    </div>
                </div>
            </header>

            <main className="content">
                {page === 'main' && (
                    <div className="clicker-page">
                        <div className="income-badge">⚡ {currentPassiveIncome}/сек</div>
                        <div className="tap-wrapper">
                            <button className="tap-button" onClick={handleTap}></button>
                            {clicks.map(c => (
                                <div key={c.id} className="floating-number" style={{ left: c.x - 20, top: c.y - 40 }}>
                                    +{currentClickPower}
                                </div>
                            ))}
                        </div>
                        <p className="tap-hint">СИЛА КЛИКА: {currentClickPower}</p>
                    </div>
                )}

                {page === 'upgrades' && (
                    <div className="menu-container">
                        <h2 className="page-title">МАГАЗИН</h2>
                        <div className="upgrade-card">
                            <div className="upgrade-info"><b>УРОВЕНЬ КЛИКА</b><span>Сила: +1</span></div>
                            <button onClick={() => buyUpgrade('click')} className="buy-btn">{clickCost} 💰</button>
                        </div>
                        <div className="upgrade-card">
                            <div className="upgrade-info"><b>ВИДЕОКАРТА</b><span>Доход: +5/сек</span></div>
                            <button onClick={() => buyUpgrade('passive')} className="buy-btn">{passiveCost} 💰</button>
                        </div>
                    </div>
                )}

                {page === 'top' && (
                    <div className="menu-container">
                        <h2 className="page-title">ЛИДЕРЫ</h2>
                        <div className="leaderboard">
                            {topPlayers.map((p, i) => (
                                <div key={p.id} className="top-entry">
                                    <span>{i + 1}. {p.username}</span>
                                    <b>{Math.floor(Number(p.balance)).toLocaleString()}</b>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {page === 'profile' && (
                    <div className="menu-container">
                        <h2 className="page-title">ПРОФИЛЬ</h2>
                        <div className="stats-box">
                            <div className="stat-row"><span>ID:</span> <b>{user.id}</b></div>
                            <div className="stat-row"><span>КЛИК:</span> <b>{currentClickPower}</b></div>
                            <div className="stat-row"><span>МАЙНИНГ:</span> <b>{currentPassiveIncome}/с</b></div>
                        </div>
                    </div>
                )}
            </main>

            <nav className="bottom-nav">
                <button onClick={() => setPage('main')} className={page === 'main' ? 'active' : ''}>ИГРА</button>
                <button onClick={() => setPage('upgrades')} className={page === 'upgrades' ? 'active' : ''}>МАГАЗИН</button>
                <button onClick={() => { setPage('top'); fetch(`${API_URL}/api/top`).then(r => r.json()).then(setTopPlayers); }} className={page === 'top' ? 'active' : ''}>ТОП</button>
                <button onClick={() => setPage('profile')} className={page === 'profile' ? 'active' : ''}>ПРОФИЛЬ</button>
            </nav>
        </div>
    );
}

export default App;