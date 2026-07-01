export interface ImageDimensions {
  width: number;
  height: number;
}

const SCREENSHOT_SIZES: Array<[number, number]> = [
  [1170, 2532], // iPhone 12/13/14 Pro
  [1284, 2778], // iPhone 12/13/14 Pro Max
  [1080, 2340], // iPhone 11 Pro
  [828, 1792],  // iPhone XR/11
  [1125, 2436], // iPhone X/XS
  [1242, 2688], // iPhone XS Max
  [750, 1334],  // iPhone 8/SE 2nd gen
  [1080, 1920], // iPhone 8 Plus
  [390, 844],   // iPhone 12 mini logical
  [1179, 2556], // iPhone 15 Pro
  [1290, 2796], // iPhone 15 Pro Max
  [1206, 2622], // iPhone 16 Pro
  [1320, 2868], // iPhone 16 Pro Max
];

export function getImageDimensions(file: File): Promise<ImageDimensions> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Failed to load image: ${file.name}`));
    };
    img.src = url;
  });
}

export function isScreenshotByDimensions(width: number, height: number): boolean {
  return SCREENSHOT_SIZES.some(
    ([w, h]) =>
      (width === w && height === h) ||
      (width === h && height === w) // landscape screenshots
  );
}

export function isScreenshotByName(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.startsWith("screenshot") ||
    lower.includes("screen shot") ||
    lower.includes("스크린샷")
  );
}

export function isImageFile(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".png") ||
    lower.endsWith(".heic") ||
    lower.endsWith(".heif") ||
    lower.endsWith(".webp") ||
    lower.endsWith(".gif") ||
    lower.endsWith(".bmp") ||
    lower.endsWith(".tiff") ||
    lower.endsWith(".tif")
  );
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
