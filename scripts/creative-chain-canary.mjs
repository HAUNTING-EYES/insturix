#!/usr/bin/env node

import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { Storage } from "@google-cloud/storage";
import { Client as QStashClient } from "@upstash/qstash";
import { config as loadEnv } from "dotenv";
import { MongoClient } from "mongodb";
import neo4j from "neo4j-driver";

const args = process.argv.slice(2);
const flags = new Set(args.filter((arg) => arg.startsWith("--") && !arg.includes("=")));
const live = flags.has("--live");
const strict = flags.has("--strict");
const allowPlatformPublish =
  flags.has("--allow-platform-publish") ||
  process.env.CREATIVE_CHAIN_CANARY_ALLOW_PLATFORM_PUBLISH === "true";

const envFile = readOption("--env-file");
if (envFile) {
  loadEnv({ path: envFile });
}

const timeoutMs = Number(process.env.CREATIVE_CHAIN_CANARY_TIMEOUT_MS || 7000);
const results = [];

function readOption(name) {
  const exact = args.find((arg) => arg.startsWith(`${name}=`));
  if (exact) return exact.slice(name.length + 1);

  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];

  return "";
}

function env(name) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function firstEnv(names) {
  for (const name of names) {
    const value = env(name);
    if (value) return { name, value };
  }

  return { name: names[0], value: "" };
}

function requireAny(groups) {
  const resolved = {};
  const missing = [];

  for (const [key, names] of Object.entries(groups)) {
    const found = firstEnv(names);
    if (!found.value) missing.push(names.join(" or "));
    resolved[key] = found;
  }

  return { resolved, missing };
}

function record(status, name, message) {
  results.push({ status, name, message });
}

function missing(name, missingVars) {
  record(
    strict ? "FAIL" : "SKIP",
    name,
    `missing ${missingVars.join(", ")}`
  );
}

function passConfigured(name) {
  record("PASS", name, live ? "configured" : "configured; run with --live for external verification");
}

function fail(name, error) {
  const message = error instanceof Error ? error.message : String(error);
  record("FAIL", name, message);
}

function withTimeout(promise, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, { ...options, signal: controller.signal }).finally(() => {
    clearTimeout(timer);
  });
}

async function checkMongo() {
  const name = "mongo";
  const uri = env("MONGODB_URI");
  const dbName = env("EDITRON_MONGODB_DB_NAME") || env("MONGODB_DB_NAME");

  if (!uri || !dbName) {
    missing(name, [!uri && "MONGODB_URI", !dbName && "MONGODB_DB_NAME"].filter(Boolean));
    return;
  }

  if (!live) {
    passConfigured(name);
    return;
  }

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: timeoutMs,
    connectTimeoutMS: timeoutMs,
    maxPoolSize: 1,
  });

  try {
    await withTimeout(client.connect(), name);
    await withTimeout(client.db(dbName).command({ ping: 1 }), name);
    record("PASS", name, `reachable database ${dbName}`);
  } catch (error) {
    fail(name, error);
  } finally {
    await client.close().catch(() => undefined);
  }
}

async function checkQStash() {
  const name = "qstash";
  const token = env("QSTASH_TOKEN");

  if (!token) {
    missing(name, ["QSTASH_TOKEN"]);
    return;
  }

  if (!live) {
    passConfigured(name);
    return;
  }

  try {
    const client = new QStashClient({
      token,
      baseUrl: env("QSTASH_URL") || undefined,
    });
    const response = await withTimeout(client.logs(), name);
    const count = Array.isArray(response.logs) ? response.logs.length : 0;
    record("PASS", name, `token accepted; ${count} recent log entries visible`);
  } catch (error) {
    fail(name, error);
  }
}

async function checkGraphiti() {
  const name = "graphiti/neo4j";
  const { resolved, missing: missingVars } = requireAny({
    uri: ["NEO4J_URI"],
    username: ["NEO4J_USERNAME"],
    password: ["NEO4J_PASSWORD"],
    database: ["NEO4J_DATABASE"],
  });

  if (missingVars.length > 0) {
    missing(name, missingVars);
    return;
  }

  if (!live) {
    passConfigured(name);
    return;
  }

  const driver = neo4j.driver(
    resolved.uri.value,
    neo4j.auth.basic(resolved.username.value, resolved.password.value),
    { connectionTimeout: timeoutMs }
  );
  const session = driver.session({ database: resolved.database.value });

  try {
    await withTimeout(session.run("RETURN 1 AS ok"), name);
    record("PASS", name, `reachable database ${resolved.database.value}`);
  } catch (error) {
    fail(name, error);
  } finally {
    await session.close().catch(() => undefined);
    await driver.close().catch(() => undefined);
  }
}

