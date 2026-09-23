import { v2 as cloudinary } from "cloudinary";

/* Cloudinary is the image bucket for the citizen-facing product: report
   evidence (POST /api/reports), squad resolution proof (PATCH
   after_photo_url) and citizen portraits (POST /api/auth/avatar) are uploaded
   here so Postgres stores a compact CDN URL instead of a multi-hundred-KB
   inline base64 blob. */

const FOLDERS = {
  report: "sada-e-awam/reports",
  resolution: "sada-e-awam/resolutions",
  avatar: "sada-e-awam/avatars",
} as const;

/** Per-kind normalisation: evidence keeps its detail at print size, a portrait
    only ever renders inside a 32–56px circle, so it is face-cropped small. */
const TRANSFORMATIONS: Record<keyof typeof FOLDERS, Record<string, unknown>[]> = {
  report: [{ width: 1600, height: 1600, crop: "limit" }],
  resolution: [{ width: 1600, height: 1600, crop: "limit" }],
  avatar: [{ width: 400, height: 400, crop: "fill", gravity: "face" }],
};

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
    decide between an inline fallback and warning the uploader. The
    transformation normalises wildly different phone sensor output
    server-side, so oversized captures still land as compact URLs. */
export async function uploadImage(
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
        ...TRANSFORMATIONS[kind],
        { quality: "auto:good", fetch_format: "auto" },
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

/** Reverse a CDN URL we issued back into its public id — and only when it is
    unmistakably ours: our cloud, the image/upload path, one of our folders. An
    inline data URL (the no-credentials fallback) or a link to anything else
    returns null, so a stored value can never be talked into deleting a foreign
    asset. */
export function ownPublicId(url: string): string | null {
  if (!configure()) return null;
  const cloud = cloudinary.config().cloud_name;
  if (!cloud) return null;
  const prefix = `https://res.cloudinary.com/${cloud}/image/upload/`;
  if (!url.startsWith(prefix)) return null;
  const rest = url.slice(prefix.length).replace(/^v\d+\//, "");
  const publicId = rest.split("?")[0].replace(/\.[^./]+$/, "");
  return Object.values(FOLDERS).some((folder) => publicId.startsWith(`${folder}/`))
    ? publicId
    : null;
}

/** Best-effort delete of an asset we uploaded earlier. False means "nothing was
    ours to delete" (or Cloudinary refused) — callers clear their own state
    first and must not surface this as a citizen-facing failure. */
export async function deleteImage(url: string): Promise<boolean> {
  const publicId = ownPublicId(url);
  if (!publicId) return false;
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return (result as { result?: string }).result === "ok";
  } catch (error) {
    console.error(
      `[cloudinary] destroy failed for ${publicId}:`,
      error instanceof Error ? error.message : error
    );
    return false;
  }
}
