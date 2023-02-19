interface SndEnv {
  PIPE: DurableObjectNamespace,
  PUSH_PRIVATE_KEY: string,
  PUSH_PUBLIC_KEY: string,
}

interface Subscription {
  endpoint: string,
  keys: any,
}