function resolveR2Config(prefix) {
  if (prefix === "uploaderx") {
    return requireAny({
      accountId: ["UPLOADERX_R2_ACCOUNT_ID", "R2_ACCOUNT_ID"],
      accessKeyId: ["UPLOADERX_R2_ACCESS_KEY_ID", "R2_ACCESS_KEY_ID"],
      secretAccessKey: ["UPLOADERX_R2_SECRET_ACCESS_KEY", "R2_SECRET_ACCESS_KEY"],
      bucketName: ["UPLOADERX_R2_BUCKET_NAME", "R2_BUCKET_NAME"],
    });
  }

  if (prefix === "clickatron") {
    return requireAny({
      accountId: ["R2_ACCOUNT_ID_CLICKATRON", "R2_ACCOUNT_ID_clickatron"],
      accessKeyId: ["R2_ACCESS_KEY_ID_CLICKATRON", "R2_ACCESS_KEY_ID_clickatron"],
      secretAccessKey: ["R2_SECRET_ACCESS_KEY_CLICKATRON", "R2_SECRET_ACCESS_KEY_clickatron"],
      bucketName: ["R2_BUCKET_NAME_CLICKATRON", "R2_BUCKET_NAME_clickatron"],
    });
  }

  return requireAny({
    accountId: ["R2_ACCOUNT_ID"],
    accessKeyId: ["R2_ACCESS_KEY_ID"],
    secretAccessKey: ["R2_SECRET_ACCESS_KEY"],
    bucketName: ["R2_BUCKET_NAME"],
  });
}

async function checkR2(prefix) {
  const name = `storage/r2/${prefix}`;
  const { resolved, missing: missingVars } = resolveR2Config(prefix);

  if (missingVars.length > 0) {
    missing(name, missingVars);
    return;
  }

  if (!live) {
    passConfigured(name);
    return;
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${resolved.accountId.value}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: resolved.accessKeyId.value,
      secretAccessKey: resolved.secretAccessKey.value,
    },
  });

  try {
    await withTimeout(
      client.send(new HeadBucketCommand({ Bucket: resolved.bucketName.value })),
      name
    );
    record("PASS", name, `bucket reachable: ${resolved.bucketName.value}`);
  } catch (error) {
    fail(name, error);
  }
}

function parseGcsCredentials(value) {
  try {
    return JSON.parse(value);
  } catch {
    return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
  }
}

async function checkGcs() {
  const name = "storage/gcs";
  const credentialsRaw = env("GOOGLE_CLOUD_CREDENTIALS");
  const bucketName = env("GCS_BUCKET_NAME");

  if (!credentialsRaw || !bucketName) {
    missing(name, [!credentialsRaw && "GOOGLE_CLOUD_CREDENTIALS", !bucketName && "GCS_BUCKET_NAME"].filter(Boolean));
    return;
  }

  if (!live) {
    passConfigured(name);
    return;
  }

  try {
    const credentials = parseGcsCredentials(credentialsRaw);
    const storage = new Storage({
      projectId: env("GOOGLE_CLOUD_PROJECT_ID") || env("GOOGLE_CLOUD_PROJECT") || credentials.project_id,
      credentials,
    });
    const [exists] = await withTimeout(storage.bucket(bucketName).exists(), name);
    if (!exists) throw new Error(`bucket not found: ${bucketName}`);
    record("PASS", name, `bucket reachable: ${bucketName}`);
  } catch (error) {
    fail(name, error);
  }
}

async function checkPlatformReadOnly(platform) {
  const config = requireAny(platform.config);
  if (config.missing.length > 0) {
    missing(`platform/${platform.name}/config`, config.missing);
    return;
  }

  if (!live) {
    passConfigured(`platform/${platform.name}/config`);
    return;
  }

  const account = requireAny(platform.account);
  if (account.missing.length > 0) {
    missing(`platform/${platform.name}/sandbox`, account.missing);
    return;
  }

  try {
    const response = await fetchWithTimeout(platform.url(account.resolved), {
      headers: platform.headers(account.resolved),
    });
    if (!response.ok) {
      throw new Error(`read-only probe failed with HTTP ${response.status}`);
    }
    record("PASS", `platform/${platform.name}/sandbox`, "read-only sandbox account probe succeeded");
  } catch (error) {
    fail(`platform/${platform.name}/sandbox`, error);
  }
}

