FROM node:16
WORKDIR /usr/src/app
COPY . /usr/src/app
RUN apt-get update &&  apt-get install -y ca-certificates && update-ca-certificates && yarn
CMD [ "yarn", "start" ]