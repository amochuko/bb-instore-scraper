import { createObjectCsvWriter } from "csv-writer";

export async function writeCsv(data: any[], outPath: string) {
  const writer = createObjectCsvWriter({
    path: outPath,
    header: [
      { id: "item_name", title: "item_name" },
      { id: "price", title: "price" },
      { id: "merchant_supplied_id", title: "merchant_supplied_id" },
      { id: "brand", title: "brand" },
      { id: "category", title: "category" },
      { id: "image_url", title: "image_url" },
    ],
  });

  await writer.writeRecords(data);
  console.log(`CSV saved to: ${outPath}`);
}
