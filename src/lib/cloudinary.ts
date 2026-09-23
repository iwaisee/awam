import { v2 as cloudinary } from "cloudinary";

/* Cloudinary is the evidence bucket for the report ledger: citizen photos
   (POST /api/reports) and squad resolution proof (PATCH after_photo_url)
   are uploaded here so Postgres stores a compact CDN URL instead of a
   multi-hundred-KB inline base64 blob. */

const FOLDERS = {
  report: "sada-e-awam/reports",
  resolution: "sada-e-awam/resolutions",
} as const;

function configure(): boolean {
  // Documented default: one CLOUDINARY_URL=cloudinary://<key>:<secret>@<cloud>
  // variable, which the SDK parses on demand.
  if (process.env.CLOUDINARY_URL?.trim()) {
    cloudinary.config({ secure: true });
    return true;
  }
  // Or the three individual credentials.
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
  if (!cloudName || !apiKey || !apiSecret) return false;
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
  return true;
}

export function isCloudinaryConfigured(): boolean {
  return configure();
}

/** Upload a data URL to Cloudinary and return its secure CDN URL. Returns
    null when credentials are missing or the upload fails — callers then
    decide between an inline fallback and warning the citizen. The
    transformation normalizes wildly different phone sensor output
    server-side, so oversized captures still land as compact URLs. */
export async function uploadReportImage(
  dataUrl: string,
  kind: keyof typeof FOLDERS
): Promise<string | null> {
  if (!dataUrl.startsWith("data:image/")) return null;
  if (!configure()) return null;
  try {
    const result = await cloudinary.uploader.upload(dataUrl, {
      folder: FOLDERS[kind],
      resource_type: "image",
      transformation: [
        {
          width: 1600,
          height: 1600,
          crop: "limit",
          quality: "auto:good",
          fetch_format: "auto",
        },
      ],
    });
    return result.secure_url || null;
  } catch (error) {
    console.error(
      `[cloudinary] ${kind} upload failed, falling back to inline data URL:`,
      error instanceof Error ? error.message : error
    );
    return null;
  }
}
