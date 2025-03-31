import { useState, useEffect } from 'react';
import { Button, ButtonGroup, Text, useBotContext, useCommand, useText, useVoice } from '@urban-bot/core';
import OpenAI from 'openai';
import fs, { createReadStream, existsSync } from 'fs';
import 'whatwg-fetch';
import { ogg } from './src/ogg';
import { removeFile } from './src/utils';
import { loadSchedule, saveSchedule } from './db';

export default function Bot(props) {
    const { chat } = useBotContext();
    const [state, setState] = useState('start');
    const [text, setText] = useState('');
    const [response, setResponse] = useState('');
    const [loading, setLoading] = useState(false);
    const [messages, setMessages] = useState([]); // Хранение истории сообщений
    const [day, setDay] = useState('');
    // Инициализация расписания из базы данных
    // const [schedule, setSchedule] = useState({
    //     monday: [],
    //     tuesday: [],
    //     wednesday: [],
    //     thursday: [],
    //     friday: [],
    //     saturday: [],
    // });

    const [schedule, setSchedule] = useState({});

    // Загрузка расписания при старте
    useEffect(() => {
        const fetchSchedule = async () => {
            try {
                const data = await loadSchedule(chat.id);
                setSchedule(data);
            } catch (err) {
                console.error(err);
            }
        };
        fetchSchedule();
    }, [chat.id]);

    // Сохранение расписания
    const handleScheduleSave = async (day, subjects) => {
        try {
            await saveSchedule(chat.id, day, subjects);
            setSchedule(prev => ({ ...prev, [day]: subjects }));
        } catch (err) {
            console.error(err);
        }
    };


    useCommand(({ command }) => {
        if (command === '/start') {
            setState('start');
            setText(
                `👋 Привет, ${chat.firstName}! Я твой виртуальный помощник по обучению. Готов помочь тебе с любыми вопросами, связанными со школой! 📚`,
            );
            setResponse(''); // Очищаем предыдущий ответ
            setMessages([]); // Очищаем историю при запуске
            setState('menu');
        }
        if (command === '/addschedule') {
            setState('addSchedule');
            setText('Отлично! Давай добавим твое расписание\nНажми на кнопку чтобы выбрать учебный день.');
        }
        if (command === '/viewschedule') {
            setState('viewSchedule');
            setText('Выбери день недели, чтобы просмотреть расписание:');
        }
        if (command === '/editschedule') {
            setState('editSchedule');
            setText('Выбери день недели, чтобы изменить расписание:');
        }

        if (command === '/menu') {
            setState('menu');
        }
    });

    function formatForTelegram(text) {
        return text
            .replace(/###/g, '▎ ')
            .replace(/```([\s\S]*?)```/g, '<pre>$1</pre>')
            .replace(/`(.+?)`/g, '<code>$1</code>')
            .replace(/_(.+?)_/g, '<i>$1</i>')
            .replace(/~(.+?)~/g, '<s>$1</s>')
            .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
            .replace(/(^|\n)(\d+)\. /g, '$1<strong>$2.</strong> ')
            .replace(/(^|\n)(- )/g, '$1• ')
            .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');
    }

    useText(async ({ text }) => {
        if (!text.trim() || loading) return;

        if (
            state !== 'monday' &&
            state !== 'tuesday' &&
            state !== 'wednesday' &&
            state !== 'thursday' &&
            state !== 'friday' &&
            state !== 'saturday' &&
            state !== 'editShedDay'
        ) {
            setState('dialog');
            setLoading(true);
            setMessages((prevMessages) => [...prevMessages, { role: 'user', content: text }]);
            console.log(`пользователь ${chat.firstName} отправил сообщение ${text}`);
            try {
                const openai = new OpenAI({
                    apiKey: process.env.OPENAI_API_KEY,
                });
                const filteredMessages = [...messages, { role: 'user', content: text }];
                const completion = await openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: filteredMessages,
                });
                const aiResponse = completion.choices[0].message.content;
                setMessages((prevMessages) => [...prevMessages, { role: 'assistant', content: aiResponse }]);
                setResponse(formatForTelegram(aiResponse));
            } catch (error) {
                console.error('Ошибка при запросе к OpenAI:', error);
                setResponse(`❌ К сожалению, в данный момент бот временно не работает.`);
            } finally {
                setLoading(false);
            }
        } else {
            if (state === 'editShedDay') {
                setState('');
                const subjects = scheduleMaker(text);
                setSchedule((prevSchedule) => ({
                    ...prevSchedule,
                    [day]: subjects,
                }));
                setText(`Отлично! Расписание для ${capitalizeFirstLetter(day)} изменено`);
                saveSchedule(day, subjects);
                setState('menu');
            } else {
                setState('');
                const subjects = scheduleMaker(text);
                const formattedSchedule = formatSchedule(subjects, day);
                setSchedule((prevSchedule) => ({
                    ...prevSchedule,
                    [day]: subjects,
                }));
                saveSchedule(day, subjects); // Сохраняем расписание в базу данных
                setText(formattedSchedule);
                setState('menu'); // Переходим в меню после ввода расписания
            }
        }
    });

    // console.log(schedule, 'shed');

    async function Chat(messages) {
        try {
            setText(`Отправляю сообщения в OpenAI: ${messages}`);
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
            const completion = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: messages,
            });
            return completion.choices[0].message.content;
        } catch (error) {
            setText(`Ошибка при запросе к OpenAI: ${error}`);
            return '❌ Ошибка при получении ответа.';
        }
    }

    const scheduleMaker = (text) => {
        const subjects = text.split(',').map((subject) => subject.trim());
        return subjects;
    };

    const formatSchedule = (subjects, day) => {
        const formattedSubjects = subjects.map((subject, index) => `${index + 1}. ${subject}`).join('\n');
        return `Расписание на ${capitalizeFirstLetter(day)}:\n${formattedSubjects}`;
    };

    const capitalizeFirstLetter = (day) => {
        const days = {
            monday: 'Понедельник',
            tuesday: 'Вторник',
            wednesday: 'Среда',
            thursday: 'Четверг',
            friday: 'Пятница',
            saturday: 'Суббота',
        };
        return days[day]?.charAt(0).toUpperCase() + days[day].slice(1) || day;
    };

    const viewSchedule = async (day) => {
        try {
            const subjects = schedule[day];
            if (!subjects || subjects.length === 0) {
                setState('noShed');
                setText(`Расписание на ${capitalizeFirstLetter(day)} ещё не добавлено.`);
            } else {
                setText(formatSchedule(subjects, day));
                setState('viewShedDay');
            }
        } catch (err) {
            console.error(err);
        }
    };

    const editSchedule = async (day) => {
        try {
            const subjects = schedule[day];
            if (!subjects || subjects.length === 0 || subjects === {}) {
                setState('noShed');
                setText(`Расписание на ${capitalizeFirstLetter(day)} ещё не добавлено.`);
            } else {
                setText(`Напиши новое расписание для ${capitalizeFirstLetter(day)}`);
                setState('editShedDay');
            }
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <>
            {/* <Text>{state}</Text> */}
            {state === 'start' && <Text>{text}</Text>}
            {state === 'dialog' && !loading && response && (
                <Text simulateTyping={1000} parseMode={'HTML'}>
                    {response}
                </Text>
            )}
            {state === 'voice' && <Text simulateTyping={1000}>{response}</Text>}
            {state === 'voice' && <Text>{text}</Text>}
            {state === 'addSchedule' && (
                <>
                    <ButtonGroup
                        maxColumns={2}
                        title={'Отлично! Давай добавим твое расписание\nНажми на кнопку чтобы выбрать учебный день.'}
                    >
                        <Button
                            onClick={() => {
                                setState('monday');
                                setDay('monday');
                                setText(
                                    'Хорошо, теперь напиши мне свое расписание на Понедельник в формате (Математика, География, История...)',
                                );
                            }}
                        >
                            Понедельник
                        </Button>
                        <Button
                            onClick={() => {
                                setState('tuesday');
                                setDay('tuesday');
                                setText(
                                    'Хорошо, теперь напиши мне свое расписание на Вторник в формате (Математика, География, История...)',
                                );
                            }}
                        >
                            Вторник
                        </Button>
                        <Button
                            onClick={() => {
                                setState('wednesday');
                                setDay('wednesday');
                                setText(
                                    'Хорошо, теперь напиши мне свое расписание на Среду в формате (Математика, География, История...)',
                                );
                            }}
                        >
                            Среда
                        </Button>
                        <Button
                            onClick={() => {
                                setState('thursday');
                                setDay('thursday');
                                setText(
                                    'Хорошо, теперь напиши мне свое расписание на Четверг в формате (Математика, География, История...)',
                                );
                            }}
                        >
                            Четверг
                        </Button>
                        <Button
                            onClick={() => {
                                setState('friday');
                                setDay('friday');
                                setText(
                                    'Хорошо, теперь напиши мне свое расписание на Пятницу в формате (Математика, География, История...)',
                                );
                            }}
                        >
                            Пятница
                        </Button>
                        <Button
                            onClick={() => {
                                setState('saturday');
                                setDay('saturday');
                                setText(
                                    'Хорошо, теперь напиши мне свое расписание на Субботу в формате (Математика, География, История...)',
                                );
                            }}
                        >
                            Суббота
                        </Button>
                    </ButtonGroup>
                </>
            )}
            {state === 'noShed' && <Text>{text}</Text>}
            {state === 'monday' && (
                <Text>
                    Хорошо, теперь напиши мне свое расписание на Понедельник в формате (Предмет 1, Предмет 2, Предмет
                    3...)
                </Text>
            )}
            {state === 'tuesday' && (
                <Text>
                    Хорошо, теперь напиши мне свое расписание на Вторник в формате (Предмет 1, Предмет 2, Предмет 3...)
                </Text>
            )}
            {state === 'wednesday' && (
                <Text>
                    Хорошо, теперь напиши мне свое расписание на Среду в формате (Предмет 1, Предмет 2, Предмет 3...)
                </Text>
            )}
            {state === 'thursday' && (
                <Text>
                    Хорошо, теперь напиши мне свое расписание на Четверг в формате (Предмет 1, Предмет 2, Предмет 3...)
                </Text>
            )}
            {state === 'friday' && (
                <Text>
                    Хорошо, теперь напиши мне свое расписание на Пятницу в формате (Предмет 1, Предмет 2, Предмет 3...)
                </Text>
            )}
            {state === 'saturday' && (
                <Text>
                    Хорошо, теперь напиши мне свое расписание на Субботу в формате (Предмет 1, Предмет 2, Предмет 3...)
                </Text>
            )}
            {state === 'menu' && (
                <ButtonGroup maxColumns={2} title={'Выбери, что ты хочешь сделать\n'}>
                    <Button
                        onClick={() => {
                            setState('addSchedule');
                        }}
                    >
                        Добавить расписание
                    </Button>
                    <Button
                        onClick={() => {
                            setState('viewSchedule');
                        }}
                    >
                        Посмотреть расписание
                    </Button>
                    <Button
                        onClick={() => {
                            setState('editSchedule');
                        }}
                    >
                        Изменить расписание
                    </Button>
                    <Button
                        onClick={() => {
                            setState('dialog');
                        }}
                    >
                        Поговорить со мной
                    </Button>
                </ButtonGroup>
            )}
            {state === 'viewSchedule' && (
                <>
                    <ButtonGroup maxColumns={2} title={'Выбери день недели, чтобы просмотреть расписание\n'}>
                        <Button
                            onClick={() => {
                                setState('');
                                viewSchedule('monday');
                                setDay('monday');
                            }}
                        >
                            Понедельник
                        </Button>
                        <Button
                            onClick={() => {
                                setState('');
                                viewSchedule('tuesday');
                                setDay('tuesday');
                            }}
                        >
                            Вторник
                        </Button>
                        <Button
                            onClick={() => {
                                setState('');
                                viewSchedule('wednesday');
                                setDay('wednesday');
                            }}
                        >
                            Среда
                        </Button>
                        <Button
                            onClick={() => {
                                setState('');
                                viewSchedule('thursday');
                                setDay('thursday');
                            }}
                        >
                            Четверг
                        </Button>
                        <Button
                            onClick={() => {
                                setState('');
                                viewSchedule('friday');
                                setDay('friday');
                            }}
                        >
                            Пятница
                        </Button>
                        <Button
                            onClick={() => {
                                setState('');
                                viewSchedule('saturday');
                                setDay('saturday');
                            }}
                        >
                            Суббота
                        </Button>
                    </ButtonGroup>
                </>
            )}
            {state === 'editSchedule' && (
                <>
                    <ButtonGroup maxColumns={2} title={'Выбери день недели, чтобы изменить расписание\n'}>
                        <Button
                            onClick={() => {
                                setState('');
                                editSchedule('monday');
                                setDay('monday');
                            }}
                        >
                            Понедельник
                        </Button>
                        <Button
                            onClick={() => {
                                setState('');
                                editSchedule('tuesday');
                                setDay('tuesday');
                            }}
                        >
                            Вторник
                        </Button>
                        <Button
                            onClick={() => {
                                setState('');
                                editSchedule('wednesday');
                                setDay('wednesday');
                            }}
                        >
                            Среда
                        </Button>
                        <Button
                            onClick={() => {
                                setState('');
                                editSchedule('thursday');
                                setDay('thursday');
                            }}
                        >
                            Четверг
                        </Button>
                        <Button
                            onClick={() => {
                                setState('');
                                editSchedule('friday');
                                setDay('friday');
                            }}
                        >
                            Пятница
                        </Button>
                        <Button
                            onClick={() => {
                                setState('');
                                editSchedule('saturday');
                                setDay('saturday');
                            }}
                        >
                            Суббота
                        </Button>
                    </ButtonGroup>
                </>
            )}
            {state === 'viewShedDay' && <Text>{text}</Text>}
            {state === 'editShedDay' && <Text>{text}</Text>}
        </>
    );
}

export function App(props) {
    return (
        <>
            <Bot {...props} />
        </>
    );
}
