import { getAssetFromKV, NotFoundError } from '@cloudflare/kv-asset-handler'

// @ts-ignore
import qrcode from 'qrcode-terminal';

export { Pipe } from './pipe';

/*****************************************
 * BEGIN Cloudflare Sites boilerplate
 *****************************************/
// @ts-ignore
import manifestJSON from '__STATIC_CONTENT_MANIFEST'
import { genkeys } from './push';
const assetManifest = JSON.parse(manifestJSON)

// @ts-ignore
function assetOptions(env, rest) {
  return Object.assign(
    {
      ASSET_NAMESPACE: env.__STATIC_CONTENT,
      ASSET_MANIFEST: assetManifest,
    },
    rest
  );
}
/*****************************************
 * END Cloudflare Sites boilerplate
 *****************************************/

export default {
  async fetch(request: Request, env: SndEnv, ctx: ExecutionContext) {
    const action = request.headers.get('snd-action');
    if (action) {
      return await handleAction(action, request, env, ctx);
    }

    if (request.method === 'POST') {
      if (request.url.endsWith('/_genkeys')) {
        const keys = await genkeys();
        return new Response(JSON.stringify(keys), { status: 200 });
      }

      return await handlePipeSend(request, env, ctx);
    } else {
      return await handleBrowserContentRequest(request, env, ctx);
    }
  },
};

// Handles subscribe/unsubscribe requests from the browser
async function handleAction(action: string, request: Request, env: SndEnv, ctx: ExecutionContext) {
  const url = new URL(request.url);
  const path = cleanPathname(url);

  const pipe = pipeFromPath(path, env);

  if (action === 'subscribe') {
    var pipeURL = 'https://pipe/subscribe';
  } else if (action === 'unsubscribe') {
    var pipeURL = 'https://pipe/unsubscribe';
  } else if (action === 'check') {
    var pipeURL = 'https://pipe/check';
  } else {
    return new Response('Invalid action', { status: 400 });
  }

  return await pipe.fetch(pipeURL, {
    method: request.method,
    body: request.body,
    headers: request.headers,
  });
}

// Handles POST requests. All POSTs will just send through a pipe
async function handlePipeSend(request: Request, env: SndEnv, ctx: ExecutionContext) {
  const url = new URL(request.url);
  const path = cleanPathname(url);
  const pipe = pipeFromPath(path, env);

  const pipeURL = new URL(request.url);
  pipeURL.pathname = `/p${path}`;

  const pipeHeaders = new Headers(request.headers);
  pipeHeaders.append('snd-pipe-url', pipeURL.toString());

  const pipeResponse = await pipe.fetch('https://pipe/send', {
    method: 'POST',
    body: request.body,
    headers: pipeHeaders,
  });
  if (pipeResponse.status >= 300) {
    throw new Error('Pipe send failed');
  }

  const { readable, writable } = new TransformStream();

  // Write QR code to response in background
  const promise = new Promise<void>((resolve, _reject) => {
    const textEncoder = new TextEncoder();

    const writer = writable.getWriter();
    writer.write(textEncoder.encode(pipeURL.toString() + "\n"));

    qrcode.generate(pipeURL.toString(), { small: true }, (qr: string) => {
      writer.write(textEncoder.encode(qr));
      writer.close();
      resolve();
    });
  });

  // Send response headers right away
  ctx.waitUntil(promise);
  return new Response(readable, {
    status: 200,
    headers: {
      'content-type': 'text/plain',
    }
  });
}

// Handles GET requests from browser
async function handleBrowserContentRequest(request: Request, env: SndEnv, ctx: ExecutionContext) {
  // This is a weird backward-compatibility object needed by getAssetFromKV.
  const evt = {
    request,
    waitUntil: ctx.waitUntil.bind(ctx)
  };
  const url = new URL(request.url);
  const path = cleanPathname(url);

  // Pipe view
  if (path.startsWith('/p/')) {
    // If there was no static page at this path, we treat it as a pipe since they can have any name
    const pipe = pipeFromPath(path, env);
    const pipeData = pipe.fetch('https://pipe/data').then(r => r.text());
    const pipeHeaders = pipe.fetch('https://pipe/headers').then(r => r.text());

    const pipeHtmlURL = new URL(request.url);
    pipeHtmlURL.pathname = '/pipe.html';
    evt.request = new Request(pipeHtmlURL.toString(), request);
    const pipeHtml = await getAssetFromKV(evt, assetOptions(env, undefined));
    const rewriter = new HTMLRewriter()
      .on('title', { element: e => { e.setInnerContent(`snd.one ${path}`) } })
      .on('pre', { element: async e => {
        const id = e.getAttribute('id');
        if (id === 'pipe-data') e.setInnerContent(await pipeData);
        else if (id === 'pipe-headers') e.setInnerContent(await pipeHeaders);
        else if (id === 'curl-example') e.setInnerContent(curlExample(path));
      } })
      .on('code', { element: e => {
        const clazz = e.getAttribute('class');
        if (clazz === 'pipe-url') e.setInnerContent(url.pathname);
      } });

    return rewriter.transform(pipeHtml);
  }

  // JS /vars.js request
  if (path === '/vars.js') {
    const vars = {
      PUSH_PUBLIC_KEY: env.PUSH_PUBLIC_KEY,
    };
    let js = '';
    for (const [key, value] of Object.entries(vars)) {
      js += `export const ${key} = ${JSON.stringify(value)};\n`;
    }
    return new Response(js, {
      status: 200,
      headers: {
        'content-type': 'application/javascript',
      }
    }); 
  }

  // Regular asset request
  else {
    try {
      return await getAssetFromKV(evt, assetOptions(env, undefined));
    } catch (e) {
      if (e instanceof NotFoundError) {
        return new Response('Path not found: ' + path, { status: 404 });
      } else if (e instanceof Error) {
        return new Response(e.message || e.toString(), { status: 500 });
      }
    }
  }
}

// Get rid of repeating and trailing slashes
function cleanPathname(url: URL) {
  return url.pathname.replace(/\/+/g, '/').replace(/\/$/, '');
}

// Pass cleaned pathnames only!!!
function pipeFromPath(path: string, env: SndEnv) {
  // To avoid mistakes, ignore /p/ prefixes
  const pipeName = path.replace(/^\/p\//, '/');
  const pipeId = env.PIPE.idFromName(pipeName);
  return env.PIPE.get(pipeId);
}

function curlExample(path: string) {
  return `curl -d "My message" https://snd.one${path.replace(/^\/p/, '')}`;
}