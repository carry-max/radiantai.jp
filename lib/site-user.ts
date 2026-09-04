export type SiteUser = {
  id: string;
  email: string;
};

export function getSiteUser(request: Request): SiteUser | null {
  const id = request.headers.get("oai-authenticated-user-id")?.trim() || "";
  const email = request.headers.get("oai-authenticated-user-email")?.trim() || "";
  if (!id) return null;
  return { id, email };
}
