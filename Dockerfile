FROM node:24-bookworm-slim

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# NEXT_PUBLIC_* vars are inlined into the client bundle at `next build` time,
# not read at container runtime. Railway auto-populates ARGs from service
# variables of the same name during the build -- without these declarations
# the values never reach `npm run build` below, even if they're set on the
# service, and ship baked in as empty strings.
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

RUN npm ci
RUN npm run prisma:generate

COPY . .

RUN chmod +x ./scripts/start.sh
RUN npm run build

ENV NODE_ENV=production

EXPOSE 3000

CMD ["sh", "./scripts/start.sh"]
