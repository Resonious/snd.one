// @ts-ignore
import { ApplicationServerKeys, generatePushHTTPRequest } from 'webpush-webcrypto';

export type PushArgs = {
  url: string,
  text: string,
};

export async function push(subscription: object, env: SndEnv, args: PushArgs) {
  const keys = await ApplicationServerKeys.fromJSON({
    publicKey: env.PUSH_PUBLIC_KEY,
    privateKey: env.PUSH_PRIVATE_KEY,
  });

  const { headers, body, endpoint } = await generatePushHTTPRequest({
    applicationServerKeys: keys,
    payload: JSON.stringify(args),
    target: subscription,
    adminContact: 'mailto:nigel@baillie.dev',
    ttl: 30,
  });

  return await fetch(endpoint, {
    method: 'POST',
    headers,
    body,
  });
}

export async function genkeys() {
  const keys = await ApplicationServerKeys.generate();
  return await keys.toJSON();
}