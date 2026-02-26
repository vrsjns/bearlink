#!/bin/sh

# Wait for PostgreSQL to be ready
until pg_isready -h db -p 5432 -U postgres; do
  echo "Waiting for PostgreSQL..."
  sleep 2
done

# Run Prisma migrations
npx prisma migrate dev --name init

# Start the service
nodemon --exec 'ts-node -r tsconfig-paths/register src/main.ts'
