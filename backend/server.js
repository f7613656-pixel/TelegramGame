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

// Этот код сам починит базу при запуске сервера
const autoFixDatabase = async () => {
  try {
    // Внутри кавычек должен быть ТОЛЬКО чистый SQL
    await pool.query(`
      ALTER TABLE users ALTER COLUMN id TYPE TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS balance BIGINT DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS click_power INTEGER DEFAULT 1;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS passive_income INTEGER DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_sync BIGINT DEFAULT 0;
      
      UPDATE users SET balance = 0 WHERE balance IS NULL;
      UPDATE users SET click_power = 1 WHERE click_power IS NULL;
      UPDATE users SET passive_income = 0 WHERE passive_income IS NULL;
    `);
    
    // console.log должен быть ЗДЕСЬ, вне скобок pool.query
    console.log("✅ БАЗА ДАННЫХ ПРОВЕРЕНА И ИСПРАВЛЕНА");
  } catch (err) {
    console.error("❌ ОШИБКА ПРИ ФИКСЕ БАЗЫ:", err.message);
  }
};

autoFixDatabase();
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
    const { userId, clicks } = req.body;

    // Логируем входящие данные, чтобы понять, что прислал фронтенд
    console.log(`[SYNC] Запрос от ID: ${userId}, Кликов: ${clicks}`);

    if (!userId || clicks === undefined) {
        return res.status(400).json({ error: "Неполные данные запроса" });
    }

    try {
        // Используем максимально простой запрос для проверки
        const query = `
            UPDATE users 
            SET balance = COALESCE(balance, 0) + $1 
            WHERE id = $2 
            RETURNING balance, click_power, passive_income
        `;
        
        const result = await pool.query(query, [Number(clicks), userId.toString()]);

        if (result.rows.length === 0) {
            console.error(`[SYNC] Пользователь ${userId} не найден в базе`);
            return res.status(404).json({ error: "Пользователь не найден" });
        }

        console.log(`[SYNC] Успех! Новый баланс пользователя ${userId}: ${result.rows[0].balance}`);
        res.json(result.rows[0]);

    } catch (err) {
        // ТУТ мы наконец увидим реальную ошибку в логах Render
        console.error("!!! КРИТИЧЕСКАЯ ОШИБКА БАЗЫ:");
        console.error("Сообщение:", err.message);
        console.error("Код ошибки:", err.code);

        res.status(500).json({ 
            error: "Ошибка сохранения", 
            details: err.message 
        });
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