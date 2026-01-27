# Use Node.js as the base image
FROM node:20-alpine

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
WORKDIR /app/notification-service

# Expose the port on which the service runs
EXPOSE 7000

# Start the application with nodemon for auto-reloading
CMD ["nodemon", "-L", "index.js"]
