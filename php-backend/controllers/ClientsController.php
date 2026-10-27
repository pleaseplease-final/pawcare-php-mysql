<?php
/**
 * PawCare Clients (Pet Owners) CRUD Controller (PHP)
 * Satisfies System Functionality (Add, Edit, Delete, View, Search) & Server-side Validation
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/auth.php';

require_once __DIR__ . '/../config/rules.php';

class ClientsController {
    /**
     * View & Search Clients (CRUD: Read / Search)
     */
    public static function index(): void {
        $user = AuthMiddleware::requireRole(['admin', 'vet', 'assistant']);
        $pdo = Database::getConnection();

        $search = trim($_GET['search'] ?? '');
        if (!empty($search)) {
            $stmt = $pdo->prepare("
                SELECT o.*, COUNT(p.id) AS pet_count
                FROM owners o
                LEFT JOIN pets p ON p.owner_id = o.id
                WHERE o.name LIKE ? OR o.email LIKE ? OR o.phone LIKE ?
                GROUP BY o.id
                ORDER BY o.name ASC
            ");
            $like = "%{$search}%";
            $stmt->execute([$like, $like, $like]);
        } else {
            $stmt = $pdo->query("
                SELECT o.*, COUNT(p.id) AS pet_count
                FROM owners o
                LEFT JOIN pets p ON p.owner_id = o.id
                GROUP BY o.id
                ORDER BY o.name ASC
            ");
        }

        $clients = $stmt->fetchAll();
        echo json_encode(['success' => true, 'data' => $clients]);
    }

    /**
     * View Single Client Details with Pets (CRUD: Read)
     */
    public static function show(string $id): void {
        $user = AuthMiddleware::requireAuth();
        AuthMiddleware::requireOwnerAccess($user, $id);
        $pdo = Database::getConnection();

        $stmt = $pdo->prepare("SELECT * FROM owners WHERE id = ?");
        $stmt->execute([$id]);
        $owner = $stmt->fetch();

        if (!$owner) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Client not found.']);
            return;
        }

        // Fetch associated pets
        $petStmt = $pdo->prepare("SELECT * FROM pets WHERE owner_id = ? ORDER BY name ASC");
        $petStmt->execute([$id]);
        $owner['pets'] = $petStmt->fetchAll();

        echo json_encode(['success' => true, 'data' => $owner]);
    }

    /**
     * Add New Client (CRUD: Create)
     */
    public static function store(): void {
        $user = AuthMiddleware::requireRole(['admin', 'assistant']);
        $data = json_decode(file_get_contents('php://input'), true) ?: $_POST;

        $name = trim($data['name'] ?? '');
        $email = trim($data['email'] ?? '');
        $phone = trim($data['phone'] ?? '');
        $address = trim($data['address'] ?? '');

        // Server-side validation (formats, required fields and duplicate email or mobile number)
        $pdo = Database::getConnection();
        $errors = Rules::owner($pdo, ['name' => $name, 'email' => $email, 'phone' => $phone, 'address' => $address]);
        if (!empty($errors)) {
            http_response_code((isset($errors['email']) && str_contains($errors['email'], 'already')) || (isset($errors['phone']) && str_contains($errors['phone'], 'already')) ? 409 : 422);
            echo json_encode(['success' => false, 'error' => reset($errors), 'errors' => $errors]);
            return;
        }
        $id = 'o_' . bin2hex(random_bytes(5));

        $stmt = $pdo->prepare("
            INSERT INTO owners (id, name, email, phone, address)
            VALUES (?, ?, ?, ?, ?)
        ");
        $stmt->execute([$id, $name, $email, $phone, $address]);

        // Audit Log
        $pdo->prepare("INSERT INTO audit_logs (id, user_name, user_role, action) VALUES (?, ?, ?, ?)")
            ->execute([uniqid('log_'), "{$user['first_name']} {$user['last_name']}", $user['role'], "Added new client {$name} ({$id})"]);

        http_response_code(201);
        echo json_encode(['success' => true, 'message' => 'Client added successfully', 'id' => $id]);
    }

    /**
     * Edit Client (CRUD: Update)
     */
    public static function update(string $id): void {
        $user = AuthMiddleware::requireRole(['admin', 'assistant']);
        $data = json_decode(file_get_contents('php://input'), true) ?: $_POST;

        $name = trim($data['name'] ?? '');
        $email = trim($data['email'] ?? '');
        $phone = trim($data['phone'] ?? '');
        $address = trim($data['address'] ?? '');

        $pdo = Database::getConnection();
        $check = $pdo->prepare('SELECT id FROM owners WHERE id = ?');
        $check->execute([$id]);
        if (!$check->fetch()) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Owner not found.']);
            return;
        }
        $errors = Rules::owner($pdo, ['name' => $name, 'email' => $email, 'phone' => $phone, 'address' => $address], $id);
        if (!empty($errors)) {
            http_response_code((isset($errors['email']) && str_contains($errors['email'], 'already')) || (isset($errors['phone']) && str_contains($errors['phone'], 'already')) ? 409 : 422);
            echo json_encode(['success' => false, 'error' => reset($errors), 'errors' => $errors]);
            return;
        }
        $stmt = $pdo->prepare("
            UPDATE owners 
            SET name = ?, email = ?, phone = ?, address = ?
            WHERE id = ?
        ");
        $stmt->execute([$name, $email, $phone, $address, $id]);

        echo json_encode(['success' => true, 'message' => 'Client updated successfully']);
    }

    /**
     * Delete Client (CRUD: Delete)
     */
    public static function destroy(string $id): void {
        $user = AuthMiddleware::requireRole(['admin']);
        $pdo = Database::getConnection();

        $stmt = $pdo->prepare("DELETE FROM owners WHERE id = ?");
        $stmt->execute([$id]);

        echo json_encode(['success' => true, 'message' => 'Client deleted successfully']);
    }
}

