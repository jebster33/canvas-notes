# docker build -t canvas-notes-sync server
# docker run -d -p 8787:8787 -e CANVAS_SYNC_TOKEN=change-me-to-a-long-secret -v canvas-notes-data:/data canvas-notes-sync
FROM node:20-alpine
WORKDIR /app
COPY core.mjs node.mjs ./
ENV PORT=8787 DATA_DIR=/data NODE_ENV=production
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8787
CMD ["node", "node.mjs"]
