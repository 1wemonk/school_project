require('dotenv').config();
const { Telegraf, session } = require('telegraf');
const OpenAI = require('openai');
const { createClient } = require('@supabase/supabase-js');
const cron = require('node-cron');
const express = require('express');
const bodyParser = require('body-parser');

// Настройка Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Настройка бота
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
bot.use(session());

// const webhookUrl = 'https://school-project-rpni.vercel.app/api/index';
//
// async function ensureWebhookIsSet(bot, webhookUrl) {
//     try {
//         const response = await bot.telegram.getWebhookInfo(); // Получаем информацию о вебхуке
//         if (!response || !response.result || !response.result.url) {
//             console.log('Вебхук не установлен или информация отсутствует. Устанавливаем новый...');
//             await bot.telegram.setWebhook(webhookUrl);
//         } else if (response.result.url !== webhookUrl) {
//             console.log('Текущий вебхук не соответствует требуемому URL. Обновляем...');
//             await bot.telegram.setWebhook(webhookUrl);
//         } else {
//             console.log('Вебхук уже установлен:', response.result.url);
//         }
//     } catch (error) {
//         console.error('Ошибка при проверке вебхука:', error);
//         // Если произошла ошибка, попробуйте установить вебхук заново
//         try {
//             console.log('Попытка установки нового вебхука...');
//             await bot.telegram.setWebhook(webhookUrl);
//         } catch (setWebhookError) {
//             console.error('Ошибка при установке вебхука:', setWebhookError);
//         }
//     }
// }
//
// if (webhookUrl) {
//     bot.telegram.webhookReply = true; // Важно для Vercel
//     ensureWebhookIsSet(bot, webhookUrl);
// } else {
//     console.error('WEBHOOK_URL is not set in environment variables.');
// }

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

async function loadSchedule(chatId, ctx) {
    const { data, error } = await supabase.from('schedule').select('day, subjects').eq('chat_id', chatId);
    if (error) {
        console.error('Ошибка при загрузке расписания:', error);
        ctx.reply('Произошла ошибка при загрузке расписания. Пожалуйста, обратитесь в тех. поддержку: @xrazycoolin');
        return {};
    }
    console.log('Загруженное расписание:', data);
    return data.reduce((acc, row) => ({ ...acc, [row.day]: JSON.parse(row.subjects) }), {});
}

async function saveSchedule(chatId, day, subjects, ctx) {
    const { error } = await supabase.from('schedule').upsert({
        chat_id: chatId,
        day: day,
        subjects: JSON.stringify(subjects),
    }, { onConflict: 'chat_id,day' });
    if (error) {
        console.error('Ошибка при сохранении расписания:', error);
        ctx.reply('Произошла ошибка при сохранении расписания. Пожалуйста, обратитесь в тех. поддержку: @xrazycoolin');
        return false;
    }
    console.log('Расписание успешно сохранено:', { chatId, day, subjects });
    return true;
}

async function loadNotes(chatId) {
    const { data, error } = await supabase.from('notes').select('*').eq('chat_id', chatId);
    if (error) {
        console.error('Ошибка при загрузке заметок:', error);
        return [];
    }
    console.log('Загруженные заметки:', data);
    return data;
}

async function saveNote(chatId, text) {
    const { error } = await supabase.from('notes').insert({
        chat_id: chatId,
        text: text,
    });
    if (error) {
        console.error('Ошибка при сохранении заметки:', error);
        return false;
    }
    console.log('Заметка успешно сохранена:', { chatId, text });
    return true;
}

async function deleteNote(noteId) {
    const { error } = await supabase.from('notes').delete().eq('id', noteId);
    if (error) {
        console.error('Ошибка при удалении заметки:', error);
        return false;
    }
    console.log('Заметка успешно удалена:', { noteId });
    return true;
}

async function logAction(chatId, action) {
    const { error } = await supabase.from('actions').insert({
        chat_id: chatId,
        action: action,
        timestamp: new Date().toISOString(),
    });
    if (error) {
        console.error('Ошибка при логировании действия:', error);
        return false;
    }
    console.log('Действие успешно залогировано:', { chatId, action });
    return true;
}

