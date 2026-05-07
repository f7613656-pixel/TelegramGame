import React, { useState, useEffect } from 'react';
import './App.css';

const tg = window.Telegram.WebApp;
const API_URL = 'https://telegramgame-1.onrender.com'; // ЗАМЕНИ НА СВОЮ ССЫЛКУ

function App() {
    const [user] = useState(tg.initDataUnsafe?.user || { id: 'test_user', first_name: 'Игрок' });
    const [balance, setBalance] = useState(0);
    const [clickPower, setClickPower] = useState(1);
    const [passiveIncome, setPassiveIncome] = useState(0);

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

    const handleTap = () => {
        if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
        const newBalance = balance + clickPower;
        setBalance(newBalance);

        fetch(`${API_URL}/api/tap`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id, clientBalance: newBalance })
        });
    };

    const buyUpgrade = async (type) => {
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
        }
    };

    return (
        <div className="App">
            <header className="header">
                <div className="profile">
                    {user.photo_url ? (
                        <img src={user.photo_url} alt="ava" className="avatar" />
                    ) : (
                        <div className="avatar-placeholder">👤</div>
                    )}
                    <span className="username">{user.first_name}</span>
                </div>
                <div className="balance">💰 {Math.floor(balance)}</div>
            </header>

            <main className="game-area">
                <button className="click-button" onClick={handleTap}>
                    TAP
                </button>
            </main>

            <footer className="shop">
                <button onClick={() => buyUpgrade('click')}>
                    Улучшить тап ({clickPower * 100} 💰)
                </button>
                <button onClick={() => buyUpgrade('passive')}>
                    Авто-доход ({ (Math.floor(passiveIncome / 5) + 1) * 150 } 💰)
                </button>
            </footer>
        </div>
    );
}

export default App;