<?php
/**
 * Login gate for the PHP reports dashboard.
 * Included at the top of dashboard.php. It stops the request unless a clinic staff member is signed in,
 * so client names, phone numbers and revenue are never shown to visitors.
 * Passwords are checked by AuthController::login (password_verify, lockout after 5 failures).
 */
require_once __DIR__ . '/middleware/auth.php';
require_once __DIR__ . '/controllers/AuthController.php';

const DASHBOARD_ROLES = ['admin', 'vet', 'assistant'];

function dashboardEscape(?string $value): string {
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
function dashboardCsrf(): string {
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));
    return $_SESSION['csrf'];
}
function dashboardCsrfValid(): bool {
    return !empty($_SESSION['csrf']) && hash_equals($_SESSION['csrf'], (string) ($_POST['csrf'] ?? ''));
}

// Staff pages share this sign-in; after signing in the user returns to the page they asked for.
$dashboardSelf = in_array(basename((string) parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH)), ['console.php', 'console'], true) ? 'console.php' : 'dashboard.php';
$dashboardError = '';
$dashboardEmail = '';
$action = $_SERVER['REQUEST_METHOD'] === 'POST' ? (string) ($_POST['action'] ?? '') : '';

// Sign out: destroy the session and the stored token.
if ($action === 'logout' && dashboardCsrfValid()) {
    $_SESSION = [];
    if (session_status() === PHP_SESSION_ACTIVE) session_destroy();
    header('Location: dashboard.php');
    exit;
}

// Sign in: server-side validation, then the same password check the API uses.
if ($action === 'login') {
    $dashboardEmail = trim((string) ($_POST['email'] ?? ''));
    if (!dashboardCsrfValid()) {
        $dashboardError = 'Your session expired. Reload the page and try again.';
    } elseif ($dashboardEmail === '' || !filter_var($dashboardEmail, FILTER_VALIDATE_EMAIL)) {
        $dashboardError = 'Enter a valid email address.';
    } elseif (($_POST['password'] ?? '') === '') {
        $dashboardError = 'Enter your password.';
    } else {
        ob_start();
        AuthController::login();
        $result = json_decode((string) ob_get_clean(), true) ?: [];
        http_response_code(200);
        if (!empty($result['success']) && in_array($result['user']['role'] ?? '', DASHBOARD_ROLES, true)) {
            header('Location: ' . $dashboardSelf);
            exit;
        }
        if (!empty($result['success'])) {
            // A pet owner signed in correctly but may not view clinic reports.
            $_SESSION = [];
            $dashboardError = 'This dashboard is for clinic staff only.';
        } else {
            $dashboardError = (string) ($result['error'] ?? 'Unable to sign in.');
        }
    }
}

$currentUser = AuthMiddleware::getCurrentUser();
if ($currentUser && in_array($currentUser['role'], DASHBOARD_ROLES, true)) {
    return; // signed in: the dashboard continues
}

// Not signed in: show only the login form.
http_response_code($currentUser ? 403 : 401);
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex">
  <title>PawCare staff sign in</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { min-height: 100vh; display: grid; place-items: center; background: #f1f5f9; padding: 20px; color: #0f172a; }
    form { width: min(400px, 100%); background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 28px; box-shadow: 0 8px 28px rgba(15,23,42,.08); }
    h1 { font-size: 20px; margin-bottom: 4px; }
    p.sub { color: #64748b; font-size: 14px; margin-bottom: 20px; }
    label { display: block; font-size: 13px; font-weight: 600; margin: 14px 0 6px; }
    input { width: 100%; padding: 11px 12px; border: 1px solid #cbd5e1; border-radius: 10px; font-size: 15px; }
    input:focus { outline: 3px solid #bae6fd; border-color: #0284c7; }
    .err { margin-top: 14px; padding: 10px 12px; border-radius: 10px; background: #fef2f2; color: #b91c1c; font-size: 14px; font-weight: 600; }
    button { width: 100%; margin-top: 20px; padding: 12px; border: 0; border-radius: 10px; background: #0284c7; color: #fff; font-size: 15px; font-weight: 700; cursor: pointer; }
  </style>
</head>
<body>
  <form method="POST" action="<?= dashboardEscape($dashboardSelf) ?>" autocomplete="on">
    <h1>PawCare staff sign in</h1>
    <p class="sub">Clinic reports are available to signed-in staff only.</p>
    <input type="hidden" name="action" value="login">
    <input type="hidden" name="csrf" value="<?= dashboardEscape(dashboardCsrf()) ?>">
    <label for="email">Email</label>
    <input id="email" name="email" type="email" required maxlength="255" autocomplete="username" value="<?= dashboardEscape($dashboardEmail) ?>">
    <label for="password">Password</label>
    <input id="password" name="password" type="password" required maxlength="128" autocomplete="current-password">
    <?php if ($dashboardError): ?><p class="err" role="alert"><?= dashboardEscape($dashboardError) ?></p><?php endif; ?>
    <button type="submit">Sign in</button>
  </form>
</body>
</html>
<?php
exit;
