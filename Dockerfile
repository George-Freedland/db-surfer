# DBSurfer - local-first, browser-based database client
# Build:  docker build -t dbsurfer .
# Run:    docker run -p 4400:4400 -v dbsurfer-data:/root/.dbsurfer dbsurfer
# Note: to reach a database on the Docker host, use host.docker.internal
# instead of localhost in your connection settings.
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY . .
RUN npm run build -w client

FROM node:20-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev -w server
COPY server server
COPY --from=build /app/client/dist client/dist
EXPOSE 4400
VOLUME /root/.dbsurfer
CMD ["node", "server/index.js"]
