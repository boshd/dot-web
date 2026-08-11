FROM node:22-alpine AS dependencies
WORKDIR /app
RUN corepack enable
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_API_URL=""
ARG NEXT_PUBLIC_STYTCH_PUBLIC_TOKEN=""
ARG NEXT_PUBLIC_STYTCH_SESSION_DURATION_MINUTES="43200"
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_STYTCH_PUBLIC_TOKEN=$NEXT_PUBLIC_STYTCH_PUBLIC_TOKEN
ENV NEXT_PUBLIC_STYTCH_SESSION_DURATION_MINUTES=$NEXT_PUBLIC_STYTCH_SESSION_DURATION_MINUTES
RUN yarn build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
