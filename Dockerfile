# hthu-web

FROM node:0.10.32
MAINTAINER Sean Adkinson <sean.adkinson@odysseyscience.com>

ENTRYPOINT ["node"]
CMD ["/app/lib/pollAndPush.js"]

ADD node_modules /app/node_modules
ADD lib /app/lib
