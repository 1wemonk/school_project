const { Telegraf, session } = require('telegraf');
require('dotenv').config();
const OpenAI = require('openai');
const { createClient } = require('@supabase/supabase-js');

// Настройка Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Настройка бота
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
bot.use(session());

function ensureSession(ctx) {
    if (!ctx.session) {
        ctx.session = { state: 'menu', schedule: {} };
    }
}

function formatForTelegram(text) {
    return text
        .replace(/###/g, '▎ ')
        .replace(/```([\s\S]*?)```/g, '<pre>$1</pre>') // Моноширинный текст
        .replace(/`(.+?)`/g, '<code>$1</code>') // Моноширинный текст
        .replace(/_(.+?)_/g, '<i>$1</i>') // Курсив
        .replace(/\*(.+?)\*/g, '<b>$1</b>') // Курсив
        .replace(/__(.+?)__/g, '<b>$1</b>') // Жирный
        .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>') // Ссылки
        .replace(/^>(.*)/gm, '<blockquote>$1</blockquote>') // Цитаты
        .replace(/^(1\.\s+.*)$/gm, '$1') // Нумерованные списки
        .replace(/^(2\.\s+.*)$/gm, '$1')
        .replace(/^(3\.\s+.*)$/gm, '$1')
        .replace(/^(4\.\s+.*)$/gm, '$1')
        .replace(/^(5\.\s+.*)$/gm, '$1')
        .replace(/^(6\.\s+.*)$/gm, '$1')
        .replace(/^(7\.\s+.*)$/gm, '$1')
        .replace(/^(8\.\s+.*)$/gm, '$1')
        .replace(/^(9\.\s+.*)$/gm, '$1')
        .replace(/^(10\.\s+.*)$/gm, '$1')
        .replace(/^- (.*)$/gm, '• $1'); // Ненумерованные списки
}

async function loadSchedule(chatId) {
    const { data } = await supabase.from('schedule').select('day, subjects').eq('chat_id', chatId);
    return data.reduce((acc, row) => ({ ...acc, [row.day]: JSON.parse(row.subjects) }), {});
}

async function saveSchedule(chatId, day, subjects) {
    await supabase.from('schedule').upsert({
        chat_id: chatId,
        day: day,
        subjects: JSON.stringify(subjects),
    });
}

bot.command('start', async (ctx) => {
    ensureSession(ctx);
    ctx.session.state = 'menu';
    ctx.session.schedule = (await loadSchedule(ctx.chat.id)) || {};
    ctx.replyWithHTML(
        `👋 Привет, ${ctx.chat.first_name}! Я твой виртуальный помощник по обучению. Готов помочь тебе с любыми вопросами, связанными со школой! 📚`,
    );
});

bot.command('menu', async (ctx) => {
    ensureSession(ctx);
    ctx.session.state = 'menu';
    await showMenu(ctx);
});

bot.command('viewschedule', async (ctx) => {
    ensureSession(ctx);
    ctx.session.state = 'view_schedule';
    await viewSchedule(ctx);
});

bot.command('addschedule', async (ctx) => {
    ensureSession(ctx);
    ctx.session.state = 'add_schedule';
    await addSchedule(ctx);
});

async function showMenu(ctx) {
    ensureSession(ctx);
    const keyboard = [
        ['Добавить расписание', 'Посмотреть расписание'],
        ['Изменить расписание', 'Поговорить со мной'],
    ];
    ctx.reply('Выбери, что ты хочешь сделать:', {
        reply_markup: { keyboard, resize_keyboard: true },
    });
}

async function viewSchedule(ctx) {
    ensureSession(ctx);
    const keyboard = [
        ['Понедельник', 'Вторник'],
        ['Среда', 'Четверг'],
        ['Пятница', 'Суббота'],
    ];
    ctx.reply('Выбери день, на который ты хочешь узнать расписание:', {
        reply_markup: { keyboard, resize_keyboard: true },
    });
    ctx.session.state = 'view_day';
}

async function addSchedule(ctx) {
    ensureSession(ctx);
    const keyboard = [
        ['Понедельник', 'Вторник'],
        ['Среда', 'Четверг'],
        ['Пятница', 'Суббота'],
    ];
    ctx.reply('Выбери день, на который ты хочешь добавить расписание:', {
        reply_markup: { keyboard, resize_keyboard: true },
    });
    ctx.session.state = 'add_day';
}

bot.on('text', async (ctx) => {
    ensureSession(ctx);
    const text = ctx.message.text;
    const state = ctx.session.state || 'menu';
    const schedule = ctx.session.schedule || {};

    const dayMapping = {
        Понедельник: 'monday',
        Вторник: 'tuesday',
        Среда: 'wednesday',
        Четверг: 'thursday',
        Пятница: 'friday',
        Суббота: 'saturday',
    };

    switch (state) {
        case 'add_day':
            const selectedDay = dayMapping[text];
            if (selectedDay) {
                ctx.session.selected_day = selectedDay;
                ctx.session.state = 'add_subjects';
                ctx.reply(`Напиши расписание на ${text} через запятую:`);
            } else {
                ctx.reply('Выберите день из предложенных вариантов.');
            }
            break;

        case 'add_subjects':
            const subjects = text.split(',').map((s) => s.trim());
            const day = ctx.session.selected_day;
            schedule[day] = subjects;
            ctx.session.schedule = schedule;
            await saveSchedule(ctx.chat.id, day, subjects);
            ctx.reply(`Расписание на ${capitalizeDay(day)} успешно сохранено!`);
            ctx.session.state = 'menu';
            break;

        case 'view_day':
            const viewDay = dayMapping[text];
            if (viewDay) {
                const subjects = schedule[viewDay];
                if (subjects && subjects.length > 0) {
                    const formatted = formatSchedule(subjects, viewDay);
                    ctx.replyWithHTML(formatted);
                } else {
                    ctx.reply(`Расписание на ${capitalizeDay(viewDay)} еще не добавлено.`);
                }
            } else {
                ctx.reply('Выберите день из предложенных вариантов.');
            }
            ctx.session.state = 'menu';
            break;

        case 'dialog':
            try {
                const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
                const response = await openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: [{ role: 'user', content: text }],
                });
                ctx.replyWithHTML(formatForTelegram(response.choices[0].message.content));
            } catch (error) {
                console.log(error);
                ctx.reply('Ошибка при обработке запроса.');
            }
            break;

        default:
            if (text === 'Добавить расписание') {
                ctx.session.state = 'add_schedule';
                await addSchedule(ctx);
            } else if (text === 'Посмотреть расписание') {
                ctx.session.state = 'view_schedule';
                await viewSchedule(ctx);
            } else if (text === 'Изменить расписание') {
                ctx.session.state = 'edit_schedule';
                await addSchedule(ctx); // Используем ту же функцию выбора дня
            } else if (text === 'Поговорить со мной') {
                ctx.session.state = 'dialog';
                ctx.reply('Напиши мне свой вопрос:');
            }
    }
});

function capitalizeDay(day) {
    const days = {
        monday: 'Понедельник',
        tuesday: 'Вторник',
        wednesday: 'Среда',
        thursday: 'Четверг',
        friday: 'Пятница',
        saturday: 'Суббота',
    };
    return days[day] || day;
}

function formatSchedule(subjects, day) {
    const formattedSubjects = subjects.map((subj, i) => `${i + 1}. ${subj}`).join('\n');
    return `<b>Расписание на ${capitalizeDay(day)}:</b>\n${formattedSubjects}`;
}

bot.startPolling();
console.log('Бот запущен!');
