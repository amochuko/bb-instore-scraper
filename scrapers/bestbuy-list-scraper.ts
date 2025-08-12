// bestbuy-list-scraper.ts
import puppeteer, { Page } from "puppeteer";

type Product = {
  sku: string | null;
  title: string | null;
  url: string | null;
  price: number | null;
  rating: number | null;
  reviewsCount: number | null;
  image: string | null;
  availability: string | null;
  model: string | null;
};

async function autoScroll(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let total = 0;
      const distance = 600;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        total += distance;
        if (total >= scrollHeight - window.innerHeight - 100) {
          clearInterval(timer);
          resolve();
        }
      }, 150);
    });
  });
}

async function extractProductsFromPage(page: Page): Promise<Product[]> {
  // Wait for grid/list to be present (both legacy and newer selectors)
  await page.waitForSelector(
    "li.sku-item, .sku-item, [data-automation='product-list'] [data-sku-id]",
    { timeout: 15000 }
  );

  const products = await page.$$eval(
    "li.sku-item, .sku-item, [data-sku-id]",
    (cards) =>
      cards.map((item) => {
        const $ = (sel: string) =>
          item.querySelector(sel) as HTMLElement | null;
        const txt = (sel: string) => $(sel)?.textContent?.trim() || null;
        const attr = (sel: string, a: string) =>
          $(sel)?.getAttribute(a) || null;

        // SKU (BestBuy often exposes data-sku-id on the container)
        const sku =
          item.getAttribute("data-sku-id") ||
          attr("[data-sku-id]", "data-sku-id") ||
          txt(".sku-model .sku-value") ||
          txt(".sku-attributes .model-number .sku-value") ||
          null;

        // Title + URL
        const titleAnchor =
          (item.querySelector(
            "h4.sku-title a, h4[class*='sku-title'] a, h3[class*='sku-title'] a, a[data-automation='product-title']"
          ) as HTMLAnchorElement | null) ||
          (item.querySelector(
            "h4.sku-title, h4[class*='sku-title'], h3[class*='sku-title']"
          ) as HTMLElement | null);

        const title = titleAnchor
          ? ("href" in titleAnchor
              ? (titleAnchor as HTMLAnchorElement).textContent?.trim()
              : titleAnchor.textContent?.trim()) || null
          : null;

        const url =
          titleAnchor && "href" in titleAnchor
            ? new URL(
                (titleAnchor as HTMLAnchorElement).getAttribute("href") || "",
                location.origin
              ).href
            : null;

        // Price (multiple resilient paths)
        const priceText =
          txt(".priceView-hero-price span[aria-hidden='true']") ||
          txt(".priceView-customer-price span[aria-hidden='true']") ||
          txt("[data-testid='customer-price'] span") ||
          txt(".pricing-price__regular-price") ||
          txt("[data-automation='pricing-price']") ||
          null;

        const price = priceText
          ? Number(
              (priceText.match(/[\d,.]+/)?.[0] || "0").replace(/[,]/g, "")
            ) || null
          : null;

        // Rating + Reviews
        const ratingText =
          txt("[data-testid='rating-stars'] ~ p") ||
          txt(".c-review-average") ||
          txt(".rating-reviews .sr-only") ||
          txt("[data-automation='rating-count'] ~ *") ||
          null;

        const rating = ratingText
          ? parseFloat((ratingText.match(/[\d.]+/) || [])[0] || "") || null
          : null;

        const reviewsText =
          txt("[data-testid='reviews-count']") ||
          txt(".c-total-reviews") ||
          txt(".rating-reviews a") ||
          txt("[data-automation='rating-count']") ||
          null;

        const reviewsCount = reviewsText
          ? parseInt(reviewsText.replace(/[^\d]/g, "") || "0", 10) || null
          : null;

        // Image (handle lazy attrs)
        const img =
          (item.querySelector(
            "img.product-image, img[class*='product-image'], img"
          ) as HTMLImageElement | null) || null;
        const image =
          img?.getAttribute("src") ||
          img?.getAttribute("data-src") ||
          img?.getAttribute("data-lazy") ||
          img?.getAttribute("data-original") ||
          null;

        // Availability / Fulfillment
        const availability =
          txt(".fulfillment-availability") ||
          txt("[data-automation='fulfillment-availability']") ||
          txt(".add-to-cart-button") ||
          txt("[data-automation='fulfillment-fulfillment-summary']") ||
          null;

        // Model
        const model =
          txt(".sku-model .sku-value") ||
          txt(".sku-attributes .model-number .sku-value") ||
          txt("[data-automation='model-number']") ||
          null;

        return {
          sku,
          title,
          url,
          price,
          rating,
          reviewsCount,
          image,
          availability,
          model,
        };
      })
  );

  return products;
}

