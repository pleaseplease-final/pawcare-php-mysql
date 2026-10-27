<?php
// Run: php php-backend/tests/validator_test.php   (no database needed)
require_once __DIR__ . '/../config/validator.php';
require_once __DIR__ . '/../controllers/PasswordRecoveryController.php';

$passed = 0; $failed = [];
function check(string $name, bool $ok): void { global $passed, $failed; $ok ? $passed++ : $failed[] = $name; }

// Passwords
check('good password accepted', Validator::password('Sunny#Day42', 'maria@example.com') === '');
check('short password rejected', Validator::password('Ab1!') !== '');
check('no uppercase rejected', Validator::password('sunny#day42') !== '');
check('no lowercase rejected', Validator::password('SUNNY#DAY42') !== '');
check('no digit rejected', Validator::password('Sunny#Day') !== '');
check('no symbol rejected', Validator::password('SunnyDay42') !== '');
check('spaces rejected', Validator::password('Sunny #Day42') !== '');
check('email name inside password rejected', Validator::password('Maria#2026x', 'maria@example.com') !== '');

// Email and phone
check('valid email', Validator::email('a@b.co') === '');
check('invalid email', Validator::email('not-an-email') !== '');
check('blank email', Validator::email('') !== '');
check('09 mobile', Validator::phone('0917 123 4567') === '');
check('+63 mobile', Validator::phone('+63 917-123-4567') === '');
check('short mobile rejected', Validator::phone('12345') !== '');
check('phone keys match across formats', Validator::phoneKey('0917 123 4567') === Validator::phoneKey('+63 917-123-4567'));

// Names
check('person name ok', Validator::personName("Maria O'Brien-Santos") === '');
check('digits in a person name rejected', Validator::personName('Maria 3') !== '');
check('pet name ok', Validator::petName('Biscuit 2') === '');
check('symbol-only pet name rejected', Validator::petName('###') !== '');

// Dates, times, weight
check('real past date ok', Validator::date('2021-03-04', 'birth date', true) === '');
check('impossible date rejected', Validator::date('2021-02-31', 'birth date', true) !== '');
check('future birth rejected', Validator::date(date('Y-m-d', strtotime('+2 days')), 'birth date', true) !== '');
check('too-early date rejected', Validator::date('1980-01-01', 'birth date', true) !== '');
check('time ok', Validator::time('09:30') === '');
check('bad time rejected', Validator::time('25:00') !== '');
check('weight ok', Validator::weight('5.5') === '');
check('zero weight rejected', Validator::weight('0') !== '');
check('text weight rejected', Validator::weight('abc') !== '');
check('huge weight rejected', Validator::weight('500') !== '');
check('one-of ok', Validator::oneOf('Male', ['Male', 'Female'], 'sex') === '');
check('one-of rejects others', Validator::oneOf('Robot', ['Male', 'Female'], 'sex') !== '');

// Masking used by the recovery options
check('email masked', PasswordRecoveryController::maskEmail('maria@example.com') === 'm****@example.com');
check('phone masked to last 4', PasswordRecoveryController::maskPhone('+639171234567') === '********4567');

echo "{$passed} passed, " . count($failed) . " failed\n";
foreach ($failed as $name) echo "  FAILED: {$name}\n";
exit($failed ? 1 : 0);
