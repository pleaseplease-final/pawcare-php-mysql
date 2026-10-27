<?php
// Creates the throwaway test database and two staff accounts. Passwords are random and written to creds.json for the test run only.
require_once __DIR__ . '/config/database.php';
@unlink(__DIR__ . '/test.sqlite');
$pdo = Database::getConnection();
$pdo->exec("CREATE TABLE users (id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT, middle_initial TEXT, birthday TEXT, password_hash TEXT, email TEXT UNIQUE, role TEXT, vet_id TEXT, owner_id TEXT, mobile_number TEXT, email_verified_at TEXT, mobile_verified INTEGER DEFAULT 0, mobile_verified_at TEXT, failed_login_attempts INTEGER DEFAULT 0, is_locked INTEGER DEFAULT 0, lockout_until TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)");
$pdo->exec("CREATE TABLE owners (id TEXT PRIMARY KEY, user_id TEXT, name TEXT, email TEXT, phone TEXT, address TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)");
$pdo->exec("CREATE TABLE pets (id TEXT PRIMARY KEY, owner_id TEXT, name TEXT, species TEXT, species_other TEXT, breed TEXT, sex TEXT, birth TEXT, weight REAL, color TEXT, neutered TEXT, allergies TEXT, vaccination_card_id TEXT, notes TEXT, photo TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)");
$pdo->exec("CREATE TABLE pet_weights (id TEXT PRIMARY KEY, pet_id TEXT, date TEXT, kg REAL, recorded_by TEXT)");
$pdo->exec("CREATE TABLE appointments (id TEXT PRIMARY KEY, pet_id TEXT, vet_id TEXT, date TEXT, time TEXT, reason TEXT, status TEXT DEFAULT 'Scheduled', billing_status TEXT DEFAULT 'Unbilled', amount REAL DEFAULT 600, payment_method TEXT, paid_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)");
$pdo->exec("CREATE TABLE audit_logs (id TEXT PRIMARY KEY, user_name TEXT, user_role TEXT, action TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)");
$pdo->exec("CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT, expires_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)");
$pdo->exec("CREATE TABLE consultations (id TEXT PRIMARY KEY, pet_id TEXT, vet_id TEXT, appt_id TEXT, date TEXT, symptoms TEXT, objective TEXT, diagnosis TEXT, treatment TEXT, prescription TEXT)");
$pdo->exec("CREATE TABLE vaccinations (id TEXT PRIMARY KEY, pet_id TEXT, card_id TEXT, vaccine TEXT, date TEXT, next_due TEXT, done INTEGER DEFAULT 1)");

$creds = [];
foreach ([['admin', 'Ada', 'Admin', 'admin1'], ['vet', 'Vic', 'Vet', 'vet1'], ['assistant', 'Asa', 'Desk', 'asst1']] as [$role, $first, $last, $id]) {
    $password = 'Zz!' . bin2hex(random_bytes(5)) . 'Q9';
    $email = "{$id}@example.test";
    $pdo->prepare("INSERT INTO users (id, first_name, last_name, birthday, password_hash, email, role, vet_id, mobile_number, email_verified_at, mobile_verified) VALUES (?,?,?,?,?,?,?,?,?,?,1)")
        ->execute([$id, $first, $last, '1990-01-01', password_hash($password, PASSWORD_BCRYPT), $email, $role, $role === 'vet' ? $id : null, '09170000001', date('Y-m-d H:i:s')]);
    $creds[$role] = ['email' => $email, 'password' => $password, 'id' => $id];
}
file_put_contents(__DIR__ . '/creds.json', json_encode($creds));
echo "database ready\n";
