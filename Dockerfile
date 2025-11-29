ARG NODE_VERSION=23.1.0
FROM node:${NODE_VERSION}-alpine

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 8080

CMD ["npm", "run", "dev", "--", "-h", "0.0.0.0", "-p", "8080", "-c", "/usr/src/app/cache"]

