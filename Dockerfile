# This Dockerfile allows you to run AstroJS in server mode

#########
# Build #
#########
FROM docker.io/node:22-alpine AS build

# Build env variables
ENV ASTRO_TELEMETRY_DISABLED=1

# Add build deps
# apk add --no-cache git

# run as non root user
USER node

# go to user repository
WORKDIR /usr/src/app

# Add package json
ADD --chown=node:node package.json package-lock.json ./

# install dependencies from package lock
RUN npm ci

# Add project files
ADD --chown=node:node . .

# build
RUN npm run build

# remove dev deps
RUN npm prune --omit=dev

##############
# Production #
##############
FROM docker.io/node:22-alpine AS prod

# inform software to be in production
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV ASTRO_TELEMETRY_DISABLED=1

# Add production deps
# apk add --no-cache git

# run as non root user
USER node

# go to work folder
WORKDIR /usr/src/app

# copy from build image
COPY --chown=node:node package.json .env* ./
COPY --chown=node:node --from=build /usr/src/app/node_modules ./node_modules
COPY --chown=node:node --from=build /usr/src/app/dist ./dist

# Expose port
EXPOSE 3000

# run it !
CMD ["npm", "run", "start"]
