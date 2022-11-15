import * as dotenv from 'dotenv';
dotenv.config({ path: '..' });
import * as transports from './lib/transports';
import { Cache } from './lib/cache';
import { Chain } from './lib/chain';

const transport = (process.env.TRANSPORT || '')
  ?.split(',')
  .map((v) => v.trim());
if (!transport?.length) {
  throw new Error('TRANSPORT is not set');
}
console.log(transport);

class Main {
  async init() {
    console.log('Starting...');
    const cache = new Cache();
    console.log('Cache initialized');
    const chain = new Chain();
    console.log('Chain start');
    if (!process.env.DROP_AMOUNT) {
      throw new Error('DROP_AMOUNT is not set');
    }
    const amount = process.env.DROP_AMOUNT;
    await chain.init();
    console.log('Chain stuff has been initialized');

    await Promise.all(
      Object.values(transports).map((t) => {
        const x = new t();
        if (!transport.includes(x.name)) return;
        x.init(cache);
        x.onRequest(async (address) => chain.fundAccount(address, amount));
      }),
    );
  }
}

new Main().init();
