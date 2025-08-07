import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

import stores from "../config/store.json";
import { writeCsv } from "../utils/logger";
import { validateMatches } from "../utils/matchVallidator";

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
        page.waitForSelector(storeLocatorSelector, { timeout: 5000 }),
        page.waitForFunction(() => !document.querySelector("a.us-link"), {
          timeout: 5000,
        }),
      ]);

      console.log("✅ US region selected. Continuing...");
      await page.screenshot({
        path: `screenshots/${storeKey}_after_splash.png`,
      });
    }

    await waitForTimeout(3000);
    const html = await page.content();
    fs.writeFileSync("debug-after-click.html", html);
    await page.screenshot({
      path: `screenshots/${storeKey}_post_click_debug.png`,
    });



  } catch (err) {
    console.error("Unhandled error in scrapeStore", err);
  } finally {
    await browser.close();
  }
}
