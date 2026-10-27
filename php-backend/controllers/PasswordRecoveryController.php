<?php
/**
 * Forgot password: find the account, choose email or text message, receive a 6-digit code, set a new password.
 * Codes are stored hashed, expire in 10 minutes, allow 5 wrong tries, and can be requested once a minute.
 */
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/validator.php';
require_once __DIR__ . '/../config/notifier.php';

class PasswordRecoveryController {
    private const UNREGISTERED = 'No account is registered with this email. Please create an account.';

    private static function json(int $status, array $body): void {
        http_response_code($status);
        echo json_encode($body);
    }

    private static function input(): array {
        return json_decode(file_get_contents('php://input'), true) ?: $_POST;
    }

    private static function ensureSchema(PDO $pdo): void {
        $pdo->exec("CREATE TABLE IF NOT EXISTS password_resets (
            user_id VARCHAR(50) NOT NULL PRIMARY KEY,
            code_hash CHAR(64) NOT NULL,
            channel VARCHAR(10) NOT NULL DEFAULT 'email',
            attempts INT NOT NULL DEFAULT 0,
            sent TINYINT(1) NOT NULL DEFAULT 0,
            consumed TINYINT(1) NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL,
            expires_at DATETIME NOT NULL
        )");
    }

    private static function findUser(PDO $pdo, string $email): ?array {
        $stmt = $pdo->prepare('SELECT id, first_name, last_name, email, role, mobile_number, mobile_verified FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1');
        $stmt->execute([$email]);
        return $stmt->fetch() ?: null;
    }

    public static function maskEmail(string $email): string {
        [$name, $domain] = array_pad(explode('@', $email, 2), 2, '');
        return substr($name, 0, 1) . str_repeat('*', max(2, min(6, strlen($name) - 1))) . '@' . $domain;
    }

    public static function maskPhone(string $phone): string {
        $digits = preg_replace('/\D/', '', $phone);
        return strlen($digits) > 4 ? str_repeat('*', strlen($digits) - 4) . substr($digits, -4) : '****';
    }

    private static function smsReady(array $user): bool {
        return !empty($user['mobile_verified']) && !empty($user['mobile_number']);
    }

    /** POST /api/auth/forgot/options  {email} -> the ways a code can be delivered. */
    public static function options(): void {
        $email = trim((string) (self::input()['email'] ?? ''));
        if ($message = Validator::email($email)) {
            self::json(422, ['success' => false, 'error' => $message, 'errors' => ['email' => $message]]);
            return;
        }
        $pdo = Database::getConnection();
        $user = self::findUser($pdo, $email);
        if (!$user) {
            self::json(404, ['success' => false, 'unregistered' => true, 'error' => self::UNREGISTERED]);
            return;
        }
        $channels = [['id' => 'email', 'label' => 'Email', 'destination' => self::maskEmail($user['email'])]];
        if (self::smsReady($user)) $channels[] = ['id' => 'sms', 'label' => 'Text message', 'destination' => self::maskPhone($user['mobile_number'])];
        self::json(200, ['success' => true, 'channels' => $channels]);
    }

    /** POST /api/auth/forgot  {email, channel: email|sms} -> sends the code. */
    public static function request(): void {
        $data = self::input();
        $email = trim((string) ($data['email'] ?? ''));
        $channel = ($data['channel'] ?? 'email') === 'sms' ? 'sms' : 'email';
        if ($message = Validator::email($email)) {
            self::json(422, ['success' => false, 'error' => $message, 'errors' => ['email' => $message]]);
            return;
        }
        $pdo = Database::getConnection();
        self::ensureSchema($pdo);
        $user = self::findUser($pdo, $email);
        if (!$user) {
            self::json(404, ['success' => false, 'unregistered' => true, 'error' => self::UNREGISTERED]);
            return;
        }
        if ($channel === 'sms' && !self::smsReady($user)) {
            self::json(400, ['success' => false, 'error' => 'This account has no verified mobile number. Choose email instead.']);
            return;
        }

        $previous = $pdo->prepare('SELECT created_at FROM password_resets WHERE user_id = ?');
        $previous->execute([$user['id']]);
        $row = $previous->fetch();
        if ($row && strtotime($row['created_at']) > time() - 60) {
            header('Retry-After: 60');
            self::json(429, ['success' => false, 'error' => 'Wait one minute before requesting another code.', 'retryAfter' => 60]);
            return;
        }

        $code = (string) random_int(100000, 999999);
        $pdo->prepare('REPLACE INTO password_resets (user_id, code_hash, channel, attempts, sent, consumed, created_at, expires_at) VALUES (?, ?, ?, 0, 0, 0, ?, ?)')
            ->execute([$user['id'], hash_hmac('sha256', $code, $user['id']), $channel, date('Y-m-d H:i:s'), date('Y-m-d H:i:s', time() + 600)]);

        $text = "Your PawCare password recovery code is {$code}. It expires in 10 minutes. If you did not request it, ignore this message.";
        $delivery = $channel === 'sms' ? Notifier::sms($user['mobile_number'], $text) : Notifier::email($user['email'], 'PawCare password recovery code', $text);
        if (empty($delivery['ok'])) {
            self::json(503, ['success' => false, 'error' => 'We could not send the code by ' . ($channel === 'sms' ? 'text message' : 'email') . '. ' . ($channel === 'sms' ? 'Try email instead, or try' : 'Try') . ' again in a minute.']);
            return;
        }
        $pdo->prepare('UPDATE password_resets SET sent = 1 WHERE user_id = ?')->execute([$user['id']]);
        $destination = $channel === 'sms' ? self::maskPhone($user['mobile_number']) : self::maskEmail($user['email']);
        self::json(202, ['success' => true, 'channel' => $channel, 'destination' => $destination, 'retryAfter' => 60,
            'message' => 'A 6-digit code was sent by ' . ($channel === 'sms' ? 'text message' : 'email') . " to {$destination}. It expires in 10 minutes."]);
    }

