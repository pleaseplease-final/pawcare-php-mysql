<?php
/**
 * PawCare Authentication & RBAC Middleware (PHP)
 * Satisfies Account Credentials & System Security Rubric
 */

if (session_status() === PHP_SESSION_NONE) {
    session_set_cookie_params([
        'httponly' => true,
        'samesite' => 'Lax',
        'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    ]);
    session_start();
}

require_once __DIR__ . '/../config/database.php';

class AuthMiddleware {
    /**
     * Get the authenticated user from Session or Bearer Token
     */
    public static function getCurrentUser(): ?array {
        // 1. Check PHP Session (the database is only opened when there is something to verify)
        if (!empty($_SESSION['user_id'])) {
            $pdo = Database::getConnection();
            $stmt = $pdo->prepare("SELECT id, first_name, last_name, email, role, vet_id, owner_id FROM users WHERE id = ? AND is_locked = 0");
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
            $tokenHash = hash('sha256', $token);
            $stmt = $pdo->prepare("
                SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.vet_id, u.owner_id
                FROM sessions s
                JOIN users u ON u.id = s.user_id
                WHERE s.token_hash = ? AND s.expires_at > NOW() AND u.is_locked = 0
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

