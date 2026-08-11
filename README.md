# Dot Web

Next.js, TypeScript, Tailwind CSS, and Yarn scaffold for Dot's web client.

## Run locally

Start the API first, then:

```bash
yarn
yarn dev
```

Open `http://localhost:3000`. The client uses `http://localhost:8000` by
default; copy `.env.example` to `.env.local` to override it.

The left conversation switcher includes the user's forever direct chat and shared groups.
Create a group with `+`, share the expiring invite link, and mention Dot when the group
wants help. Open group chats refresh every 2.5 seconds so messages from other web members
appear without using Linq quota.

## Railway

Railway builds the committed `Dockerfile` using `railway.json` and checks `GET /health`
before promoting a deployment. Configure these service variables:

```dotenv
NEXT_PUBLIC_API_URL=https://api.example.com
NEXT_PUBLIC_STYTCH_PUBLIC_TOKEN=public-token-test-or-live-...
NEXT_PUBLIC_STYTCH_SESSION_DURATION_MINUTES=43200
BENJI_INTERNAL_API_URL=http://api.railway.internal:8000
```

`NEXT_PUBLIC_*` values are frozen into the client during `yarn build`. Set them before the
first deployment and redeploy the service after changing them. `BENJI_INTERNAL_API_URL` is
server-only and should use the backend service's Railway private domain.

## Checks

```bash
yarn lint
yarn build
```
