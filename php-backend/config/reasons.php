<?php
/**
 * Reasons an administrator can choose when an account or price-list item is deactivated, restored, unlocked or retired.
 * Choosing from a list keeps the audit trail consistent; "Other" needs a short explanation.
 * Keep these lists identical to src/accessReasons.js (a test compares them).
 */
class Reasons {
    public const OTHER = 'other';
    public const NOTE_MIN = 5;
    public const NOTE_MAX = 200;

    public const LISTS = [
        'deactivate' => ['left_clinic' => 'Resigned or left the clinic', 'contract_ended' => 'Contract or employment ended', 'role_change' => 'Moved to a role without clinic access', 'security' => 'Security concern or suspected misuse', 'leave' => 'Extended leave of absence', 'duplicate' => 'Duplicate account', 'other' => 'Other (explain below)'],
        'reactivate' => ['returned' => 'Returned to work', 'identity_verified' => 'Identity re-verified', 'by_mistake' => 'Deactivated by mistake', 'contract_renewed' => 'Contract renewed', 'other' => 'Other (explain below)'],
        'unlock' => ['forgot_password' => 'Forgot their password', 'identity_verified' => 'Identity verified in person', 'mistyped' => 'Mistyped the password too many times', 'other' => 'Other (explain below)'],
        'retire' => ['discontinued' => 'Item discontinued', 'not_stocked' => 'No longer stocked or offered', 'replaced' => 'Replaced by another item', 'mistake' => 'Added by mistake', 'price_review' => 'Removed in a price list review', 'other' => 'Other (explain below)'],
        'restore' => ['offered_again' => 'Offered or stocked again', 'by_mistake' => 'Retired by mistake', 'price_review' => 'Brought back in a price list review', 'other' => 'Other (explain below)'],
    ];

    /** Field errors for a chosen reason (empty when valid). */
    public static function errors(string $list, string $code, string $note): array {
        $errors = [];
        $options = self::LISTS[$list] ?? [];
        $note = trim(preg_replace('/\s{2,}/', ' ', $note));
        if (!isset($options[$code])) $errors['reason_code'] = 'Choose a reason from the list.';
        if (mb_strlen($note) > self::NOTE_MAX) $errors['reason_note'] = 'Keep the note under ' . self::NOTE_MAX . ' characters.';
        elseif ($code === self::OTHER && mb_strlen($note) < self::NOTE_MIN) $errors['reason_note'] = 'Explain the reason in at least ' . self::NOTE_MIN . ' characters.';
        elseif ($code === self::OTHER && !preg_match('/\p{L}{3}/u', $note)) $errors['reason_note'] = 'Use words, not only numbers or symbols.';
        elseif (preg_match('/[\x00-\x1f\x7f]/', $note)) $errors['reason_note'] = 'Remove special control characters.';
        return $errors;
    }

    /** The sentence stored on the record and in the audit trail. */
    public static function text(string $list, string $code, string $note): string {
        $note = trim(preg_replace('/\s{2,}/', ' ', $note));
        $label = $code === self::OTHER ? '' : (self::LISTS[$list][$code] ?? '');
        return implode(': ', array_filter([$label, $note])) ?: (self::LISTS[$list][$code] ?? '');
    }
}
