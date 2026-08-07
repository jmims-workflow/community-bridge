FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

ENV NODE_ENV=production

# Cloud Run injects its own PORT env var (usually 8080) at runtime;
# server/index.ts already reads process.env.PORT, so this just documents it.
EXPOSE 8080

CMD ["npm", "start"]
