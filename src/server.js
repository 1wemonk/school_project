// server.js
import express from 'express';
import { Bot } from './App';
import { createServer } from '@urban-bot/server';

const app = express();
const botServer = createServer();

app.use(express.json());

// Роут для вебхука
app.post('/api/webhook', (req, res) => {
    botServer.handleUpdate(req.body);
    res.sendStatus(200);
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});