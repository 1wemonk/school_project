import { useState } from 'react';
import { Text, ButtonGroup, Button, useText, useAction } from '@urban-bot/core';

import 'whatwg-fetch';
import { putOrder } from './actions';

//const file = fs.readFileSync(logo);

const SUPPORT_IT = 'support@protectfeed.ru';
const SUPPORT_1C = 'support-1c@feedtech.su';
const SUPPORT_EFEED = 'support-marketplace@e-feed.ru';
const SUPPORT_SERVICE = 'support-service@e-feed.ru';
const SUPPORT_EVENTS = 'support-events@e-feed.ru';

const validateEmail = (email) => {
    return String(email)
        .toLowerCase()
        .match(
            /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
        );
};

function Help(props) {
    //const [trouble, setTrouble] = useState('Опишите вашу проблему');

    //const [state, setState] = useState('start');
    const [messages, setMessages] = useState({
        name: '',
        phone: '',
        trouble: '',
        email: '',
        subject: SUPPORT_IT,
        state: 'start',
    });

    //const mixpanel = useMixpanel();

    useAction((actionId) => {
        //console.log('user made some action', actionId);
        if (messages.name.length === 0)
            setMessages({ ...messages, name: actionId.from.firstName + ' ' + actionId.from.lastName });
        //if (mixpanel) mixpanel.track('User Action', { ...actionId.chat });
    });

    useText(({ text }) => {
        switch (messages.state) {
            case 'trouble':
                setMessages({
                    ...messages,
                    trouble: text,
                    state: messages.name.length === 0 ? 'name' : 'confirm name',
                });

                break;
            case 'name':
                setMessages({
                    ...messages,
                    name: text,
                    state: messages.phone.length === 0 ? 'phone' : 'confirm phone',
                });
                break;
            case 'phone':
                setMessages({
                    ...messages,
                    phone: text,
                    state: messages.email.length === 0 ? 'email' : 'confirm email',
                });
                break;
            case 'email':
            case 'email error':
            case 'email error again':
                if (validateEmail(text))
                    setMessages({
                        ...messages,
                        email: text,
                        state: 'confirm ticket',
                    });
                else {
                    setMessages({
                        ...messages,
                        state: ['email', 'email error again'].includes(messages.state)
                            ? 'email error'
                            : 'email error again',
                    });
                }
                break;
        }
    });

    function getOutputText() {
        switch (messages.state) {
            case 'start':
                return '';
            case 'trouble':
                return 'Пожалуйста, опишите вашу проблему или что нужно сделать';
            case 'name':
                return 'Введите имя и фамилию, к кому обратиться';
            case 'phone':
                return 'Укажите номер телефона, по которому с вами можно будет связаться';
            case 'email':
                return 'Укажите электронную почту для автоматических уведомлений, на нее будет направлена копия обращения';
            case 'email error':
            case 'email error again':
                return 'Извините, это не похоже на правильный e-mail, пожалуйста, введите еще раз';
            case 'yes':
                return 'Обращение успешно создано, на указанную электронную почту поступит информация по мере решения проблемы';
            case 'no':
                return 'Хорошо, если понадобится, обращайтесь';
            case 'confirm ticket':
                return `Проблема: ${messages.trouble}, имя: ${messages.name}, номер телефона: ${messages.phone}, эл. почта: ${messages.email}`;
            default:
                return '';
        }
    }

    function createTicket() {
        let now = new Date();
        const ticket = {
            subject: 'Обращение через TG бот от ' + messages.name + ' ' + now,
            message: messages.trouble,
            email: messages.email,
            phone: messages.phone,
            who: messages.name,
            to: messages.subject,
            consumer_key: props.CONSUMER_KEY,
            consumer_secret: props.CONSUMER_SECRET,
        };
        putOrder(ticket);
        setMessages({ ...messages, state: 'yes' });
    }

    function startTicket() {
        setMessages({ ...messages, state: 'subject' });
    }

    function setSubject(code) {
        setMessages({ ...messages, subject: code, state: 'trouble' });
    }

    console.log('App states', messages);
    //mixpanel.track('App States', state, messages);

    return (
        <>
            {!['start', 'subject', 'confirm name', 'confirm phone', 'confirm email'].includes(messages.state) && (
                <Text>{getOutputText()}</Text>
            )}

            {['start', 'yes', 'no'].includes(messages.state) && (
                <ButtonGroup title="Чтобы оставить обращение в службу технической поддержки, нажмите на кнопку ниже">
                    <Button onClick={startTicket}>Создать обращение</Button>
                </ButtonGroup>
            )}

            {messages.state === 'subject' && (
                <ButtonGroup title="Выберите предмет обращения" maxColumns={1}>
                    <Button
                        onClick={() => {
                            setSubject(SUPPORT_1C);
                        }}
                    >
                        1С БП, ЗУП, УНФ, ERP
                    </Button>
                    <Button
                        onClick={() => {
                            setSubject(SUPPORT_EVENTS);
                        }}
                    >
                        CRM, сайты и лендинги
                    </Button>
                    <Button
                        onClick={() => {
                            setSubject(SUPPORT_EFEED);
                        }}
                    >
                        e-Feed Маркетплейс
                    </Button>
                    <Button
                        onClick={() => {
                            setSubject(SUPPORT_EFEED);
                        }}
                    >
                        e-Feed Взвешивание
                    </Button>
                    <Button
                        onClick={() => {
                            setSubject(SUPPORT_SERVICE);
                        }}
                    >
                        e-Feed Сервис
                    </Button>
                    <Button
                        onClick={() => {
                            setSubject(SUPPORT_IT);
                        }}
                    >
                        Рабочие места или другое
                    </Button>
                </ButtonGroup>
            )}

            {messages.state === 'confirm name' && (
                <ButtonGroup title={messages.name + ', обращение зарегистрировать от вас или другого человека?'}>
                    <Button
                        onClick={() =>
                            setMessages({
                                ...messages,
                                state: messages.phone.length ? 'confirm phone' : 'phone',
                            })
                        }
                    >
                        Да, от меня
                    </Button>
                    <Button
                        onClick={() =>
                            setMessages({
                                ...messages,
                                state: 'name',
                            })
                        }
                    >
                        Нет, другое ФИО
                    </Button>
                </ButtonGroup>
            )}

            {messages.state === 'confirm phone' && (
                <ButtonGroup title={'Использовать этот номер телефона для связи ' + messages.phone + '?'}>
                    <Button
                        onClick={() =>
                            setMessages({
                                ...messages,
                                state: messages.phone.length ? 'confirm email' : 'email',
                            })
                        }
                    >
                        Да
                    </Button>
                    <Button
                        onClick={() =>
                            setMessages({
                                ...messages,
                                state: 'phone',
                            })
                        }
                    >
                        Нет, укажу другой
                    </Button>
                </ButtonGroup>
            )}

            {messages.state === 'confirm email' && (
                <ButtonGroup title={'Использовать эту электронную почту для связи ' + messages.email + '?'}>
                    <Button
                        onClick={() =>
                            setMessages({
                                ...messages,
                                state: 'confirm ticket',
                            })
                        }
                    >
                        Да
                    </Button>
                    <Button
                        onClick={() =>
                            setMessages({
                                ...messages,
                                state: 'email',
                            })
                        }
                    >
                        Нет, укажу другую
                    </Button>
                </ButtonGroup>
            )}

            {messages.state === 'confirm ticket' && (
                <ButtonGroup title="Создать обращение?">
                    <Button onClick={createTicket}>Да, пожалуйста</Button>
                    <Button
                        onClick={() =>
                            setMessages({
                                ...messages,
                                state: 'no',
                            })
                        }
                    >
                        Нет
                    </Button>
                </ButtonGroup>
            )}
        </>
    );
}

export function App(props) {
    return (
        <>
            <Text>Добро пожаловать в чат-бота технической поддержки ООО ФИДТЕХ</Text>
            <Help {...props} />
        </>
    );
}
