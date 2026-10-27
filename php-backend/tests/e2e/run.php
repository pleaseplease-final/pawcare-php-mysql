<?php
/**
 * End-to-end test of the PHP back end: sign-in, lockout, password recovery, and every console workflow
 * (valid input, invalid input, duplicates, unauthorized access, delete protection).
 *
 * Run:  php php-backend/tests/e2e/run.php
 *
 * It copies the PHP code into a temporary folder, swaps the MySQL connection for a throwaway SQLite file,
 * starts PHP's built-in web server on 127.0.0.1:8125 and drives it with real HTTP requests.
 * Your MySQL database and .env are never touched. (SQLite stands in for MySQL; the SQL used is portable.)
 */
$source = realpath(__DIR__ . '/../..');
$tmp = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'pawcare_e2e_' . bin2hex(random_bytes(4));
mkdir($tmp, 0775, true);

$skip = ['tests', 'storage', 'scripts', '.gitignore'];
$items = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($source, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::SELF_FIRST);
foreach ($items as $item) {
    $relative = substr($item->getPathname(), strlen($source) + 1);
    if (in_array(explode(DIRECTORY_SEPARATOR, $relative)[0], $skip, true)) continue;
    $target = $tmp . DIRECTORY_SEPARATOR . $relative;
    $item->isDir() ? @mkdir($target, 0775, true) : copy($item->getPathname(), $target);
}
copy(__DIR__ . '/database_stub.php', $tmp . '/config/database.php');
copy(__DIR__ . '/setup.php', $tmp . '/setup.php');
copy(__DIR__ . '/client.php', $tmp . '/client.php');

passthru(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($tmp . '/setup.php'));
$cron = bin2hex(random_bytes(12));
putenv('CRON_SECRET=' . $cron);
$env = array_merge(getenv(), ['APP_ENV' => 'local', 'CRON_SECRET' => $cron]);
$server = proc_open([PHP_BINARY, '-S', '127.0.0.1:8125', 'index.php'], [0 => ['pipe', 'r'], 1 => ['file', $tmp . '/server.log', 'a'], 2 => ['file', $tmp . '/server.log', 'a']], $pipes, $tmp, $env);
usleep(1500000);
passthru(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($tmp . '/client.php'), $code);
proc_terminate($server);
proc_close($server);

// Remove only the temporary folder created above.
if (!getenv('E2E_KEEP') && str_starts_with(basename($tmp), 'pawcare_e2e_') && str_starts_with($tmp, sys_get_temp_dir())) {
    $cleanup = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($tmp, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($cleanup as $file) { $file->isDir() ? @rmdir($file->getPathname()) : @unlink($file->getPathname()); }
    @rmdir($tmp);
}
exit($code);
