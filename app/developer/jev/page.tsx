import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { JevDeveloperView } from "@/components/jev-developer-view";
import { getDeveloper } from "@/lib/developer-access";
import { serviceConfig } from "@/lib/service-config";

export const metadata: Metadata = { title: "AI Console | Radiant AI", robots: { index: false, follow: false, noarchive: true } };

export default async function JevDeveloperPage() {
  const request = new Request("http://internal/developer/jev", { headers: await headers() });
  const developer = await getDeveloper(request).catch(() => null);
  if (!developer) notFound();
  return <JevDeveloperView userId={developer.id} email={developer.email} serverConfigured={Boolean(serviceConfig().jev.apiKey)} />;
}
