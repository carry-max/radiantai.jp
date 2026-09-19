import { getSiteUser } from "@/lib/site-user";
import { serviceConfig } from "@/lib/service-config";

export function isDeveloperEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  return Boolean(normalized) && serviceConfig().developerEmails.includes(normalized);
}

export async function getDeveloper(request: Request) {
  const user = await getSiteUser(request);
  return user && isDeveloperEmail(user.email) ? user : null;
}
