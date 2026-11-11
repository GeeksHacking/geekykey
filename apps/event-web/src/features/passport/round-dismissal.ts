export function readDismissed(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
