# hthu-web

FROM node:0.10.32
MAINTAINER Sean Adkinson <sean.adkinson@odysseyscience.com>

ENTRYPOINT ["node"]
CMD ["/app/lib/pollAndPush.js"]

ADD package.json /app/package.json
RUN cd /app && npm install

ADD lib /app/lib
