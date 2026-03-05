FROM node:20

RUN apt update
RUN apt install -y postgresql-client

WORKDIR /app

COPY ../ ./

RUN npm install

RUN npm install -g nodemon

WORKDIR /app/audit-service

RUN npm exec -- prisma generate

EXPOSE 8500

CMD ["sh", "/app/tools/wait-for-postgres.sh"]
