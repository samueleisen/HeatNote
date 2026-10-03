# -----------------------------------------------------------------------------
# Dockerfile - Builds a production container image for HeatNote
# -----------------------------------------------------------------------------
# A Dockerfile is a recipe. Docker reads it top-to-bottom and produces an
# "image" - a frozen, portable snapshot of your app + its environment.
# That image can run identically on any machine that has Docker installed.

# FROM: The base image we start from. We're not building from scratch -
# we inherit a minimal Linux OS (Alpine, ~5MB) with Nginx already installed.
# alpine tag = smallest possible footprint, faster downloads, smaller attack surface.
FROM nginx:alpine

# RUN apk upgrade: Forces Alpine to upgrade all installed packages to their latest
# available versions BEFORE we do anything else.
#
# WHY THIS EXISTS: CI security scanners like Trivy check the exact package
# versions baked into the image. Base images (nginx:alpine) are rebuilt
# periodically but not instantly when a CVE is published. There can be a
# window where the latest tag still ships a vulnerable package version.
#
# apk upgrade closes that window by pulling patched versions at build time.
# --no-cache means don't store the package index file inside the image layer
# (keeps the image smaller and avoids stale cache issues in CI).
RUN apk upgrade --no-cache

# RUN: Remove the default Nginx config shipped with the base image.
# We remove it so our custom nginx.conf is the only config that applies.
RUN rm /etc/nginx/conf.d/default.conf

# COPY <source-on-your-machine> <destination-inside-the-image>
# Copy our custom Nginx configuration into the image.
COPY docker/nginx.conf /etc/nginx/nginx.conf

# Copy all static application files into the directory Nginx will serve from.
# We copy specific files rather than everything (.) to avoid including
# DevOps files (Dockerfile, docker-compose.yml, roadmap.md) in the web root.
COPY index.html        /usr/share/nginx/html/
COPY app.js            /usr/share/nginx/html/
COPY activity.js       /usr/share/nginx/html/
COPY mobile.js         /usr/share/nginx/html/
COPY style.css         /usr/share/nginx/html/
COPY fav-icon.png      /usr/share/nginx/html/

# All application source files have been copied above.
# firebase-config.js and cloudinary.js have been removed --
# authentication and media uploads are now handled by the local backend service.

# EXPOSE: Documents which port this container listens on.
# This is metadata only - it doesn't actually open any port.
# The real port mapping happens in docker-compose.yml.
EXPOSE 80

# No CMD needed here. The nginx:alpine base image already defines the default
# command to start Nginx in the foreground, which is exactly what we want.
