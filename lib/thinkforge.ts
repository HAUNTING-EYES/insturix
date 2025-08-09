export async function fetchAgentResponse(prompt: string) {
  const THINKFORGE_BACKEND_URL = process.env.THINKFORGE_BACKEND_URL || 'http://localhost:8080';
  const response = await fetch(`${THINKFORGE_BACKEND_URL}/agent/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!response.ok) throw new Error("Failed to fetch agent response");
  return response.json();
}
