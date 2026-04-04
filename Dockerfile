FROM node:24-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

COPY . .

EXPOSE 3001

CMD ["node", "backend/server.js"]
