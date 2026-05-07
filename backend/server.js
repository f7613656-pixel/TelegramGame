const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const app = express();

app.use(cors());
app.use(express.json());

// ВСТАВЬ СВОЙ ТОКЕН ОТ BOTFATHER ЗДЕСЬ
const BOT_TOKEN = '8782512322:AAE2dwWX7V2PZwFIj3aAFLC-GoszWh0hwiQ';

// --- ФУНКЦИЯ ПРОВЕРКИ (КРИПТОГРАФИЯ) ---
function verifyTelegramWebAppData(initData) {
    if (!initData) return false;
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    urlParams.delete('hash');
    urlParams.sort();
    let dataCheckString = '';
    for (const [key, value] of urlParams.entries()) {
        dataCheckString += `${key}=${value}\n`;
    }
    dataCheckString = dataCheckString.slice(0, -1);
    const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const _hash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
    return _hash === hash;
}

// --- MIDDLEWARE ЗАЩИТЫ ---
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('tma ')) {
        return res.status(401).send('Unauthorized');
    }
    const initData = authHeader.split(' ')[1];
    if (verifyTelegramWebAppData(initData)) {
        next(); // Всё ок, идем дальше
    } else {
        res.status(403).send('Forbidden');
    }
};

// --- МАРШРУТЫ (С ПРИМЕНЕНИЕМ ЗАЩИТЫ) ---

// Теперь добавляем authMiddleware в каждый важный роут
app.post('/api/tap', authMiddleware, async (req, res) => {
    const { userId } = req.body;
    // ТУТ ЛОГИКА: Находим юзера в базе и САМИ прибавляем ему clickPower
    // res.json({ balance: newBalance });
});

app.post('/api/upgrade/click', authMiddleware, async (req, res) => {
    const { userId } = req.body;
    const player = players[userId];
    if (!player) return res.status(404).send("User not found");
    const cost = player.clickPower * 100;
    if (player.balance >= cost) {
        player.balance -= cost;
        player.clickPower += 1;
        res.json(player);
    } else res.status(400).send("Low balance");
});

app.post('/api/upgrade/passive', authMiddleware, async(req, res) => {
    const { userId } = req.body;
    const player = players[userId];
    if (!player) return res.status(404).send("User not found");
    const level = Math.floor(player.passiveIncome / 5);
    const cost = (level + 1) * 150;
    if (player.balance >= cost) {
        player.balance -= cost;
        player.passiveIncome += 5;
        res.json(player);
    } else res.status(400).send("Low balance");
});

app.get('/api/leaderboard', authMiddleware, async (req, res) => {
    // Получаем топ-100 из базы
    const topUsers = await Database.getTop(100); 
    
    // Формируем безопасный массив
    const safeTop = topUsers.map(u => ({
        name: u.first_name, // Отдаем только имя
        balance: u.balance  // И баланс
        // НИКАКИХ userId или фото
    }));

    res.json(safeTop);
});

// Запуск сервера (В САМОМ КОНЦЕ)
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});