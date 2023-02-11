import { ITransport } from '../types/transport';
import { Cache } from '../cache';
import axios from 'axios';

export class TwitterTransport implements ITransport {
  name = 'twitter';
  #cache: Cache;
  #onReady: Function;
  #onTweet: Function;
  #lastId: string;
  async init(cache: Cache) {
    if (!process.env.TWITTER_BEARER_TOKEN) {
      throw new Error('TWITTER_BEARER_TOKEN not found');
    }
    if (!process.env.TWITTER_HASHTAGS) {
      throw new Error('TWITTER_HASHTAGS not found');
    }
    const interval = parseInt(process.env.TWITTER_CHECK_INTERVAL || '60', 10);
    this.#cache = cache;
    this.#onReady && this.#onReady();
    console.log(`interval`, interval * 1000);
    setInterval(() => this.check(), interval * 1000);
    console.log('Twitter bot is ready');
  }

  check = async () => {
    console.log('Checking twitter...');
    const ht = process.env.TWITTER_HASHTAGS;
    const accountMinAge = parseInt(
      process.env.TWITTER_ACCOUNT_MIN_AGE || '30',
      10,
    );

    const tweets = await axios.get(
      'https://api.twitter.com/2/tweets/search/recent',
      {
        headers: {
          Authorization: `Bearer ${process.env.TWITTER_BEARER_TOKEN}`,
        },
        params: {
          query: `has:hashtags ${ht}`,
          'tweet.fields': 'author_id,created_at',
          ...(this.#lastId && { since_id: this.#lastId }),
        },
      },
    );
    if (tweets.data.meta.result_count === 0) return;
    for (const tweet of tweets.data.data) {
      console.log(tweet.text);
      const match = tweet.text.match(
        new RegExp(` (${process.env.CHAIN_PREFIX}[a-z0-9]{39,})`, ''),
      );
      if (!match || !match[1]) {
        continue;
      }
      const address = match[1];
      const user = await axios.get(
        `https://api.twitter.com/2/users/${tweet.author_id}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.TWITTER_BEARER_TOKEN}`,
          },
          params: {
            'user.fields': 'created_at,username',
          },
        },
      );

      const { username, created_at: createdAt } = user.data.data;

      if (
        new Date(createdAt).getTime() >
        Date.now() - accountMinAge * 24 * 60 * 60 * 1000
      ) {
        continue;
      }
      this.#onTweet && this.#onTweet(username, address);
    }
    this.#lastId = tweets.data.meta.newest_id;
  };

  onReady(fn = () => {}): void {
    this.#onReady = fn;
  }

  onTweet(fn): void {
    this.#onTweet = fn;
  }

  onRequest(fn): void {
    this.onTweet(async (username, address) => {
      if (!username || !address) {
        return;
      }
      console.log('going to fund ', username, address);
      const diff: number = await this.#cache.check(
        address,
        this.name,
        username
      );
      if (diff > 0) {
        return;
      }
      try {
        await fn(address);
        this.#cache.set(
          address,
          this.name,
          username,
        );
      } catch (error) {
        console.error(error);
      }
    });
  }
}
