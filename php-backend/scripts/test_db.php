<?php
require_once __DIR__ . '/../config/database.php';

try {
    $pdo = Database::getConnection();
    echo "========================================\n";
    echo "  PawCare PHP & MySQL Connection Test  \n";
    echo "========================================\n";
    $stmt = $pdo->query("SELECT VERSION() as version, DATABASE() as dbname");
    $row = $stmt->fetch();
    echo "Database Server: " . $row['version'] . "\n";
    echo "Active Database: " . $row['dbname'] . "\n";

    $tables = $pdo->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
    echo "Total Tables:    " . count($tables) . "\n";
    echo "Tables:          " . implode(", ", $tables) . "\n\n";

    $users = $pdo->query("SELECT id, first_name, email, role FROM users")->fetchAll();
    echo "Seeded Users (" . count($users) . "):\n";
    foreach ($users as $u) {
        echo " - [{$u['role']}] {$u['first_name']} ({$u['email']})\n";
    }
    echo "========================================\n";
    echo "Status: SUCCESS! Fully operational.\n";
} catch (Exception $e) {
    echo "Connection error: " . $e->getMessage() . "\n";
}

