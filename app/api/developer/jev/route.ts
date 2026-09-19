import { z } from "zod";
import { getDeveloper } from "@/lib/developer-access";
import { classifyJevMatches, JEV_MAX_MATCHES, JEV_MODEL, jevMatchesSchema } from "@/lib/jev-classifier";
import { sameOriginRequest, serviceConfig } from "@/lib/service-config";
import { withAuth } from "@/lib/site-user";

const developerSchema = z.object({ matches: jevMatchesSchema, apiKey: z.string().trim().max(1000).optional() }).strict();
const hidden = () => Response.json({ error: "Not found" }, { status: 404 });

const getHandler = withAuth(async (request: Request) => {
  if (!await getDeveloper(request)) return hidden();
  const config = serviceConfig();
  return Response.json({ configured: Boolean(config.jev.apiKey), model: JEV_MODEL, maxMatches: JEV_MAX_MATCHES });
});

const postHandler = withAuth(async (request: Request) => {
  if (!sameOriginRequest(request)) return hidden();
  const developer = await getDeveloper(request);
  if (!developer) return hidden();
  let input: z.infer<typeof developerSchema>;
  try { input = developerSchema.parse(await request.json()); }
  catch { return Response.json({ error: "JSON形式と試合データを確認してください。最大50試合です。" }, { status: 400 }); }
  const apiKey = input.apiKey || serviceConfig().jev.apiKey;
  if (!apiKey) return Response.json({ error: "Jev APIキーを入力するか、サーバー環境変数JEV_API_KEYを設定してください。" }, { status: 503 });
  try {
    return Response.json({ model: JEV_MODEL, ...await classifyJevMatches(input.matches, { apiKey, userId: `developer:${developer.id}` }) });
  } catch (error) {
    console.error("developer jev request failed", error instanceof Error ? error.name : "unknown");
    return Response.json({ error: "Jevへ接続できませんでした。キーとGatewayの利用設定を確認してください。" }, { status: 502 });
  }
});

export async function GET(request: Request) {
  const response = await getHandler(request);
  return response.status === 503 ? hidden() : response;
}

export async function POST(request: Request) {
  const response = await postHandler(request);
  return response.status === 503 && !(await response.clone().json().catch(() => ({})) as { error?: string }).error?.includes("APIキー") ? hidden() : response;
}
