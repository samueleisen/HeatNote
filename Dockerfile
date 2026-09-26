# -----------------------------------------------------------------------------
# Dockerfile — Builds a production container image for HeatNote
# -----------------------------------------------------------------------------
# A Dockerfile is a recipe. Docker reads it top-to-bottom and produces an
# "image" — a frozen, portable snapshot of your app + its environment.
# That image can run identically on any machine that has Docker installed.

# FROM: The base image we start from. We're not building from scratch —
# we inherit a minimal Linux OS (Alpine, ~5MB) with Nginx already installed.
# alpine tag = smallest possible footprint, faster downloads, smaller attack surface.
FROM nginx:alpine

# RUN: Executes a shell command during the image build.
# The default Nginx Alpine image ships with a basic config at this path.
# We remove it so our custom nginx.conf is the only config that applies.
RUN rm /etc/nginx/conf.d/default.conf

# COPY <source-on-your-machine> <destination-inside-the-image>
# Copy our custom Nginx configuration into the image.
# Nginx automatically loads any .conf file found in /etc/nginx/nginx.conf
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

# NOTE: firebase-config.js and cloudinary.js are in .gitignore (not in the repo)
# but they ARE needed in the Docker image to run the app.
# They must exist on the machine running docker build.
# This is an intentional distinction: gitignored ? dockerignored.
COPY firebase-config.js /usr/share/nginx/html/
COPY cloudinary.js      /usr/share/nginx/html/

# EXPOSE: Documents which port this container listens on.
# This is metadata only — it doesn't actually open any port.
# The real port mapping happens in docker-compose.yml.
EXPOSE 80

# No CMD needed here. The nginx:alpine base image already defines the default
# command to start Nginx in the foreground, which is exactly what we want.
