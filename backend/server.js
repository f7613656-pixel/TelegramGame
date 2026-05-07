const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const app = express();

const players = {}; // Хранилище в памяти

app.use(cors());
app.use(express.json());

// Токен бота
const BOT_TOKEN = '8782512322:AAE2dwWX7V2PZwFIj3aAFLC-GoszWh0hwiQ';

// --- ПРОВЕРКА ПОДЛИННОСТИ ---
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

// --- ЗАЩИТНЫЙ СЛОЙ ---
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).send('No auth header');
    
    const initData = authHeader.split(' ')[1];
    if (!verifyTelegramWebAppData(initData)) {
        return res.status(401).send('Unauthorized');
    }
    next();
};

// --- МАРШРУТЫ ---

// 1. Получение данных пользователя (или создание нового)
app.get('/api/user/:id', authMiddleware, (req, res) => {
    const userId = req.params.id;

    if (!players[userId]) {
        players[userId] = {
            id: userId,
            balance: 0,
            clickPower: 1,
            passiveIncome: 0,
            firstName: "Игрок" // Можно передавать из фронта при первом входе
        };
    }
    res.json(players[userId]);
});

app.post('/api/sync', authMiddleware, (req, res) => {
    const { userId, clicksCount } = req.body; // Получаем количество кликов
    const player = players[userId];

    if (!player) return res.status(404).send('User not found');

    // Начисляем сразу всю пачку кликов
    const totalAdded = player.clickPower * (clicksCount || 0);
    player.balance += totalAdded;

    res.json(player);
});

// 2. Обработка клика
app.post('/api/tap', authMiddleware, (req, res) => {
    const { userId } = req.body;
    const player = players[userId];

    if (!player) return res.status(404).send('User not found');

    player.balance += player.clickPower;
    
    // Возвращаем ВЕСЬ объект игрока, чтобы фронт обновился полностью
    res.json(player); 
});

// ОДИН универсальный маршрут для всех улучшений
app.post('/api/upgrade/:type', authMiddleware, (req, res) => {
    const { userId } = req.body;
    const type = req.params.type; // Теперь это 'click' или 'passive'
    const player = players[userId];

    // Если игрока нет в памяти (например, сервер перезагрузился)
    if (!player) {
        return res.status(404).json({ message: "User not found. Please refresh." });
    }

    let cost = 0;

    // Рассчитываем цену
    if (type === 'click') {
        cost = player.clickPower * 100;
    } else if (type === 'passive') {
        // Уровни пассива считаем кратно 5
        const level = Math.floor(player.passiveIncome / 5);
        cost = (level + 1) * 150;
    } else {
        return res.status(400).json({ message: "Invalid upgrade type" });
    }

    // Проверка денег
    if (player.balance >= cost) {
        player.balance -= cost;
        
        if (type === 'click') {
            player.clickPower += 1;
        } else if (type === 'passive') {
            player.passiveIncome += 5;
        }

        console.log(`Игрок ${userId} купил ${type}. Новый баланс: ${player.balance}`);
        res.json(player); // Отправляем обновленного игрока целиком
    } else {
        res.status(400).json({ message: "Low balance" });
    }
});

// 4. Лидерборд (работает с объектом players в памяти)
app.get('/api/leaderboard', (req, res) => {
    const topUsers = Object.values(players)
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 10)
        .map(u => ({
            name: u.firstName || "Аноним",
            balance: Math.floor(u.balance)
        }));

    res.json(topUsers);
});

// Запуск
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});