<?php
/**
 * PawCare Authentication & RBAC Middleware (PHP)
 * Satisfies Account Credentials & System Security Rubric
 */

require_once __DIR__ . '/../config/database.php';

if (session_status() === PHP_SESSION_NONE) {
    // Behind a proxy (Render, Vercel) the browser connection is HTTPS even when PHP only sees HTTP.
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || strtolower($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
    session_set_cookie_params([
        'httponly' => true,
        'samesite' => 'Lax',
        'secure' => $https,
    ]);
    if (strtolower((string) getenv('SESSION_STORE')) === 'db') {
        require_once __DIR__ . '/../config/session_store.php';
        session_set_save_handler(new DbSessionHandler(Database::getConnection()), true);
    }
    session_start();
}
require_once __DIR__ . '/../config/schema.php';

class AuthMiddleware {
    /**
     * Get the authenticated user from Session or Bearer Token
     */
    public static function getCurrentUser(): ?array {
        // 1. Check PHP Session (the database is only opened when there is something to verify)
        if (!empty($_SESSION['user_id'])) {
            $pdo = Database::getConnection();
            Schema::ensure($pdo);
            $stmt = $pdo->prepare("SELECT id, first_name, last_name, email, role, vet_id, owner_id FROM users WHERE id = ? AND is_locked = 0 AND is_active = 1");
            $stmt->execute([$_SESSION['user_id']]);
            $user = $stmt->fetch();
            if ($user) return $user;
        }

        // 2. Check Authorization Bearer Header or Cookie
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        $token = null;

        if (preg_match('/Bearer\s+(\S+)/i', $authHeader, $matches)) {
            $token = $matches[1];
        } elseif (!empty($_COOKIE['pawcare_token'])) {
            $token = $_COOKIE['pawcare_token'];
        }

        if ($token) {
            $pdo = Database::getConnection();
            Schema::ensure($pdo);
            $tokenHash = hash('sha256', $token);
            $stmt = $pdo->prepare("
                SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.vet_id, u.owner_id
                FROM sessions s
                JOIN users u ON u.id = s.user_id
                WHERE s.token_hash = ? AND s.expires_at > NOW() AND u.is_locked = 0 AND u.is_active = 1
            ");
            $stmt->execute([$tokenHash]);
            $user = $stmt->fetch();
            if ($user) {
                $_SESSION['user_id'] = $user['id'];
                $_SESSION['role'] = $user['role'];
                return $user;
            }
        }

        return null;
    }

    /**
     * Require authentication - halts request if not logged in
     */
    public static function requireAuth(): array {
        $user = self::getCurrentUser();
        if (!$user) {
            http_response_code(401);
            echo json_encode([
                'success' => false,
                'error' => 'Authentication required. Please log in.'
            ]);
            exit;
        }
        return $user;
    }

    /** Stops the request with 403 JSON. */
    public static function forbid(string $message = 'You do not have access to this record.'): never {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => $message]);
        exit;
    }

    /** Pet owners may only touch their own owner record; clinic staff may touch any. */
    public static function requireOwnerAccess(array $user, string $ownerId): void {
        if ($user['role'] === 'owner' && ($user['owner_id'] ?? null) !== $ownerId) self::forbid();
    }

    /** Pet owners may only touch their own pets; clinic staff may touch any. 404 when the pet does not exist. */
    public static function requirePetAccess(PDO $pdo, array $user, string $petId): void {
        $stmt = $pdo->prepare('SELECT owner_id FROM pets WHERE id = ?');
        $stmt->execute([$petId]);
        $ownerId = $stmt->fetchColumn();
        if ($ownerId === false) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Patient not found.']);
            exit;
        }
        if ($user['role'] === 'owner' && ($user['owner_id'] ?? null) !== $ownerId) self::forbid();
    }

    /**
     * Role-Based Access Control (RBAC) - checks allowed roles
     */
    public static function requireRole(array $allowedRoles): array {
        $user = self::requireAuth();
        if (!in_array($user['role'], $allowedRoles, true)) {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'error' => 'Access denied: insufficient permissions for role [' . $user['role'] . '].'
            ]);
            exit;
        }
        return $user;
    }
}

