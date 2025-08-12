import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { scrapeStore } from "./scrapers/baseScraper";

const argv = yargs(hideBin(process.argv))
  .options({
    store: {
      type: "string",
      demandOption: true,
      choices: ["sfBayArea", "minnieapolis", "dallas"],
    },
    category: {
      type: "string",
      demandOption: true,
      choices: ["tv", "computer", "accessories"],
    },
    page: {
      type: "number",
      demandOption: false,
      describe: "Page number to scrape (if omitted, all pages will be scraped)",
    },
  })
  .check((argv) => {
    if (argv.page !== undefined) {
      if (!Number.isInteger(argv.page) || argv.page < 1) {
        throw new Error(
          "The --page option must be a positive integer (e.g., 1, 2, 3, ...)"
        );
      }
    }
    return true;
  }).argv;

const { store, category, page: numOfPages } = argv as any;

if (numOfPages) {
  console.log(
    `Scraping ${numOfPages} page${numOfPages > 1 ? "s" : ""} only...`
  );
} else {
  console.log(`Scraping all pages...`);
}

const website = "https://www.bestbuy.com";
scrapeStore(website, store, category, numOfPages);
