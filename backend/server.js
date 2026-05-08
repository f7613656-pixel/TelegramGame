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
app.post('/api/upgrade/:type', authMiddleware, async (req, res) => {
    console.log(`=== ПОКУПКА АПГРЕЙДА (${req.params.type}) ===`);
    console.log("Данные от игрока:", req.body);

    if (!req.body || req.body.userId === undefined) {
        console.error("Ошибка: нет userId для покупки");
        return res.status(400).json({ message: "Ошибка передачи данных" });
    }

    const userId = req.body.userId.toString();
    const type = req.params.type;

    try {
        const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
        
        if (userRes.rows.length === 0) {
            console.log("Пользователь не найден в БД:", userId);
            return res.status(404).json({ message: 'Пользователь не найден. Попробуйте перезайти.' });
        }
        
        let user = userRes.rows[0];
        let cost = 0;
        let updateQuery = "";
        let queryParams = [];

        if (type === 'click') {
            cost = user.click_power * 100;
            if (user.balance < cost) return res.status(400).json({ message: "Недостаточно монет" });
            
            updateQuery = "UPDATE users SET balance = balance - $1, click_power = click_power + 1 WHERE id = $2 RETURNING *";
            queryParams = [cost, userId];
        } else if (type === 'passive') {
            const level = Math.floor(user.passive_income / 5);
            cost = (level + 1) * 150;
            if (user.balance < cost) return res.status(400).json({ message: "Недостаточно монет" });
            
            updateQuery = "UPDATE users SET balance = balance - $1, passive_income = passive_income + 5 WHERE id = $2 RETURNING *";
            queryParams = [cost, userId];
        } else {
            return res.status(400).json({ message: 'Неверный тип апгрейда' });
        }

        const result = await pool.query(updateQuery, queryParams);
        const updatedUser = result.rows[0];

        console.log("Покупка успешна! Новый баланс:", updatedUser.balance);

        res.json({
            balance: updatedUser.balance,
            clickPower: updatedUser.click_power,
            passiveIncome: updatedUser.passive_income,
            serverTime: Date.now()
        });

    } catch (err) {
        console.error("ОШИБКА БД ПРИ ПОКУПКЕ:", err.message);
        res.status(500).json({ message: "Ошибка базы данных", details: err.message });
    }
});

// 4. Топы
app.get('/api/leaderboard', async (req, res) => {
    try {
        // Добавляем приведение типов и проверку на наличие баланса
        const result = await pool.query(`
            SELECT name, CAST(balance AS FLOAT) as balance 
            FROM users 
            WHERE balance > 0 
            ORDER BY balance DESC 
            LIMIT 50
        `);
        
        // Если строк нет, возвращаем пустой массив, а не null
        res.json(result.rows || []); 
    } catch (err) {
        console.error("Ошибка в топах:", err.message);
        res.status(500).json({ error: "Ошибка сервера", details: err.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});