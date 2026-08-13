# Build de la SPA y servido con nginx.
#
# El nginx final no es opcional: la app pide los TLE a /celestrak (ver
# celestrakService.js), un proxy inverso que en desarrollo aporta Vite y que en
# produccion tiene que replicar el servidor web. Ver nginx.conf.

FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite inyecta las VITE_* en tiempo de build, no de ejecucion: tienen que estar
# aqui, no en las variables de runtime del contenedor. En Coolify se declaran
# como "Build Variable".
ARG VITE_CESIUM_ION_TOKEN=""
ARG VITE_MAPILLARY_TOKEN=""
ARG VITE_CELESTRAK_BASE="/celestrak"
ENV VITE_CESIUM_ION_TOKEN=$VITE_CESIUM_ION_TOKEN \
    VITE_MAPILLARY_TOKEN=$VITE_MAPILLARY_TOKEN \
    VITE_CELESTRAK_BASE=$VITE_CELESTRAK_BASE

# El gancho prebuild copia los recursos de CesiumJS a public/cesiumStatic.
RUN npm run build


FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
