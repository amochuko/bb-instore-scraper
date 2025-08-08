import fs from "node:fs";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

import { Page } from "puppeteer";
import stores from "../config/store.json";

puppeteer.use(StealthPlugin());

type Product = {
  item_name: string;
  price: string;
  merchant_supplied_id: string;
  brand?: string;
  category?: string;
  image_url?: string;
};

type StoreData = {
  storeId: string;
  zip: string;
  location: string;
  city: string;
  city_code: string;
  state: string;
  state_code: string;
};
puppeteer.use(StealthPlugin());

const waitForTimeout = (secs: number) =>
  new Promise((res) => setTimeout(res, secs));

export async function scrapeStore(
  website: string,
  storeKey: string,
  itemCategory: string
) {
  const browser = await puppeteer.launch({
    headless: process.env.NODE_END === "production",
    slowMo: process.env.NODE_END === "production" ? 0 : 50,
    defaultViewport: null,
    args: [
      "--disable-features=Geolocation", // block geolocation API
      "--deny-permission-prompts", // auto-deny prompts
    ],
  });
  const page = await browser.newPage();

  const store = stores[storeKey as keyof typeof stores];
  console.log(`Navigating to BestBuy for store: ${storeKey}`);

  try {
    // 1. Go to BestBuy root
    await page.goto(website, { waitUntil: "domcontentloaded" });

    const splashSelector = "a.us-link";

    if (await page.$(splashSelector)) {
      console.log("Clicking US flag...");

      await page.click(splashSelector);
      const nextPage = "https://www.bestbuy.com/?intl=nosplash";
      await page.goto(nextPage, {
        waitUntil: "domcontentloaded",
      });
    } else {
      console.error("Option for US region not available.");
    }

    await changeLocation(page, storeKey, store);
  } catch (err) {
    console.error("Unhandled error in scrapeStore", err);
  } finally {
    await browser.close();
  }
}

////////////////////////////////////////////////////////
// 2. Open location modal (top nav "Your Store" button)
////////////////////////////////////////////////////////
async function changeLocation(page: Page, storeKey: string, store: StoreData) {
  // await page.waitForNavigation({
  //   waitUntil: "domcontentloaded",
  // });

  console.log("US region confirmed", page.url());

  await waitForTimeout(5000);
  // After clicking the US link and navigation
  const locationTooltipSelector = 'button[data-cy*="location-tooltip"]';
  // await page.waitForSelector('button[data-cy*="location-tooltip"]', {
  //   timeout: 5000,
  // });
  await waitForSelectorWithRetry(page, locationTooltipSelector, 5, 10000);

  const changeLocationBtn = 'button[data-cy="location-tooltip-lv-button"]';
  const found = await waitForSelectorWithRetry(
    page,
    changeLocationBtn,
    5,
    9000
  );

  if (!found) {
    console.error("Could not find `Your Store` button");
    await page.screenshot({
      path: `screenshots/${storeKey}_missing_location_button.png`,
    });

    throw new Error("Location button not found.");
  }

  await page.click(changeLocationBtn);
  console.log("Opened store location overlay");

  // await takeScreenshot(page, `screenshots/${storeKey}_store_overlay`);

  // Click "Find Another Store"
  const findAnotherStore = "a.find-store-btn";
  await page.waitForSelector(findAnotherStore, { timeout: 11000 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }),
    page.click(findAnotherStore),
  ]);

  // 4. Wait for ZIP input field and submit
  await searchForStoreLocation(page, storeKey, store);
}

async function searchForStoreLocation(
  page: Page,
  storeKey: string,
  storeData: StoreData
) {
  console.log("🔁 Navigated to Store Locator");
  await takeScreenshot(page, `${storeKey}_store_locator_landing`);

  const locationInputSelector =
    'input[aria-label="Enter city and state or zip code"]';

  // const locationInputSelector = 'input[data-cy="store-locator-search-input"]';
  await page.waitForSelector(locationInputSelector, { timeout: 10000 });

  // Priority: city → state → zip
  const searchOptions = [
    storeData.city_code,
    storeData.state_code,
    storeData.zip,
  ].filter(Boolean);

  let searchQuery;
  for (const option of searchOptions) {
    // Clear input before typing
    await page.click(locationInputSelector, { clickCount: 3 });
    await page.keyboard.press("Backspace");

    console.log(`🔍 Trying location search with: ${option}`);
    await page.type(locationInputSelector, option, { delay: 100 });
    await page.keyboard.press("Enter");

    try {
      await page.waitForSelector(
        'li[data-cy="LocationCardListItemComponent"]',
        {
          timeout: 8000,
        }
      );
      searchQuery = option;
      console.log(`Search results loaded for ${option}`);
      break; // Found results, exit loop
    } catch {
      console.warn(`⚠️ No results for "${option}", trying next...`);

      await savePageForDebug(page, "debug-page");
      await takeScreenshot(page, "debug-screenshot");

      console.error(
        "Failed to find ZIP input. Debug HTML and screenshot saved."
      );
    }
  }

  if (!searchQuery) {
    throw new Error(
      `No search results found for city, state, or zip in ${storeKey}`
    );
  }


  await waitForTimeout(5000);
  
  // Wait for the first store card (highlighted one)
  // await pickFirstStore(page, zip);
  // await waitForTimeout(2000);
}

async function savePageForDebug(page: Page, label: string) {
  const html = await page.content();
  fs.writeFileSync(`${label}.html`, html);
}

async function takeScreenshot(page: Page, label: string) {
  await page.screenshot({
    path: `screenshots/${label}.png`,
  });
}

async function waitForSelectorWithRetry(
  page: Page,
  selector: string,
  retries = 3,
  delay = 3000
) {
  for (let i = 0; i < retries; i++) {
    const el = await page.$(selector);
    if (el) return el;
    console.warn(`⏳ Retry ${i + 1}: Waiting for ${selector}`);
    await waitForTimeout(delay);
  }
  return null;
}
