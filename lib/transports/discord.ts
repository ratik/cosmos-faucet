import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
} from 'discord.js';
import { ITransport } from '../types/transport';
import { Cache } from '../cache';

export class DiscordTransport implements ITransport {
  name = 'discord';
  #cache: Cache;
  #client: Client;
  #token: string;
  #appId: string;
  #onReady: Function;
  #channelName: string;
  async init(cache: Cache) {
    if (!process.env.DISCORD_TOKEN) {
      throw new Error('DISCORD_TOKEN is not set');
    }
    if (!process.env.DISCORD_APP_ID) {
      throw new Error('DISCORD_APP_ID is not set');
    }
    if (!process.env.DISCORD_CHANNEL_NAME) {
      throw new Error('DISCORD_CHANNEL_NAME is not set');
    }
    this.#token = process.env.DISCORD_TOKEN;
    this.#appId = process.env.DISCORD_APP_ID;
    this.#channelName = process.env.DISCORD_CHANNEL_NAME;
    this.#cache = cache;

    this.#client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    this.#client.on('ready', async () => {
      const commands = [
      ];
      //update slash commands
      try {
        const rest = new REST({ version: '10' }).setToken(this.#token);
        await rest.put(Routes.applicationCommands(this.#appId), {
          body: commands,
        });
      } catch (error) {
        console.error(error);
      }
      this.#onReady && this.#onReady();
      console.log('Discord bot is ready');
    });
    this.#client.login(this.#token);
  }

  onReady(fn = () => {}): void {
    this.#onReady = fn;
  }

  onRequest(fn): void {
    this.#client.on('messageCreate', async (msg) => {
      console.log("got message");
      if (msg.author.bot) return;
      if (msg.content.startsWith('!$request')) return;
      const channelName = msg.guild?.channels.cache.get(msg.channelId)?.name;
      if (!channelName ||  !channelName.includes(this.#channelName)) {
	      return;
      }
      const match = msg.content.match(/\$request\s+(.+)/);
      if (!match || !match[1]) return;
      const address = match[1];
      const username = msg.author.username;
      const diff: number = await this.#cache.check(
        address,
        this.name,
        username,
        msg.author.id,
      );
      if (diff > 0) {
        msg.reply(
          `Don't be thirsty @${username}, you can request again in ${diff} minutes`,
        );
        return;
      }
      try {
        const txHash = await fn(address);
        await msg.reply(
          `Cool! @${username} Here is your tx: ${
            process.env.EXPLORER_URL || ''
          }${txHash}`,
        );
        this.#cache.set(address, this.name, username, msg.author.id);
      } catch (error) {
        console.error(error);
        await msg.reply(`Oh no! @${username} Something went wrong!`);
      }
    });
  }
}
