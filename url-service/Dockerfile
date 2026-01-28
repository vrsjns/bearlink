# Use Node.js as the base image
FROM node:20

# Install pgsql client to check readiness later
RUN apt update
RUN apt install -y postgresql-client

# Set the working directory inside the container
WORKDIR /app

# Copy all source files (workspaces need to be present for npm install)
COPY ../ ./

# Install dependencies (including workspace dependencies like prisma)
RUN npm install

# Install nodemon globally for auto-reloading
RUN npm install -g nodemon

# Navigate to the specific service
WORKDIR /app/url-service

# Generate Prisma client using workspace-installed version
RUN npm exec -- prisma generate

# Expose the port on which the service runs
EXPOSE 5000

# Start the application with nodemon for auto-reloading
CMD ["sh", "/app/tools/wait-for-postgres.sh"]
