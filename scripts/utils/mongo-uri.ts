export function requireMongoUri(scriptName = 'script'): string {
  const uri = process.env.MONGODB_URI?.trim();

  if (!uri) {
    throw new Error(
      `${scriptName} requires MONGODB_URI. Refusing to use a checked-in database URI fallback.`,
    );
  }

  return uri;
}
