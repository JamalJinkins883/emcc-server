FROM emscripten/emsdk:latest

RUN apt-get update && apt-get install -y \
    nodejs npm curl

WORKDIR /app
COPY server.js package.json ./
RUN npm install

EXPOSE 3001
CMD ["node", "server.js"]
