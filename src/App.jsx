import { useState } from 'react';
import { Text, ButtonGroup, Button, useText, useAction, useContact } from '@urban-bot/core';
import fs from 'fs';
import logo from './assets/logo.png';
import 'whatwg-fetch';
import { useMixpanel } from 'react-mixpanel-browser';
import { putOrder } from './actions';

const file = fs.readFileSync(logo);
const nodemailer = require('nodemailer');

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

    const [state, setState] = useState('start');
    const [messages, setMessages] = useState({
        name: '',
        phone: '',
        trouble: '',
        email: '',
        subject: SUPPORT_IT,
    });

    const mixpanel = useMixpanel();

    useAction((actionId) => {
        //console.log('user made some action', actionId);
        if (messages.name.length === 0)
            setMessages({ ...messages, name: actionId.from.firstName + ' ' + actionId.from.lastName });
        //if (mixpanel) mixpanel.track('User Action', { ...actionId.chat });
    });

    useContact((event) => {
        console.log('user sent a contact', event);
    });

    useText(({ text }) => {
        switch (state) {
            case 'trouble':
                setMessages((messages) => ({
                    ...messages,
                    trouble: text,
                }));
                setState(messages.name.length === 0 ? 'name' : 'confirm name');
                break;
            case 'name':
                setMessages((messages) => ({
                    ...messages,
                    name: text,
                }));
                setState(messages.phone.length === 0 ? 'phone' : 'confirm phone');
                break;
            case 'phone':
                setMessages((messages) => ({
                    ...messages,
                    phone: text,
                }));
                setState(messages.email.length === 0 ? 'email' : 'confirm email');
                break;
            case 'email':
            case 'email error':
            case 'email error again':
                if (validateEmail(text)) {
                    setMessages((messages) => ({
                        ...messages,
                        email: text,
                    }));
                    setState('confirm ticket');
                } else setState(['email', 'email error again'].includes(state) ? 'email error' : 'email error again');
                break;
            default:
                break;
        }
    });

    function getOutputText() {
        switch (state) {
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
                return 'Извините, это не похоже на валидный e-mail, пожалуйста, введите еще раз';
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
        setState('yes');
    }

    function startTicket() {
        setState('subject');
    }

    console.log('App states', state, messages);
    //mixpanel.track('App States', state, messages);

    return (
        <>
            {!['start', 'subject', 'confirm name', 'confirm phone', 'confirm email'].includes(state) && (
                <Text>{getOutputText()}</Text>
            )}

            {['start', 'yes', 'no'].includes(state) && (
                <ButtonGroup title="Чтобы оставить обращение в службу технической поддержки, нажмите на кнопку ниже">
                    <Button onClick={startTicket}>Создать обращение</Button>
                </ButtonGroup>
            )}

            {state === 'subject' && (
                <ButtonGroup title="Выберите предмет обращения" maxColumns={1}>
                    <Button
                        onClick={() => {
                            setMessages({ ...messages, subject: SUPPORT_1C });
                            setState('trouble');
                        }}
                    >
                        1С БП, ЗУП, УНФ, ERP
                    </Button>
                    <Button
                        onClick={() => {
                            setMessages({ ...messages, subject: SUPPORT_EVENTS });
                            setState('trouble');
                        }}
                    >
                        CRM, сайты и лендинги
                    </Button>
                    <Button
                        onClick={() => {
                            setMessages({ ...messages, subject: SUPPORT_EFEED });
                            setState('trouble');
                        }}
                    >
                        e-Feed Маркетплейс
                    </Button>
                    <Button
                        onClick={() => {
                            setMessages({ ...messages, subject: SUPPORT_EFEED });
                            setState('trouble');
                        }}
                    >
                        e-Feed Взвешивание
                    </Button>
                    <Button
                        onClick={() => {
                            setMessages({ ...messages, subject: SUPPORT_SERVICE });
                            setState('trouble');
                        }}
                    >
                        e-Feed Сервис
                    </Button>
                    <Button
                        onClick={() => {
                            setMessages({ ...messages, subject: SUPPORT_IT });
                            setState('trouble');
                        }}
                    >
                        Рабочие места или другое
                    </Button>
                </ButtonGroup>
            )}

            {state === 'confirm name' && (
                <ButtonGroup title={messages.name + ', обращение зарегистрировать от вас или другого человека?'}>
                    <Button onClick={() => setState(messages.phone.length ? 'confirm phone' : 'phone')}>
                        Да, от меня
                    </Button>
                    <Button onClick={() => setState('name')}>Нет, другое ФИО</Button>
                </ButtonGroup>
            )}

            {state === 'confirm phone' && (
                <ButtonGroup title={'Использовать этот номер телефона для связи ' + messages.phone + '?'}>
                    <Button onClick={() => setState(messages.phone.length ? 'confirm email' : 'email')}>Да</Button>
                    <Button onClick={() => setState('phone')}>Нет, укажу другой</Button>
                </ButtonGroup>
            )}

            {state === 'confirm email' && (
                <ButtonGroup title={'Использовать эту электронную почту для связи ' + messages.email + '?'}>
                    <Button onClick={() => setState('confirm ticket')}>Да</Button>
                    <Button onClick={() => setState('email')}>Нет, укажу другую</Button>
                </ButtonGroup>
            )}

            {state === 'confirm ticket' && (
                <ButtonGroup title="Создать обращение?">
                    <Button onClick={createTicket}>Да, пожалуйста</Button>
                    <Button onClick={() => setState('no')}>Нет</Button>
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
