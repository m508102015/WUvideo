const secretKey = /(password|passwd|token|secret|authorization|cookie|api[-_]?key)/i;
const bearer = /\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi;
const githubToken = /\b(gh[opusr]_[A-Za-z0-9_]{20,})\b/g;
const jwt = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const secretName = '(?:password|passwd|token|secret|authorization|cookie|api[-_]?key)';

function redactAssignments(value) {
  return value
    .replace(new RegExp(`("${secretName}"\\s*:\\s*)"[^"]*"`, 'gi'), '$1"[REDACTED]"')
    .replace(new RegExp(`('(?:${secretName})'\\s*:\\s*)'[^']*'`, 'gi'), "$1'[REDACTED]'")
    .replace(new RegExp(`\\b(${secretName})(\\s*=\\s*)[^\\s,;]+`, 'gi'), '$1$2[REDACTED]')
    .replace(new RegExp(`(--${secretName})(?:=|\\s+)([^\\s]+)`, 'gi'), '$1=[REDACTED]')
    .replace(/\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API_KEY|AUTHORIZATION|COOKIE)[A-Z0-9_]*=)([^\s]+)/g, '$1[REDACTED]')
    .replace(/(https?:\/\/[^\s/:@]+:)[^\s@/]+@/gi, '$1[REDACTED]@');
}

export function redactText(value) {
  return redactAssignments(String(value))
    .replace(bearer, '$1[REDACTED]')
    .replace(githubToken, '[REDACTED_GITHUB_TOKEN]')
    .replace(jwt, '[REDACTED_JWT]')
    .replace(/([?&](?:token|key|secret|password)=)[^&#\s]+/gi, '$1[REDACTED]');
}

export function redact(value, key = '') {
  if (secretKey.test(key)) return '[REDACTED]';
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([childKey, child]) => [childKey, redact(child, childKey)]),
  );
}
