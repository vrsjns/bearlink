# Use Node.js as the base image
FROM node:20-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy all source files (workspaces need to be present for npm install)
COPY ../ ./

# Install dependencies (including workspace dependencies)
RUN npm install

# Install nodemon globally for auto-reloading
RUN npm install -g nodemon

# Navigate to the specific service
WORKDIR /app/notification-service

# Expose the port on which the service runs
EXPOSE 7000

# Start the application with nodemon for auto-reloading
CMD ["nodemon", "-L", "index.js"]
