type AnalysisBackendOptions = {
  apiKey: string;
  backendUrl: string;
  backendToken: string;
  payload: Record<string, unknown>;
  useBackend: boolean;
};

export async function requestVideoAnalysis(options: AnalysisBackendOptions) {
  if (options.useBackend && options.backendUrl && options.backendToken) {
    return fetch(`${options.backendUrl}/v1/analyze`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.backendToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ request: options.payload }),
      signal: AbortSignal.timeout(120_000),
    });
  }

  return fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(options.payload),
    signal: AbortSignal.timeout(90_000),
  });
}
