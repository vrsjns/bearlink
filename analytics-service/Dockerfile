# Use Node.js as the base image
FROM node:20

# Install pgsql client to check readiness later
RUN apt update
RUN apt install -y postgresql-client

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json into the container
COPY ../package*.json ./

# Install dependencies, including development dependencies
RUN npm install

# Copy the rest of the application code
COPY ../ ./

# Install nodemon globally for auto-reloading
RUN npm install -g nodemon

# Navigate to the specific service
WORKDIR /app/analytics-service

# Generate Prisma client
RUN npx prisma generate

# Expose the port on which the service runs
EXPOSE 6000

# Start the application with nodemon for auto-reloading
CMD ["sh", "/app/tools/wait-for-postgres.sh"]
