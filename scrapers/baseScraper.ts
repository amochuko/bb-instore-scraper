import fs from "node:fs";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

import path from "node:path";
import { Browser, Page } from "puppeteer";
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

let maxPages = 0;

export async function scrapeStore(
  website: string,
  storeKey: string,
  itemCategory: string,
  numOfPages: number
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
  maxPages = numOfPages;

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

    await changeLocation(page, storeKey, store, website, itemCategory, browser);
  } catch (err) {
    console.error("Unhandled error in scrapeStore", err);
  } finally {
    await browser.close();
  }
}

////////////////////////////////////////////////////////
// 2. Open location modal (top nav "Your Store" button)
////////////////////////////////////////////////////////
async function changeLocation(
  page: Page,
  storeKey: string,
  store: StoreData,
  website: string,
  itemCategory: string,
  broswer: Browser
) {
  console.log("US region confirmed", page.url());

  await waitForTimeout(5000);
  // After clicking the US link and navigation
  const locationTooltipSelector = 'button[data-cy*="location-tooltip"]';
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

  // Click "Find Another Store"
  const findAnotherStore = "a.find-store-btn";
  await page.waitForSelector(findAnotherStore, { timeout: 11000 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }),
    page.click(findAnotherStore),
  ]);

  // Wait for store location search input field and submit
  await searchForStoreLocation(
    page,
    storeKey,
    store,
    website,
    itemCategory,
    broswer
  );
}

async function searchForStoreLocation(
  page: Page,
  storeKey: string,
  storeData: StoreData,
  website: string,
  itemCategory: string,
  browser: Browser
) {
  console.log("Navigated to Store Locator");
  await takeScreenshot(page, `${storeKey}_store_locator_landing`);

  const locationInputSelector =
    'input[aria-label="Enter city and state or zip code"]';

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

    console.log(`Trying location search with: ${option}`);
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
      console.warn(`No results for "${option}", trying next...`);

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
  await pickFirstStoreFromList(page, searchQuery);
  await scrapeAllPages(page, itemCategory, website, storeKey, browser);
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
    console.warn(`* Retry ${i + 1}: Waiting for ${selector}`);
    await waitForTimeout(delay);
  }
  return null;
}

async function pickFirstStoreFromList(page: Page, searchQuery: string) {
  // Wait for the first store card (highlighted one)
  await waitForSelectorWithRetry(page, "li.store.store-selected", 4, 15000);

  //5. Click on "Make This Your Store"
  const makeThisYourStoreSelector =
    "li.store.store-selected .make-this-your-store";
  await waitForSelectorWithRetry(page, makeThisYourStoreSelector, 5, 1000);

  await page.click(makeThisYourStoreSelector);

  // takeScreenshot(page, "make-this-your-store");
  console.log(`Store set to ${searchQuery}`);
}

async function autoScroll(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let totalHeight = 0;
      const distance = 300;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 200);
    });
  });
}

