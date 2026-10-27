<?php
/**
 * PawCare Authentication Controller (PHP)
 * Satisfies Account Credentials & System Security Rubric:
 * - password_hash() and password_verify()
 * - Prepared statements against SQL injection
 * - Server-side validation and meaningful error messages
 * - Session and token management
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/auth.php';

require_once __DIR__ . '/../config/validator.php';

class AuthController {
    public const MAX_LOGIN_ATTEMPTS = 3;

    /**
     * User Login
     */
    public static function login(): void {
        $data = json_decode(file_get_contents('php://input'), true) ?: $_POST;
        $email = trim($data['email'] ?? '');
        $password = $data['password'] ?? '';

        // Server-side validation
        if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            http_response_code(422);
            echo json_encode(['success' => false, 'error' => 'A valid email address is required.']);
            return;
        }
        if (empty($password)) {
            http_response_code(422);
            echo json_encode(['success' => false, 'error' => 'Password is required.']);
            return;
        }

        $pdo = Database::getConnection();

        // 1. Fetch user by email using PDO Prepared Statement
        $stmt = $pdo->prepare("SELECT * FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1");
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if (!$user) {
            http_response_code(404);
            echo json_encode(['success' => false, 'unregistered' => true, 'error' => 'No account is registered with this email. Please create an account.']);
            return;
        }

        // 2. Check if account is locked
        if ($user['is_locked']) {
            if ($user['lockout_until'] && strtotime($user['lockout_until']) > time()) {
                http_response_code(423);
                echo json_encode([
                    'success' => false,
                    'error' => 'Account is temporarily locked due to failed attempts. Try again later.'
                ]);
                return;
            } else {
                // Lockout expired, reset
                $resetStmt = $pdo->prepare("UPDATE users SET is_locked = 0, failed_login_attempts = 0 WHERE id = ?");
                $resetStmt->execute([$user['id']]);
            }
        }

        // 3. Verify Password using PHP password_verify()
        if (!password_verify($password, $user['password_hash'])) {
            $attempts = $user['failed_login_attempts'] + 1;
            if ($attempts >= self::MAX_LOGIN_ATTEMPTS) {
                $lockUntil = date('Y-m-d H:i:s', strtotime('+15 minutes'));
                $pdo->prepare("UPDATE users SET failed_login_attempts = ?, is_locked = 1, lockout_until = ? WHERE id = ?")
                    ->execute([$attempts, $lockUntil, $user['id']]);
                http_response_code(423);
                echo json_encode(['success' => false, 'error' => 'Account locked after ' . self::MAX_LOGIN_ATTEMPTS . ' incorrect attempts. Wait 15 minutes, or use Forgot password to reset it now.']);
                return;
            } else {
                $pdo->prepare("UPDATE users SET failed_login_attempts = ? WHERE id = ?")
                    ->execute([$attempts, $user['id']]);
                $remaining = self::MAX_LOGIN_ATTEMPTS - $attempts;
                http_response_code(401);
                echo json_encode(['success' => false, 'attemptsRemaining' => $remaining,
                    'error' => "Invalid email or password. Attempt {$attempts} of " . self::MAX_LOGIN_ATTEMPTS . ". Your account will lock after " . ($remaining === 1 ? 'one more incorrect attempt.' : "{$remaining} more incorrect attempts.")]);
                return;
            }
        }

        // 4. Successful Login - Reset failed attempts
        $pdo->prepare("UPDATE users SET failed_login_attempts = 0, is_locked = 0 WHERE id = ?")
            ->execute([$user['id']]);

        // 5. Generate Session Token & Store
        $rawToken = bin2hex(random_bytes(32));
        $tokenHash = hash('sha256', $rawToken);
        $expiresAt = date('Y-m-d H:i:s', strtotime('+7 days'));

        $pdo->prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
            ->execute([$tokenHash, $user['id'], $expiresAt]);

        // Store in PHP Session (a new id after sign-in prevents session fixation)
        if (session_status() === PHP_SESSION_ACTIVE) session_regenerate_id(true);
        $_SESSION['user_id'] = $user['id'];
        $_SESSION['role'] = $user['role'];

        // Audit log
        $pdo->prepare("INSERT INTO audit_logs (id, user_name, user_role, action) VALUES (?, ?, ?, ?)")
            ->execute([uniqid('log_'), "{$user['first_name']} {$user['last_name']}", $user['role'], 'User logged in successfully']);

        echo json_encode([
            'success' => true,
            'message' => 'Login successful',
            'token' => $rawToken,
            'user' => [
                'id' => $user['id'],
                'first_name' => $user['first_name'],
                'last_name' => $user['last_name'],
                'email' => $user['email'],
                'role' => $user['role'],
                'vet_id' => $user['vet_id'],
                'owner_id' => $user['owner_id']
            ]
        ]);
    }

    /**
     * User Registration
     */
    public static function register(): void {
        $data = json_decode(file_get_contents('php://input'), true) ?: $_POST;

        $firstName = trim($data['first_name'] ?? '');
        $lastName = trim($data['last_name'] ?? '');
        $email = trim($data['email'] ?? '');
        $password = $data['password'] ?? '';
        $mobile = trim($data['mobile_number'] ?? $data['phone'] ?? '');
        $birthday = $data['birthday'] ?? '2000-01-01';

        // Server-side validation
        $errors = [];
        if (empty($firstName)) $errors['first_name'] = 'First name is required.';
        if (empty($lastName)) $errors['last_name'] = 'Last name is required.';
        if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) $errors['email'] = 'A valid email is required.';
        if ($message = Validator::password($password, $email)) $errors['password'] = $message;
        if ($message = Validator::phone($mobile)) $errors['mobile_number'] = $message;

        if (!empty($errors)) {
            http_response_code(422);
            echo json_encode(['success' => false, 'error' => 'Validation failed', 'errors' => $errors]);
            return;
        }

        $pdo = Database::getConnection();

        // Check duplicate email
        $checkStmt = $pdo->prepare("SELECT id FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1");
        $checkStmt->execute([$email]);
        if ($checkStmt->fetch()) {
            http_response_code(409);
            echo json_encode(['success' => false, 'error' => 'This email is already registered.']);
            return;
        }

        // Hash password securely with PHP password_hash()
        $passwordHash = password_hash($password, PASSWORD_BCRYPT);
        $userId = 'u_' . bin2hex(random_bytes(5));
        $ownerId = 'o_' . bin2hex(random_bytes(5));

        $pdo->beginTransaction();
        try {
            // Insert user
            $userStmt = $pdo->prepare("
                INSERT INTO users (id, first_name, last_name, birthday, password_hash, email, role, owner_id, mobile_number, email_verified_at, mobile_verified)
                VALUES (?, ?, ?, ?, ?, ?, 'owner', ?, ?, NOW(), 1)
            ");
            $userStmt->execute([$userId, $firstName, $lastName, $birthday, $passwordHash, $email, $ownerId, $mobile]);

            // Insert owner record
            $fullName = "{$firstName} {$lastName}";
            $ownerStmt = $pdo->prepare("
                INSERT INTO owners (id, user_id, name, email, phone, address)
                VALUES (?, ?, ?, ?, ?, ?)
            ");
            $ownerStmt->execute([$ownerId, $userId, $fullName, $email, $mobile, $data['address'] ?? 'Not specified']);

            $pdo->commit();

            echo json_encode([
                'success' => true,
                'message' => 'Registration successful! You may now log in.',
                'user_id' => $userId
            ]);
        } catch (Exception $e) {
            $pdo->rollBack();
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Registration failed: ' . $e->getMessage()]);
        }
    }

    /**
     * User Logout
     */
    public static function logout(): void {
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (preg_match('/Bearer\s+(\S+)/i', $authHeader, $matches)) {
            $tokenHash = hash('sha256', $matches[1]);
            $pdo = Database::getConnection();
            $pdo->prepare("DELETE FROM sessions WHERE token_hash = ?")->execute([$tokenHash]);
        }

        if (session_status() === PHP_SESSION_ACTIVE) {
            session_destroy();
        }

        echo json_encode(['success' => true, 'message' => 'Logged out successfully']);
    }

    /**
     * Change the signed-in user's own password. Returns field errors, or an empty array on success.
     * The current password is verified with password_verify(); wrong guesses count toward the same
     * 3-attempt lock as sign-in, so a stolen session cannot be used to guess it.
     */
    public static function applyPasswordChange(PDO $pdo, array $user, string $cur, string $next, string $conf, ?string $keepTokenHash = null): array {
        $errors = [];
        if ($cur === '') $errors['cur'] = 'Enter your current password.';
        if ($message = Validator::password($next, (string) ($user['email'] ?? ''))) $errors['next'] = $message;
        elseif ($cur !== '' && $next === $cur) $errors['next'] = 'New password must be different from your current password.';
        if ($conf === '') $errors['conf'] = 'Retype the new password.';
        elseif ($conf !== $next) $errors['conf'] = 'Passwords do not match.';
        if ($errors) return $errors;

        $stmt = $pdo->prepare('SELECT password_hash, failed_login_attempts FROM users WHERE id = ?');
        $stmt->execute([$user['id']]);
        $row = $stmt->fetch();
        if (!$row) return ['cur' => 'Account not found.'];

        if (!password_verify($cur, (string) $row['password_hash'])) {
            $attempts = (int) $row['failed_login_attempts'] + 1;
            if ($attempts >= self::MAX_LOGIN_ATTEMPTS) {
                $pdo->prepare('UPDATE users SET failed_login_attempts = ?, is_locked = 1, lockout_until = ? WHERE id = ?')
                    ->execute([$attempts, date('Y-m-d H:i:s', strtotime('+15 minutes')), $user['id']]);
                $pdo->prepare('DELETE FROM sessions WHERE user_id = ?')->execute([$user['id']]);
                return ['cur' => 'Account locked after ' . self::MAX_LOGIN_ATTEMPTS . ' incorrect attempts. Use Forgot password to reset it.', '_locked' => 'yes'];
            }
            $pdo->prepare('UPDATE users SET failed_login_attempts = ? WHERE id = ?')->execute([$attempts, $user['id']]);
            return ['cur' => 'Current password is incorrect. Attempt ' . $attempts . ' of ' . self::MAX_LOGIN_ATTEMPTS . '.'];
        }

        $pdo->beginTransaction();
        try {
            $pdo->prepare('UPDATE users SET password_hash = ?, failed_login_attempts = 0 WHERE id = ?')->execute([password_hash($next, PASSWORD_BCRYPT), $user['id']]);
            if ($keepTokenHash) $pdo->prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?')->execute([$user['id'], $keepTokenHash]);
            else $pdo->prepare('DELETE FROM sessions WHERE user_id = ?')->execute([$user['id']]);
            $pdo->prepare('INSERT INTO audit_logs (id, user_name, user_role, action) VALUES (?, ?, ?, ?)')
                ->execute([uniqid('log_'), trim(($user['first_name'] ?? '') . ' ' . ($user['last_name'] ?? '')), $user['role'], 'Changed own password']);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            return ['cur' => 'Your password was not changed. Please try again.'];
        }
        return [];
    }

    /** POST /api/auth/password  {cur, next, conf} */
    public static function changePassword(): void {
        $user = AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?: $_POST;
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        $keep = preg_match('/Bearer\s+(\S+)/i', $authHeader, $m) ? hash('sha256', $m[1]) : null;
        $errors = self::applyPasswordChange(Database::getConnection(), $user, (string) ($data['cur'] ?? ''), (string) ($data['next'] ?? ''), (string) ($data['conf'] ?? $data['confirm_password'] ?? ''), $keep);
        if ($errors) {
            $locked = isset($errors['_locked']);
            unset($errors['_locked']);
            http_response_code($locked ? 423 : 400);
            echo json_encode(['success' => false, 'error' => reset($errors), 'errors' => $errors]);
            return;
        }
        echo json_encode(['success' => true, 'message' => 'Password changed. Your other sessions were signed out.']);
    }

    /**
     * Get Current Authenticated Profile
     */
    public static function me(): void {
        $user = AuthMiddleware::requireAuth();
        echo json_encode(['success' => true, 'user' => $user]);
    }
}

