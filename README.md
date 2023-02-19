# snd.one

"Send one"

Extremely simple notifications pipe.

Example: https://snd.one/p/readme-example (replace "readme-example" with any string)

```bash
# Once subscribed, send a notification:
curl -d 'Hello, world!' https://snd.one/readme-example
```

These pipes go away after 24 hours of inactivity.

## Setup

This project runs on Cloudflare workers.

```bash
npm install
npm run dev
```
