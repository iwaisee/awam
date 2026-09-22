/* Cloudinary credential health check: loads .env.local, uploads a tiny test
   image to sada-e-awam/_healthcheck, prints the delivered CDN URL, then
   deletes the asset so the media library stays clean. Run with:
   node scripts/cloudinary-check.mjs */

import { config } from "dotenv";
import { v2 as cloudinary } from "cloudinary";

config({ path: ".env.local" });

const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
const cloudUrl = process.env.CLOUDINARY_URL?.trim();

if (!cloudUrl && !(cloudName && apiKey && apiSecret)) {
  console.error(
    "Missing Cloudinary credentials. Set CLOUDINARY_URL or " +
      "CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET in .env.local"
  );
  process.exit(1);
}

cloudinary.config({
  ...(cloudName && { cloud_name: cloudName }),
  ...(apiKey && { api_key: apiKey }),
  ...(apiSecret && { api_secret: apiSecret }),
  secure: true,
});

// 1x1 transparent PNG
const TEST_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

try {
  const upload = await cloudinary.uploader.upload(TEST_PNG, {
    folder: "sada-e-awam/_healthcheck",
    resource_type: "image",
  });
  console.log("Upload OK");
  console.log("  secure_url :", upload.secure_url);
  console.log("  public_id  :", upload.public_id);

  const destroy = await cloudinary.uploader.destroy(upload.public_id);
  console.log("Cleanup    :", destroy.result === "ok" ? "test asset deleted" : destroy.result);
} catch (error) {
  console.error("Upload FAILED:", error?.message ?? error);
  process.exit(1);
}
