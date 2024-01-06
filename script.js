import puppeteer from 'puppeteer-core';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import { Telegraf, session } from 'telegraf';
import https from 'https';

const bot = new Telegraf('5412985709:AAEtIov5j7RsECWvgxtsC8AAH5RjERmHwu8', {
    telegram: {
    agent: new https.Agent({ keepAlive: true }),
    },
    });

    


const sentAdIdsFilePath = './sentAdIds.json';
const lastAdIdFilePath = './lastAdId.json';

const sessionMiddleware = session();
let sentAdIds = new Set();
let queue = [];

async function loadSentAdIds() {
    try {
        const data = await fs.readFile(sentAdIdsFilePath, 'utf8');
        const items = JSON.parse(data);

        // Оставляем только записи, которые не старше двух запусков скрипта
        const thresholdTime = Date.now() - (2 * 100000); // 2 запуска * 100000 мс
        const filteredItems = items.filter(item => item.time > thresholdTime);

        sentAdIds = new Set(filteredItems.map(item => item.id));
    } catch (error) {
        console.log('No saved data, creating a new file.');
        await saveSentAdIds();
    }
}

async function saveSentAdIds() {
    const idsArray = Array.from(sentAdIds).map(id => ({ id, time: Date.now() }));
    await fs.writeFile(sentAdIdsFilePath, JSON.stringify(idsArray), 'utf8');
}

async function loadLastAdId() {
    try {
        const data = await fs.readFile(lastAdIdFilePath, 'utf8');
        lastAdId = JSON.parse(data).lastAdId;
    } catch (error) {
        console.log('No lastAdId data found, starting fresh.');
    }
}


async function saveLastAdId() {
    await fs.writeFile(lastAdIdFilePath, JSON.stringify({ lastAdId }), 'utf8');
}

async function safelyGetTextContent(page, selector, defaultValue) {
    const element = await page.$(selector);
    if (element) {
        const text = await page.evaluate(el => el.textContent.trim(), element);
        return text;
    } else {
        return defaultValue;
    }
}


