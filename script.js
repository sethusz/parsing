
import puppeteer from 'puppeteer';
import fetch from 'node-fetch';
import fs from 'fs';
import { promisify } from 'util';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const sentAdIdsFilePath = './sentAdIds.json';

let sentAdIds = new Set();

// Функция для загрузки сохраненных идентификаторов объявлений
async function loadSentAdIds() {
    try {
        const data = await readFile(sentAdIdsFilePath, 'utf8');
        const ids = JSON.parse(data);
        sentAdIds = new Set(ids);
    } catch (error) {
        console.log('Нет сохраненных данных, создаем новый файл.');
        await saveSentAdIds();
    }
}

// Функция для сохранения идентификаторов объявлений в файл
async function saveSentAdIds() {
    const idsArray = [...sentAdIds];
    await writeFile(sentAdIdsFilePath, JSON.stringify(idsArray), 'utf8');
}


async function checkNewListings() {
    console.log("Launching browser...");
    const browser = await puppeteer.launch({
        headless: true
    });
    const page = await browser.newPage();
    console.log("Going to the page...");
    await page.goto('https://es.wallapop.com/app/search?category_ids=100&filters_source=quick_filters&latitude=40.41955&longitude=-3.69196&distance=50000&order_by=newest', { waitUntil: 'networkidle0' });

    console.log("Evaluating page content...");
    await page.waitForSelector('a.ItemCardList__item', { timeout: 5000 });
  
    const listings = [];
    const listingElementHandles = await page.$$('a.ItemCardList__item');
    for (const linkElementHandle of listingElementHandles) {
      if (linkElementHandle) {
        const link = await linkElementHandle.evaluate(el => el.href);
        const adId = link;
        listings.push({ adId, link });
      }
    }
  
    console.log("Listings fetched:", listings);
    await browser.close();
    return listings;
}

async function sendTelegramMessage(message) {
    console.log("Sending message to Telegram:", message);
    const telegramApi = `https://api.telegram.org/bot5412985709:AAEtIov5j7RsECWvgxtsC8AAH5RjERmHwu8/sendMessage`;
    const chatId = '-4090647219';
    const url = `${telegramApi}?chat_id=${chatId}&text=${encodeURIComponent(message)}`;

    const response = await fetch(url, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) {
        console.error('Error sending message:', data.description);
    } else {
        console.log("Message sent successfully.");
    }
}

let lastAdId = null;

async function main() {
    console.log("Running main function...");
    const newlistings = await checkNewListings();

    if (newlistings.length > 0) {
        // Первоначальная инициализация lastAdId при первом запуске
        if (!lastAdId) {
            lastAdId = newlistings[0].adId;
        }

        let foundNewAd = false;
        for (const ad of newlistings) {
            let adId = ad.adId;

            if (adId === lastAdId) {
                break; // Прервать цикл, как только достигли последнего запомненного объявления
            }

            if (!sentAdIds.has(adId)) {
                console.log("Sending new listing to Telegram.");
                await sendTelegramMessage(`Новое объявление: ${ad.link}`);
                sentAdIds.add(adId);
                foundNewAd = true;
            }
        }

        // Обновление lastAdId и сохранение идентификаторов
        if (foundNewAd) {
            lastAdId = newlistings[0].adId;
            await saveSentAdIds();
        } else {
            console.log("No new listings found since the last check.");
            await sendTelegramMessage("Новых объявлений с последней проверки нет!");
        }
    } else {
        console.log("No listings found.");
        await sendTelegramMessage("Объявлений нет!");
    }
}


loadSentAdIds().then(() => {
    main();
    setInterval(main, 300000); 
});
