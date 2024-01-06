import puppeteer from 'puppeteer';

(async () => {
    const browser = await puppeteer.launch({   headless: true,   args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();

  await page.goto('https://es.wallapop.com/app/search?category_ids=100&filters_source=quick_filters&latitude=40.41955&longitude=-3.69196&distance=50000&order_by=newest', { waitUntil: 'networkidle0' });

  const data = await page.evaluate(() => document.querySelector('*').outerHTML);

  console.log(data)
  await browser.close();
})();
