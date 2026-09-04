import { getEntitlement, stripeCheckoutConfigured } from "@/lib/billing";
import { getSiteUser } from "@/lib/site-user";

export async function GET(request: Request) {
  const user = getSiteUser(request);
  if (!user) {
    return Response.json({ configured: stripeCheckoutConfigured(), entitlement: null }, { status: 401 });
  }
  try {
    return Response.json({
      configured: stripeCheckoutConfigured(),
      entitlement: await getEntitlement(user.id),
    });
  } catch (error) {
    console.error("billing status unavailable", error);
    return Response.json({
      configured: stripeCheckoutConfigured(),
      entitlement: null,
      error: "利用状況を読み込めませんでした。",
    }, { status: 503 });
  }
}
