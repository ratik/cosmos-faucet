import { Cache } from '../cache';
type onRequest = (address: string) => Promise<string>;
export interface ITransport {
  name: string;
  init: (cache: Cache) => Promise<void>;
  onReady(fn: () => void): void;
  onRequest(fn: onRequest): void;
}
