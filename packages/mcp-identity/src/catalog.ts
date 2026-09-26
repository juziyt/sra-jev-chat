export interface Identity {
  name: string;
  email: string;
}

const KNOWN: Identity[] = [
  { name: "Jane Smith", email: "jane.smith@example.com" },
  { name: "Alex Rivera", email: "alex.rivera@example.com" },
  { name: "Sam Chen", email: "sam.chen@example.com" },
];

function foldName(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

function foldEmail(s: string): string {
  return s.trim().toLowerCase();
}

/** Whether `name` and `email` match the same catalog record. Always returns a boolean result. */
export function verifyIdentity(
  name: string,
  email: string,
): Identity & { verified: boolean; text: string } {
  const verified = KNOWN.some(
    (p) => foldName(p.name) === foldName(name) && foldEmail(p.email) === foldEmail(email),
  );
  const text = `${name} (${email}) is ${verified ? "verified" : "not verified"}.`;
  return { name, email, verified, text };
}
