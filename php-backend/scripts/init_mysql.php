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

    if (!file_exists($schemaFile) || (in_array('--demo-data', $argv ?? [], true) && !file_exists($seedFile))) {
        throw new Exception("SQL files not found in server/database/");
    }

    echo "1. Applying Schema DDL (pawcare_mysql.sql)...\n";
    $schemaSql = file_get_contents($schemaFile);
    // The schema file starts by dropping every table so it can rebuild from scratch. That would erase real data,
    // so those lines are removed unless you ask for a reset on purpose:  php scripts/init_mysql.php --reset
    if (in_array('--reset', $argv ?? [], true)) {
        echo "   --reset: existing tables will be DROPPED and rebuilt. All data in them is lost.\n";
    } else {
        $schemaSql = preg_replace('/^\s*DROP TABLE IF EXISTS [^;]+;\s*$/mi', '', $schemaSql);
        echo "   Existing tables and data are kept (only missing tables are created).\n";
    }
    $pdo->exec($schemaSql);
    echo "   Schema applied successfully!\n";

    // Demo accounts use passwords that are published in this repository, so they are only created when asked for explicitly.
    if (in_array('--demo-data', $argv ?? [], true)) {
        echo "2. Applying DEMO seed records (pawcare_seed_mysql.sql). Use on a local test database only.
";
        $pdo->exec(file_get_contents($seedFile));
        echo "   Demo records inserted.
";
    } else {
        echo "2. Skipping demo accounts. Create your administrator with scripts/create_admin.php.
";
    }

    $tables = $pdo->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
    echo "\nVerification:\n";
    echo " - Total tables verified: " . count($tables) . "\n";
    
    $users = $pdo->query("SELECT id, first_name, email, role FROM users")->fetchAll();
    echo " - Accounts (" . count($users) . "):\n";
    foreach ($users as $u) {
        echo "   * {$u['email']} ({$u['role']})\n";
    }

    echo "\n[SUCCESS] MySQL Database is ready for use!\n";
    echo "========================================================\n";
} catch (Exception $e) {
    echo "\n[ERROR] Initialization failed: " . $e->getMessage() . "\n";
    exit(1);
}

