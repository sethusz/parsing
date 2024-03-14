


import puppeteer from 'puppeteer';
import fs from 'fs/promises';

import { Telegraf, session } from 'telegraf';
import https from 'https';
import dotenv from 'dotenv';
dotenv.config();

const bot = new Telegraf('6955802346:AAG2qs8ZQ0VneN4sxTUmYLMrHwrd3jlCvmE', {
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
    }
}

export function startBot() {
    bot.launch();
}



const proxyServer = 'ua-1.stableproxy.com';
const proxyPort = '11001';
const proxyUser = 'baDb9y9sv2';
const proxyPassword = '578sNJwVMiyP';


const sentAdIdsFilePath = './sentAdIds.json';
const lastAdIdFilePath = './lastAdId.json';

let sentAdIds = new Set();

async function loadSentAdIds() {
    try {
        const data = await fs.readFile(sentAdIdsFilePath, 'utf8');
        const items = JSON.parse(data);

        const thresholdTime = Date.now() - (2 * 100000); 
        const filteredItems = items.filter(item => item.time > thresholdTime);

        sentAdIds = new Set(filteredItems.map(item => item.id));
    } catch (error) {
        console.log('No saved data, creating a new file.');
        await saveSentAdIds();
    }``
}

async function saveSentAdIds() {
    const idsArray = Array.from(sentAdIds).map(id => ({ id, time: Date.now() }));
    await fs.writeFile(sentAdIdsFilePath, JSON.stringify(idsArray), 'utf8');
}

// async function sendMessageThroughBotTwo(message) {
//     try {
//         await botTwo.telegram.sendMessage('-4195335988', message);
//     } catch (error) {
//         console.error('Failed to send message through botTwo:', error);
//     }
// }

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

const botTwo = new Telegraf('6955802346:AAG2qs8ZQ0VneN4sxTUmYLMrHwrd3jlCvmE', {
    telegram: {
        agent: new https.Agent({
            keepAlive: true,
        }),
    },
});


let lastProcessedAdId = null;

async function processBatch(batch, browser) {
    const details = await Promise.all(batch.map(handle => processListing(handle, browser)));
    return details.filter(detail => detail !== null);
}

async function checkNewListings() {
    console.log("Launching browser...");
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    console.log("Going to the page...");
    await page.goto('https://es.wallapop.com/app/search?category_ids=100&filters_source=quick_filters&latitude=42.46591&longitude=-2.45193&distance=100000&order_by=newest&max_sale_price=3000', {
        waitUntil: 'networkidle0',
        timeout: 90000000
    });

    console.log("Evaluating page content...");
    await page.waitForSelector('a.ItemCardList__item', { timeout: 5000000 });

    const listingElementHandles = await page.$$('a.ItemCardList__item');
    let startIndex = 0;

    if (lastProcessedAdId) {
        const links = await Promise.all(listingElementHandles.map(handle => handle.evaluate(node => node.href)));
        startIndex =links.indexOf(lastProcessedAdId) + 1;
    }
    const newListingHandles = listingElementHandles.slice(startIndex);
let listings = [];

// Process listings in batches
for (let i = 0; i < newListingHandles.length; i += 5) {
    const batch = newListingHandles.slice(i, i + 5);
    const batchListings = await processBatch(batch, browser); // Убедитесь, что browser передается сюда
    listings = listings.concat(batchListings);

    // If there are listings, update the lastProcessedAdId
    if (batchListings.length > 0) {
        lastProcessedAdId = batchListings[batchListings.length - 1].adId;
    }
}

await browser.close();
console.log("Listings fetched:", listings);

return listings;
}