    /** POST /api/auth/reset  {email, code, password, confirm_password} */
    public static function reset(): void {
        $data = self::input();
        $email = trim((string) ($data['email'] ?? ''));
        $code = (string) ($data['code'] ?? '');
        $password = (string) ($data['password'] ?? '');
        $errors = Validator::errors([
            'email' => Validator::email($email),
            'code' => preg_match('/^\d{6}$/', $code) ? '' : 'Enter the 6-digit code.',
            'password' => Validator::password($password, $email),
            'confirm_password' => hash_equals($password, (string) ($data['confirm_password'] ?? '')) ? '' : 'Passwords do not match.',
        ]);
        if ($errors) {
            self::json(422, ['success' => false, 'error' => 'Check the highlighted fields.', 'errors' => $errors]);
            return;
        }

        $pdo = Database::getConnection();
        self::ensureSchema($pdo);
        $user = self::findUser($pdo, $email);
        $invalid = 'The code is incorrect, expired or already used. Request a new code.';
        if (!$user) {
            self::json(404, ['success' => false, 'unregistered' => true, 'error' => self::UNREGISTERED]);
            return;
        }

        $pdo->beginTransaction();
        try {
            $lock = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' FOR UPDATE' : '';
            $stmt = $pdo->prepare('SELECT * FROM password_resets WHERE user_id = ?' . $lock);
            $stmt->execute([$user['id']]);
            $reset = $stmt->fetch();
            if (!$reset || !$reset['sent'] || $reset['consumed'] || $reset['attempts'] >= 5 || strtotime($reset['expires_at']) < time()) {
                $pdo->rollBack();
                self::json(400, ['success' => false, 'error' => $invalid]);
                return;
            }
            if (!hash_equals($reset['code_hash'], hash_hmac('sha256', $code, $user['id']))) {
                $pdo->prepare('UPDATE password_resets SET attempts = attempts + 1 WHERE user_id = ?')->execute([$user['id']]);
                $pdo->commit();
                self::json(400, ['success' => false, 'error' => $invalid]);
                return;
            }
            $current = $pdo->prepare('SELECT password_hash FROM users WHERE id = ?');
            $current->execute([$user['id']]);
            if (password_verify($password, (string) $current->fetchColumn())) {
                $pdo->rollBack();
                self::json(422, ['success' => false, 'error' => 'Choose a password different from your current one.', 'errors' => ['password' => 'Choose a password different from your current one.']]);
                return;
            }
            $pdo->prepare('UPDATE users SET password_hash = ?, failed_login_attempts = 0, is_locked = 0, lockout_until = NULL WHERE id = ?')
                ->execute([password_hash($password, PASSWORD_BCRYPT), $user['id']]);
            $pdo->prepare('DELETE FROM sessions WHERE user_id = ?')->execute([$user['id']]);
            $pdo->prepare('UPDATE password_resets SET consumed = 1 WHERE user_id = ?')->execute([$user['id']]);
            $pdo->prepare('INSERT INTO audit_logs (id, user_name, user_role, action) VALUES (?, ?, ?, ?)')
                ->execute([uniqid('log_'), trim($user['first_name'] . ' ' . $user['last_name']), $user['role'], 'Reset own password with a recovery code']);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            self::json(500, ['success' => false, 'error' => 'Your password was not changed. Please try again.']);
            return;
        }
        self::json(200, ['success' => true, 'message' => 'Password changed. Please log in.']);
    }
}
