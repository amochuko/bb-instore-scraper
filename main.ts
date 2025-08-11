import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { scrapeStore } from "./scrapers/baseScraper";

const argv = yargs(hideBin(process.argv)).options({
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
}).argv;

const { store, category } = argv as any;

const website = "https://www.bestbuy.com";
scrapeStore(website, store, category);
