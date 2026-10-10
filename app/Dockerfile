FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# Cài dependency trước để tận dụng cache layer
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY public ./public

# Hardening: mã nguồn thuộc root (chỉ đọc với user chạy app), tiến trình chạy bằng user "node" (uid 1000)
USER node

EXPOSE 3000
CMD ["node", "src/server.js"]
