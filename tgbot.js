import { Telegraf, session } from 'telegraf';
import https from 'https';
import dotenv from 'dotenv';
dotenv.config();

const bot = new Telegraf('5463178895:AAFA5lnL_sfY3VaDNOdBuG4c57VO4JBJPo0', {
    telegram: {
        agent: new https.Agent({
            keepAlive: true,
        }),
    },
});

let userChatIds = new Set();

bot.on('text', (ctx) => {
    const chatId = ctx.chat.id;
    userChatIds.add(chatId);
    console.log(`Добавлен новый ID чата: ${chatId}`);
    ctx.reply('Ваше сообщение получено!');
});


export async function sendTelegramMessage(chatId, message, useMarkdown = false) {
    try {
        const options = useMarkdown ? { parse_mode: 'Markdown' } : {};
        await bot.telegram.sendMessage(chatId, message, options);
        console.log("Message sent successfully.");
    } catch (error) {
        console.error('Failed to send message:', error);
    }
}

export async function sendTelegramMediaGroup(chatId, mediaGroup) {
    try {
        const validMediaGroup = mediaGroup.filter(media => media.media.startsWith('http'));
        if (validMediaGroup.length === 0) {
            console.log("Нет доступных изображений для отправки.");
            return;
        }

        await bot.telegram.sendMediaGroup(chatId, validMediaGroup);
        console.log("Media group sent successfully.");
    } catch (error) {
        console.error('Failed to send media group:', error);
    }
}

export function startBot() {
    bot.launch();
}