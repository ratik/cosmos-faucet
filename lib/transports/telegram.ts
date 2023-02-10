import { ITransport } from '../types/transport';
import { Cache } from '../cache';
import TelegramBot from 'node-telegram-bot-api';

export class TelegramTransport implements ITransport {
  name = 'telegram';
  #cache: Cache;
  #bot: TelegramBot;
  #onReady: Function;
  async init(cache: Cache) {
    const token = process.env.TELEGRAM_TOKEN;
    if (!token) {
      throw new Error('Telegram token not found');
    }
    this.#bot = new TelegramBot(token, { polling: true });
    this.#cache = cache;
    this.#onReady && this.#onReady();
    console.log('Telegram bot is ready');
  }

  onReady(fn = () => {}): void {
    this.#onReady = fn;
  }

  onRequest(fn): void {
    this.#bot.onText(/\/request (.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const address = match ? match[1] : '';
      const username = msg.from?.username;
      const firstName = msg.from?.first_name.replace(/[\[\]]*/g,'')
      if (!username || !address) {
        return;
      }
      const diff: number = await this.#cache.check(
        address,
        username,
        this.name,
      );
      if (diff > 0) {
        this.#bot.sendMessage(
          chatId,
          `Don't be thirsty [${firstName}](tg://user?id=${msg.from?.id}), you can request again in ${diff} minutes`,
          {
            parse_mode: 'Markdown',
          }
        );
        return;
      }
      try {
        const txHash = await fn(address);
        await this.#bot.sendMessage(
          chatId,
          `Cool! [${firstName}](tg://user?id=${msg.from?.id}) Here is your tx: ${
            process.env.EXPLORER_URL || ''
          }${txHash}`,
          {
            parse_mode: 'Markdown',
          }
        );
        this.#cache.set(address, username, this.name);
      } catch (error) {
        console.error(error);
        await this.#bot.sendMessage(
          chatId,
          `Oh no! [${firstName}](tg://user?id=${msg.from?.id}) Something went wrong!`,
          {
            parse_mode: 'Markdown',
          }
        );
      }
    });
  }
}
