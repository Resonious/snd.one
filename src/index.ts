import { getAssetFromKV, NotFoundError } from '@cloudflare/kv-asset-handler'

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
  async fetch(request: Request, env: any, ctx: ExecutionContext) {
    return await handleBrowserContentRequest(request, env, ctx);
  },
};

async function handleBrowserContentRequest(request: Request, env: any, ctx: ExecutionContext) {
  // This is a weird backward-compatibility object needed by getAssetFromKV.
  const evt = {
    request,
    waitUntil: ctx.waitUntil.bind(ctx)
  };

  try {
    return await getAssetFromKV(evt, assetOptions(env, undefined));
  } catch (e) {
    if (e instanceof NotFoundError) {
      return new Response('Not found', { status: 404 });
    } else if (e instanceof Error) {
      return new Response(e.message || e.toString(), { status: 500 });
    }
  }
}
