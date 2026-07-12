FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund --ignore-scripts
COPY . .
EXPOSE 8080
CMD ["npx", "tsx", "src/index.ts"]