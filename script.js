import puppeteer from 'puppeteer';

(async () => {
    const browser = await puppeteer.launch({   headless: true,   args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();

  await page.goto('https://google.com', { waitUntil: 'networkidle0' });

  console.log(page.body);
  await browser.close();
})();
