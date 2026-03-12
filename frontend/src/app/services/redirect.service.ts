import { Injectable } from '@angular/core';

const STORAGE_KEY = 'returnUrl';
const BLOCKED_RETURN_URL_PREFIXES = ['/login', '/signup', '/verify-email', '/email-not-verified'];

@Injectable({ providedIn: 'root' })
export class RedirectService {
  /**
   * Stores a safe return URL for later navigation.
   * @param url Candidate application URL.
   */
  set(url: string) {
    if (!this.isSafeReturnUrl(url)) {
      this.clear();
      return;
    }

    try {
      sessionStorage.setItem(STORAGE_KEY, url);
    } catch (e) {
      // ignore storage errors
    }
  }

  /**
   * Reads the currently stored return URL when it is still safe to use.
   * @returns The stored application URL or `null`.
   */
  get(): string | null {
    try {
      const url = sessionStorage.getItem(STORAGE_KEY);
      return this.isSafeReturnUrl(url) ? url : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Removes the stored return URL from session storage.
   */
  clear(): void {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      // ignore
    }
  }

  /**
   * Checks whether a URL can safely be reused as an internal return target.
   * @param url Candidate application URL.
   * @returns `true` when the URL is an allowed local route.
   */
  private isSafeReturnUrl(url: string | null): url is string {
    if (!url || !url.startsWith('/')) {
      return false;
    }

    return !BLOCKED_RETURN_URL_PREFIXES.some((prefix) => url === prefix || url.startsWith(`${prefix}?`) || url.startsWith(`${prefix}/`));
  }
}
