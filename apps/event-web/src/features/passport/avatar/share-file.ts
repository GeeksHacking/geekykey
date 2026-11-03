interface ShareFileOptions {
  /** The share sheet's heading, where the browser shows one. */
  title?: string;
}

/**
 * Opens the phone's share sheet with `file`, or downloads it where the browser can't share
 * files. Closing the sheet isn't a failure, so it doesn't fall through to a download. The
 * object URL waits 10 seconds, so the browser has started the download before it goes.
 */
export async function shareOrDownload(file: File, { title }: ShareFileOptions = {}): Promise<void> {
  const phone = window.matchMedia("(pointer: coarse)").matches;
  if (phone && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], ...(title === undefined ? {} : { title }) });
      return;
    } catch (error) {
      // Closing the sheet is the guest saying no, not a failed save.
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }

  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
