<?php
/**
 * PawCare Database Initializer & Migration Tool (PHP)
 * Runs DDL and Seed data against any configured MySQL database (Local XAMPP or Online Cloud).
 */
require_once __DIR__ . '/../config/database.php';

echo "========================================================\n";
echo " PawCare PHP & MySQL Database Initializer & Migrations \n";
echo "========================================================\n";

try {
    $pdo = Database::getConnection();
    echo "Connected to MySQL successfully.\n";

    $schemaFile = __DIR__ . '/../../server/database/pawcare_mysql.sql';
    $seedFile = __DIR__ . '/../../server/database/pawcare_seed_mysql.sql';

    if (!file_exists($schemaFile) || !file_exists($seedFile)) {
        throw new Exception("SQL files not found in server/database/");
    }

    echo "1. Applying Schema DDL (pawcare_mysql.sql)...\n";
    $schemaSql = file_get_contents($schemaFile);
    $pdo->exec($schemaSql);
    echo "   Schema applied successfully!\n";

    echo "2. Applying Seed Records (pawcare_seed_mysql.sql)...\n";
    $seedSql = file_get_contents($seedFile);
    $pdo->exec($seedSql);
    echo "   Seed records inserted successfully!\n";

    $tables = $pdo->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
    echo "\nVerification:\n";
    echo " - Total tables verified: " . count($tables) . "\n";
    
    $users = $pdo->query("SELECT id, first_name, email, role FROM users")->fetchAll();
    echo " - Seeded accounts (" . count($users) . "):\n";
    foreach ($users as $u) {
        echo "   * {$u['email']} ({$u['role']})\n";
    }

    echo "\n[SUCCESS] MySQL Database is ready for use!\n";
    echo "========================================================\n";
} catch (Exception $e) {
    echo "\n[ERROR] Initialization failed: " . $e->getMessage() . "\n";
    exit(1);
}

