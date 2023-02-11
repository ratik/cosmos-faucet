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
    transport: string,
    username?: string,
    userId?: string,
  ): Promise<number> {
    const vals = [
      this.#cache.get(`addr: ${address}`),
    ];
    if (username) {
      vals.push(this.#cache.get(`name: ${username}_${transport}`));
    }
    if (userId) {
      vals.push(this.#cache.get(`userId: ${userId}_${transport}`));
    }
    return Math.max(
      ...(await Promise.all(vals)).map((v) => (v || 0)),
    );
  }

  async set(
    address: string,
    transport: string,
    username?: string,
    userId?: string,
  ): Promise<void> {
    const ts = Date.now();
    await this.#cache.set(`addr: ${address}`, ts);
    if (username)
      await this.#cache.set(`name: ${username}_${transport}`, ts);
    if (userId)
      await this.#cache.set(`userId: ${userId}_${transport}`, ts);
  }

  async check(
    address: string,
    transport: string,
    username?: string,
    userId?: string,
  ): Promise<number> {
    const ts = await this.get(address,  transport, username, userId);
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
