require('dotenv').config();
const { Telegraf, session } = require('telegraf');
const OpenAI = require('openai');
const { createClient } = require('@supabase/supabase-js');
const cron = require('node-cron');

// Настройка Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Настройка бота
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
bot.use(session());

function ensureSession(ctx) {
    if (!ctx.session) {
        ctx.session = { state: 'menu', schedule: {}, selected_day: null };
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

async function loadNotes(chatId) {
    const { data } = await supabase.from('notes').select('*').eq('chat_id', chatId);
    return data;
}

async function saveNote(chatId, text) {
    await supabase.from('notes').insert({
        chat_id: chatId,
        text: text,
    });
}

async function deleteNote(noteId) {
    await supabase.from('notes').delete().eq('id', noteId);
}

async function logAction(chatId, action) {
    await supabase.from('actions').insert({
        chat_id: chatId,
        action: action,
        timestamp: new Date().toISOString(),
    });
}

bot.command('start', async (ctx) => {
    ensureSession(ctx);
    ctx.session.state = 'menu';
    ctx.session.schedule = (await loadSchedule(ctx.chat.id)) || {};
    ctx.replyWithHTML(
        `👋 Привет, ${ctx.chat.first_name}! Я твой виртуальный помощник по обучению. Готов помочь тебе с любыми вопросами, связанными со школой! 📚`,
    );
    await showMenu(ctx);
});

bot.command('menu', async (ctx) => {
    ensureSession(ctx);
    ctx.session.state = 'menu';
    await showMenu(ctx);
});

bot.command('viewschedule', async (ctx) => {
    ensureSession(ctx);
    await viewSchedule(ctx);
});

bot.command('addschedule', async (ctx) => {
    ensureSession(ctx);
    ctx.session.state = 'add_schedule';
    await addSchedule(ctx);
});

bot.command('addsubject', async (ctx) => {
    ensureSession(ctx);
    ctx.session.state = 'add_subject';
    ctx.reply('Введите день недели и название предмета через запятую (например, Понедельник, Математика):');
});

bot.command('editsubject', async (ctx) => {
    ensureSession(ctx);
    ctx.session.state = 'edit_subject';
    ctx.reply('Введите день недели, номер предмета и новое название предмета через запятую (например, Понедельник, 1, Физика):');
});

bot.command('deletesubject', async (ctx) => {
    ensureSession(ctx);
    ctx.session.state = 'delete_subject';
    ctx.reply('Введите день недели и номер предмета для удаления (например, Понедельник, 1):');
});

bot.command('addnote', async (ctx) => {
    ensureSession(ctx);
    ctx.session.state = 'add_note';
    ctx.reply('Введите текст заметки:');
});

bot.command('shownotes', async (ctx) => {
    ensureSession(ctx);
    await showNotes(ctx);
    ctx.session.state = 'menu';
});

bot.command('deletenote', async (ctx) => {
    ensureSession(ctx);
    ctx.session.state = 'delete_note';
    ctx.reply('Введите номер заметки для удаления:');
});

bot.command('homework', async (ctx) => {
    ensureSession(ctx);
    ctx.session.state = 'homework';
    ctx.reply('Введите предмет и тему домашнего задания:');
});

bot.command('explain', async (ctx) => {
    ensureSession(ctx);
    ctx.session.state = 'explain';
    ctx.reply('Введите тему или концепцию для объяснения:');
});

bot.command('findarticle', async (ctx) => {
    ensureSession(ctx);
    ctx.session.state = 'find_article';
    ctx.reply('Введите тему для поиска статьи:');
});

bot.command('findvideo', async (ctx) => {
    ensureSession(ctx);
    ctx.session.state = 'find_video';
    ctx.reply('Введите тему для поиска видеоурока:');
});

bot.command('stats', async (ctx) => {
    ensureSession(ctx);
    await showStats(ctx);
});

async function showMenu(ctx) {
    ensureSession(ctx);
    const keyboard = [
        ['Добавить расписание', 'Посмотреть расписание'],
        ['Изменить расписание', 'Поговорить со мной'],
        ['Добавить заметку', 'Показать заметки'],
        ['Найти статью', 'Найти видеоурок'],
        ['Статистика'],
    ];
    ctx.reply('Выбери, что ты хочешь сделать:', {
        reply_markup: { keyboard, resize_keyboard: true },
    });
}

async function viewSchedule(ctx) {
    ctx.session.state = 'view_schedule';
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

        case 'add_subject':
            const [dayTextAdd, subjectName] = text.split(',').map((s) => s.trim());
            const dayAdd = dayMapping[dayTextAdd];
            if (dayAdd && subjectName) {
                if (!schedule[dayAdd]) {
                    schedule[dayAdd] = [];
                }
                schedule[dayAdd].push(subjectName);
                ctx.session.schedule = schedule;
                await saveSchedule(ctx.chat.id, dayAdd, schedule[dayAdd]);
                ctx.reply(`Предмет "${subjectName}" добавлен на ${capitalizeDay(dayAdd)}.`);
            } else {
                ctx.reply('Неверный формат. Введите день недели и название предмета через запятую.');
            }
            ctx.session.state = 'menu';
            break;

        case 'edit_subject':
            const [editDayText, subjectIndexStr, newSubjectName] = text.split(',').map((s) => s.trim());
            const editDay = dayMapping[editDayText];
            const subjectIndex = parseInt(subjectIndexStr, 10) - 1;
            if (editDay && !isNaN(subjectIndex) && newSubjectName) {
                if (schedule[editDay] && schedule[editDay][subjectIndex]) {
                    schedule[editDay][subjectIndex] = newSubjectName;
                    ctx.session.schedule = schedule;
                    await saveSchedule(ctx.chat.id, editDay, schedule[editDay]);
                    ctx.reply(`Предмет на ${capitalizeDay(editDay)}, №${subjectIndex + 1} изменен на "${newSubjectName}".`);
                } else {
                    ctx.reply('Предмета с таким индексом нет.');
                }
            } else {
                ctx.reply('Неверный формат. Введите день недели, номер предмета и новое название предмета через запятую.');
            }
            ctx.session.state = 'menu';
            break;

        case 'delete_subject':
            const [deleteDayText, deleteSubjectIndexStr] = text.split(',').map((s) => s.trim());
            const deleteDay = dayMapping[deleteDayText];
            const deleteSubjectIndex = parseInt(deleteSubjectIndexStr, 10) - 1;
            if (deleteDay && !isNaN(deleteSubjectIndex)) {
                if (schedule[deleteDay] && schedule[deleteDay][deleteSubjectIndex]) {
                    schedule[deleteDay].splice(deleteSubjectIndex, 1);
                    ctx.session.schedule = schedule;
                    await saveSchedule(ctx.chat.id, deleteDay, schedule[deleteDay]);
                    ctx.reply(`Предмет на ${capitalizeDay(deleteDay)}, №${deleteSubjectIndex + 1} удален.`);
                } else {
                    ctx.reply('Предмета с таким индексом нет.');
                }
            } else {
                ctx.reply('Неверный формат. Введите день недели и номер предмета для удаления через запятую.');
            }
            ctx.session.state = 'menu';
            break;

        case 'add_note':
            await saveNote(ctx.chat.id, text);
            ctx.reply('Заметка добавлена.');
            ctx.session.state = 'menu';
            break;

        case 'delete_note':
            const noteIndex = parseInt(text, 10) - 1;
            const notes = await loadNotes(ctx.chat.id);
            if (notes[noteIndex]) {
                await deleteNote(notes[noteIndex].id);
                ctx.reply('Заметка удалена.');
            } else {
                ctx.reply('Нет заметки с таким номером.');
            }
            ctx.session.state = 'menu';
            break;

        case 'homework':
            try {
                const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
                const response = await openai.chat.completions.create({
                    model: 'gpt-4',
                    messages: [{ role: 'user', content: `Сгенерируй домашнее задание по ${text}` }],
                });
                ctx.replyWithHTML(formatForTelegram(response.choices[0].message.content));
            } catch (error) {
                console.error('Ошибка при генерации домашнего задания:', error);
                ctx.reply('Ошибка при генерации домашнего задания.');
            }
            ctx.session.state = 'menu';
            break;

        case 'explain':
            try {
                const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
                const response = await openai.chat.completions.create({
                    model: 'gpt-4',
                    messages: [{ role: 'user', content: `Объясни ${text}` }],
                });
                ctx.replyWithHTML(formatForTelegram(response.choices[0].message.content));
            } catch (error) {
                console.error('Ошибка при объяснении концепции:', error);
                ctx.reply('Ошибка при объяснении концепции.');
            }
            ctx.session.state = 'menu';
            break;

        case 'find_article':
            try {
                const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
                const response = await openai.chat.completions.create({
                    model: 'gpt-4',
                    messages: [{ role: 'user', content: `Найди статью по теме ${text}` }],
                });
                ctx.replyWithHTML(formatForTelegram(response.choices[0].message.content));
            } catch (error) {
                console.error('Ошибка при поиске статьи:', error);
                ctx.reply('Ошибка при поиске статьи.');
            }
            ctx.session.state = 'menu';
            break;

        case 'find_video':
            try {
                const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
                const response = await openai.chat.completions.create({
                    model: 'gpt-4',
                    messages: [{ role: 'user', content: `Найди видеоурок по теме ${text}` }],
                });
                ctx.replyWithHTML(formatForTelegram(response.choices[0].message.content));
            } catch (error) {
                console.error('Ошибка при поиске видеоурока:', error);
                ctx.reply('Ошибка при поиске видеоурока.');
            }
            ctx.session.state = 'menu';
            break;

        case 'dialog':
            try {
                const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
                const response = await openai.chat.completions.create({
                    model: 'gpt-4',
                    messages: [{ role: 'user', content: text }],
                });
                ctx.replyWithHTML(formatForTelegram(response.choices[0].message.content));
            } catch (error) {
                console.error('Ошибка при обработке запроса:', error);
                ctx.reply('Ошибка при обработке запроса.');
            }
            ctx.session.state = 'menu';
            break;

        default:
            if (text === 'Добавить расписание') {
                ctx.session.state = 'add_schedule';
                await addSchedule(ctx);
            } else if (text === 'Посмотреть расписание') {
                await viewSchedule(ctx);
            } else if (text === 'Изменить расписание') {
                ctx.session.state = 'edit_schedule';
                await addSchedule(ctx); // Используем ту же функцию выбора дня
            } else if (text === 'Поговорить со мной') {
                ctx.session.state = 'dialog';
                ctx.reply('Напиши мне свой вопрос:');
            } else if (text === 'Добавить заметку') {
                ctx.session.state = 'add_note';
                ctx.reply('Введите текст заметки:');
            } else if (text === 'Показать заметки') {
                await showNotes(ctx);
            } else if (text === 'Найти статью') {
                ctx.session.state = 'find_article';
                ctx.reply('Введите тему для поиска статьи:');
            } else if (text === 'Найти видеоурок') {
                ctx.session.state = 'find_video';
                ctx.reply('Введите тему для поиска видеоурока:');
            } else if (text === 'Статистика') {
                await showStats(ctx);
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

// Уведомления о занятиях
async function sendReminders() {
    const { data } = await supabase.from('schedule').select('*');
    data.forEach(async (item) => {
        const chatId = item.chat_id;
        const schedule = JSON.parse(item.subjects);
        const now = new Date();
        const dayOfWeek = now.getDay(); // 0 - воскресенье, 1 - понедельник, ...

        const dayMapping = {
            1: 'monday',
            2: 'tuesday',
            3: 'wednesday',
            4: 'thursday',
            5: 'friday',
            6: 'saturday',
        };

        const day = dayMapping[dayOfWeek];
        if (day && schedule[day]) {
            const subjects = schedule[day];
            const message = `Занятия на ${capitalizeDay(day)}:\n${formatSchedule(subjects, day)}`;
            bot.telegram.sendMessage(chatId, message);
        }
    });
}

// Запуск задачи каждые 5 минут
cron.schedule('*/5 * * * *', sendReminders);

// Команда для показа заметок
async function showNotes(ctx) {
    const notes = await loadNotes(ctx.chat.id);
    if (notes.length) {
        const notesList = notes.map((note, i) => `${i + 1}. ${note.text}`).join('\n');
        ctx.reply(`Ваши заметки:\n${notesList}`);
    } else {
        ctx.reply('У вас нет заметок.');
    }
}

// Команда для показа статистики
async function showStats(ctx) {
    const { data } = await supabase.from('actions').select('*').eq('chat_id', ctx.chat.id);
    if (data.length) {
        const stats = data.reduce((acc, action) => {
            acc[action.action] = (acc[action.action] || 0) + 1;
            return acc;
        }, {});
        const statsMessage = Object.entries(stats).map(([action, count]) => `${action}: ${count}`).join('\n');
        ctx.replyWithHTML(`<b>Статистика использования:</b>\n${statsMessage}`);
    } else {
        ctx.reply('У вас нет записей в статистике.');
    }
}

// Логирование действий
bot.on('text', async (ctx) => {
    ensureSession(ctx);
    const text = ctx.message.text;
    const state = ctx.session.state || 'menu';

    await logAction(ctx.chat.id, `text: ${text}`);
});

// Запуск бота в режиме опроса
bot.startPolling().then(() => {
    console.log('Бот запущен!');
}).catch((err) => {
    console.error('Ошибка при запуске бота:', err);
});

// Обработка завершения процесса
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));