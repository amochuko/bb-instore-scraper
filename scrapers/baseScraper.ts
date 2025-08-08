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
    const storeLocatorSelector = 'input[placeholder*="ZIP"]';

    if (await page.$(splashSelector)) {
      console.log("🌍 Clicking US flag...");

      await page.click(splashSelector);

      // Wait for the splash to disappear or store-locator to appear
      await Promise.race([
        page.waitForSelector(storeLocatorSelector, { timeout: 6000 }),
        page.waitForFunction(() => !document.querySelector("a.us-link"), {
          timeout: 12000,
        }),
      ]);

      console.log("✅ US region selected. Continuing...");
      await page.screenshot({
        path: `screenshots/$1{storeKey}_after_splash.png`,
      });
    }

    await waitForTimeout(8000);
    // After clicking the US link and navigation
    await page.waitForSelector('button[data-cy*="location-tooltip"]', {
      timeout: 18000,
    });

    const html = await page.content();
    fs.writeFileSync("debug-after-click.html", html);
    await page.screenshot({
      path: `screenshots/${storeKey}_post_click_debug.png`,
    });

    // await changeLocation(page, storeKey);
  } catch (err) {
    console.error("Unhandled error in scrapeStore", err);
  } finally {
    await browser.close();
  }
}

////////////////////////////////////////////////////////
// 2. Open location modal (top nav "Your Store" button)
////////////////////////////////////////////////////////
async function changeLocation(page: Page, storeKey: string) {
  await waitForTimeout(10000);

  const changeLocationBtn = 'button[data-cy="location-tooltip-lv-button"]';
  const found = waitForSelectorWithRetry(page, changeLocationBtn, 5, 9000);

  if (!found) {
    console.error("Could not find `Your Store` button");
    await page.screenshot({
      path: `screenshots/${storeKey}_missing_location_button.png`,
    });

    throw new Error("Location button not found.");
  }

  await page.click(changeLocationBtn);
  console.log("Opened store location overlay");

  await page.screenshot({
    path: `screenshots/${storeKey}_store_overlay.png`,
  });

  // Click "Find Another Store"
  const findAnotherStore = "a.find-store-btn";
  await page.waitForSelector(findAnotherStore, { timeout: 11000 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }),
    page.click(findAnotherStore),
  ]);

  console.log("🔁 Navigated to Store Locator");

  await page.screenshot({
    path: `screenshots/${storeKey}_store_locator_landing.png`,
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
