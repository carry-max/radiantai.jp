import { getEntitlement, salesConfigured } from "@/lib/billing";
import { getSiteUser } from "@/lib/site-user";
import { serviceConfig } from "@/lib/service-config";

export async function GET(request: Request) {
  const user = getSiteUser(request);
  if (!user) {
    return Response.json({ configured: salesConfigured(), paypayEnabled: serviceConfig().paypayEnabled, entitlement: null }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  try {
    return Response.json({
      configured: salesConfigured(), paypayEnabled: serviceConfig().paypayEnabled,
      entitlement: await getEntitlement(user.id),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("billing status unavailable", error);
    return Response.json({
      configured: false, paypayEnabled: false,
      entitlement: null,
      error: "利用状況を読み込めませんでした。",
    }, { status: 503 });
  }
}
