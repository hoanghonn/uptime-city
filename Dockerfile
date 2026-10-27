# One container: the Node server serves the built web app and the API on $PORT.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY . .
RUN npm run build -w apps/web

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=build /app /app
EXPOSE 8080
CMD ["npm", "run", "start", "-w", "apps/server"]
