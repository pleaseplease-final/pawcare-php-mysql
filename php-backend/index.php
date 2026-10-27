<?php
/**
 * PawCare Central PHP API Gateway & Router
 * Dispatches all /api/* requests with CORS, JSON parsing, and unified error handling
 */

// Cross-origin support: allow local Vite frontend, Vercel frontend, and configured CORS_ORIGINS
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowedOrigins = array_filter(array_map('trim', explode(',', (string) getenv('CORS_ORIGINS'))));
$isLocalDev = preg_match('#^https?://(localhost|127\.0\.0\.1)(:\d+)?$#', $origin);
if ($origin !== '' && ($isLocalDev || in_array($origin, $allowedOrigins, true) || empty($allowedOrigins))) {
    header("Access-Control-Allow-Origin: {$origin}");
    header("Access-Control-Allow-Credentials: true");
    header("Vary: Origin");
}
header("Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, If-None-Match");
header("Access-Control-Expose-Headers: ETag, Retry-After");
header("X-Content-Type-Options: nosniff");

// Handle preflight OPTIONS request
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Ensure default JSON header for API responses (unless downloading CSV/PDF)
if (!str_contains($_SERVER['QUERY_STRING'] ?? '', 'export=csv') && !str_contains($_SERVER['REQUEST_URI'] ?? '', '/pdf')) {
    header("Content-Type: application/json; charset=UTF-8");
}

require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/middleware/auth.php';
require_once __DIR__ . '/controllers/AuthController.php';
require_once __DIR__ . '/controllers/PasswordRecoveryController.php';
require_once __DIR__ . '/controllers/GeoCheckController.php';
require_once __DIR__ . '/controllers/JsxClinicController.php';
require_once __DIR__ . '/controllers/ClientsController.php';
require_once __DIR__ . '/controllers/PetsController.php';
require_once __DIR__ . '/controllers/AppointmentsController.php';
require_once __DIR__ . '/controllers/MedicalController.php';
require_once __DIR__ . '/controllers/ReportsController.php';
require_once __DIR__ . '/controllers/ClinicController.php';
require_once __DIR__ . '/controllers/StateController.php';

// Parse URI path
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = rtrim($path, '/');
if (empty($path)) $path = '/';

