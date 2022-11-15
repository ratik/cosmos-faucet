export interface ICache {
  get: (
    address: string,
    username: string,
    transport: string,
  ) => Promise<number>;
  set: (address: string, username: string, transport: string) => Promise<void>;
}
