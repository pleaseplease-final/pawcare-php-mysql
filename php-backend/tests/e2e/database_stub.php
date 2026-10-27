<?php
// TEST STAND-IN ONLY: same API as php-backend/config/database.php but backed by a throwaway SQLite file.
class Database {
    private static ?PDO $pdo = null;
    public static function getConnection(): PDO {
        if (self::$pdo !== null) return self::$pdo;
        $pdo = new PDO('sqlite:' . __DIR__ . '/../test.sqlite', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
        $pdo->sqliteCreateFunction('NOW', fn() => date('Y-m-d H:i:s'));
        $pdo->sqliteCreateFunction('VERSION', fn() => 'sqlite (test stand-in)');
        $pdo->sqliteCreateFunction('DATABASE', fn() => 'e2e');
        $pdo->sqliteCreateFunction('CURDATE', fn() => date('Y-m-d'));
        $pdo->sqliteCreateFunction('LOWER', fn($v) => $v === null ? null : mb_strtolower($v));
        return self::$pdo = $pdo;
    }
}
