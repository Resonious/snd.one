// A "pipe" represents a named notification channel or whatever.

import { push } from "./push";

// Something you can send or subscribe to.
export class Pipe implements DurableObject {
  state: DurableObjectState
  env: SndEnv

  constructor(state: DurableObjectState, env: SndEnv) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Self destruct after 24 hours of inactivity
    this.state.storage.setAlarm(Date.now() + 24 * 60 * 60 * 1000);

    // POST /check (doesn't actually change any data..)
    if (request.method === 'POST' && url.pathname === '/check') {
      const [subscription, subscriptions] = await Promise.all([
        request.json().then(x => x as Subscription),
        this.state.storage.get<Record<string, Subscription>>('subscriptions').then(x => x ?? {}),
      ]);
      if (subscription && subscriptions[subscription.endpoint]) {
        return new Response('{"subscribed":true}', { status: 200 });
      } else {
        return new Response('{"subscribed":false}', { status: 200 });
      }
    }

    // POST /subscribe
    if (request.method === 'POST' && url.pathname === '/subscribe') {
      const [subscription, subscriptions] = await Promise.all([
        request.json().then(x => x as Subscription),
        this.state.storage.get<Record<string, Subscription>>('subscriptions').then(x => x ?? {}),
      ]);
      subscriptions[subscription.endpoint] = subscription;
      await this.state.storage.put('subscriptions', subscriptions);
      return new Response('', { status: 204 });
    }

    // POST /unsubscribe (pretty much copypasta)
    if (request.method === 'POST' && url.pathname === '/unsubscribe') {
      const [subscription, subscriptions] = await Promise.all([
        request.json().then(x => x as Subscription),
        this.state.storage.get<Record<string, Subscription>>('subscriptions').then(x => x ?? {}),
      ]);
      delete subscriptions[subscription.endpoint];
      await this.state.storage.put('subscriptions', subscriptions);
      return new Response('', { status: 204 });
    }

    // POST /send
    if (request.method === 'POST' && url.pathname === '/send') {
      const text = await request.text();
      this.state.storage.put('data', text);

      const headerLines = [];
      let pipeURL: string | undefined;
      for (const header of request.headers) {
        if (header[0].startsWith('cf-') || header[0].startsWith('snd-')) {
          if (header[0] === 'cf-ipcountry') {
            headerLines.push(`x-country: ${header[1]}`);
          }
          else if (header[0] === 'snd-pipe-url') {
            pipeURL = header[1];
          }
          continue;
        }

        headerLines.push(`${header[0]}: ${header[1]}`);
      }
      this.state.storage.put('headers', headerLines.join("\n"));

      // Push notifications to all subscribers
      this.state.storage.get<Record<string, Subscription>>('subscriptions').then(async subscriptions => {
        if (!subscriptions) return;

        let modified = false;
        for (const k in subscriptions) {
          const result = await push(subscriptions[k], this.env, {
            url: pipeURL ?? '',
            text,
          });

          // This probably means the subscription is no longer valid and we can remove it
          if (result.status >= 400 && result.status < 500) {
            console.log('Cleaning up invalid subscription for', pipeURL);
            delete subscriptions[k];
            modified = true;
          }
        }

        if (modified) {
          await this.state.storage.put('subscriptions', subscriptions);
        }
      });

      return new Response('', { status: 204 });
    }

    // GET /data
    if (request.method === 'GET' && url.pathname === '/data') {
      const contents = await this.state.storage.get<string>('data');
      return new Response(JSON.stringify(contents));
    }

    // GET /headers
    if (request.method === 'GET' && url.pathname === '/headers') {
      const contents = await this.state.storage.get<string>('headers');
      return new Response(contents ?? '');
    }

    return new Response('???', { status: 404 });
  }

  // Self-destruct on alarm!!
  async alarm(): Promise<void> {
    console.log(`Deleting pipe ${this.state.id}`);
    await this.state.storage.deleteAll();
  }
}