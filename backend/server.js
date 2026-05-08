const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

// Твой токен от BotFather
const BOT_TOKEN = '8782512322:AAE2dwWX7V2PZwFIj3aAFLC-GoszWh0hwiQ';

// База данных в оперативной памяти
const players = {}; 

// --- ПРОВЕРКА ПОДЛИННОСТИ (TELEGRAM) ---
function verifyTelegramWebAppData(initData) {
    if (!initData) return false;
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    urlParams.delete('hash');
    urlParams.sort();
    
    const dataCheckString = Array.from(urlParams.entries())
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

    const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const _hash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
    
    return _hash === hash;
}

// --- MIDDLEWARE ДЛЯ ЗАЩИТЫ ---
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).send('No auth header');
    
    const initData = authHeader.split(' ')[1];
    if (!verifyTelegramWebAppData(initData)) {
        return res.status(401).send('Unauthorized');
    }
    next();
};

// --- ФУНКЦИЯ ПЕРЕРАСЧЕТА (ВРЕМЯ = ДЕНЬГИ) ---
function getRecalculatedPlayer(player) {
    const now = Date.now();
    const elapsedSeconds = (now - player.lastSyncTime) / 1000;
    
    // Начисляем пассивный доход за прошедшее время
    const earnedPassive = elapsedSeconds * player.passiveIncome;
    player.balance += earnedPassive;
    player.lastSyncTime = now;
    
    return player;
}

// --- МАРШРУТЫ ---

// 1. Вход в игру (создание или получение профиля)
app.get('/api/user/:id', authMiddleware, (req, res) => {
    const userId = req.params.id;

    if (!players[userId]) {
        players[userId] = {
            balance: 0,
            clickPower: 1,
            passiveIncome: 0,
            lastSyncTime: Date.now()
        };
    } else {
        players[userId] = getRecalculatedPlayer(players[userId]);
    }

    res.json({
        ...players[userId],
        serverTime: Date.now() // Отдаем время сервера для синхронизации
    });
});

// 2. Синхронизация кликов и пассивного дохода
app.post('/api/sync', authMiddleware, (req, res) => {
    const { userId, clicksCount } = req.body;
    let player = players[userId];

    if (!player) return res.status(404).send('User not found');

    player = getRecalculatedPlayer(player);

    if (clicksCount > 0) {
        player.balance += clicksCount * player.clickPower;
    }

    res.json({
        balance: player.balance,
        clickPower: player.clickPower,
        passiveIncome: player.passiveIncome,
        serverTime: Date.now()
    });
});

// 3. Покупка улучшений
app.post('/api/upgrade/:type', authMiddleware, (req, res) => {
    const { userId, pendingClicks } = req.body; 
    const type = req.params.type;
    let player = players[userId];

    if (!player) return res.status(404).send('User not found');

    // Сначала актуализируем баланс и добавляем еще не отправленные клики
    player = getRecalculatedPlayer(player);
    if (pendingClicks > 0) {
        player.balance += pendingClicks * player.clickPower;
    }

    let cost = 0;
    if (type === 'click') {
        cost = player.clickPower * 100;
    } else if (type === 'passive') {
        const level = Math.floor(player.passiveIncome / 5);
        cost = (level + 1) * 150;
    } else {
        return res.status(400).send('Invalid upgrade type');
    }

    if (player.balance >= cost) {
        player.balance -= cost;
        
        if (type === 'click') {
            player.clickPower += 1;
        } else if (type === 'passive') {
            player.passiveIncome += 5;
        }

        res.json({
            balance: player.balance,
            clickPower: player.clickPower,
            passiveIncome: player.passiveIncome,
            serverTime: Date.now()
        });
    } else {
        res.status(400).json({ message: "Недостаточно монет" });
    }
});

// Твои временные данные (убедись, что это массив [], а не объект {}, 
// так как фронтенд использует .map)
const players = [
    { name: "Игрок 1", balance: 5000 },
    { name: "Игрок 2", balance: 2500 },
    { name: "Игрок 3", balance: 1200 }
];

app.get('/api/leaderboard', (req, res) => {
    try {
        // Сортируем по балансу (от большего к меньшему) перед отправкой
        const sortedPlayers = [...players].sort((a, b) => b.balance - a.balance);
        
        // Отправляем именно JSON
        res.status(200).json(sortedPlayers);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Ошибка на стороне сервера" });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});