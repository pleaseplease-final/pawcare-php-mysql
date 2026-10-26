import React, { useRef, useEffect } from "react";

export default function OtpBoxInput({
  value = "",
  onChange,
  autoFocus = true,
  hasError = false,
  disabled = false,
  onComplete = null
}) {
  const digits = Array.from({ length: 6 }, (_, i) => value[i] || "");
  const inputRefs = useRef([]);

  useEffect(() => {
    if (autoFocus && !disabled && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [autoFocus, disabled]);

  const handleChange = (e, idx) => {
    const raw = e.target.value;
    const cleanDigit = raw.replace(/\D/g, "");

    if (!cleanDigit) {
      // User erased
      const nextArr = [...digits];
      nextArr[idx] = "";
      const nextStr = nextArr.join("").trim();
      onChange(nextStr);
      return;
    }

    // Take the newest character
    const char = cleanDigit.slice(-1);
    const nextArr = [...digits];
    nextArr[idx] = char;
    const nextStr = nextArr.join("");
    onChange(nextStr);

    if (nextStr.length === 6 && onComplete) {
      onComplete(nextStr);
    }

    // Advance focus to next input
    if (idx < 5 && inputRefs.current[idx + 1]) {
      inputRefs.current[idx + 1].focus();
      inputRefs.current[idx + 1].select();
    }
  };

  const handleKeyDown = (e, idx) => {
    if (e.key === "Backspace") {
      if (!digits[idx] && idx > 0 && inputRefs.current[idx - 1]) {
        // Current empty, clear and focus previous
        const nextArr = [...digits];
        nextArr[idx - 1] = "";
        onChange(nextArr.join(""));
        inputRefs.current[idx - 1].focus();
        inputRefs.current[idx - 1].select();
      } else {
        const nextArr = [...digits];
        nextArr[idx] = "";
        onChange(nextArr.join(""));
      }
    } else if (e.key === "ArrowLeft" && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
      inputRefs.current[idx - 1]?.select();
    } else if (e.key === "ArrowRight" && idx < 5) {
      inputRefs.current[idx + 1]?.focus();
      inputRefs.current[idx + 1]?.select();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    if (disabled) return;
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;

    onChange(pasted);
    if (pasted.length === 6 && onComplete) {
      onComplete(pasted);
    }
    const targetIdx = Math.min(pasted.length, 5);
    inputRefs.current[targetIdx]?.focus();
  };

  return (
    <div className="otp-boxes-wrap" onPaste={handlePaste} aria-label="6-digit security code input">
      {digits.map((digit, i) => (
        <React.Fragment key={i}>
          {i === 3 && <span className="otp-divider" aria-hidden="true" />}
          <input
            ref={(el) => (inputRefs.current[i] = el)}
            type="text"
            disabled={disabled}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={2}
            value={digit}
            className={`otp-digit-box ${digit ? "filled" : ""} ${hasError ? "bad" : ""}`}
            onChange={(e) => handleChange(e, i)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            onFocus={(e) => e.target.select()}
            aria-label={`Digit ${i + 1} of 6`}
            autoComplete={i === 0 ? "one-time-code" : "off"}
          />
        </React.Fragment>
      ))}
    </div>
  );
}