try {
    // 0. Interactive Dashboard & Evaluation Portal
    if ($path === '/') {
        header('Location: /console.php');
        exit;
    }
    if ($path === '/dashboard' || $path === '/dashboard.php') {
        header('Content-Type: text/html; charset=UTF-8');
        require __DIR__ . '/dashboard.php';
        exit;
    }
    if ($path === '/portal' || $path === '/portal.php') {
        header('Content-Type: text/html; charset=UTF-8');
        require __DIR__ . '/portal.php';
        exit;
    }
    if ($path === '/console' || $path === '/console.php') {
        header('Content-Type: text/html; charset=UTF-8');
        require __DIR__ . '/console.php';
        exit;
    }

    if ($path === '/api/jobs/reminders' && $method === 'GET') {
        $secret = (string) getenv('CRON_SECRET');
        if ($secret === '') { http_response_code(503); echo json_encode(['success' => false, 'error' => 'The reminder scheduler is not configured. Set CRON_SECRET.']); exit; }
        $supplied = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        if (!hash_equals('Bearer ' . $secret, $supplied)) { http_response_code(401); echo json_encode(['success' => false, 'error' => 'Unauthorized']); exit; }
        require_once __DIR__ . '/config/reminders.php';
        echo json_encode(['success' => true] + Reminders::run(Database::getConnection()));
        exit;
    }

    // 1. Health Check
    if ($path === '/api/health' || $path === '/health') {
        Database::getConnection()->query('SELECT 1');
        echo json_encode(['status' => 'ok', 'timestamp' => date('c')]);
        exit;
    }

    // 2. Authentication & Account Management
    if ($path === '/api/auth/login' && $method === 'POST') { AuthController::login(); exit; }
    if ($path === '/api/auth/register' && $method === 'POST') { AuthController::register(); exit; }
    if ($path === '/api/auth/forgot/options' && $method === 'POST') { PasswordRecoveryController::options(); exit; }
    if ($path === '/api/auth/forgot' && $method === 'POST') { PasswordRecoveryController::request(); exit; }
    if ($path === '/api/auth/reset' && $method === 'POST') { PasswordRecoveryController::reset(); exit; }
    if ($path === '/api/auth/password' && $method === 'POST') { AuthController::changePassword(); exit; }
    if ($path === '/api/auth/password/check' && $method === 'POST') { AuthController::checkPassword(); exit; }
    if ($path === '/api/auth/logout' && $method === 'POST') { AuthController::logout(); exit; }
    if ($path === '/api/auth/me' && $method === 'GET') { AuthController::me(); exit; }
    if ($path === '/api/auth/resend-verification' && $method === 'POST') { AuthController::resendVerification(); exit; }
    if (($path === '/api/auth/verify' || $path === '/api/auth/verify-email') && $method === 'GET') { AuthController::verifyEmail(); exit; }
    if ($path === '/api/auth/unlock' && ($method === 'GET' || $method === 'POST')) { AuthController::unlock(); exit; }
    if ($path === '/api/auth/otp/info' && $method === 'GET') { AuthController::otpInfo(); exit; }
    if ($path === '/api/auth/otp/resend' && $method === 'POST') { AuthController::otpResend(); exit; }
    if ($path === '/api/auth/otp/verify' && $method === 'POST') { AuthController::otpVerify(); exit; }
    if ($path === '/api/auth/profile') {
        if ($method === 'GET') AuthController::me();
        elseif ($method === 'PUT') AuthController::profile();
        exit;
    }
    if ($path === '/api/auth/profile/photo') { AuthController::profilePhoto(); exit; }
    if (($path === '/api/auth/profile/contact' || $path === '/api/owner/contact' || $path === '/api/auth/contact-change/request') && $method === 'POST') {
        AuthController::requestContactChange();
        exit;
    }
    if (($path === '/api/auth/profile/contact/verify' || $path === '/api/auth/contact-change/verify') && $method === 'POST') {
        AuthController::verifyContactChange();
        exit;
    }
    if ($path === '/api/auth/staff/invite' && $method === 'POST') { AuthController::inviteStaff(); exit; }
    if ($path === '/api/auth/staff/invite-info' && $method === 'GET') { AuthController::staffInviteInfo(); exit; }
    if ($path === '/api/auth/staff/accept-invite' && $method === 'POST') { AuthController::staffAcceptInvite(); exit; }
    if ($path === '/api/auth/available' && $method === 'GET') { GeoCheckController::checkFieldAvailability(); exit; }

    // 3. Geographic / Location & Validation endpoints
    if ($path === '/api/geo/countries' && $method === 'GET') { GeoCheckController::countries(); exit; }
    if (preg_match('#^/api/geo/countries/([^/]+)$#', $path, $matches) && $method === 'GET') { GeoCheckController::country($matches[1]); exit; }
    if ($path === '/api/geo/states' && $method === 'GET') { GeoCheckController::states(); exit; }
    if ($path === '/api/geo/cities' && $method === 'GET') { GeoCheckController::cities(); exit; }
    if ($path === '/api/geo/zips' && $method === 'GET') { GeoCheckController::zips(); exit; }
    if ($path === '/api/geo/validate' && $method === 'POST') { GeoCheckController::validateAddress(); exit; }
    if ($path === '/api/check/email' && $method === 'POST') { GeoCheckController::checkEmail(); exit; }
    if ($path === '/api/check/mobile' && $method === 'POST') { GeoCheckController::checkMobile(); exit; }

    // 4. State Sync (Full, Summary, History)
    if (in_array($path, ['/api/state', '/api/state/summary', '/api/state/history'], true) && $method === 'GET') {
        StateController::get();
        exit;
    }

    // 5. Prices & Catalogs
    if ($path === '/api/services/prices' || $path === '/api/catalog') {
        JsxClinicController::getPrices();
        exit;
    }
    if ($path === '/api/clinical/note-options') {
        if ($method === 'GET') JsxClinicController::getNoteOptions();
        elseif ($method === 'PUT') JsxClinicController::saveNoteOptions();
        exit;
    }
    if ($path === '/api/clinic-document-profile') {
        if ($method === 'GET') ClinicController::getDocumentProfile();
        elseif ($method === 'PUT' || $method === 'POST') ClinicController::updateDocumentProfile();
        exit;
    }

    // 6. Pet Requests & Registrations
    if ($path === '/api/pet-requests' || $path === '/api/owner/pets') {
        if ($method === 'POST') JsxClinicController::savePetRequest();
        exit;
    }
    if (preg_match('#^/api/pet-requests/([^/]+)$#', $path, $m)) {
        if ($method === 'PUT') JsxClinicController::savePetRequest($m[1]);
        elseif ($method === 'DELETE') JsxClinicController::deletePetRequest($m[1]);
        exit;
    }
    if (preg_match('#^/api/pet-requests/([^/]+)/approve$#', $path, $m) && $method === 'POST') {
        JsxClinicController::approvePetRequest($m[1]);
        exit;
    }
    if (preg_match('#^/api/pet-requests/([^/]+)/decline$#', $path, $m) && $method === 'POST') {
        JsxClinicController::declinePetRequest($m[1]);
        exit;
    }

    // 7. Owner & Pet Detail Updates
    if (preg_match('#^/api/owners/([^/]+)/details$#', $path, $m) && ($method === 'PUT' || $method === 'POST')) {
        JsxClinicController::updateOwnerDetails($m[1]);
        exit;
    }
    if (preg_match('#^/api/owners/([^/]+)/account-link/([^/]+)$#', $path, $m) && $method === 'POST') {
        JsxClinicController::ownerAccountLink($m[1], $m[2]);
        exit;
    }
    if (preg_match('#^/api/pets/([^/]+)/details$#', $path, $m) && ($method === 'PUT' || $method === 'POST')) {
        JsxClinicController::updatePetDetails($m[1]);
        exit;
    }
    if (preg_match('#^/api/pets/([^/]+)/reference-history$#', $path, $m) && ($method === 'PUT' || $method === 'POST')) {
        JsxClinicController::savePetReferenceHistory($m[1]);
        exit;
    }
    if (preg_match('#^/api/(?:owner/)?pets/([^/]+)/allergies$#', $path, $m) && ($method === 'PUT' || $method === 'POST')) {
        JsxClinicController::savePetAllergies($m[1]);
        exit;
    }
    if (preg_match('#^/api/(?:owner/)?pets/([^/]+)/weights$#', $path, $m) && $method === 'POST') {
        JsxClinicController::addPetWeight($m[1]);
        exit;
    }
    if (preg_match('#^/api/(?:owner/)?pets/([^/]+)/photo$#', $path, $m) && $method === 'POST') {
        JsxClinicController::savePetPhoto($m[1]);
        exit;
    }
    if (preg_match('#^/api/(?:owner/)?pets/([^/]+)/notes$#', $path, $m) && $method === 'POST') {
        JsxClinicController::savePetNotes($m[1]);
        exit;
    }

    // 8. Vitals & Digital Vet Card
    if (preg_match('#^/api/pets/([^/]+)/vitals/([^/]+)/correct$#', $path, $m) && $method === 'POST') {
        JsxClinicController::correctPetVital($m[1], $m[2]);
        exit;
    }
    if (preg_match('#^/api/pets/([^/]+)/vitals$#', $path, $m) && $method === 'GET') {
        JsxClinicController::getPetVitals($m[1]);
        exit;
    }
    if (preg_match('#^/api/pets/([^/]+)/vet-card/pdf$#', $path, $m) && $method === 'GET') {
        JsxClinicController::getVetCardPdf($m[1]);
        exit;
    }
    if (preg_match('#^/api/pets/([^/]+)/vet-card$#', $path, $m) && $method === 'GET') {
        JsxClinicController::getVetCard($m[1]);
        exit;
    }

    // 9. Appointments & Visits
    if ($path === '/api/appointments/availability' && $method === 'GET') {
        JsxClinicController::appointmentAvailability();
        exit;
    }
    if ($path === '/api/appointments') {
        if ($method === 'GET') AppointmentsController::index();
        elseif ($method === 'POST') JsxClinicController::saveAppointment();
        exit;
    }
    if (preg_match('#^/api/appointments/([^/]+)/status$#', $path, $m) && ($method === 'PATCH' || $method === 'POST')) {
        JsxClinicController::updateAppointmentStatus($m[1]);
        exit;
    }
    if (preg_match('#^/api/appointments/([^/]+)/close$#', $path, $m) && $method === 'POST') {
        JsxClinicController::closeAppointment($m[1]);
        exit;
    }
    if (preg_match('#^/api/appointments/([^/]+)/handoff$#', $path, $m) && $method === 'POST') {
        JsxClinicController::handoffAppointment($m[1]);
        exit;
    }
    if (preg_match('#^/api/appointments/([^/]+)/billing$#', $path, $m) && $method === 'POST') {
        JsxClinicController::billAppointment($m[1]);
        exit;
    }
    if (preg_match('#^/api/appointments/([^/]+)/vitals$#', $path, $m) && $method === 'POST') {
        AppointmentsController::recordVitals($m[1]);
        exit;
    }
    if (preg_match('#^/api/appointments/([^/]+)$#', $path, $m)) {
        if ($method === 'PUT' || $method === 'POST') JsxClinicController::saveAppointment($m[1]);
        elseif ($method === 'DELETE') AppointmentsController::destroy($m[1]);
        exit;
    }
    if ($path === '/api/walk-in' && $method === 'POST') {
        JsxClinicController::walkIn();
        exit;
    }

    // 10. Medical Records (Consultations & Vaccinations)
    if ($path === '/api/consultations') {
        if ($method === 'GET') MedicalController::getConsultations();
        elseif ($method === 'POST') JsxClinicController::saveConsultation();
        exit;
    }
    if ($path === '/api/vaccinations') {
        if ($method === 'GET') MedicalController::getVaccinations();
        elseif ($method === 'POST') MedicalController::addVaccination();
        exit;
    }
    if (preg_match('#^/api/vaccinations/([^/]+)$#', $path, $m) && $method === 'DELETE') {
        JsxClinicController::deleteVaccination($m[1]);
        exit;
    }

    // 11. Checkout Inbox & Admissions
    if ($path === '/api/checkout-inbox' && $method === 'GET') {
        JsxClinicController::checkoutInbox();
        exit;
    }
    if (preg_match('#^/api/checkout-inbox/([^/]+)/([^/]+)$#', $path, $m) && $method === 'POST') {
        JsxClinicController::checkoutAction($m[1], $m[2]);
        exit;
    }
    if ($path === '/api/admissions/eligible' && $method === 'GET') {
        JsxClinicController::admissionsEligible();
        exit;
    }
    if ($path === '/api/admissions') {
        if ($method === 'GET') JsxClinicController::admissionsIndex();
        elseif ($method === 'POST') JsxClinicController::admissionCreate();
        exit;
    }
    if (preg_match('#^/api/admissions/([^/]+)/([^/]+)$#', $path, $m) && $method === 'POST') {
        JsxClinicController::admissionAction($m[1], $m[2]);
        exit;
    }

    // 12. Reminders
    if ($path === '/api/reminders/status' && $method === 'GET') {
        JsxClinicController::remindersStatus();
        exit;
    }
    if ($path === '/api/reminders/calls' && $method === 'GET') {
        JsxClinicController::remindersCalls();
        exit;
    }
    if (($path === '/api/reminders/log-call' || $path === '/api/reminders/send') && $method === 'POST') {
        JsxClinicController::remindersLogCall();
        exit;
    }

    // 13. Audit Logs
    if ($path === '/api/logs') {
        if ($method === 'GET') JsxClinicController::getLogs();
        elseif ($method === 'POST') JsxClinicController::addLog();
        exit;
    }

    // 14. Admin Management (Staff, Audit, Catalog)
    if ($path === '/api/admin/staff/email-availability' && $method === 'GET') {
        GeoCheckController::checkEmail();
        exit;
    }
    if ($path === '/api/admin/staff' && $method === 'GET') {
        JsxClinicController::adminStaffList();
        exit;
    }
    if (preg_match('#^/api/admin/staff/([^/]+)/access$#', $path, $m) && $method === 'POST') {
        JsxClinicController::adminStaffAccess($m[1]);
        exit;
    }
    if (preg_match('#^/api/admin/invitations/([^/]+)/revoke$#', $path, $m) && $method === 'POST') {
        JsxClinicController::adminStaffAccess($m[1]);
        exit;
    }
    if ($path === '/api/admin/audit' && $method === 'GET') {
        JsxClinicController::adminAudit();
        exit;
    }
    if ($path === '/api/admin/catalog') {
        if ($method === 'GET') JsxClinicController::adminCatalogList();
        elseif ($method === 'POST') JsxClinicController::adminCatalogCreate();
        exit;
    }
    if (preg_match('#^/api/admin/catalog/([^/]+)$#', $path, $m) && ($method === 'PUT' || $method === 'POST')) {
        JsxClinicController::adminCatalogUpdate($m[1]);
        exit;
    }

    // 15. Clients (Owners) CRUD Routes (for legacy tests & portal)
    if ($path === '/api/clients' || $path === '/api/owners') {
        if ($method === 'GET') ClientsController::index();
        elseif ($method === 'POST') ClientsController::store();
        exit;
    }
    if (preg_match('#^/api/(?:clients|owners)/([^/]+)$#', $path, $matches)) {
        $clientId = $matches[1];
        if ($method === 'GET') ClientsController::show($clientId);
        elseif ($method === 'PUT' || $method === 'POST') ClientsController::update($clientId);
        elseif ($method === 'DELETE') ClientsController::destroy($clientId);
        exit;
    }

    // 16. Patients (Pets) CRUD Routes (for legacy tests & portal)
    if ($path === '/api/pets') {
        if ($method === 'GET') PetsController::index();
        elseif ($method === 'POST') PetsController::store();
        exit;
    }
    if (preg_match('#^/api/pets/([^/]+)$#', $path, $matches)) {
        $petId = $matches[1];
        if ($method === 'GET') PetsController::show($petId);
        elseif ($method === 'PUT' || $method === 'POST') PetsController::update($petId);
        elseif ($method === 'DELETE') PetsController::destroy($petId);
        exit;
    }

    // 17. Reports Generation (Rubric Item #3)
    if ($path === '/api/reports/sales') {
        ReportsController::salesReport();
        exit;
    }
    if ($path === '/api/reports/appointments') {
        ReportsController::appointmentsReport();
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
