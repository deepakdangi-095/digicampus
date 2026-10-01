FROM node:22-slim
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npx tsc
ENV NODE_ENV=production
EXPOSE 4000
CMD ["./docker-entrypoint.sh"]
