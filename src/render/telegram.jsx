import { UrbanBotTelegram } from '@urban-bot/telegram';
import { render, Root } from '@urban-bot/core';
import dotenv from 'dotenv';
import { App } from '../App';
import { MixpanelProvider } from 'react-mixpanel-browser';

dotenv.config();

const { TELEGRAM_TOKEN, PORT, MIXPANEL_API_KEY } = process.env;

const isDevelopment = process.env.NODE_ENV === 'development';

if (!TELEGRAM_TOKEN) {
    throw new Error('Provide TELEGRAM_TOKEN to .env https://core.telegram.org/bots#6-botfather');
}

const urbanBotTelegram = new UrbanBotTelegram({
    token: TELEGRAM_TOKEN,
    isPolling: isDevelopment,
});

const MIXPANEL_CONFIG = {
    track_pageview: true, // Set to `false` by default
};

render(
    <Root bot={urbanBotTelegram} port={PORT ? Number(PORT) : undefined}>
        <MixpanelProvider config={MIXPANEL_CONFIG} token={MIXPANEL_API_KEY}>
            <App {...process.env} />
        </MixpanelProvider>
    </Root>,
    () => {
        console.log('TG Бот начал свою работу', MIXPANEL_API_KEY);
    },
);
