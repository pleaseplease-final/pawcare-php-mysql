<?php
/**
 * Creates (or resets) the first administrator account. No password is stored in the code.
 *
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='A-strong#Pass1' ADMIN_NAME='First Last' ADMIN_MOBILE=09171234567 php php-backend/scripts/create_admin.php
 *
 * The password must meet the same rules as every other password (8+ characters, upper, lower, number, symbol).
 */
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/validator.php';

$email = trim((string) getenv('ADMIN_EMAIL'));
$password = (string) getenv('ADMIN_PASSWORD');
$name = trim((string) (getenv('ADMIN_NAME') ?: 'Clinic Administrator'));
$mobile = trim((string) (getenv('ADMIN_MOBILE') ?: ''));

$errors = Validator::errors([
    'ADMIN_EMAIL' => Validator::email($email),
    'ADMIN_PASSWORD' => Validator::password($password, $email),
    'ADMIN_MOBILE' => Validator::phone($mobile),
]);
if ($errors) {
    fwrite(STDERR, "Cannot create the administrator:\n");
    foreach ($errors as $field => $message) fwrite(STDERR, "  {$field}: {$message}\n");
    exit(1);
}

[$first, $last] = array_pad(explode(' ', $name, 2), 2, 'Administrator');
$pdo = Database::getConnection();
$existing = $pdo->prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)');
$existing->execute([$email]);
$id = $existing->fetchColumn();
$hash = password_hash($password, PASSWORD_BCRYPT);

if ($id) {
    $pdo->prepare("UPDATE users SET password_hash = ?, role = 'admin', is_locked = 0, failed_login_attempts = 0, lockout_until = NULL, mobile_number = ?, mobile_verified = 1 WHERE id = ?")->execute([$hash, $mobile, $id]);
    echo "Updated administrator {$email}.\n";
} else {
    $id = 'u_' . bin2hex(random_bytes(5));
    $pdo->prepare("INSERT INTO users (id, first_name, last_name, birthday, password_hash, email, role, mobile_number, email_verified_at, mobile_verified) VALUES (?, ?, ?, '1990-01-01', ?, ?, 'admin', ?, NOW(), 1)")
        ->execute([$id, $first, $last, $hash, $email, $mobile]);
    echo "Created administrator {$email}.\n";
}