async function processListing(linkElementHandle, browser) {
    try {
        const link = await linkElementHandle.evaluate(el => el.href);
        const detailPage = await browser.newPage();
        await detailPage.goto(link, { waitUntil: 'networkidle0', timeout: 5000000 });
        console.log(`Processing link: ${link}`);

        const titleExists = await detailPage.$('.item-detail_ItemDetail__title__wcPRl') !== null;
        let title = titleExists ? await detailPage.$eval('.item-detail_ItemDetail__title__wcPRl', el => el.textContent) : 'Title not found';

        let price = 'Информация не найдена';
        const priceSelectorStandard = '.item-detail-price_ItemDetailPrice--standard__TxPXr';
        const priceSelectorFinanced = '.item-detail-price_ItemDetailPrice--standardFinanced__14D3z';
        
        const priceElementStandard = await detailPage.$(priceSelectorStandard);
        const priceElementFinanced = await detailPage.$(priceSelectorFinanced);
        
        if (priceElementStandard) {
            price = await detailPage.$eval(priceSelectorStandard, el => el.textContent);
        } else if (priceElementFinanced) {
            price = await detailPage.$eval(priceSelectorFinanced, el => el.textContent);
        }

        
        const descriptionExists = await detailPage.$('.item-detail_ItemDetail__description__7rXXT') !== null;
        let description = descriptionExists ? await detailPage.$eval('.item-detail_ItemDetail__description__7rXXT', el => el.textContent) : 'Название не найдено';

        let kilometors = 'Информация не найдена';
        const kilometorsElements = await detailPage.$$('.item-detail-car-extra-info_ItemDetailCarExtraInfo__section__n4g_P');
        
        for (const element of kilometorsElements) {
            const spans = await element.$$eval('span', spans => spans.map(span => span.textContent));
            if (spans.length >= 2 && spans[0].includes('Kilómetros')) {
                kilometors = spans[1];
                break;
            }
        }

        let fuel = 'Информация не найдена';

        const fuelElements = await detailPage.$$('.item-detail-attributes-info_AttributesInfo__measure__uZS62');
        for (const element of fuelElements) {
            const textContentFuel = await element.evaluate(el => el.textContent);
            if (textContentFuel.includes('Diésel') || textContentFuel.includes('Gasolina')) {
                fuel = textContentFuel;
                break;
            }
        }

        let box = 'Информация не найдена';

        const boxElements = await detailPage.$$('.item-detail-attributes-info_AttributesInfo__measure__uZS62');
        for (const element of boxElements) {
            const textContent = await element.evaluate(el => el.textContent);
            if (textContent.includes('Manual') || textContent.includes('Automático')) {
                box = textContent;
                break;
            }
        }



        const photoUrls = await getSliderImages(detailPage, '.wallapop-carousel--rounded');

        await detailPage.close();
        return { adId: link, link, title, price, description, kilometors, fuel, box, photoUrls };
    } catch (error) {
        console.error(`Error processing link: ${link}`, error);
        return null;
    }
}


async function getSliderImages(detailPage, sliderSelector) {
    return detailPage.$$eval(`${sliderSelector} img`, imgs => imgs.map(img => img.src));
}



let lastAdId = null;


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }


  let isProcessing = false;

  
  async function broadcastMessageToAllUsers(message, mediaGroup = null) {
        if (mediaGroup) {
            await sendTelegramMediaGroup('-4195335988', mediaGroup);
        } else {
            await sendTelegramMessage('-4195335988', message);
        }
        // await sleep(40000); 
}


let isFirstRun = true;

async function main() {

    // await sendMessageThroughBotTwo("Бот работает");


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
                                    `[Ссылка](${ad.link})(новая)`;

                    let mediaGroup = ad.photoUrls.slice(0, 5).map((photoUrl, index) => ({
                        type: 'photo',
                        media: photoUrl,
                        caption: index === 0 ? caption : undefined,
                        parse_mode: index === 0 ? 'Markdown' : undefined
                    }));
                            
                    if (mediaGroup.length > 0) {
                        await broadcastMessageToAllUsers(null, mediaGroup);
                        await sleep(30000);
                    } else {
                        await broadcastMessageToAllUsers(caption);
                        await sleep(30000);
                    }
                }
                                    
                console.log(`Processed ad ${adId}`);
                sentAdIds.add(adId);
                newLastAdId = adId;
            }
        }

        if (newLastAdId) {
            lastAdId = newLastAdId;
            await saveSentAdIds();
            await saveLastAdId();
            console.log(`Updated lastAdId to ${lastAdId}`);
        } else if (!foundNew) {
            console.log("Новых объявлений нет.");
        }

        isFirstRun = false



    } catch (error) {
        console.error("Error in main function:", error);
    } finally {
        isProcessing = false;
        console.log("Finished main function");
    }
}

startBot();

loadSentAdIds().then(() => {
    main();
    setInterval(main, 60000); 
});
