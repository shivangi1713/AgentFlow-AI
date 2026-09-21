export function cleanEnv(value: string | undefined) {
  return value?.trim().replace(/^["']|["']$/g, "");
}

export function isPlaceholder(value: string | undefined) {
  const cleaned = cleanEnv(value);
  return (
    !cleaned ||
    cleaned.includes("...") ||
    cleaned.toLowerCase().includes("your_") ||
    cleaned.toLowerCase().includes("your-")
  );
}

export function hasValidClerkKeys() {
  const publishableKey = cleanEnv(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  const secretKey = cleanEnv(process.env.CLERK_SECRET_KEY);

  return (
    !!publishableKey &&
    !!secretKey &&
    /^(pk_test|pk_live)_/.test(publishableKey) &&
    /^(sk_test|sk_live)_/.test(secretKey) &&
    !isPlaceholder(publishableKey) &&
    !isPlaceholder(secretKey)
  );
}

export function isLocalDevFallbackEnabled() {
  return process.env.NODE_ENV !== "production" && !hasValidClerkKeys();
}
