import fs from "fs";
import csv from "csv-parser";

export async function validateMatches(scrapedPath: string, samplePath: string) {
  // Ensure folder exists
  const sampleDir = samplePath.split("/").slice(0, -1).join("/");
  if (!fs.existsSync(sampleDir)) {
    fs.mkdirSync(sampleDir, { recursive: true });
  }

  // If the file doesn't exist, create it with just the header
  if (!fs.existsSync(samplePath)) {
    fs.writeFileSync(samplePath, "merchant_supplied_id\n");
    console.warn(`Sample SKU file not found, created new one: ${samplePath}`);
  }

  const scrapedIds = new Set<string>();
  const sampleIds = new Set<string>();

  await new Promise<void>((res) => {
    fs.createReadStream(scrapedPath)
      .pipe(csv())
      .on("data", (row) => scrapedIds.add(row["merchant_supplied_id"]))
      .on("end", res);
  });

  await new Promise<void>((res) => {
    fs.createReadStream(samplePath)
      .pipe(csv())
      .on("data", (row) => sampleIds.add(row["merchant_supplied_id"]))
      .on("end", res);
  });

  const matched = [...sampleIds].filter((id) => scrapedIds.has(id));
  console.log(`SKU matches: ${matched.length} of ${sampleIds.size}`);
}
