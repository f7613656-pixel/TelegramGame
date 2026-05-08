const express = require('express');
const cors = require('cors'); // Импортируем
const { Pool } = require('pg');
const crypto = require('crypto'); // Обязательно добавь этот импорт
require('dotenv').config();

const app = express();
app.use(cors()); // Должен быть первым!
app.use(express.json()); // Должен быть вторым!

// --- ПОДКЛЮЧЕНИЕ БД ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

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
initDB();

const BOT_TOKEN = '8782512322:AAE2dwWX7V2PZwFIj3aAFLC-GoszWh0hwiQ';

// --- ПРОВЕРКА TELEGRAM ---
function verifyTelegramWebAppData(initData) {
    if (!initData) return false;
    try {
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
    } catch (e) {
        return false;
    }
}

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

// 1. Вход/Получение юзера
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

// 2. Синхронизация (теперь обновляет и клики, и пассив)
app.post('/api/sync', async (req, res) => {
    const { userId, name, balance } = req.body;
    if (!userId) return res.status(400).send("No user ID");

    try {
        const query = `
            INSERT INTO users (id, name, balance, last_sync)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (id) DO UPDATE
            SET balance = $3, name = $2, last_sync = $4
            RETURNING *;
        `;
        const result = await pool.query(query, [userId.toString(), name, balance, Date.now()]);
        res.json(result.rows[0]);
    } catch (err) {
        console.error("Ошибка синхронизации:", err);
        res.status(500).send("Ошибка сохранения");
    }
});

// 3. Покупка улучшений (ПОЛНОСТЬЮ ПЕРЕПИСАНО ПОД БД)
app.post('/api/upgrade/:type', authMiddleware, async (req, res) => {
    const { userId } = req.body;
    const type = req.params.type;

    try {
        // Получаем текущие данные игрока из БД
        const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [userId.toString()]);
        if (userRes.rows.length === 0) return res.status(404).send('User not found');
        
        let user = userRes.rows[0];
        let cost = 0;
        let updateQuery = "";
        let queryParams = [];

        if (type === 'click') {
            cost = user.click_power * 100;
            if (user.balance < cost) return res.status(400).json({ message: "Недостаточно монет" });
            
            updateQuery = "UPDATE users SET balance = balance - $1, click_power = click_power + 1 WHERE id = $2 RETURNING *";
            queryParams = [cost, user.id];
        } else if (type === 'passive') {
            const level = Math.floor(user.passive_income / 5);
            cost = (level + 1) * 150;
            if (user.balance < cost) return res.status(400).json({ message: "Недостаточно монет" });
            
            updateQuery = "UPDATE users SET balance = balance - $1, passive_income = passive_income + 5 WHERE id = $2 RETURNING *";
            queryParams = [cost, user.id];
        } else {
            return res.status(400).send('Invalid type');
        }

        const result = await pool.query(updateQuery, queryParams);
        const updatedUser = result.rows[0];

        res.json({
            balance: updatedUser.balance,
            clickPower: updatedUser.click_power,
            passiveIncome: updatedUser.passive_income,
            serverTime: Date.now()
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Ошибка при покупке");
    }
});

// 4. Топы
app.get('/api/leaderboard', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT name, balance FROM users ORDER BY balance DESC LIMIT 50'
        );
        res.json(result.rows); 
    } catch (err) {
        res.status(500).json({ error: "Ошибка сервера" });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});