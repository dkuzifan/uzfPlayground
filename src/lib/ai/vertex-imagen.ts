/**
 * Vertex AI Imagen integration for character portrait generation.
 * Uses service account credentials from GOOGLE_APPLICATION_CREDENTIALS_BASE64.
 */

interface ImagenResponse {
  predictions: Array<{
    bytesBase64Encoded: string;
    mimeType: string;
  }>;
}

// Module-level token cache (valid per server instance lifetime)
let tokenCache: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  const credBase64 = process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64;
  if (!credBase64) throw new Error("GOOGLE_APPLICATION_CREDENTIALS_BASE64 is not set");

  const creds = JSON.parse(Buffer.from(credBase64, "base64").toString("utf-8"));

  // Build JWT for service account
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      iss: creds.client_email,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })
  ).toString("base64url");

  const signingInput = `${header}.${payload}`;

  // Sign with private key using Web Crypto API
  const privateKeyPem = creds.private_key as string;
  const pemBody = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const keyBuffer = Buffer.from(pemBody, "base64");

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    Buffer.from(signingInput)
  );

  const signature = Buffer.from(signatureBuffer).toString("base64url");
  const jwt = `${signingInput}.${signature}`;

  // Exchange JWT for access token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Failed to get access token: ${err}`);
  }

  const tokenData = await tokenRes.json();
  const token = tokenData.access_token as string;
  // Cache for 55 minutes (token expires in 60)
  tokenCache = { token, expiresAt: Date.now() + 55 * 60 * 1000 };
  return token;
}

export interface PortraitPromptParams {
  characterName: string;
  job: string;
  personalitySummary?: string;
  theme?: string; // fantasy | mystery | horror | sci-fi
}

function buildPortraitPrompt(params: PortraitPromptParams): string {
  const { characterName, job, personalitySummary, theme } = params;

  const themeStyle: Record<string, string> = {
    fantasy: "fantasy RPG art style, painterly, warm golden tones, medieval setting",
    mystery: "noir detective style, desaturated blue palette, dramatic shadows, 1920s",
    horror: "dark gothic art, unsettling atmosphere, muted colors, expressionist shadows",
    "sci-fi": "cyberpunk sci-fi art, neon accents, futuristic, digital painting",
  };

  const style = themeStyle[theme ?? ""] ?? "RPG character portrait, detailed digital art";

  return [
    `Portrait of ${characterName}, a ${job} character.`,
    personalitySummary ? `Personality: ${personalitySummary}.` : "",
    style,
    "Close-up portrait, dramatic lighting, high quality, no text, no watermark.",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Generate a portrait using Vertex AI Imagen 3.
 * Returns a base64-encoded PNG string (without data URL prefix).
 */
export async function generatePortrait(params: PortraitPromptParams): Promise<string> {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
  if (!projectId) throw new Error("GOOGLE_CLOUD_PROJECT_ID is not set");

  const accessToken = await getAccessToken();
  const prompt = buildPortraitPrompt(params);

  const endpoint = `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/imagen-3.0-fast-generate-001:predict`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: {
        sampleCount: 1,
        aspectRatio: "1:1",
        safetyFilterLevel: "block_some",
        personGeneration: "allow_adult",
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Imagen API error ${res.status}: ${err}`);
  }

  const data: ImagenResponse = await res.json();
  const prediction = data.predictions?.[0];
  if (!prediction?.bytesBase64Encoded) {
    throw new Error("No image data in Imagen response");
  }

  return prediction.bytesBase64Encoded;
}
