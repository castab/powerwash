FROM node:24-bookworm-slim

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY package.json package-lock.json ./
COPY prisma ./prisma

RUN npm ci
RUN npm run prisma:generate

COPY . .

RUN chmod +x ./scripts/start.sh
RUN npm run build

ENV NODE_ENV=production

EXPOSE 3000

CMD ["sh", "./scripts/start.sh"]