bot.command('start', async (ctx) => {
    ensureSession(ctx);
    ctx.session.state = 'menu';
    ctx.session.schedule = (await loadSchedule(ctx.chat.id, ctx)) || {};
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

bot.command('edit_schedule', async (ctx) => {
    ensureSession(ctx);
    ctx.session.state = 'edit_schedule';
    await editSchedule(ctx);
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
    await showMenu(ctx); // Возвращаемся в меню
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
    ctx.session.state = 'menu';
    await showMenu(ctx); // Возвращаемся в меню
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

async function editSchedule(ctx) {
    ensureSession(ctx);
    const keyboard = [
        ['Понедельник', 'Вторник'],
        ['Среда', 'Четверг'],
        ['Пятница', 'Суббота'],
    ];
    ctx.reply('Выбери день, который ты хочешь изменить:', {
        reply_markup: { keyboard, resize_keyboard: true },
    });
    ctx.session.state = 'edit_day';
}

bot.on('text', async (ctx) => {
    ensureSession(ctx);
    const text = ctx.message.text;
    const state = ctx.session.state || 'menu';
    const schedule = ctx.session.schedule || {};
    console.log('Текущее состояние:', state);
    console.log('Текущее расписание:', schedule);

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
            const selectedDayOne = dayMapping[text];
            if (selectedDayOne) {
                ctx.session.selected_day = selectedDayOne;
                ctx.session.state = 'add_subjects';
                ctx.reply(`Напиши расписание на ${text} через запятую:`);
            } else {
                ctx.reply('Выберите день из предложенных вариантов.');
            }
            break;
        case 'add_subjects':
            const subjects = text.split(',').map((s) => s.trim());
            const dayAddSubject = ctx.session.selected_day;
            schedule[dayAddSubject] = subjects;
            ctx.session.schedule = schedule;
            const saved = await saveSchedule(ctx.chat.id, dayAddSubject, subjects, ctx);
            if (saved) {
                ctx.reply(`Расписание на ${capitalizeDay(dayAddSubject)} успешно сохранено!`);
                ctx.reply('Возвращаюсь в меню ...').then((sentMessage) => {
                    setTimeout(() => {
                        ctx.deleteMessage(sentMessage.message_id);
                        showMenu(ctx);
                    }, 1500);
                });
            } else {
                ctx.reply('Ошибка при сохранении расписания. Пожалуйста, обратитесь в тех. поддержку: @xrazycoolin');
                ctx.reply('Возвращаюсь в меню ...').then((sentMessage) => {
                    setTimeout(() => {
                        ctx.deleteMessage(sentMessage.message_id);
                        showMenu(ctx);
                    }, 1500);
                });
            }
            break;
        case 'view_day':
            const viewDay = dayMapping[text];
            if (viewDay) {
                // Перезагружаем расписание из базы перед отображением
                const latestSchedule = await loadSchedule(ctx.chat.id, ctx);
                const subjects = latestSchedule[viewDay] || [];
                if (subjects.length > 0) {
                    const formatted = formatSchedule(subjects, viewDay);
                    ctx.replyWithHTML(formatted);
                    ctx.reply('Возвращаюсь в меню ...').then((sentMessage) => {
                        setTimeout(() => {
                            ctx.deleteMessage(sentMessage.message_id);
                            showMenu(ctx);
                        }, 1500);
                    });
                } else {
                    ctx.reply(`Расписание на ${capitalizeDay(viewDay)} еще не добавлено.`);
                }
            } else {
                ctx.reply('Выберите день из предложенных вариантов.');
            }
            break;
        case 'edit_day':
            const editDay = dayMapping[text];
            if (editDay) {
                ctx.session.selected_day = editDay;
                ctx.session.state = 'edit_subjects';
                const latestSchedule = await loadSchedule(ctx.chat.id, ctx);
                const subjects = latestSchedule[editDay] || [];
                const formatted = formatSchedule(subjects, editDay);
                ctx.replyWithHTML(formatted);
                setTimeout(
                    () =>
                        ctx.reply(
                            `Введите номер предмета и новое название предмета через запятую (например, 1, Физика):`,
                        ),
                    1000,
                );
            } else {
                ctx.reply('Выберите день из предложенных вариантов.');
            }
            break;
        case 'edit_subjects':
            const [subjectIndexStr, newSubjectName] = text.split(',').map((s) => s.trim());
            const subjectIndex = parseInt(subjectIndexStr, 10) - 1;
            const selectedDay = ctx.session.selected_day; // Переименовано для избежания конфликта
            if (selectedDay && !isNaN(subjectIndex) && newSubjectName) {
                if (schedule[selectedDay] && schedule[selectedDay][subjectIndex]) {
                    schedule[selectedDay][subjectIndex] = newSubjectName;
                    ctx.session.schedule = schedule;
                    const saved = await saveSchedule(ctx.chat.id, selectedDay, schedule[selectedDay], ctx);
                    if (saved) {
                        ctx.reply(
                            `Предмет на ${capitalizeDay(selectedDay)}, №${
                                subjectIndex + 1
                            } изменен на "${newSubjectName}".`,
                        );
                        ctx.reply('Возвращаюсь в меню ...').then((sentMessage) => {
                            setTimeout(() => {
                                ctx.deleteMessage(sentMessage.message_id);
                                showMenu(ctx);
                            }, 1500);
                        });
                    } else {
                        ctx.reply(
                            'Ошибка при сохранении изменений. Пожалуйста, обратитесь в тех. поддержку: @xrazycoolin',
                        );
                        ctx.reply('Возвращаюсь в меню ...').then((sentMessage) => {
                            setTimeout(() => {
                                ctx.deleteMessage(sentMessage.message_id);
                                showMenu(ctx);
                            }, 1500);
                        });
                    }
                } else {
                    ctx.reply('Предмета с таким индексом нет.');
                }
            } else {
                ctx.reply('Неверный формат. Введите номер предмета и новое название предмета через запятую.');
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
                const saved = await saveSchedule(ctx.chat.id, dayAdd, schedule[dayAdd], ctx);
                if (saved) {
                    ctx.reply(`Предмет "${subjectName}" добавлен на ${capitalizeDay(dayAdd)}.`);
                    ctx.reply('Возвращаюсь в меню ...').then((sentMessage) => {
                        setTimeout(() => {
                            ctx.deleteMessage(sentMessage.message_id);
                            showMenu(ctx);
                        }, 1500);
                    });
                } else {
                    ctx.reply('Ошибка при добавлении предмета. Пожалуйста, обратитесь в тех. поддержку: @xrazycoolin');
                    ctx.reply('Возвращаюсь в меню ...').then((sentMessage) => {
                        setTimeout(() => {
                            ctx.deleteMessage(sentMessage.message_id);
                            showMenu(ctx);
                        }, 1500);
                    });
                }
            } else {
                ctx.reply('Неверный формат. Введите день недели и название предмета через запятую.');
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
                    const saved = await saveSchedule(ctx.chat.id, deleteDay, schedule[deleteDay], ctx);
                    if (saved) {
                        ctx.reply(`Предмет на ${capitalizeDay(deleteDay)}, №${deleteSubjectIndex + 1} удален.`);
                        ctx.reply('Возвращаюсь в меню ...').then((sentMessage) => {
                            setTimeout(() => {
                                ctx.deleteMessage(sentMessage.message_id);
                                showMenu(ctx);
                            }, 1500);
                        });
                    } else {
                        ctx.reply(
                            'Ошибка при удалении предмета. Пожалуйста, обратитесь в тех. поддержку: @xrazycoolin',
                        );
                        ctx.reply('Возвращаюсь в меню ...').then((sentMessage) => {
                            setTimeout(() => {
                                ctx.deleteMessage(sentMessage.message_id);
                                showMenu(ctx);
                            }, 1500);
                        });
                    }
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
            ctx.reply('Возвращаюсь в меню ...').then((sentMessage) => {
                setTimeout(() => {
                    ctx.deleteMessage(sentMessage.message_id);
                    showMenu(ctx);
                }, 1500);
            });
            break;
        case 'delete_note':
            const noteIndex = parseInt(text, 10) - 1;
            const notes = await loadNotes(ctx.chat.id);
            if (notes[noteIndex]) {
                await deleteNote(notes[noteIndex].id);
                ctx.reply('Заметка удалена.');
                ctx.reply('Возвращаюсь в меню ...').then((sentMessage) => {
                    setTimeout(() => {
                        ctx.deleteMessage(sentMessage.message_id);
                        showMenu(ctx);
                    }, 1500);
                });
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
                ctx.reply('Возвращаюсь в меню ...').then((sentMessage) => {
                    setTimeout(() => {
                        ctx.deleteMessage(sentMessage.message_id);
                        showMenu(ctx);
                    }, 1500);
                });
            } catch (error) {
                console.error('Ошибка при генерации домашнего задания:', error);
                ctx.reply(
                    'Ошибка при генерации домашнего задания. Пожалуйста, обратитесь в тех. поддержку: @xrazycoolin',
                );
                ctx.reply('Возвращаюсь в меню ...').then((sentMessage) => {
                    setTimeout(() => {
                        ctx.deleteMessage(sentMessage.message_id);
                        showMenu(ctx);
                    }, 1500);
                });
            }
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
                ctx.reply('Ошибка при объяснении концепции. Пожалуйста, обратитесь в тех. поддержку: @xrazycoolin');
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
                ctx.reply('Возвращаюсь в меню ...').then((sentMessage) => {
                    setTimeout(() => {
                        ctx.deleteMessage(sentMessage.message_id);
                        showMenu(ctx);
                    }, 1500);
                });
            } catch (error) {
                console.error('Ошибка при поиске статьи:', error);
                ctx.reply('Ошибка при поиске статьи. Пожалуйста, обратитесь в тех. поддержку: @xrazycoolin');
                ctx.reply('Возвращаюсь в меню ...').then((sentMessage) => {
                    setTimeout(() => {
                        ctx.deleteMessage(sentMessage.message_id);
                        showMenu(ctx);
                    }, 1500);
                });
            }
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
                ctx.reply('Ошибка при поиске видеоурока. Пожалуйста, обратитесь в тех. поддержку: @xrazycoolin');
                ctx.reply('Возвращаюсь в меню ...').then((sentMessage) => {
                    setTimeout(() => {
                        ctx.deleteMessage(sentMessage.message_id);
                        showMenu(ctx);
                    }, 1500);
                });
            }
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
                ctx.reply('Ошибка при обработке запроса. Пожалуйста, обратитесь в тех. поддержку: @xrazycoolin');
                ctx.reply('Возвращаюсь в меню ...').then((sentMessage) => {
                    setTimeout(() => {
                        ctx.deleteMessage(sentMessage.message_id);
                        showMenu(ctx);
                    }, 1500);
                });
            }
            break;
        default:
            if (text === 'Добавить расписание') {
                ctx.session.state = 'add_schedule';
                await addSchedule(ctx);
            } else if (text === 'Посмотреть расписание') {
                await viewSchedule(ctx);
            } else if (text === 'Изменить расписание') {
                ctx.session.state = 'edit_schedule';
                await editSchedule(ctx);
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
    const { data, error } = await supabase.from('schedule').select('*');
    if (error) {
        console.error('Ошибка при загрузке расписания для напоминаний:', error);
        return;
    }
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
    const { data, error } = await supabase.from('actions').select('*').eq('chat_id', ctx.chat.id);
    if (error) {
        console.error('Ошибка при загрузке статистики:', error);
        ctx.reply('Произошла ошибка при загрузке статистики.');
        return;
    }
    if (data.length) {
        const stats = data.reduce((acc, action) => {
            acc[action.action] = (acc[action.action] || 0) + 1;
            return acc;
        }, {});
        const statsMessage = Object.entries(stats)
            .map(([action, count]) => `${action}: ${count}`)
            .join('\n');
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

// Настройка Express
const app = express();
app.use(bodyParser.json());

// Обработчик вебхуков
app.post('/api/index', async (req, res) => {
    try {
        await bot.handleUpdate(req.body); // Обрабатываем запрос
        res.sendStatus(200); // Отправляем успешный ответ Telegram
    } catch (error) {
        console.error('Ошибка обработки запроса:', error);
        res.sendStatus(500); // Отправляем ошибку
    }
});

// Запускаем сервер
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});

// Запуск бота
bot.launch().then(() => {
    console.log('Бот инициализирован!');
}).catch((error) => {
    console.error('Ошибка инициализации бота:', error);
});