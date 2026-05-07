const express = require('express');
const cors = require('cors');

const app = express(); // ВОТ ЭТА СТРОЧКА ДОЛЖНА БЫТЬ ТРЕТЬЕЙ!

app.use(cors());
app.use(express.json());

// База данных в памяти
let players = {
    "test_user": { 
        balance: 0, 
        clickPower: 1, 
        passiveIncome: 0, 
        username: "BANANEZLAL",
        lastSync: Date.now() 
    }
};

// Эндпоинты
app.get('/api/user/:id', (req, res) => {
    const userId = req.params.id;
    if (!players[userId]) {
        players[userId] = { balance: 0, clickPower: 1, passiveIncome: 0, username: "Игрок", lastSync: Date.now() };
    }
    res.json(players[userId]);
});

app.post('/api/tap', (req, res) => {
    const { userId, clientBalance } = req.body;
    if (players[userId]) {
        players[userId].balance = Math.max(players[userId].balance, Number(clientBalance) || 0);
        players[userId].lastSync = Date.now();
        res.json({ success: true, balance: players[userId].balance });
    } else res.status(404).send("User not found");
});

app.post('/api/upgrade/click', (req, res) => {
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

app.post('/api/upgrade/passive', (req, res) => {
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

// Запуск сервера (В САМОМ КОНЦЕ)
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});