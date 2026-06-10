export function resolveDirectorBrandScope(
  projectBrandId: unknown,
  userId: string,
): { brandId?: string; graphitiGroupId: string } {
  const brandId = typeof projectBrandId === 'string' && projectBrandId.trim()
    ? projectBrandId.trim()
    : undefined;

  return {
    brandId,
    graphitiGroupId: brandId || userId,
  };
}
