<?php
/**
 * Look and feel shared by the staff console and the owner portal: styles, live (as-you-type) validation script and the form field helper.
 */
function e(mixed $v): string { return dashboardEscape((string) $v); }

function field(string $name, string $label, array $values, array $errors, array $attrs = [], string $type = 'text', array $options = []): void {
    $value = (string) ($values[$name] ?? '');
    $error = $errors[$name] ?? '';
    $id = 'f_' . $name;
    $attr = '';
    foreach ($attrs as $k => $v) $attr .= $v === true ? " {$k}" : ' ' . $k . '="' . e($v) . '"';
    echo '<div class="fld' . ($error ? ' bad' : '') . '"><label for="' . $id . '">' . e($label) . (isset($attrs['required']) ? ' <i>*</i>' : '') . '</label>';
    if ($type === 'select') {
        echo '<select id="' . $id . '" name="' . e($name) . '"' . $attr . '><option value="">Choose…</option>';
        foreach ($options as $val => $text) echo '<option value="' . e($val) . '"' . ((string) $val === $value ? ' selected' : '') . '>' . e($text) . '</option>';
        echo '</select>';
    } elseif ($type === 'textarea') {
        echo '<textarea id="' . $id . '" name="' . e($name) . '" rows="3"' . $attr . '>' . e($value) . '</textarea>';
    } else {
        echo '<input id="' . $id . '" name="' . e($name) . '" type="' . e($type) . '" value="' . e($type === 'password' ? '' : $value) . '"' . $attr . '>';
    }
    echo '<span class="msg" role="status" aria-live="polite">' . e($error) . '</span></div>';
}

