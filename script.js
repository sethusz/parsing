import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.goto('https://google.com', { waitUntil: 'networkidle0' });

  console.log(page.body);
  await browser.close();
})();
