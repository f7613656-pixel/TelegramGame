const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const app = express();
const players = {}; // Объект для хранения данных игроков в оперативной памяти
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
    
    // Собираем строку данных
    const dataCheckString = Array.from(urlParams.entries())
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

    const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const _hash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
    
    return _hash === hash;
}

// --- MIDDLEWARE ЗАЩИТЫ ---
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const initData = authHeader.split(' ')[1];
    const isValid = verifyTelegramWebAppData(initData);
    
    if (!isValid) {
        console.log("Ошибка проверки initData!"); // Это появится в логах Render
        return res.status(401).send('Unauthorized');
    }
    next();
};

// --- МАРШРУТЫ (С ПРИМЕНЕНИЕМ ЗАЩИТЫ) ---

// Теперь добавляем authMiddleware в каждый важный роут
app.post('/api/tap', authMiddleware, async (req, res) => {
    const { userId } = req.body;
    // ТУТ ЛОГИКА: Находим юзера в базе и САМИ прибавляем ему clickPower
    // res.json({ balance: newBalance });
});

app.get('/api/user/:id', authMiddleware, (req, res) => {
    const userId = req.params.id;

    // Если игрока нет в памяти, создаем его с начальными параметрами
    if (!players[userId]) {
        players[userId] = {
            balance: 0,
            clickPower: 1,
            passiveIncome: 0,
            lastUpdate: Date.now()
        };
        console.log(`Создан новый игрок: ${userId}`);
    }

    res.json(players[userId]);
});

app.post('/api/upgrade/click', authMiddleware, (req, res) => {
    const { userId } = req.body;
    const type = req.params.type;

    // 1. Проверяем, существует ли игрок в памяти
    if (!players[userId]) {
        return res.status(404).json({ message: "Пользователь не найден" });
    }

    const user = players[userId];
    let cost = 0;

    // 2. Рассчитываем стоимость (логика должна совпадать с фронтендом!)
    if (type === 'click') {
        cost = user.clickPower * 100;
    } else if (type === 'passive') {
        cost = (Math.floor(user.passiveIncome / 5) + 1) * 150;
    }

    // 3. Проверка баланса
    if (user.balance < cost) {
        return res.status(400).json({ message: "Low balance" });
    }

    // 4. Списание денег и применение эффекта
    user.balance -= cost;
    
    if (type === 'click') {
        user.clickPower += 1;
    } else if (type === 'passive') {
        user.passiveIncome += 5;
    }

    // 5. Отправляем обновленные данные
    res.json({
        balance: user.balance,
        clickPower: user.clickPower,
        passiveIncome: user.passiveIncome
    });
});

app.post('/api/upgrade/passive', authMiddleware,(req, res) => {
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

app.get('/api/leaderboard',  async (req, res) => {
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