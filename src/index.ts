import { getAssetFromKV, NotFoundError } from '@cloudflare/kv-asset-handler'
const qrcode = require('qrcode-terminal');

export { Pipe } from './pipe';

/*****************************************
 * BEGIN Cloudflare Sites boilerplate
 *****************************************/
// @ts-ignore
import manifestJSON from '__STATIC_CONTENT_MANIFEST'
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
    if (request.method === 'POST') {
      return await handlePipeSend(request, env, ctx);
    } else {
      return await handleBrowserContentRequest(request, env, ctx);
    }
  },
};

// Handles POST requests. All POSTs will just send through a pipe
async function handlePipeSend(request: Request, env: SndEnv, ctx: ExecutionContext) {
  const url = new URL(request.url);
  const path = cleanPathname(url);
  const pipe = pipeFromPath(path, env);

  const pipeResponse = await pipe.fetch('https://pipe/send', {
    method: 'POST',
    body: request.body,
    headers: request.headers,
  });
  if (pipeResponse.status >= 300) {
    throw new Error('Pipe send failed');
  }

  // Repurpose 'url' into the URL to access the pipe
  url.pathname = `/p${path}`;

  const { readable, writable } = new TransformStream();

  // Write QR code to response in background
  const promise = new Promise<void>((resolve, _reject) => {
    const textEncoder = new TextEncoder();

    const writer = writable.getWriter();
    writer.write(textEncoder.encode(url.toString() + "\n"));

    qrcode.generate(url.toString(), { small: true }, (qr: string) => {
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
      } });

    return rewriter.transform(pipeHtml);
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