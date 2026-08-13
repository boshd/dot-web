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
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project
NEXT_PUBLIC_FIREBASE_APP_ID=1:...:web:...
BENJI_INTERNAL_API_URL=http://api.railway.internal:8000
```

`NEXT_PUBLIC_*` values are frozen into the client during `yarn build`. Set them before the
first deployment and redeploy the service after changing them. `BENJI_INTERNAL_API_URL` is
server-only and should use the backend service's Railway private domain.

The production UI signs in existing Dot users through Firebase Authentication. It accepts the
same phone number or email address used to message Dot, checks that identity with the API before
sending anything, then uses SMS OTP or a passwordless email link. Configure both providers and
authorize the deployed web domain in Firebase. When Firebase is absent, the phone identity picker
is available only in `next dev`; production fails closed.

## Checks

```bash
yarn test:app-preview
yarn lint
yarn build
```
