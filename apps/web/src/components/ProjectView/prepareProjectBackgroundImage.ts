import { maxProjectBackgroundImageDataUrlLength } from "@will-be-done/slices/space";
import { projectColorsFromPixels } from "@/lib/projectColors";

function sampleColors(source: CanvasImageSource) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 32;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not read image colors.");
  context.drawImage(source, 0, 0, 32, 32);
  return projectColorsFromPixels(context.getImageData(0, 0, 32, 32).data);
}

export async function inferProjectImageColors(url: string) {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.referrerPolicy = "no-referrer";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () =>
      reject(
        new Error(
          "Cannot read colors from this link. Upload the photo or choose colors manually.",
        ),
      );
    image.src = url;
  });
  return sampleColors(image);
}

const acceptedImageTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

export async function prepareProjectBackgroundImage(file: File) {
  if (!acceptedImageTypes.has(file.type)) {
    throw new Error("Choose a JPEG, PNG, WebP or AVIF photo.");
  }
  if (file.size > 20 * 1024 * 1024) {
    throw new Error("Choose a photo smaller than 20 MB.");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Could not read this photo. Try a different image.");
  }

  try {
    const colors = sampleColors(bitmap);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("Could not prepare the photo in this browser.");
    let scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));

    for (let attempt = 0; attempt < 8; attempt++) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.fillStyle = "#0a0a0f";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.82),
      );
      if (!blob)
        throw new Error("Could not prepare the photo. Try a different image.");
      if (
        4 * Math.ceil(blob.size / 3) + "data:image/jpeg;base64,".length <=
        maxProjectBackgroundImageDataUrlLength
      ) {
        const imageUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            typeof reader.result === "string"
              ? resolve(reader.result)
              : reject(new Error("Could not read the prepared photo."));
          reader.onerror = () =>
            reject(new Error("Could not read the prepared photo."));
          reader.readAsDataURL(blob);
        });
        return { imageUrl, ...colors };
      }
      scale *= 0.75;
    }
    throw new Error("This photo is too large. Try a smaller image.");
  } finally {
    bitmap.close();
  }
}
