FROM node:20

RUN apt update && apt install -y postgresql-client

WORKDIR /app/link-management-service

# Copy package.json first for better layer caching
COPY link-management-service/package.json ./package.json
RUN npm install
RUN npm install -g nodemon

# Copy service source files
COPY link-management-service/ ./

# Generate Prisma client
RUN npx prisma generate

RUN chmod +x tools/wait-for-postgres-lm.sh

EXPOSE 9000

CMD ["sh", "tools/wait-for-postgres-lm.sh"]
