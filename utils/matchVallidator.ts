import csv from "csv-parser";
import fs from "node:fs";

export async function validateMatches(scrapedPath: string, samplePath: string) {
  const scrapedIds = new Set<string>();
  const samppleIds = new Set<string>();

  await new Promise<void>((res) => {
    fs.createReadStream(scrapedPath)
      .pipe(csv())
      .on("data", (row) => scrapedIds.add(row["merchant_supplied_id"]))
      .on("end", res);
  });

  await new Promise<void>((res) => {
    fs.createReadStream(samplePath)
      .pipe(csv())
      .on("data", (row) => samppleIds.add(row["merchant_supplied_id"]))
      .on("end", res);
  });

  const matched = [...samppleIds].filter((id) => scrapedIds.has(id));
  console.log(`SKU matches: ${matched.length} of ${samppleIds.size}`);
}
