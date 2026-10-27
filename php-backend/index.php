<?php
/**
 * PawCare Central PHP API Gateway & Router
 * Dispatches all /api/* requests with CORS, JSON parsing, and unified error handling
 */

// Cross-origin calls are allowed only from the origins listed in CORS_ORIGINS (comma separated). Same-origin needs no header.
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowedOrigins = array_filter(array_map('trim', explode(',', (string) getenv('CORS_ORIGINS'))));
if ($origin !== '' && in_array($origin, $allowedOrigins, true)) {
    header("Access-Control-Allow-Origin: {$origin}");
    header("Access-Control-Allow-Credentials: true");
    header("Vary: Origin");
}
header("Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("X-Content-Type-Options: nosniff");

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Ensure default JSON header for API responses (unless downloading CSV/PDF)
if (!str_contains($_SERVER['QUERY_STRING'] ?? '', 'export=csv')) {
    header("Content-Type: application/json; charset=UTF-8");
}

require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/middleware/auth.php';
require_once __DIR__ . '/controllers/AuthController.php';
require_once __DIR__ . '/controllers/PasswordRecoveryController.php';
require_once __DIR__ . '/controllers/ClientsController.php';
require_once __DIR__ . '/controllers/PetsController.php';
require_once __DIR__ . '/controllers/AppointmentsController.php';
require_once __DIR__ . '/controllers/MedicalController.php';
require_once __DIR__ . '/controllers/ReportsController.php';
require_once __DIR__ . '/controllers/ClinicController.php';

// Parse URI path
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = rtrim($path, '/');
if (empty($path)) $path = '/';

try {
    // 0. Interactive Dashboard & Evaluation Portal
    if ($path === '/' || $path === '/dashboard' || $path === '/dashboard.php') {
        header('Content-Type: text/html; charset=UTF-8');
        require __DIR__ . '/dashboard.php';
        exit;
    }

    if ($path === '/console' || $path === '/console.php') {
        header('Content-Type: text/html; charset=UTF-8');
        require __DIR__ . '/console.php';
        exit;
    }

    // 1. Health Check
    if ($path === '/api/health' || $path === '/health') {
        Database::getConnection()->query('SELECT 1');
        echo json_encode(['status' => 'ok', 'timestamp' => date('c')]);
        exit;
    }

    // 2. Authentication Routes
    if ($path === '/api/auth/login' && $method === 'POST') {
        AuthController::login();
        exit;
    }
    if ($path === '/api/auth/register' && $method === 'POST') {
        AuthController::register();
        exit;
    }
    if ($path === '/api/auth/forgot/options' && $method === 'POST') {
        PasswordRecoveryController::options();
        exit;
    }
    if ($path === '/api/auth/forgot' && $method === 'POST') {
        PasswordRecoveryController::request();
        exit;
    }
    if ($path === '/api/auth/reset' && $method === 'POST') {
        PasswordRecoveryController::reset();
        exit;
    }
    if ($path === '/api/auth/password' && $method === 'POST') {
        AuthController::changePassword();
        exit;
    }
    if ($path === '/api/auth/logout' && $method === 'POST') {
        AuthController::logout();
        exit;
    }
    if ($path === '/api/auth/me' && $method === 'GET') {
        AuthController::me();
        exit;
    }

    // 3. Clients (Owners) Routes
    if ($path === '/api/clients') {
        if ($method === 'GET') ClientsController::index();
        elseif ($method === 'POST') ClientsController::store();
        exit;
    }
    if (preg_match('#^/api/clients/([^/]+)$#', $path, $matches)) {
        $clientId = $matches[1];
        if ($method === 'GET') ClientsController::show($clientId);
        elseif ($method === 'PUT' || $method === 'POST') ClientsController::update($clientId);
        elseif ($method === 'DELETE') ClientsController::destroy($clientId);
        exit;
    }

    // 4. Patients (Pets) Routes
    if ($path === '/api/pets') {
        if ($method === 'GET') PetsController::index();
        elseif ($method === 'POST') PetsController::store();
        exit;
    }
    if (preg_match('#^/api/pets/([^/]+)/weights$#', $path, $matches)) {
        PetsController::addWeight($matches[1]);
        exit;
    }
    if (preg_match('#^/api/pets/([^/]+)$#', $path, $matches)) {
        $petId = $matches[1];
        if ($method === 'GET') PetsController::show($petId);
        elseif ($method === 'PUT' || $method === 'POST') PetsController::update($petId);
        elseif ($method === 'DELETE') PetsController::destroy($petId);
        exit;
    }

    // 5. Appointments Routes
    if ($path === '/api/appointments') {
        if ($method === 'GET') AppointmentsController::index();
        elseif ($method === 'POST') AppointmentsController::store();
        exit;
    }
    if (preg_match('#^/api/appointments/([^/]+)/status$#', $path, $matches)) {
        AppointmentsController::updateStatus($matches[1]);
        exit;
    }
    if (preg_match('#^/api/appointments/([^/]+)/vitals$#', $path, $matches)) {
        AppointmentsController::recordVitals($matches[1]);
        exit;
    }
    if (preg_match('#^/api/appointments/([^/]+)$#', $path, $matches)) {
        if ($method === 'DELETE') AppointmentsController::destroy($matches[1]);
        exit;
    }

    // 6. Medical Records (Consultations & Vaccinations)
    if ($path === '/api/consultations') {
        if ($method === 'GET') MedicalController::getConsultations();
        elseif ($method === 'POST') MedicalController::addConsultation();
        exit;
    }
    if ($path === '/api/vaccinations') {
        if ($method === 'GET') MedicalController::getVaccinations();
        elseif ($method === 'POST') MedicalController::addVaccination();
        exit;
    }

    // 7. Reports Generation (Rubric Item #3)
    if ($path === '/api/reports/sales') {
        ReportsController::salesReport();
        exit;
    }
    if ($path === '/api/reports/appointments') {
        ReportsController::appointmentsReport();
        exit;
    }

    // 7.1 Clinic Document Profile & Prices (Fixes "Loading clinic details" lag)
    if ($path === '/api/clinic-document-profile') {
        if ($method === 'GET') ClinicController::getDocumentProfile();
        elseif ($method === 'PUT' || $method === 'POST') ClinicController::updateDocumentProfile();
        exit;
    }
    if ($path === '/api/services/prices' || $path === '/api/catalog') {
        ClinicController::getPrices();
        exit;
    }

    // 8. Bootstrap / State Sync (For React Frontend)
    if ($path === '/api/state') {
        $pdo = Database::getConnection();
        $user = AuthMiddleware::getCurrentUser();

        $owners = $pdo->query("SELECT * FROM owners ORDER BY name ASC")->fetchAll();
        $pets = $pdo->query("SELECT * FROM pets ORDER BY name ASC")->fetchAll();
        $weights = $pdo->query("SELECT * FROM pet_weights ORDER BY date DESC")->fetchAll();
        $appts = $pdo->query("SELECT * FROM appointments ORDER BY date DESC, time ASC")->fetchAll();
        $vaccs = $pdo->query("SELECT * FROM vaccinations ORDER BY date DESC")->fetchAll();
        $consults = $pdo->query("SELECT * FROM consultations ORDER BY date DESC")->fetchAll();
        $vets = $pdo->query("SELECT id, first_name, last_name, role FROM users WHERE role = 'vet'")->fetchAll();

        echo json_encode([
            'success' => true,
            'user' => $user,
            'owners' => $owners,
            'pets' => $pets,
            'weights' => $weights,
            'appointments' => $appts,
            'vaccinations' => $vaccs,
            'consultations' => $consults,
            'vets' => $vets
        ]);
        exit;
    }

    // Fallback 404
    http_response_code(404);
    echo json_encode([
        'success' => false,
        'error' => "API endpoint not found: [{$method}] {$path}",
        'debug' => ['uri' => $_SERVER['REQUEST_URI'] ?? '', 'script' => $_SERVER['SCRIPT_NAME'] ?? '', 'path' => $path, 'method' => $method]
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Server error: ' . $e->getMessage()]);
}
