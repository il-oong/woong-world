import { isImageFile } from "./image-utils";

export interface ScannedFile {
  file: File;
  path: string;
}

export async function scanDirectoryForImages(
  dirHandle: FileSystemDirectoryHandle,
  onProgress?: (count: number) => void
): Promise<ScannedFile[]> {
  const results: ScannedFile[] = [];

  async function walk(handle: FileSystemDirectoryHandle, prefix: string) {
    const dir = handle as FileSystemDirectoryHandle & AsyncIterable<[string, FileSystemHandle]>;
    for await (const [name, entry] of dir) {
      if (entry.kind === "directory") {
        await walk(entry as FileSystemDirectoryHandle, `${prefix}${name}/`);
      } else if (entry.kind === "file") {
        if (isImageFile(name)) {
          const fileHandle = entry as FileSystemFileHandle;
          const file = await fileHandle.getFile();
          results.push({ file, path: `${prefix}${name}` });
          onProgress?.(results.length);
        }
      }
    }
  }

  await walk(dirHandle, "");
  return results;
}
