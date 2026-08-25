FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production

EXPOSE 4000

# Default to running the API. The worker service overrides this command
# (see docker-compose.yml / render.yaml) to run "node src/worker/worker.js".
CMD ["node", "src/api/server.js"]
