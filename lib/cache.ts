import c, { FileSystemCache } from 'file-system-cache';
import { ICache } from './types/cache';

export class Cache implements ICache {
  #cache: FileSystemCache;
  #timeout: number;
  constructor() {
    this.#cache = c({
      basePath: process.env.STORAGE || './.cache',
    });
    this.#timeout = parseInt(process.env.TIMEOUT || '24', 10);
  }

  async get(
    address: string,
    username: string,
    transport: string,
  ): Promise<number> {
    return Math.max(
      (await this.#cache.get(`addr: ${address}`)) || 0,
      (await this.#cache.get(`name: ${username}_${transport}`)) || 0,
      0,
    );
  }

  async set(
    address: string,
    username: string,
    transport: string,
  ): Promise<void> {
    const ts = Date.now();
    await this.#cache.set(`addr: ${address}`, ts);
    await this.#cache.set(`name: ${username}_${transport}`, ts);
  }

  async check(
    address: string,
    username: string,
    transport: string,
  ): Promise<number> {
    const ts = await this.get(address, username, transport);
    if (!ts) {
      return -1;
    }
    if (Date.now() - ts < this.#timeout * 60 * 60 * 1000) {
      return Math.round(
        (ts + this.#timeout * 60 * 60 * 1000 - Date.now()) / 1000 / 60,
      );
    }
    return 0;
  }
}
