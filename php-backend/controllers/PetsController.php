<?php
/**
 * PawCare Patients (Pets) CRUD Controller (PHP)
 * Satisfies System Functionality (Add, Edit, Delete, View, Search) & Server-side Validation
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/auth.php';

require_once __DIR__ . '/../config/rules.php';

class PetsController {
    /**
     * View & Search Pets (CRUD: Read / Search)
     */
    public static function index(): void {
        $user = AuthMiddleware::requireAuth();
        $pdo = Database::getConnection();

        $search = trim($_GET['search'] ?? '');
        $species = trim($_GET['species'] ?? '');

        $sql = "
            SELECT p.*, o.name AS owner_name, o.phone AS owner_phone
            FROM pets p
            JOIN owners o ON o.id = p.owner_id
            WHERE 1=1
        ";
        $params = [];

        // Scoped to owner if user role is 'owner'
        if ($user['role'] === 'owner') {
            $sql .= " AND (p.owner_id = ? OR o.user_id = ?)";
            $params[] = $user['owner_id'] ?? '';
            $params[] = $user['id'];
        }

        if (!empty($species)) {
            $sql .= " AND LOWER(p.species) = LOWER(?)";
            $params[] = $species;
        }

        if (!empty($search)) {
            $sql .= " AND (p.name LIKE ? OR p.breed LIKE ? OR o.name LIKE ?)";
            $like = "%{$search}%";
            $params[] = $like;
            $params[] = $like;
            $params[] = $like;
        }

        $sql .= " ORDER BY p.name ASC";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        $pets = $stmt->fetchAll();
        echo json_encode(['success' => true, 'data' => $pets]);
    }

    /**
     * View Single Pet Details with Medical History (CRUD: Read)
     */
    public static function show(string $id): void {
        $user = AuthMiddleware::requireAuth();
        $pdo = Database::getConnection();
        AuthMiddleware::requirePetAccess($pdo, $user, $id);

        $stmt = $pdo->prepare("
            SELECT p.*, o.name AS owner_name, o.phone AS owner_phone, o.email AS owner_email
            FROM pets p
            JOIN owners o ON o.id = p.owner_id
            WHERE p.id = ?
        ");
        $stmt->execute([$id]);
        $pet = $stmt->fetch();

        if (!$pet) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Patient record not found.']);
            return;
        }

        // Weights
        $wStmt = $pdo->prepare("SELECT * FROM pet_weights WHERE pet_id = ? ORDER BY date DESC");
        $wStmt->execute([$id]);
        $pet['weight_history'] = $wStmt->fetchAll();

        // Vaccinations
        $vStmt = $pdo->prepare("SELECT * FROM vaccinations WHERE pet_id = ? ORDER BY date DESC");
        $vStmt->execute([$id]);
        $pet['vaccinations'] = $vStmt->fetchAll();

        // Consultations
        $cStmt = $pdo->prepare("SELECT * FROM consultations WHERE pet_id = ? ORDER BY date DESC");
        $cStmt->execute([$id]);
        $pet['consultations'] = $cStmt->fetchAll();

        echo json_encode(['success' => true, 'data' => $pet]);
    }

    /**
     * Add New Patient (CRUD: Create)
     */
    public static function store(): void {
        $user = AuthMiddleware::requireRole(['admin', 'assistant', 'vet']);
        $data = json_decode(file_get_contents('php://input'), true) ?: $_POST;

        $ownerId = $data['owner_id'] ?? ($user['role'] === 'owner' ? $user['owner_id'] : '');
        $name = trim($data['name'] ?? '');
        $species = trim($data['species'] ?? 'Dog');
        $breed = trim($data['breed'] ?? 'Mixed Breed');
        $sex = trim($data['sex'] ?? 'Male');
        $birth = $data['birth'] ?? date('Y-m-d');
        $weight = floatval($data['weight'] ?? 5.0);
        $color = trim($data['color'] ?? '');
        $neutered = trim($data['neutered'] ?? 'Not sure');
        $notes = trim($data['notes'] ?? '');

        // Server-side validation (formats, allowed values, plausible dates and duplicate pets)
        $pdo = Database::getConnection();
        $errors = Rules::pet($pdo, ['owner_id' => $ownerId, 'name' => $name, 'species' => $species, 'breed' => $breed, 'sex' => $sex, 'birth' => $birth,
            'weight' => $data['weight'] ?? 5.0, 'neutered' => $neutered, 'color' => $color, 'notes' => $notes]);
        if (!empty($errors)) {
            http_response_code(isset($errors['name']) && str_contains($errors['name'], 'already has') ? 409 : 422);
            echo json_encode(['success' => false, 'error' => reset($errors), 'errors' => $errors]);
            return;
        }
        $petId = 'p_' . bin2hex(random_bytes(5));
        $cardId = 'VACC-' . date('Y') . '-' . rand(1000, 9999);

        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare("
                INSERT INTO pets (id, owner_id, name, species, breed, sex, birth, weight, color, neutered, vaccination_card_id, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([$petId, $ownerId, $name, $species, $breed, $sex, $birth, $weight, $color, $neutered, $cardId, $notes]);

            // Initial weight log
            $wStmt = $pdo->prepare("INSERT INTO pet_weights (id, pet_id, date, kg, recorded_by) VALUES (?, ?, CURDATE(), ?, ?)");
            $wStmt->execute([uniqid('wt_'), $petId, $weight, $user['first_name'] ?? 'Staff']);

            $pdo->commit();

            echo json_encode([
                'success' => true,
                'message' => 'Patient record created successfully',
                'id' => $petId,
                'card_id' => $cardId
            ]);
        } catch (Exception $e) {
            $pdo->rollBack();
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Failed to add pet: ' . $e->getMessage()]);
        }
    }

    /**
     * Edit Patient (CRUD: Update)
     */
    public static function update(string $id): void {
        $user = AuthMiddleware::requireRole(['admin', 'vet', 'assistant']);
        $data = json_decode(file_get_contents('php://input'), true) ?: $_POST;

        $name = trim($data['name'] ?? '');
        $species = trim($data['species'] ?? 'Dog');
        $breed = trim($data['breed'] ?? '');
        $sex = trim($data['sex'] ?? 'Male');
        $birth = $data['birth'] ?? date('Y-m-d');
        $weight = floatval($data['weight'] ?? 5.0);
        $color = trim($data['color'] ?? '');
        $neutered = trim($data['neutered'] ?? 'Not sure');
        $notes = trim($data['notes'] ?? '');

        $pdo = Database::getConnection();
        $owner = $pdo->prepare('SELECT owner_id FROM pets WHERE id = ?');
        $owner->execute([$id]);
        $ownerId = $owner->fetchColumn();
        if ($ownerId === false) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Patient not found.']);
            return;
        }
        $errors = Rules::pet($pdo, ['owner_id' => $ownerId, 'name' => $name, 'species' => $species, 'breed' => $breed, 'sex' => $sex, 'birth' => $birth,
            'weight' => $data['weight'] ?? '', 'neutered' => $neutered, 'color' => $color, 'notes' => $notes], $id);
        if (!empty($errors)) {
            http_response_code(isset($errors['name']) && str_contains($errors['name'], 'already has') ? 409 : 422);
            echo json_encode(['success' => false, 'error' => reset($errors), 'errors' => $errors]);
            return;
        }
        $stmt = $pdo->prepare("
            UPDATE pets 
            SET name = ?, species = ?, breed = ?, sex = ?, birth = ?, weight = ?, color = ?, neutered = ?, notes = ?
            WHERE id = ?
        ");
        $stmt->execute([$name, $species, $breed, $sex, $birth, $weight, $color, $neutered, $notes, $id]);

        echo json_encode(['success' => true, 'message' => 'Patient record updated successfully']);
    }

    /**
     * Delete Patient (CRUD: Delete)
     */
    public static function destroy(string $id): void {
        $user = AuthMiddleware::requireRole(['admin']);
        $pdo = Database::getConnection();

        $stmt = $pdo->prepare("DELETE FROM pets WHERE id = ?");
        $stmt->execute([$id]);

        echo json_encode(['success' => true, 'message' => 'Patient record deleted successfully']);
    }

    /**
     * Log Weight
     */
    public static function addWeight(string $id): void {
        $user = AuthMiddleware::requireRole(['admin', 'vet', 'assistant']);
        $data = json_decode(file_get_contents('php://input'), true) ?: $_POST;
        $kg = floatval($data['kg'] ?? $data['weight'] ?? 0);

        if ($kg <= 0) {
            http_response_code(422);
            echo json_encode(['success' => false, 'error' => 'Valid weight is required.']);
            return;
        }

        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("INSERT INTO pet_weights (id, pet_id, date, kg, recorded_by) VALUES (?, ?, CURDATE(), ?, ?)");
        $stmt->execute([uniqid('wt_'), $id, $kg, $user['first_name'] ?? 'Staff']);

        // Update current weight in pets table
        $pdo->prepare("UPDATE pets SET weight = ? WHERE id = ?")->execute([$kg, $id]);

        echo json_encode(['success' => true, 'message' => 'Weight logged successfully']);
    }
}