function uiStyles(): void { ?>
    :root { --blue:#2563eb; --navy:#1e3a8a; --line:#e3e9f7; --bg:#f4f7ff; --bad:#c2362b; --ok:#15803d; }
    * { box-sizing:border-box; margin:0; padding:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
    body { background:var(--bg); color:#1e293b; }
    header { background:linear-gradient(135deg,#2563eb,#1e3a8a); color:#fff; padding:14px 24px; display:flex; flex-wrap:wrap; gap:12px; justify-content:space-between; align-items:center; }
    header nav { display:flex; gap:6px; flex-wrap:wrap; }
    header nav a { color:#dbe7ff; text-decoration:none; padding:8px 14px; border-radius:99px; font-weight:600; font-size:14px; }
    header nav a.on, header nav a:hover { background:#ffe28a; color:#1e3a8a; }
    header form { display:inline; }
    main { max-width:1200px; margin:22px auto; padding:0 16px 40px; display:grid; gap:16px; }
    h1 { font-size:22px; color:var(--navy); }
    .card { background:#fff; border:1px solid var(--line); border-radius:18px; padding:18px; box-shadow:0 2px 10px rgba(30,58,138,.06); }
    .bar { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
    .filters { display:flex; flex-wrap:wrap; gap:12px; align-items:end; }
    .grid2 { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:4px 18px; }
    .fld { display:flex; flex-direction:column; gap:5px; margin-bottom:10px; }
    .fld label { font-size:13px; font-weight:600; color:#33466f; } .fld i { color:var(--bad); font-style:normal; }
    input, select, textarea { padding:10px 12px; border:2px solid #dbe4f7; border-radius:12px; font-size:14px; background:#f6f9ff; width:100%; }
    input:focus, select:focus, textarea:focus { outline:none; border-color:var(--blue); background:#fff; box-shadow:0 0 0 4px rgba(37,99,235,.14); }
    .fld.bad input, .fld.bad select, .fld.bad textarea { border-color:#f3a8a0; background:#fff6f5; }
    .fld.good input, .fld.good select, .fld.good textarea { border-color:#86efac; background:#f0fdf4; }
    .msg { min-height:1.2em; font-size:12.5px; color:var(--bad); font-weight:600; }
    .btn { display:inline-block; background:var(--blue); color:#fff; border:0; border-radius:99px; padding:9px 18px; font-weight:700; font-size:14px; text-decoration:none; cursor:pointer; }
    .btn.ghost { background:#eaf1ff; color:var(--navy); } .btn.danger { background:#fdeceb; color:#b42318; } .btn.sm { padding:6px 12px; font-size:13px; }
    .actions { display:flex; justify-content:flex-end; gap:10px; margin-top:8px; }
    .flash { padding:10px 14px; border-radius:12px; font-weight:600; margin-bottom:12px; } .flash.ok { background:#dcfce7; color:#14532d; } .flash.err { background:#fef2f2; color:#b91c1c; }
    .tw { overflow-x:auto; } table { width:100%; border-collapse:collapse; } th { text-align:left; background:#f3f6ff; color:#4b5b82; font-size:13px; padding:10px 12px; }
    td { padding:10px 12px; border-top:1px solid #edf1fa; font-size:14px; vertical-align:middle; } td.act { white-space:nowrap; text-align:right; } form.inline { display:inline; }
    .chips { display:flex; flex-wrap:wrap; gap:8px; }
    .chip { display:inline-flex; align-items:center; gap:8px; padding:7px 14px; border-radius:99px; background:#fff; border:1px solid var(--line); color:#33466f; font-weight:600; font-size:13.5px; text-decoration:none; }
    .chip b { background:#e4ebfb; color:#1e3a8a; border-radius:99px; padding:1px 8px; font-size:12px; }
    .chip.on { background:#ffe28a; border-color:#ffd24d; color:#1e3a8a; } .chip.on b { background:#fff; }
    .steps { display:flex; gap:8px; margin-bottom:14px; } .steps span { padding:5px 12px; border-radius:99px; background:#eef1f8; color:#64748b; font-size:13px; font-weight:600; } .steps .on { background:var(--blue); color:#fff; }
    .sub { color:#64748b; margin-bottom:12px; } .reasonline { margin:12px 0; padding:10px 14px; border-radius:12px; background:#eef3ff; } .effects { margin:8px 0 14px 18px; color:#33466f; line-height:1.7; }
    .you { color:#64748b; font-size:13px; padding:0 8px; } code { background:#eef1f8; padding:1px 6px; border-radius:6px; font-size:13px; }
    .pill { padding:5px 12px; border-radius:99px; font-weight:700; font-size:13px; } .pill.ok { background:#dcfce7; color:#15803d; } .pill.warn { background:#fef3c7; color:#b45309; }
    .metrics { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:12px; margin:14px 0; } .metrics>div { border:1px solid var(--line); border-radius:16px; padding:14px 16px; background:#f8faff; }
    .metrics span { display:block; color:#64748b; font-weight:600; font-size:13px; } .metrics b { display:block; font-size:28px; color:var(--navy); margin:4px 0; } .metrics b.small { font-size:17px; } .metrics small { color:#64748b; }
    .metrics .ok { background:#f0fdf4; border-color:#bbf0cc; } .metrics .warn { background:#fffbeb; border-color:#f1dd8a; } .providers { margin:8px 0 14px; color:#475569; } .okt { color:var(--ok); } .badt { color:var(--bad); }
    .filters .fld { margin-bottom:0; } .filters { align-items:flex-end; } .filters input, .filters select { height:46px; } .filters .fld label { line-height:1.3; }
    .pager { display:flex; gap:12px; align-items:center; justify-content:center; margin-top:14px; } .empty { color:#64748b; padding:20px; text-align:center; }
    @media print { header, .noprint, .flash { display:none !important; } body { background:#fff; } .card { box-shadow:none; } }
    h3 { color:var(--navy); margin:14px 0 8px; font-size:16px; }
    @media (max-width:700px) { thead { display:none; } tr { display:block; border:1px solid var(--line); border-radius:14px; margin-bottom:10px; } td { display:flex; justify-content:space-between; gap:10px; border:0; } td::before { content:attr(data-label); font-weight:700; color:#64748b; } td.act { justify-content:flex-end; } }
<?php }

function uiScript(): void { ?>
// Inline validation while typing: uses each field's own rules (required, length, pattern, type) plus a few clinic rules.
(function () {
  var rules = {
    name: [/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'\-]*$/, "Use letters, spaces, . ' and - only."],
    petname: [/^[A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 .'\-]*$/, "Use letters, numbers and . ' - only."],
    phone: [/^(09|\+639)\d{9}$/, 'Use 09XXXXXXXXX or +639XXXXXXXXX.'],
    email: [/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 'Enter a valid email address.'],
    money: [/^\d+(\.\d{1,2})?$/, 'Use numbers only, with at most 2 decimal places.'],
    password: [/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])\S{12,72}$/, 'At least 12 characters with upper, lower, a number and a symbol; no spaces.']
  };
  function check(el) {
    var box = el.closest('.fld'), msg = box.querySelector('.msg'), v = el.value.trim(), text = '';
    var cond = el.getAttribute('data-required-if'), needed = el.hasAttribute('required') || (cond && document.getElementById(cond.split('=')[0]) && document.getElementById(cond.split('=')[0]).value === cond.split('=')[1]);
    if (needed && v === '') text = cond && !el.hasAttribute('required') ? 'Explain the reason (required for Other).' : 'This field is required.';
    else if (v !== '') {
      var rule = rules[el.getAttribute('data-rule')];
      if (rule && !rule[0].test(el.getAttribute('data-rule') === 'phone' ? v.replace(/[\s-]/g, '') : v)) text = rule[1];
      else if (el.minLength > 0 && v.length < el.minLength) text = 'Use at least ' + el.minLength + ' characters.';
      else if (el.validity && !el.validity.valid) text = el.validationMessage;
      var differs = el.getAttribute('data-differs'), match = el.getAttribute('data-match'), who = (el.getAttribute('data-identity') || '').split('@')[0].toLowerCase();
      if (!text && differs && document.getElementById(differs).value === v) text = 'New password must be different from your current password.';
      if (!text && who.length >= 4 && el.getAttribute('data-rule') === 'password' && v.toLowerCase().indexOf(who) !== -1) text = 'Do not include your email name in the password.';
      if (!text && match && document.getElementById(match).value !== v) text = 'Passwords do not match.';
    }
    msg.textContent = text;
    box.classList.toggle('bad', text !== '');
    box.classList.toggle('good', text === '' && v !== '');
    return text === '';
  }
  document.querySelectorAll('form[data-live]').forEach(function (form) {
    var fields = form.querySelectorAll('input:not([type=hidden]), select, textarea');
    fields.forEach(function (el) {
      el.addEventListener('input', function () { check(el); fields.forEach(function (other) { if (other !== el && other.value !== '' && (other.getAttribute('data-match') || other.getAttribute('data-differs') || other.getAttribute('data-required-if'))) check(other); }); });
      el.addEventListener('blur', function () { check(el); });
    });
    form.addEventListener('submit', function (event) {
      var first = null;
      fields.forEach(function (el) { if (!check(el) && !first) first = el; });
      if (first) { event.preventDefault(); first.focus(); }
    });
  });
})();
<?php }
