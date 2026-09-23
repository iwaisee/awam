import { NextResponse } from "next/server";
import {
  deleteImage,
  isCloudinaryConfigured,
  uploadImage,
} from "@/lib/cloudinary";
import { verifySession } from "@/lib/auth/session";
import { setCitizenAvatarUrl } from "@/lib/auth/usersDb";
import { avatarUploadSchema, fieldErrorsFrom } from "@/lib/auth/schemas";

/* Portrait upload for the signed-in citizen.

   The picker sends a canvas-downscaled data URL; this route is the only writer
   of `citizen_users.avatar_url`. Cloudinary gets the bytes and the row keeps
   its CDN URL, so a profile picture costs the ledger a string rather than a
   multi-megabyte base64 blob. Without credentials (local runs) the data URL is
   stored inline when it is small enough, mirroring the evidence-photo policy in
   POST /api/reports — the citizen's edit is never silently dropped. Whichever
   way the portrait changes, the asset the account pointed at before is
   destroyed, so neither a replacement nor a DELETE leaves a file behind:
   DELETE clears the column back to the initials monogram, POST swaps it. */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Inline fallback ceiling — a 400px square JPEG sits far under this. */
const MAX_INLINE_CHARS = 2_000_000;

export async function POST(request: Request) {
  const user = await verifySession();
  if (!user) {
    return NextResponse.json(
      { success: false, error: "Sign in to change your profile photo." },
      { status: 401 }
    );
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = avatarUploadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Check the image and try again.",
        field_errors: fieldErrorsFrom(parsed.error),
      },
      { status: 422 }
    );
  }

  const { image } = parsed.data;
  const url = isCloudinaryConfigured()
    ? await uploadImage(image, "avatar")
    : null;
  if (!url && image.length > MAX_INLINE_CHARS) {
    return NextResponse.json(
      {
        success: false,
        error: "Could not upload that photo — pick a smaller image.",
      },
      { status: 413 }
    );
  }

  try {
    const stored = url ?? image;
    await setCitizenAvatarUrl(user, stored);
    /* The picture this account pointed at is now unreferenced, so it is
       destroyed as well — otherwise every replacement leaks an asset. Column
       first, asset second, exactly as in DELETE below. */
    if (user.avatarUrl && user.avatarUrl !== stored) {
      await deleteImage(user.avatarUrl);
    }
    return NextResponse.json({ success: true, url: stored });
  } catch (error) {
    console.error("[api/auth/avatar] POST", error);
    return NextResponse.json(
      { success: false, error: "Could not save your profile photo." },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const user = await verifySession();
  if (!user) {
    return NextResponse.json(
      { success: false, error: "Sign in to change your profile photo." },
      { status: 401 }
    );
  }

  try {
    /* Column first, asset second: a photo the citizen removed but still sees
       would be a bug, an orphaned asset is only a billing nit — and a destroy
       that fails (or had nothing of ours to delete) must not fail the request. */
    await setCitizenAvatarUrl(user, "");
    await deleteImage(user.avatarUrl);
    return NextResponse.json({ success: true, url: "" });
  } catch (error) {
    console.error("[api/auth/avatar] DELETE", error);
    return NextResponse.json(
      { success: false, error: "Could not remove your profile photo." },
      { status: 500 }
    );
  }
}
