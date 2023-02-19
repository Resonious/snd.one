// A "pipe" represents a named notification channel or whatever.
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

    // POST /send
    if (request.method === 'POST' && url.pathname === '/send') {
      this.state.storage.put('data', await request.text());
      return new Response('', { status: 204 });
    }

    // GET /data
    if (request.method === 'GET' && url.pathname === '/data') {
      const contents = await this.state.storage.get<string>('data');
      return new Response(JSON.stringify(contents));
    }

    return new Response('Hello from a Durable Object!');
  }

  // Self-destruct on alarm!!
  async alarm(): Promise<void> {
    await this.state.storage.deleteAll();
  }
}