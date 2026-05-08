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
app.post('/api/upgrade/:type', async (req, res) => {
    const { userId } = req.body;
    const { type } = req.params;

    console.log(`[UPGRADE] Попытка покупки: ${type} для ID: ${userId}`);

    try {
        // 1. Проверяем пользователя
        const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [userId.toString()]);
        
        if (userRes.rows.length === 0) {
            return res.status(404).json({ message: "Сначала начни играть (ID не найден)" });
        }

        const user = userRes.rows[0];
        let cost = 0;
        let query = "";
        let params = [];

        // 2. Логика расчета (убедись, что имена колонок в базе именно такие!)
        if (type === 'click') {
            cost = (user.click_power || 1) * 100;
            if (user.balance < cost) return res.status(400).json({ message: "Недостаточно монет" });
            
            query = `UPDATE users SET balance = balance - $1, click_power = COALESCE(click_power, 1) + 1 WHERE id = $2 RETURNING *`;
            params = [cost, userId.toString()];
        } 
        else if (type === 'passive') {
            const currentPassive = user.passive_income || 0;
            cost = (Math.floor(currentPassive / 5) + 1) * 150;
            if (user.balance < cost) return res.status(400).json({ message: "Недостаточно монет" });
            
            query = `UPDATE users SET balance = balance - $1, passive_income = COALESCE(passive_income, 0) + 5 WHERE id = $2 RETURNING *`;
            params = [cost, userId.toString()];
        }

        const result = await pool.query(query, params);
        const updated = result.rows[0];

        res.json({
            balance: updated.balance,
            clickPower: updated.click_power,
            passiveIncome: updated.passive_income,
            serverTime: Date.now()
        });

    } catch (err) {
        // ВОТ ТУТ мы увидим реальную причину в логах Render
        console.error("!!! ОШИБКА БАЗЫ ДАННЫХ:", err.message);
        res.status(500).json({ 
            message: "Ошибка базы данных", 
            details: err.message // Отправляем детали на фронт для отладки
        });
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