async function traverseForData(
  page: Page,
  itemCategory: string
): Promise<Product[]> {
  // Force scroll to load all items on the current page
  await autoScroll(page);

  const products: Product[] = [];

  // Get both normal and sponsored <li> items
  const items = await page.$$(
    `
    main li.product-list-item.product-list-item-gridView,
    main div.product-list-sponsored-wrapper-grid-view li
    `
  );

  console.log(`Found ${items.length} items on this page`);

  for (const item of items) {
    try {
      const availability = await item
        .$eval(".fulfillment p", (el) => el.textContent?.trim() || "")
        .catch(() => "");
      if (!availability.toLowerCase().includes("pick up")) continue;

      const name = await item
        .$eval(
          ".sku-block-content-title h2.product-title",
          (el) => el.textContent?.trim() || ""
        )
        .catch(() => "");

      let { currentPrice: price, originalPrice } = await item
        .$eval('[data-testid="price-presentational-testId"]', (el) => {
          const restricted = el.querySelector("#restricted-price");
          const normal = el.querySelector("span, div");
          let rawText = restricted?.textContent || normal?.textContent || "";
          rawText = rawText.trim();

          let currentPrice = "";
          let originalPrice = "";

          // Special case: Tap for price
          if (/tap for price/i.test(rawText)) {
            currentPrice = "Tap for price";
            return { currentPrice, originalPrice: "" };
          }

          // Extract current price (first number before Save/Comp. Value)
          const currentMatch = rawText.match(/\$?([\d,]+(\.\d{1,2})?)/);
          if (currentMatch) {
            currentPrice = currentMatch[1];
          }

          // Extract original price from "Comp. Value" if present
          const originalMatch = rawText.match(
            /Comp\. Value:?\s*\$?([\d,]+(\.\d{1,2})?)/i
          );
          if (originalMatch) {
            originalPrice = originalMatch[1];
          }

          return { currentPrice, originalPrice };
        })
        .catch(() => ({ currentPrice: "", originalPrice: "" }));

      const link = await item
        .$eval(
          ".sku-block-content-title a.product-list-item-link",
          (el) => el.getAttribute("href") || ""
        )
        .catch(() => "");

      const img = await item
        .$eval(
          'img[data-testid="product-image"]',
          (el) => el.getAttribute("src") || ""
        )
        .catch(() => "");

      const brand = await item
        .$eval(
          ".sku-block-content-title span.first-title",
          (el) => el.textContent?.trim() || ""
        )
        .catch(() => "");

      const skuMatch = link.match(/skuId=(\d+)/);
      const sku = skuMatch ? skuMatch[1] : "";

      // Handle "Tap for Price"
      if (!price || price.toLowerCase().includes("tap for price")) {
        const tapBtn = await item.$('button[aria-label="Tap for Price"]');
        if (tapBtn) {
          await tapBtn.click();
          await item.waitForSelector("#medium-customer-price", {
            timeout: 5000,
          });
          price = await item
            .$eval(
              "#medium-customer-price",
              (el) => el.textContent?.trim().replace("$", "") || ""
            )
            .catch(() => price);
        }
      }

      products.push({
        item_name: name,
        price,
        merchant_supplied_id: sku,
        image_url: img,
        brand,
        category: itemCategory,
      });
    } catch (err) {
      console.warn("Skipped item due to error:", err);
    }
  }

  return products;
}

async function safeGoto(page: Page, url: string, options = {}) {
  if (!url || typeof url !== "string") {
    throw new Error(`Invalid URL provided to safeGoto: ${url}`);
  }

  // If it's a relative URL, prepend BestBuy base
  if (!/^https?:\/\//i.test(url)) {
    console.warn(`Relative URL detected, prepending base: ${url}`);
    url = `https://www.bestbuy.com${url}`;
  }

  console.log(`Navigating to: ${url}`);

  try {
    await page.goto(url, {
      waitUntil: "networkidle0",
      timeout: 30000,
      ...options,
    });
  } catch (err) {
    if (err instanceof Error) {
      console.error(`Navigation failed for ${url}:`, err.message);
    }
    console.error(`Navigation failed for ${url}:`, err);
    throw err;
  }
}

async function scrapeAllPages(
  page: Page,
  itemCategory: string,
  website: string,
  storeKey: string,
  browser: Browser
) {
  const searchQuery = `${website}/site/searchpage.jsp?st=${encodeURIComponent(
    itemCategory
  )}`;

  console.log(`Searching category: ${itemCategory}`);
  await safeGoto(page, searchQuery, { waitUntil: "domcontentloaded" });

  const allProducts: Product[] = [];
  let currentPage = 1;

  while (true) {
    console.log(`Scraping page ${currentPage}...`);
    const productsOnPage = await traverseForData(page, itemCategory);
    allProducts.push(...productsOnPage);

    // If --page=N was passed and we've reached it, stop
    if (maxPages && currentPage >= maxPages) {
      console.log(`Reached CLI page limit (${maxPages}).`);
      break;
    }

    // Look for 'Next page' button
    const nextPageButton = await page.$(`a[aria-label='Next page']`);
    if (!nextPageButton) {
      console.log("No more pages found.");
      break;
    }

    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle0" }),
      nextPageButton.click(),
    ]);

    currentPage++;
  }

  const outPath = path.join("output", `bestbuy_${storeKey}.csv`);
  await writeCsv(allProducts, outPath);
  await validateMatches(outPath, "data/sample_sku_list.csv");
  await page.screenshot({ path: `screenshots/${storeKey}_store_set.png` });
  await browser.close();

  console.log(`Scraped ${allProducts.length} in-stock items for ${storeKey}`);
}
