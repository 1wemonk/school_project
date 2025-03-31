import express from 'express';
import { createServer } from '@urban-bot/server';
import Bot from './App';

const app = express();
const botServer = createServer(Bot);

app.use(express.json());

app.post('/api/webhook', (req, res) => {
    botServer.handleUpdate(req.body);
    res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});