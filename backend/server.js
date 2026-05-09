const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// --- УМНОЕ ПОДКЛЮЧЕНИЕ К БД ---
// Решает проблему с SSL: включает его только для облачных баз (Render/Supabase)
const dbUrl = process.env.DATABASE_URL || '';
const pool = new Pool({
  connectionString: dbUrl,
  ssl: dbUrl.includes('render.com') || dbUrl.includes('supabase') 
    ? { rejectUnauthorized: false } 
    : false
});

// Авто-фикс таблиц при запуске
const autoFixDatabase = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100),
        balance BIGINT DEFAULT 0,
        click_power INTEGER DEFAULT 1,
        passive_income INTEGER DEFAULT 0,
        last_sync BIGINT
      );
      ALTER TABLE users ALTER COLUMN id TYPE TEXT;
    `);
    console.log("✅ База данных проверена и готова к работе!");
  } catch (err) {
    console.error("❌ Ошибка при фиксе базы:", err.message);
  }
};
autoFixDatabase();

const BOT_TOKEN = process.env.BOT_TOKEN || '8782512322:AAE2dwWX7V2PZwFIj3aAFLC-GoszWh0hwiQ';

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

// 1. Вход/Получение юзера (С АВТОРЕГИСТРАЦИЕЙ)
app.get('/api/user/:id', async (req, res) => {
    try {
        const userId = req.params.id.toString();
        const userName = req.query.name || "Игрок"; // Имя берем из запроса
        
        const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
        
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            // ГЛАВНЫЙ ФИКС: Создаем пользователя в БД, если его еще нет!
            const insertQuery = `
                INSERT INTO users (id, name, balance, click_power, passive_income, last_sync) 
                VALUES ($1, $2, 0, 1, 0, $3) 
                RETURNING *;
            `;
            const newUser = await pool.query(insertQuery, [userId, userName, Date.now()]);
            console.log(`[РЕГИСТРАЦИЯ] Создан новый игрок: ${userName} (ID: ${userId})`);
            res.json(newUser.rows[0]);
        }
    } catch (err) {
        console.error("КРИТИЧЕСКАЯ ОШИБКА БД:", err.message);
        res.status(500).json({ error: "Database error", details: err.message });
    }
});

// 2. Синхронизация кликов
app.post('/api/sync', async (req, res) => {
    const { userId, clicks } = req.body;

    if (!userId || clicks === undefined) {
        return res.status(400).json({ error: "Неполные данные запроса" });
    }

    try {
        const query = `
            UPDATE users 
            SET balance = COALESCE(balance, 0) + $1, last_sync = $3
            WHERE id = $2 
            RETURNING balance, click_power, passive_income
        `;
        
        const result = await pool.query(query, [Number(clicks), userId.toString(), Date.now()]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Пользователь не найден" });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error("ОШИБКА СИНХРОНИЗАЦИИ:", err.message);
        res.status(500).json({ error: "Ошибка сохранения", details: err.message });
    }
});

// 3. Покупка улучшений
app.post('/api/upgrade/:type', authMiddleware, async (req, res) => {
    const { userId } = req.body;
    const { type } = req.params;
    
    if (!userId) return res.status(400).json({ message: "ID не передан" });

    try {
        let query = "";
        
        if (type === 'click') {
            query = `
                UPDATE users 
                SET 
                    balance = balance - (COALESCE(click_power, 1) * 100),
                    click_power = COALESCE(click_power, 1) + 1 
                WHERE id = $1 AND balance >= (COALESCE(click_power, 1) * 100)
                RETURNING balance, click_power, passive_income;
            `;
        } else if (type === 'passive') {
            query = `
                UPDATE users 
                SET 
                    balance = balance - ((FLOOR(COALESCE(passive_income, 0) / 5) + 1) * 150),
                    passive_income = COALESCE(passive_income, 0) + 5
                WHERE id = $1 AND balance >= ((FLOOR(COALESCE(passive_income, 0) / 5) + 1) * 150)
                RETURNING balance, click_power, passive_income;
            `;
        } else {
            return res.status(400).json({ message: "Неизвестный тип улучшения" });
        }
        
        const result = await pool.query(query, [userId.toString()]);

        if (result.rows.length === 0) {
            return res.status(400).json({ message: "Недостаточно монет" });
        }

        const updatedUser = result.rows[0];
        res.json({
            balance: updatedUser.balance,
            clickPower: updatedUser.click_power,
            passiveIncome: updatedUser.passive_income,
            serverTime: Date.now()
        });

    } catch (err) {
        console.error("ОШИБКА АПГРЕЙДА:", err.message);
        res.status(500).json({ message: "Ошибка БД", details: err.message });
    }
});

// 4. Топы
app.get('/api/leaderboard', async (req, res) => {
    try {
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
        res.status(500).json([]); 
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});