async function goNextPage(page: Page): Promise<boolean> {
  // Try various "Next" controls; skip if disabled/hidden
  const nextSelectors = [
    "a[aria-label='Next']", // common accessible pagination
    "button[aria-label='Next']",
    ".pagination__item--next a",
    "[data-automation='pagination-next'] a, [data-automation='pagination-next'] button",
  ];

  for (const sel of nextSelectors) {
    const el = await page.$(sel);
    if (el) {
      const disabled = await page.evaluate(
        (n) =>
          n.getAttribute("aria-disabled") === "true" ||
          n.hasAttribute("disabled"),
        el
      );
      const hidden = await page.evaluate(
        (n) =>
          window.getComputedStyle(n).display === "none" ||
          (n as HTMLElement).offsetParent === null,
        el as any
      );
      if (!disabled && !hidden) {
        await Promise.all([
          el.click(),
          page.waitForNavigation({ waitUntil: "networkidle2" }),
        ]);
        return true;
      }
    }
  }
  return false;
}

export async function scrapeBestBuyCategory(startUrl: string, maxPages = 5) {
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1366, height: 900 },
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
  );
  await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });

  // Optional: block fonts to speed things up (keep images for image URLs)
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    if (["font"].includes(req.resourceType())) req.abort();
    else req.continue();
  });

  const all: Product[] = [];
  try {
    await page.goto(startUrl, { waitUntil: "networkidle2", timeout: 60000 });
    for (let i = 0; i < maxPages; i++) {
      await autoScroll(page); // ensure lazy content is loaded
      const products = await extractProductsFromPage(page);
      all.push(...products);

      const moved = await goNextPage(page);
      if (!moved) break;
    }
  } finally {
    await browser.close();
  }
  return dedupeBySkuOrUrl(all);
}

