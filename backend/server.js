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
        console.log("Поиск пользователя с ID:", req.params.id); // Лог для проверки
        const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
        
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            // Если юзера нет в базе, лучше не выдавать 404, 
            // а возвращать пустой объект или дефолтные значения
            res.json({ id: req.params.id, balance: 0, click_power: 1, isNew: true });
        }
    } catch (err) {
        console.error("КРИТИЧЕСКАЯ ОШИБКА БД:", err.message);
        res.status(500).json({ error: "Database error", details: err.message });
    }
});

app.post('/api/sync', async (req, res) => {
    console.log("=== СИНХРОНИЗАЦИЯ ===");
    console.log("Полученные данные:", req.body); // Смотрим, что реально пришло

    // Проверяем, что тело запроса вообще есть
    if (!req.body || req.body.userId === undefined) {
        console.error("Ошибка: фронтенд не прислал userId!");
        return res.status(400).json({ error: "No user ID provided" });
    }

    const { userId, name, balance } = req.body;

    try {
        const query = `
            INSERT INTO users (id, name, balance, last_sync)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (id) DO UPDATE
            SET balance = $3, name = $2, last_sync = $4
            RETURNING *;
        `;
        const values = [userId.toString(), name || "Player", balance || 0, Date.now()];
        const result = await pool.query(query, values);
        
        console.log("Успешно сохранено:", result.rows[0].id);
        res.json(result.rows[0]);
    } catch (err) {
        console.error("ОШИБКА БД ПРИ СИНХРОНИЗАЦИИ:", err.message);
        res.status(500).json({ error: "Ошибка сохранения", details: err.message });
    }
});

// 3. Покупка улучшений (ПОЛНОСТЬЮ ПЕРЕПИСАНО ПОД БД)
app.post('/api/upgrade/click', authMiddleware, async (req, res) => {
    const { userId } = req.body;
    
    if (!userId) return res.status(400).json({ message: "ID не передан" });

    try {
        // Используем COALESCE, чтобы если в базе NULL, заменялось на 1 и 0
        const query = `
            UPDATE users 
            SET 
                balance = balance - (COALESCE(click_power, 1) * 100),
                click_power = COALESCE(click_power, 1) + 1 
            WHERE id = $1 AND balance >= (COALESCE(click_power, 1) * 100)
            RETURNING balance, click_power, passive_income;
        `;
        
        const result = await pool.query(query, [userId.toString()]);

        if (result.rows.length === 0) {
            return res.status(400).json({ message: "Недостаточно монет или юзер не найден" });
        }

        const updatedUser = result.rows[0];
        res.json({
            balance: updatedUser.balance,
            clickPower: updatedUser.click_power,
            passiveIncome: updatedUser.passive_income,
            serverTime: Date.now()
        });

    } catch (err) {
        console.error("ОШИБКА АПГРЕЙДА КЛИКА:", err.message);
        res.status(500).json({ message: "Ошибка БД", details: err.message });
    }
});

// 4. Топы
app.get('/api/leaderboard', async (req, res) => {
    try {
        // Проверяем по балансу, берем топ 10
        const result = await pool.query(`
            SELECT name, balance 
            FROM users 
            WHERE name IS NOT NULL 
            ORDER BY balance DESC 
            LIMIT 10
        `);
        
        res.json(result.rows);
    } catch (err) {
        console.error("ОШИБКА ЛИДЕРБОРДА:", err.message);
        res.status(500).json([]); // Возвращаем пустой массив вместо ошибки 500
    }
});
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});