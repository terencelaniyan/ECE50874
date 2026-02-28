# Bowling Ball Frontend – build and serve (Node + nginx)
# Expects package.json and a build script (e.g. npm run build → dist/ or build/)

# Stage 1: build
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./
RUN npm ci 2>/dev/null || npm install

COPY . .
RUN npm run build

# Stage 2: serve static assets
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
