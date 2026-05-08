const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

const { Pool } = require('pg');
require('dotenv').config();

// Настройка пула соединений
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Обязательно для работы с облачными БД типа Render/Supabase
  }
});

// Функция для создания таблицы (выполнится один раз при запуске, если таблицы нет)
const initDB = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(100),
      balance NUMERIC DEFAULT 0,
      click_power INTEGER DEFAULT 1,
      passive_income INTEGER DEFAULT 0,
      last_sync BIGINT
    );
  `;
  try {
    await pool.query(query);
    console.log("База данных готова к работе");
  } catch (err) {
    console.error("Ошибка инициализации БД:", err);
  }
};


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
app.get('/api/user/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(404).send("User not found");
        }
    } catch (err) {
        res.status(500).send("Server error");
    }
});

// 2. Синхронизация кликов и пассивного дохода
app.post('/api/sync', async (req, res) => {
    const { userId, name, balance } = req.body;
    
    if (!userId) return res.status(400).send("No user ID");

    try {
        // UPSERT: если юзер есть — обновляем, если нет — создаем
        const query = `
            INSERT INTO users (id, name, balance, last_sync)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (id) DO UPDATE
            SET balance = $3, name = $2, last_sync = $4
            RETURNING *;
        `;
        const values = [userId.toString(), name, balance, Date.now()];
        const result = await pool.query(query, values);
        
        res.json(result.rows[0]);
    } catch (err) {
        console.error("Ошибка при синхронизации:", err);
        res.status(500).send("Ошибка сохранения");
    }
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


app.get('/api/leaderboard', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT name, balance FROM users ORDER BY balance DESC LIMIT 50'
        );
        res.json(result.rows); 
    } catch (err) {
        console.error("Ошибка БД в топах:", err);
        res.status(500).json({ error: "Ошибка сервера" });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});
initDB();