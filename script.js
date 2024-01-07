




import puppeteer from 'puppeteer';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import { sendTelegramMessage, sendTelegramMediaGroup, startBot, getUserChatIds } from './tgbot.js';


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


async function checkNewListings() {
    console.log("Launching browser...");
    const browser = await puppeteer.launch({   headless: true,  args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        `--proxy-server=${proxyServer}:${proxyPort}`
    ], });
    const page = await browser.newPage();

    await page.authenticate({
        username: proxyUser,
        password: proxyPassword
    });

    
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
            listings.push({ adId: link, link, title, price, description, kilometors, fuel, box, photoUrls });
        } catch (error) {
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



let lastAdId = null;


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }


  let isProcessing = false;

  
  async function broadcastMessageToAllUsers(message, mediaGroup = null) {
    const chatIds = getUserChatIds();
    for (const chatId of chatIds) {
        if (mediaGroup) {
            await sendTelegramMediaGroup(chatId, mediaGroup);
        } else {
            await sendTelegramMessage(chatId, message);
        }
        await sleep(1000); 
    }
}


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
                                        await broadcastMessageToAllUsers(null, mediaGroup);
                                        await sleep(30000);

                                    } else {
                                        await broadcastMessageToAllUsers(caption);
                                        await sleep(30000);
                                    }
                                    
                    console.log(`Sending ad ${adId} to Telegram`);
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