


const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

let players = {
    "test_user": { 
        balance: 0, 
        clickPower: 1, 
        passiveIncome: 0, 
        username: "BANANEZLAL",
        lastSync: Date.now() 
    }
};

// Хелпер для получения игрока
const getPlayer = (id) => players[id] || players["test_user"];

app.get('/api/user/:id', (req, res) => {
    const userId = req.params.id;
    if (!players[userId]) {
        players[userId] = { balance: 0, clickPower: 1, passiveIncome: 0, username: "Игрок", lastSync: Date.now() };
    }
    const player = players[userId];
    const now = Date.now();
    const seconds = (now - player.lastSync) / 1000;
    player.balance += seconds * (Number(player.passiveIncome) || 0);
    player.lastSync = now;
    res.json(player);
});

app.post('/api/tap', (req, res) => {
    const { userId, clientBalance } = req.body;
    const player = getPlayer(userId);
    player.balance = Math.max(player.balance, Number(clientBalance) || 0);
    player.lastSync = Date.now();
    res.json({ success: true, balance: player.balance });
});

// ПРОВЕРЬ ЭТОТ ПУТЬ
app.post('/api/upgrade/click', (req, res) => {
    const { userId } = req.body;
    const player = getPlayer(userId);
    const cost = Number(player.clickPower) * 100;

    if (Math.floor(player.balance) >= cost) {
        player.balance -= cost;
        player.clickPower += 1;
        player.lastSync = Date.now();
        return res.json(player);
    }
    res.status(400).send("Low balance");
});

// И ЭТОТ ПУТЬ
app.post('/api/upgrade/passive', (req, res) => {
    const { userId } = req.body;
    const player = getPlayer(userId);
    const level = Math.floor(Number(player.passiveIncome) / 5);
    const cost = (level + 1) * 150;
    
    if (Math.floor(player.balance) >= cost) {
        player.balance -= cost;
        player.passiveIncome += 5;
        player.lastSync = Date.now();
        return res.json(player);
    }
    res.status(400).send("Low balance");
});

app.get('/api/top', (req, res) => {
    const top = Object.entries(players).map(([id, d]) => ({ id, ...d }))
        .sort((a, b) => b.balance - a.balance).slice(0, 10);
    res.json(top);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));