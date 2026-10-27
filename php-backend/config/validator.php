<?php
/**
 * Server-side validation helpers shared by the API controllers and the PHP console.
 * Browser checks are a convenience only; every write is validated again here.
 */
class Validator {
    /** Returns an error message, or '' when the password is acceptable. */
    public static function password(string $password, string $email = ''): string {
        if (strlen($password) < 8) return 'Use at least 8 characters.';
        if (strlen($password) > 72) return 'Use at most 72 characters.';
        if (!preg_match('/[a-z]/', $password)) return 'Add a lowercase letter.';
        if (!preg_match('/[A-Z]/', $password)) return 'Add an uppercase letter.';
        if (!preg_match('/\d/', $password)) return 'Add a number.';
        if (!preg_match('/[^A-Za-z0-9]/', $password)) return 'Add a symbol, for example ! or #.';
        if (preg_match('/\s/', $password)) return 'Do not use spaces.';
        $local = strtolower(explode('@', $email)[0] ?? '');
        if (strlen($local) >= 4 && str_contains(strtolower($password), $local)) return 'Do not include your email name in the password.';
        return '';
    }

    public static function email(string $email): string {
        $email = trim($email);
        if ($email === '') return 'Enter an email address.';
        if (strlen($email) > 255 || !filter_var($email, FILTER_VALIDATE_EMAIL)) return 'Enter a valid email address.';
        return '';
    }

    /** Philippine mobile: 09XXXXXXXXX or +639XXXXXXXXX. */
    public static function phone(string $phone): string {
        $digits = preg_replace('/[\s-]/', '', $phone);
        if ($digits === '') return 'Enter a mobile number.';
        if (!preg_match('/^(09|\+639)\d{9}$/', $digits)) return 'Use a valid PH mobile number: 09XXXXXXXXX or +639XXXXXXXXX.';
        return '';
    }

    public static function personName(string $name, string $label = 'Name'): string {
        $name = trim(preg_replace('/\s{2,}/', ' ', $name));
        if ($name === '') return "Enter the {$label}.";
        if (mb_strlen($name) < 2) return 'Use at least 2 characters.';
        if (mb_strlen($name) > 60) return 'Keep it under 60 characters.';
        if (!preg_match("/^[\p{L}][\p{L} .'\-]*$/u", $name)) return "Use letters, spaces, . ' and - only.";
        return '';
    }

    public static function petName(string $name): string {
        $name = trim($name);
        if ($name === '') return 'Enter the pet\'s name.';
        if (mb_strlen($name) > 30) return 'Keep the name under 30 characters.';
        if (!preg_match("/^[\p{L}\p{N}][\p{L}\p{N} .'\-]*$/u", $name) || !preg_match('/\p{L}/u', $name)) return "Use letters, numbers and . ' - only.";
        return '';
    }

    public static function date(string $value, string $label, bool $notFuture = false, string $earliest = '1990-01-01'): string {
        if ($value === '') return "Enter the {$label}.";
        $d = DateTime::createFromFormat('Y-m-d', $value);
        if (!$d || $d->format('Y-m-d') !== $value) return 'Enter a real date (YYYY-MM-DD).';
        if ($value < $earliest) return "The {$label} must be {$earliest} or later.";
        if ($notFuture && $value > date('Y-m-d')) return "The {$label} cannot be in the future.";
        return '';
    }

    public static function time(string $value): string {
        if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $value)) return 'Enter a time as HH:MM (24-hour).';
        return '';
    }

    public static function weight(mixed $value): string {
        if ($value === '' || $value === null) return 'Enter the weight in kg.';
        if (!is_numeric($value)) return 'Weight must be a number.';
        $w = (float) $value;
        if ($w <= 0 || $w > 120) return 'Weight must be greater than 0 and at most 120 kg.';
        return '';
    }

    public static function text(string $value, string $label, int $min, int $max, bool $required = true): string {
        $value = trim($value);
        if ($value === '') return $required ? "Enter the {$label}." : '';
        if (mb_strlen($value) < $min) return "Use at least {$min} characters.";
        if (mb_strlen($value) > $max) return "Keep it under {$max} characters.";
        return '';
    }

    public static function oneOf(string $value, array $allowed, string $label): string {
        return in_array($value, $allowed, true) ? '' : "Choose a valid {$label}.";
    }

    public static function phoneKey(string $phone): string {
        return preg_replace('/^09/', '639', preg_replace('/\D/', '', $phone));
    }

    /** Keeps only non-empty messages. */
    public static function errors(array $messages): array {
        return array_filter($messages, fn($m) => $m !== '');
    }
}