function dedupeBySkuOrUrl(items: Product[]): Product[] {
  const seen = new Set<string>();
  const out: Product[] = [];
  for (const p of items) {
    const key = p.sku || p.url || JSON.stringify([p.title, p.price]);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

const parsePrice = (txt?: string | null) => {
  if (!txt) return null;
  const m = txt.replace(/\s+/g, " ").match(/\$[\d,]+(\.\d{2})?/);
  return m ? Number(m[0].replace(/[^0-9.]/g, "")) : null;
};

export async function scrapeBestBuyList(url: string) {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await autoScroll(page);
  await page
    .waitForSelector("main.product-grid-view-container", { timeout: 15000 })
    .catch(() => {});

  const products = await page.$$eval(
    // Grab all product <li> regardless of sponsored wrappers or intervening <div>s
    "main.product-grid-view-container li.product-list-item.product-list-item-gridView",
    (nodes) =>
      nodes.map((el) => {
        const getAttr = (n: Element, a: string) => n.getAttribute(a) || null;
        const text = (sel: string) =>
          el.querySelector(sel)?.textContent?.trim() || null;
        const textAll = (sel: string) =>
          Array.from(el.querySelectorAll(sel))
            .map((n) => n.textContent?.trim())
            .filter(Boolean) as string[];

        // IDs can be data-testid or data-test-id
        const id =
          getAttr(el, "data-testid") || getAttr(el, "data-test-id") || null;

        // Links: prefer title link, fallback to image link
        const linkEl =
          el.querySelector<HTMLAnchorElement>("a.product-list-item-link") ||
          el.querySelector<HTMLAnchorElement>(".product-image a");
        const url = linkEl?.href || null;

        // Title + brand
        const title = text("h2.product-title") || null;
        const brand = text("h2.product-title .first-title") || null;

        // Image
        const imgEl = el.querySelector<HTMLImageElement>(
          'img[data-testid="product-image"]'
        );
        const image = imgEl?.src || null;

        // Price states
        const customerPriceText =
          text('[data-testid="medium-customer-price"]') ||
          text("#medium-customer-price") ||
          text('[data-testid="open-box-large-customer-price"]');

        const restrictedText =
          text('[data-testid="restricted-price"]') || text("#restricted-price");
        const price = restrictedText?.toLowerCase().includes("tap for price")
          ? null
          : parseFloat(
              String(
                customerPriceText && customerPriceText.replace(/[^\d.]/g, "")
              )
            ) || null;

        // Savings and compare-at
        const savings = text(".offer-price") || null; // e.g., "Save $30"
        const compareAtText = text(".regular-price") || null;
        const compareAt =
          parseFloat(
            String(compareAtText && compareAtText.replace(/[^\d.]/g, ""))
          ) || null;

        // Rating and reviews: from visually hidden or visible spans
        const ratingHidden = text(".c-ratings-reviews .visually-hidden");
        let rating: number | null = null;
        let reviewsCount: number | null = null;
        if (ratingHidden) {
          const m = ratingHidden.match(
            /Rating\s+([\d.]+)\s+out of 5.*?with\s+([\d,]+)/i
          );
          if (m) {
            rating = parseFloat(m[1]);
            reviewsCount = parseInt(m[2].replace(/,/g, ""), 10);
          }
        }
        if (rating === null) {
          const rTxt = text(".c-ratings-reviews .order-1");
          rating = rTxt ? parseFloat(rTxt) : null;
        }
        if (reviewsCount === null) {
          const rcTxt = text(".c-ratings-reviews .c-reviews");
          const m = rcTxt?.match(/\(([\d,]+)\s*reviews?\)/i);
          reviewsCount = m ? parseInt(m[1].replace(/,/g, ""), 10) : null;
        }

        // Open box
        const openBoxText = text('[data-testid="buying-option-text"]') || null;
        const openBoxLink =
          el.querySelector<HTMLAnchorElement>(
            '[data-testid="buying-option-link"]'
          )?.href || null;

        // Fulfillment info: capture all lines
        const fulfillment = textAll(".fulfillment p").join(" | ") || null;

        // CTA presence
        const hasAddToCart = !!el.querySelector('[data-test-id="add-to-cart"]');
        const hasFindStore = !!el.querySelector(
          '[data-test-id="find-a-store"]'
        );

        // Sponsored flag
        const sponsored = !!el.querySelector(".sponsored");

        return {
          id,
          url,
          title,
          brand,
          image,
          price,
          restrictedPrice: !!restrictedText,
          savingsText: savings,
          compareAt,
          rating,
          reviewsCount,
          openBoxText,
          openBoxLink,
          fulfillment,
          hasAddToCart,
          hasFindStore,
          sponsored,
        };
      })
  );

  await browser.close();
  return products;
}

// Example usage:
(async () => {
//   const results = await scrapeBestBuyCategory("https://www.bestbuy.com/site/searchpage.jsp?st=laptop");
  const results = await scrapeBestBuyList(
    "https://www.bestbuy.com/site/searchpage.jsp?st=laptop"
  );
  console.log(results);
})();
