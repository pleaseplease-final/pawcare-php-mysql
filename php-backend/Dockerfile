# PHP 8.2 + Apache for the PawCare PHP/MySQL back end.
# Build from the repository root:  docker build -f php-backend/Dockerfile -t pawcare-php .
FROM php:8.2-apache

RUN docker-php-ext-install pdo pdo_mysql \
 && a2enmod rewrite headers

# The site lives in /var/www/html; the SQL files used by the one-time setup script sit two levels above scripts/.
COPY php-backend/ /var/www/html/
COPY server/database/ /var/www/server/database/

# Send every request through index.php (it serves the console, reports and the /api routes) and keep the Authorization header.
RUN printf '%s\n' \
  'RewriteEngine On' \
  'RewriteRule .* - [E=HTTP_AUTHORIZATION:%%{HTTP:Authorization}]' \
  'RewriteCond %%{REQUEST_URI} !^/index\.php' \
  'RewriteRule ^ /index.php [L]' > /var/www/html/.htaccess \
 && printf '%s\n' '<Directory /var/www/html>' '  AllowOverride All' '  Require all granted' '</Directory>' \
  '<DirectoryMatch "^/var/www/html/(tests|scripts|config|controllers|middleware|storage)">' '  Require all denied' '</DirectoryMatch>' \
  > /etc/apache2/conf-enabled/pawcare.conf \
 && mkdir -p /var/www/html/storage && chown -R www-data:www-data /var/www/html/storage

# Render and Railway tell the container which port to use in $PORT.
CMD ["sh", "-c", "sed -i \"s/80/${PORT:-80}/g\" /etc/apache2/ports.conf /etc/apache2/sites-available/000-default.conf && exec apache2-foreground"]

HEALTHCHECK --interval=30s --timeout=5s CMD curl -fs http://localhost:${PORT:-80}/api/health || exit 1
