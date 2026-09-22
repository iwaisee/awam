/**
 * Read an image file into an inline data URL, downscaled via canvas,
 * so a full-size camera photo can never blow the storage quota. Portraits are
 * cover-cropped square (no distortion in the circular frame); stamps keep
 * their aspect ratio. Falls back to the raw data URL if canvas is unusable.
 */
export async function readDownscaledDataUrl(
  file: File,
  options: { maxSize: number; square: boolean }
): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read-failed"));
    reader.readAsDataURL(file);
  });
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("decode-failed"));
      img.src = dataUrl;
    });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    if (options.square) {
      canvas.width = options.maxSize;
      canvas.height = options.maxSize;
      const scale = Math.max(
        options.maxSize / image.width,
        options.maxSize / image.height
      );
      const width = image.width * scale;
      const height = image.height * scale;
      ctx.drawImage(
        image,
        (options.maxSize - width) / 2,
        (options.maxSize - height) / 2,
        width,
        height
      );
    } else {
      const scale = Math.min(
        1,
        options.maxSize / Math.max(image.width, image.height)
      );
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    }
    return canvas.toDataURL(
      file.type === "image/png" ? "image/png" : "image/jpeg",
      0.85
    );
  } catch {
    return dataUrl;
  }
}
