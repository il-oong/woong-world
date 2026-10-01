export function allowedSheetUrl(raw: string, redirected = false): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    if (redirected) {
      if (url.hostname !== "docs.google.com" && !url.hostname.endsWith(".googleusercontent.com")) return null;
    } else if (url.hostname !== "docs.google.com" || !url.pathname.startsWith("/spreadsheets/")) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}
