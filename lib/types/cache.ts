export interface ICache {
  get: (
    address: string,
    username: string,
    transport: string,
    userId?: string,
  ) => Promise<number>;
  set: (address: string, username: string, transport: string) => Promise<void>;
}
