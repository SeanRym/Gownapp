export function isRealName(name) {
  const value = String(name || "").trim().replace(/\s+/g, " ");
  if (!value) return false;
  return /^[A-Za-z][A-Za-z' -]*[A-Za-z]$/.test(value);
}

export function getPasswordRuleChecks(password) {
  const value = String(password || "");
  return {
    length: value.length >= 8,
    letter: /[A-Za-z]/.test(value),
    number: /\d/.test(value),
  };
}

export function passwordMeetsRules(password) {
  const checks = getPasswordRuleChecks(password);
  return checks.length && checks.letter && checks.number;
}

export function validateSignupForm(form) {
  const firstName = String(form?.firstName || "").trim();
  const lastName = String(form?.lastName || "").trim();
  const email = String(form?.email || "").trim().toLowerCase();
  const password = String(form?.password || "");
  const confirmPassword = String(form?.confirmPassword || "");
  const errors = [];

  if (!firstName) errors.push("Please enter your first name.");
  else if (!isRealName(firstName)) errors.push("Please use a real first name (letters, spaces, hyphens, or apostrophes only).");

  if (!lastName) errors.push("Please enter your last name.");
  else if (!isRealName(lastName)) errors.push("Please use a real last name (letters, spaces, hyphens, or apostrophes only).");

  if (!email) errors.push("Please enter your email address.");
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Please enter a valid email address.");
  if (!password) errors.push("Please enter a password.");
  else if (!passwordMeetsRules(password)) {
    errors.push("Password must be at least 8 characters and include at least one letter and one number.");
  }
  if (!confirmPassword) errors.push("Please confirm your password.");
  else if (password !== confirmPassword) errors.push("Passwords do not match.");

  return { ok: errors.length === 0, errors };
}
