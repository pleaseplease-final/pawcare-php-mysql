<?php
/**
 * Adds the columns and tables introduced after the first release, without touching existing data.
 * It runs once per request (a single cheap SELECT when everything is already in place), so a database created
 * with the older pawcare_mysql.sql upgrades itself the first time the new code runs.
 */
class Schema {
    private static bool $done = false;

    public static function ensure(PDO $pdo): void {
        if (self::$done) return;
        self::column($pdo, 'users', 'is_active', 'TINYINT(1) NOT NULL DEFAULT 1');
        self::column($pdo, 'users', 'access_revision', 'INT NOT NULL DEFAULT 0');
        self::column($pdo, 'users', 'access_reason', 'VARCHAR(300) DEFAULT NULL');
        self::column($pdo, 'clinic_catalog_items', 'status_reason', 'VARCHAR(300) DEFAULT NULL');
        self::column($pdo, 'appointments', 'payment_reference', 'VARCHAR(100) DEFAULT NULL');
        self::column($pdo, 'consultations', 'follow_up_date', 'DATE DEFAULT NULL');
        $pdo->exec("CREATE TABLE IF NOT EXISTS vaccination_reminders (
            id VARCHAR(50) NOT NULL PRIMARY KEY,
            vaccination_id VARCHAR(50) NOT NULL,
            milestone INT NOT NULL,
            channel VARCHAR(10) NOT NULL,
            due_date DATE NOT NULL,
            scheduled_for DATE NOT NULL,
            status VARCHAR(12) NOT NULL DEFAULT 'pending',
            detail VARCHAR(255) DEFAULT NULL,
            sent_at DATETIME DEFAULT NULL,
            created_at DATETIME NOT NULL,
            UNIQUE (vaccination_id, milestone, channel)
        )");
        $pdo->exec("CREATE TABLE IF NOT EXISTS reminder_runs (
            id INT NOT NULL PRIMARY KEY,
            last_started_at DATETIME DEFAULT NULL,
            last_completed_at DATETIME DEFAULT NULL,
            last_summary VARCHAR(255) DEFAULT NULL
        )");
        self::$done = true;
    }

    /** Adds a column when it is missing. A SELECT is the portable way to ask (works on MySQL and SQLite). */
    private static function column(PDO $pdo, string $table, string $column, string $definition): void {
        try {
            $pdo->query("SELECT {$column} FROM {$table} LIMIT 1");
        } catch (PDOException $e) {
            $pdo->exec("ALTER TABLE {$table} ADD COLUMN {$column} {$definition}");
        }
    }
}
