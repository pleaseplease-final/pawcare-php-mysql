<?php
/**
 * PawCare Clinic - MySQL Database Connection Configuration (PHP PDO)
 * Supports both Local XAMPP MySQL and Online Cloud MySQL (TiDB Cloud, Aiven, Clever Cloud)
 */

class Database {
    private static ?PDO $pdo = null;

    public static function getConnection(): PDO {
        if (self::$pdo !== null) {
            return self::$pdo;
        }

        // Load .env if present
        self::loadEnv(__DIR__ . '/../../.env');

        $host = getenv('DB_HOST') ?: '127.0.0.1';
        $port = getenv('DB_PORT') ?: '3306';
        $dbname = getenv('DB_NAME') ?: 'pawcare_db';
        $user = getenv('DB_USER') ?: 'root';
        $pass = getenv('DB_PASS') !== false ? getenv('DB_PASS') : '';
        $ssl = filter_var(getenv('DB_SSL'), FILTER_VALIDATE_BOOLEAN);

        $dsn = "mysql:host={$host};port={$port};dbname={$dbname};charset=utf8mb4";
        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci"
        ];

        // SSL certificate options for online cloud databases (TiDB Cloud, Aiven, etc.)
        if ($ssl) {
            // Linux hosts keep the trusted certificate list in one of these files. (Windows/XAMPP has none, so it keeps the old setting.)
            foreach (['/etc/ssl/certs/ca-certificates.crt', '/etc/pki/tls/certs/ca-bundle.crt', '/etc/ssl/cert.pem', '/etc/ssl/ca-bundle.pem'] as $bundle) {
                if (is_file($bundle)) { $options[PDO::MYSQL_ATTR_SSL_CA] = $bundle; break; }
            }
            if (!isset($options[PDO::MYSQL_ATTR_SSL_CA])) $options[PDO::MYSQL_ATTR_SSL_CA] = true;
            // Set DB_SSL_VERIFY=true to also check the server's certificate (recommended once the connection works).
            $options[PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT] = filter_var(getenv('DB_SSL_VERIFY'), FILTER_VALIDATE_BOOLEAN);
        }

        try {
            self::$pdo = new PDO($dsn, $user, $pass, $options);
            return self::$pdo;
        } catch (PDOException $e) {
            error_log('Database connection failed: ' . $e->getMessage());
            http_response_code(503);
            echo json_encode(['success' => false, 'error' => 'The clinic database is not reachable right now. Please try again in a moment.']);
            exit;
        }
    }

    /**
     * Simple .env parser to read environment variables without external packages
     */
    private static function loadEnv(string $filePath): void {
        if (!file_exists($filePath)) return;
        $lines = file($filePath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            $line = trim($line);
            if (empty($line) || str_starts_with($line, '#')) continue;
            if (str_contains($line, '=')) {
                [$key, $val] = explode('=', $line, 2);
                $key = trim($key);
                $val = trim($val);
                // Strip enclosing quotes
                if ((str_starts_with($val, '"') && str_ends_with($val, '"')) ||
                    (str_starts_with($val, "'") && str_ends_with($val, "'"))) {
                    $val = substr($val, 1, -1);
                }
                if (!getenv($key)) {
                    putenv("{$key}={$val}");
                    $_ENV[$key] = $val;
                    $_SERVER[$key] = $val;
                }
            }
        }
    }
}

