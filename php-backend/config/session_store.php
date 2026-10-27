<?php
/**
 * Keeps PHP sessions in the database instead of in files.
 * Hosts such as Vercel run every request on a fresh, short-lived server, so file sessions would sign everyone out
 * on every click. Turn this on with the environment variable SESSION_STORE=db. It works the same on any host.
 */
final class DbSessionHandler implements SessionHandlerInterface {
    public function __construct(private PDO $pdo) {
        $pdo->exec("CREATE TABLE IF NOT EXISTS php_sessions (
            id VARCHAR(128) NOT NULL PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at INT NOT NULL
        )");
    }
    public function open(string $path, string $name): bool { return true; }
    public function close(): bool { return true; }
    public function read(string $id): string|false {
        $stmt = $this->pdo->prepare('SELECT data FROM php_sessions WHERE id = ? AND updated_at > ?');
        $stmt->execute([$id, time() - (int) ini_get('session.gc_maxlifetime')]);
        $data = $stmt->fetchColumn();
        return $data === false ? '' : (string) $data;
    }
    public function write(string $id, string $data): bool {
        $this->pdo->prepare('REPLACE INTO php_sessions (id, data, updated_at) VALUES (?, ?, ?)')->execute([$id, $data, time()]);
        return true;
    }
    public function destroy(string $id): bool {
        $this->pdo->prepare('DELETE FROM php_sessions WHERE id = ?')->execute([$id]);
        return true;
    }
    public function gc(int $max_lifetime): int|false {
        $stmt = $this->pdo->prepare('DELETE FROM php_sessions WHERE updated_at < ?');
        $stmt->execute([time() - $max_lifetime]);
        return $stmt->rowCount();
    }
}