async function checkPlatforms() {
  const platforms = [
    {
      name: "facebook",
      config: {
        appId: ["FACEBOOK_APP_ID"],
        appSecret: ["FACEBOOK_APP_SECRET"],
      },
      account: {
        pageId: ["FACEBOOK_PAGE_ID"],
        token: ["FACEBOOK_PAGE_TOKEN"],
      },
      url: ({ pageId, token }) =>
        `https://graph.facebook.com/v20.0/${encodeURIComponent(pageId.value)}?fields=id,name&access_token=${encodeURIComponent(token.value)}`,
      headers: () => ({}),
    },
    {
      name: "instagram",
      config: {
        appId: ["INSTAGRAM_APP_ID", "FACEBOOK_APP_ID"],
        appSecret: ["INSTAGRAM_APP_SECRET", "FACEBOOK_APP_SECRET"],
      },
      account: {
        accountId: ["INSTAGRAM_TEST_ACCOUNT_ID", "INSTAGRAM_BUSINESS_ACCOUNT_ID"],
        token: ["INSTAGRAM_TEST_ACCESS_TOKEN", "FACEBOOK_PAGE_TOKEN"],
      },
      url: ({ accountId, token }) =>
        `https://graph.facebook.com/v20.0/${encodeURIComponent(accountId.value)}?fields=id,username&access_token=${encodeURIComponent(token.value)}`,
      headers: () => ({}),
    },
    {
      name: "twitter",
      config: {
        clientId: ["TWITTER_CLIENT_ID", "TWITTER_API_KEY"],
        clientSecret: ["TWITTER_CLIENT_SECRET", "TWITTER_API_SECRET"],
      },
      account: {
        token: ["TWITTER_BEARER_TOKEN"],
      },
      url: () => "https://api.twitter.com/2/users/me",
      headers: ({ token }) => ({ Authorization: `Bearer ${token.value}` }),
    },
    {
      name: "linkedin",
      config: {
        clientId: ["LINKEDIN_CLIENT_ID"],
        clientSecret: ["LINKEDIN_CLIENT_SECRET"],
      },
      account: {
        token: ["LINKEDIN_ACCESS_TOKEN"],
      },
      url: () => "https://api.linkedin.com/v2/userinfo",
      headers: ({ token }) => ({ Authorization: `Bearer ${token.value}` }),
    },
    {
      name: "youtube",
      config: {
        clientId: ["YOUTUBE_CLIENT_ID"],
        clientSecret: ["YOUTUBE_CLIENT_SECRET"],
        redirectUri: ["YOUTUBE_REDIRECT_URI"],
      },
      account: {
        token: ["YOUTUBE_TEST_ACCESS_TOKEN"],
      },
      url: () => "https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true",
      headers: ({ token }) => ({ Authorization: `Bearer ${token.value}` }),
    },
  ];

  for (const platform of platforms) {
    await checkPlatformReadOnly(platform);
  }

  record(
    allowPlatformPublish ? "PASS" : "SKIP",
    "platform/publish-guard",
    allowPlatformPublish
      ? "publish guard explicitly disabled for sandbox-only checks"
      : "real platform publishes are blocked unless --allow-platform-publish is passed"
  );
}

function printResults() {
  for (const result of results) {
    console.log(`[${result.status}] ${result.name}: ${result.message}`);
  }

  const counts = results.reduce(
    (acc, result) => {
      acc[result.status] += 1;
      return acc;
    },
    { PASS: 0, SKIP: 0, FAIL: 0 }
  );

  console.log("");
  console.log(`Summary: ${counts.PASS} pass, ${counts.SKIP} skip, ${counts.FAIL} fail`);

  if (!live) {
    console.log("Note: use --live for real external reachability checks.");
  }
}

async function main() {
  console.log("Creative chain canary");
  console.log(`mode: ${live ? "live/read-only" : "config-only"}${strict ? ", strict" : ""}`);
  if (envFile) console.log(`env file: ${envFile}`);
  console.log("");

  await checkMongo();
  await checkQStash();
  await checkGraphiti();
  await checkR2("shared");
  await checkR2("uploaderx");
  await checkR2("clickatron");
  await checkGcs();
  await checkPlatforms();

  printResults();

  if (results.some((result) => result.status === "FAIL")) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