async function checkNewListings() {
    console.log("Launching browser...");
    const browser = await puppeteer.launch({   headless: true,   args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    console.log("Going to the page...");
    await page.goto('https://es.wallapop.com/app/search?category_ids=100&filters_source=quick_filters&latitude=40.41955&longitude=-3.69196&distance=50000&order_by=newest', { waitUntil: 'networkidle0' });

    console.log("Evaluating page content...");
    await page.waitForSelector('a.ItemCardList__item', { timeout: 5000 });

    const listings = [];
    const listingElementHandles = await page.$$('a.ItemCardList__item');
    for (const linkElementHandle of listingElementHandles) {
         const link = await linkElementHandle.evaluate(el => el.href);
        console.log(`Processing link: ${link}`);
        const detailPage = await browser.newPage();

        detailPage.on('response', response => {
            console.log(`Received response with status: ${response.status()} for ${response.url()}`);
        });

        try {
            await detailPage.goto(link, { waitUntil: 'networkidle0' });
        
            let title = await safelyGetTextContent(detailPage, '.item-detail_ItemDetail__title__wcPRl', 'Title not found');
        
            let price = 'Price not found';
            const priceElementStandard = await detailPage.$('.item-detail-price_ItemDetailPrice--standard__TxPXr');
            const priceElementFinanced = await detailPage.$('.item-detail-price_ItemDetailPrice--standardFinanced__14D3z');
            if (priceElementStandard) {
                price = await detailPage.evaluate(el => el.textContent.trim(), priceElementStandard);
            } else if (priceElementFinanced) {
                price = await detailPage.evaluate(el => el.textContent.trim(), priceElementFinanced);
            }
        
            let description = await safelyGetTextContent(detailPage, '.item-detail_ItemDetail__description__7rXXT', 'Description not found');
        
            let kilometers = 'Kilometers not found';
            const kilometersElements = await detailPage.$$('.item-detail-car-extra-info_ItemDetailCarExtraInfo__section__n4g_P');
            for (const element of kilometersElements) {
                const spans = await element.$$eval('span', spans => spans.map(span => span.textContent.trim()));
                if (spans.length >= 2 && spans[0].includes('Kilómetros')) {
                    kilometers = spans[1];
                    break;
                }
            }
        
            let fuel = 'Fuel not found';
            const fuelElements = await detailPage.$$('.item-detail-attributes-info_AttributesInfo__measure__uZS62');
            for (const element of fuelElements) {
                const textContentFuel = await element.evaluate(el => el.textContent.trim());
                if (textContentFuel.includes('Diésel') || textContentFuel.includes('Gasolina')) {
                    fuel = textContentFuel;
                    break;
                }
            }
        
            let box = 'Box type not found';
            const boxElements = await detailPage.$$('.item-detail-attributes-info_AttributesInfo__measure__uZS62');
            for (const element of boxElements) {
                const textContentBox = await element.evaluate(el => el.textContent.trim());
                if (textContentBox.includes('Manual') || textContentBox.includes('Automático')) {
                    box = textContentBox;
                    break;
                }
            }
        
            const photoUrls = await getSliderImages(detailPage, '.wallapop-carousel--rounded');
            listings.push({ adId: link, link, title, price, description, kilometers, fuel, box, photoUrls });
        }
         catch (error) {
            console.error(`Error processing link: ${link}`, error);
        } finally {
            await detailPage.close();
        }
    }

    await browser.close();
    console.log("Listings fetched:", listings);
    return listings;
}


async function getSliderImages(detailPage, sliderSelector) {
    return detailPage.$$eval(`${sliderSelector} img`, imgs => imgs.map(img => img.src));
}


async function sendTelegramMessage(chatId, message, useMarkdown = false) {
    try {
        const options = useMarkdown ? { parse_mode: 'Markdown' } : {};
        await bot.telegram.sendMessage(chatId, message, options);
        console.log("Message sent successfully.");
    } catch (error) {
        console.error('Failed to send message:', error);
    }
}


async function sendTelegramMediaGroup(chatId, mediaGroup) {
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
        if (error.message.includes("Too Many Requests: retry after")) {
            const retryAfter = parseInt(error.message.split("retry after ")[1], 10) * 1000;
            console.log(`Rate limit hit, retrying after ${retryAfter / 1000} seconds.`);
            await new Promise(resolve => setTimeout(resolve, retryAfter));
            await sendTelegramMediaGroup(chatId, mediaGroup); 
        } else {
            throw error;
        }
    }
}
bot.launch();

let lastAdId = null;


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }


  let isProcessing = false;

  let isFirstRun = true;
  
  async function main() {
    if (isProcessing) {
        console.log("Previous main function is still running, skipping...");
        return;
    }

    isProcessing = true;

    try {
        await loadLastAdId();
        console.log("Running main function...");
        const newlistings = await checkNewListings();
        newlistings.reverse();
        let newLastAdId = null;
        let foundNew = false;

        for (let i = 0; i < newlistings.length; i++) {
            let ad = newlistings[i];
            let adId = ad.adId;
        
            if (!sentAdIds.has(adId)) {
                console.log(`Found new ad: ${adId}`);
                foundNew = true;

                if (!isFirstRun) {
                    const caption = `${ad.title}\n` +
                                    `\n` +
                                    `Цена: ${ad.price}\n` +
                                    `Топливо: ${ad.fuel}\n` +
                                    `Пробег: ${ad.kilometors}\n` +
                                    `Коробка: ${ad.box}\n` +
                                    `Описание: ${ad.description}\n` +
                                    `[Ссылка](${ad.link})`;

                    let mediaGroup = ad.photoUrls.slice(0, 10).map((photoUrl, index) => ({
                        type: 'photo',
                        media: photoUrl,
                        caption: index === 0 ? caption : undefined,
                        parse_mode: index === 0 ? 'Markdown' : undefined
                    }));

                    if (mediaGroup.length > 0) {
                        await sendTelegramMediaGroup('-4090647219', mediaGroup);
                        await sleep(50000);
                    } else {
                        await sendTelegramMessage('-4090647219', caption, true);
                        await sleep(50000);
                    }
                    console.log(`Sending ad ${adId} to Telegram`);
                    sentAdIds.add(adId);
                    newLastAdId = adId; // Обновляем newLastAdId после успешной отправки
                }
            }
        }

        if (newLastAdId) {
            lastAdId = newLastAdId; // Обновляем lastAdId после обработки всех новых объявлений
            await saveSentAdIds();
            await saveLastAdId();
            console.log(`Updated lastAdId to ${lastAdId}`);

        } else if (!foundNew) {
            console.log("Новых объявлений нет.");
        }

        if (isFirstRun) {
            console.log("First run, setting isFirstRun to false");

            isFirstRun = false;
        }
    } catch (error) {
        console.error("Error in main function:", error);
    } finally {
        isProcessing = false;
        console.log("Finished main function");

    }
}


loadSentAdIds().then(() => {
    main();
    setInterval(main, 400000); 
});


