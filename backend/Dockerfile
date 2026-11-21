FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY backend/package.json ./
RUN npm install --omit=dev && npm cache clean --force
RUN mkdir -p /var/lib/sigis/documents/pending /var/lib/sigis/documents/private \
    && chown -R node:node /var/lib/sigis/documents
ENV DOCUMENTS_DIR=/var/lib/sigis/documents
COPY backend/src ./src
COPY backend/test ./test
USER node
EXPOSE 3000
CMD ["npm", "start"]
