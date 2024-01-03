import puppeteer from 'puppeteer';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import { Telegraf } from 'telegraf';

const bot = new Telegraf('5412985709:AAEtIov5j7RsECWvgxtsC8AAH5RjERmHwu8');

const sentAdIdsFilePath = './sentAdIds.json';
let sentAdIds = new Set();
let queue = [];

async function loadSentAdIds() {
    try {
        const data = await fs.readFile(sentAdIdsFilePath, 'utf8');
        const ids = JSON.parse(data);
        sentAdIds = new Set(ids);
    } catch (error) {
        console.log('Нет сохраненных данных, создаем новый файл.');
        await saveSentAdIds();
    }
}

async function saveSentAdIds() {
    const idsArray = [...sentAdIds];
    await fs.writeFile(sentAdIdsFilePath, JSON.stringify(idsArray), 'utf8');
}

async function checkNewListings() {
    console.log("Launching browser...");
    const browser = await puppeteer.launch({ headless: true });
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
        try {
            await detailPage.goto(link, { waitUntil: 'networkidle0' });
            const titleExists = await detailPage.$('.item-detail_ItemDetail__title__wcPRl') !== null;
            let title = titleExists ? await detailPage.$eval('.item-detail_ItemDetail__title__wcPRl', el => el.textContent) : 'Название не найдено';

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
            
            const fuelExists = await detailPage.$('.item-detail-attributes-info_AttributesInfo__measure__uZS62') !== null;
            let fuel = fuelExists ? await detailPage.$eval('.item-detail-attributes-info_AttributesInfo__measure__uZS62', el => el.textContent) : 'Название не найдено';

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
            listings.push({ adId: link, link, title, price, description, kilometors, fuel, box, photoUrls });
        } catch (error) {
            console.error(`Error processing link: ${link}`, error);
        } finally {
            await detailPage.close();
        }
    }

    console.log("Listings fetched:", listings);
    await browser.close();
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
        await bot.telegram.sendMediaGroup(chatId, mediaGroup);
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

  async function main() {
    console.log("Running main function...");
    const newlistings = await checkNewListings();

    if (newlistings.length > 0) {
        if (!lastAdId) {
            lastAdId = newlistings[0].adId;
        }

        let foundNewAd = false;
        let mediaGroup = [];

        for (const ad of newlistings) {
            let adId = ad.adId;
        
            if (adId === lastAdId) {
                break;
            }
        
            if (!sentAdIds.has(adId)) {
                const caption = `${ad.title}\n` +
                                `Цена: ${ad.price}\n` +
                                `Топливо: ${ad.fuel}\n` +
                                `Пробег: ${ad.kilometors}\n` +
                                `Коробка: ${ad.box}\n` +
                                `Описание: ${ad.description}\n` +
                                `[Ссылка](${ad.link})`;
        
                mediaGroup = ad.photoUrls.slice(0, 10).map((photoUrl, index) => ({
                    type: 'photo',
                    media: photoUrl,
                    caption: index === 0 ? caption : undefined,
                    parse_mode: index === 0 ? 'Markdown' : undefined 
                }));
        
                if (mediaGroup.length > 0) {
                    await sendTelegramMediaGroup('-4090647219', mediaGroup);
                } else {
                    await sendTelegramMessage('-4090647219', caption, true);
                }
        
                sentAdIds.add(adId);
                foundNewAd = true;
                
                mediaGroup = [];
            }
        }
        if (foundNewAd) {
            lastAdId = newlistings[0].adId;
            await saveSentAdIds();
        } else {
            console.log("No new listings found since the last check.");
            await sendTelegramMessage('-4090647219', "Новых объявлений с последней проверки нет!");
        }
        
    } else {
        console.log("No listings found.");
        await sendTelegramMessage("Объявлений нет!");
    }
}

async function processMediaGroup(mediaGroup) {
    try {
        await sendTelegramMediaGroup('-4090647219', mediaGroup);
    } catch (error) {
        if (error.message.includes("Too Many Requests: retry after")) {
            const retryAfter = parseInt(error.message.split("retry after ")[1], 10) * 1000;
            console.log(`Rate limit hit, retrying after ${retryAfter / 1000} seconds.`);
            await sleep(retryAfter);
            await sendTelegramMediaGroup('-4090647219', mediaGroup); 
        } else {
            throw error;
        }
    }
}

loadSentAdIds().then(() => {
    main();
    setInterval(main, 100000);
    
});
