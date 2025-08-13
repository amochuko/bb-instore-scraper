
# BestBuy Store-Specific Product Scraper

This scraper extracts **in-stock**, **store-specific** product data from [BestBuy.com](https://www.bestbuy.com).  
It uses **Puppeteer** with stealth capabilities and supports targeting by **store ID** or **ZIP code**.

---

## 🚀 Features
- **Store-specific targeting** via ZIP code or store ID
- **Stealth mode** to reduce bot detection
- **CAPTCHA detection** and handling
- **Retry logic** for failed requests
- **SKU match validation** from a sample list
- **Configurable via CLI** — store, category, page
- Saves **CSV output** to `/output/`
- Optional extra fields: brand, image URL
- Saves a **screenshot** after store selection confirmation

---

## 📈 How It Works (Flow)

```
[Start] 
   │
   ▼
[Set Store/ZIP in CLI]
   │
   ▼
[Puppeteer launches stealth browser]
   │
   ▼
[Select store on BestBuy site]
   │
   ▼
[Scrape products from category/search]
   │
   ▼
[Validate SKU list]
   │
   ▼
[Export CSV → /output]
   │
   ▼
[Done ✅]
```

---

## 📦 Installation

```bash
npm install
```

---

## ⚙️ Usage

```bash
npx tsx main --store sfBayArea --category tv --page 2
```

**Command breakdown:**
- `npx tsx` → Task runner
- `main` → File to execute
- `--store sfBayArea` → Store name or ZIP code
- `--category tv` → Category or search term
- `--page 2` → Number of pages to scrape (omit to scrape all)

---

## 📂 Output

The scraper saves results to the `/output/` directory in CSV format.

**CSV Columns:**
- `item_name`
- `price`
- `merchant_supplied_id`
- `brand`
- `category`
- `image_url`

---

## 📊 Example CSV Output Preview

```csv
item_name,price,merchant_supplied_id,brand,category,image_url
"Samsung 65\" Class QLED 4K Smart TV","$999.99","6401720","Samsung","Televisions","https://pisces.bbystatic.com/image2.jpg"
"LG 55\" Class OLED 4K Smart TV","$1,299.99","6384542","LG","Televisions","https://pisces.bbystatic.com/image3.jpg"
"Insignia 50\" Class F30 Series LED 4K UHD Smart Fire TV","$249.99","6430271","Insignia","Televisions","https://pisces.bbystatic.com/image4.jpg"
```

---

## 🏬 How Store Targeting Works
- Navigates to BestBuy's store selector
- Enters ZIP code or selects store ID
- Confirms selection via cookies/session

---

## ✅ SKU Match Validation
- Optionally filters scraped results to only include products whose `merchant_supplied_id` matches one listed in `data/sample_sku_list.csv`.
  
Example:

```
merchant_supplied_id
65915265
12345678
```

- This helps target specific known SKUs during scraping.
- Uses `utils/matchValidator.ts` for post-scrape validation

---

## 🔐 Resiliency
- Stealth mode enabled to reduce detection
- Built-in retry logic for failed requests
- (Note: CAPTCHA detection is not implemented yet - the flow didn't came across the need)

---

## 🌟 Bonus Features
- Store config switchable via CLI
- Screenshot saved after store confirmation
- Optional data fields: brand, image URL
- Built-in retry and error logging
