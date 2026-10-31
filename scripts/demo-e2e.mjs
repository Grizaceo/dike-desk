#!/usr/bin/env node
// Diké Desk end-to-end demo driver.
//
// Runs the full agent loop in ONE browser page (client-side navigation only,
// like a normal session): load the synthetic demo brief, verify with Diké,
// comment on «artículo 60», wait for the agent's suggestion, accept it in the
// UI, wait for the re-verify, comment on «artículo 9999», emit the signed
// commitment, download the three artifacts and optionally verify them with
// the third-party verifier.
//
// Usage:
//   node scripts/demo-e2e.mjs --out <new dir> [--base http://localhost:8080]
//          [--verifier <path to verificar_tercero.py>]
//
// All artifacts land in --out, which must be a NEW directory outside this
// repository (created 0700; files 0600, never overwritten). Everything written
// or logged is redacted first; screenshots and text dumps cover only the
// <main> of the synthetic brief this run created, never the brief list or the
// chat sidebar. Only chat threads this run created and confirmed are exported.

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { chromium } from "playwright";

import {
  formatTranscript,
  freshThreadIds,
  isConfirmedTurn,
  threadHasMarker,
} from "./lib/demo-chat.mjs";
import {
  SECRET_PATTERN,
  SIGNED_ARTIFACTS,
  prepareOutputDirectory,
  readBoundedStream,
  redactText,
  validateBaseOrigin,
  writeArtifact,
  writeSignedArtifact,
} from "./lib/demo-output.mjs";

const execFileP = promisify(execFile);

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

// ---------- args ----------

function parseArgs(argv) {
  const args = { base: "http://localhost:8080", verifier: null, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--out") args.out = argv[++i];
    else if (a === "--base") args.base = argv[++i];
    else if (a === "--verifier") args.verifier = argv[++i];
    else if (a === "--help" || a === "-h") args.help = true;
    else throw new Error("unknown argument");
  }
  return args;
}

function usage(code) {
  console.log(
    "usage: node scripts/demo-e2e.mjs --out <new dir> [--base <origin>] [--verifier <verificar_tercero.py>]",
  );
  process.exit(code);
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (e) {
  console.error(redactText(e.message));
  usage(2);
}
if (args.help || !args.out) usage(args.help ? 0 : 2);

let BASE;
let OUT;
try {
  BASE = validateBaseOrigin(args.base);
  OUT = await prepareOutputDirectory(REPO_ROOT, args.out);
} catch (e) {
  console.error(redactText(e.message));
  process.exit(2);
}
const VERIFIER = args.verifier ? path.resolve(args.verifier) : null;
if (VERIFIER && !existsSync(VERIFIER)) {
  console.error("--verifier not found");
  process.exit(2);
}

// ---------- helpers ----------

const scrub = (value) =>
  redactText(
    (typeof value === "string"
      ? value
      : (JSON.stringify(value) ?? "")
    ).replaceAll(homedir(), "~"),
  );
const log = (...a) =>
  console.log(`[${new Date().toISOString()}]`, a.map(scrub).join(" "));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const hardChecks = [];
const softChecks = [];
function hard(name, ok, detail) {
  hardChecks.push({ name, ok: Boolean(ok), detail });
  log(`hard check ${ok ? "PASS" : "FAIL"}: ${name}`, detail ?? "");
  return Boolean(ok);
}
function soft(name, ok, detail) {
  softChecks.push({ name, ok: Boolean(ok), detail });
  log(`soft check ${ok ? "PASS" : "WARN"}: ${name}`, detail ?? "");
  return Boolean(ok);
}

// Captures are limited to <main> of the brief this run created: the list view
// and the chat sidebar can show unrelated briefs and conversations.
function onDemoBrief(page) {
  return Boolean(
    summary.briefId &&
    page.url().split(/[?#]/)[0] === `${BASE}/briefs/${summary.briefId}`,
  );
}

async function shot(page, name) {
  if (!onDemoBrief(page))
    return log("screenshot skipped (not the demo brief):", name);
  const main = page.locator("main").first();
  const holdsSecret = await page.evaluate(
    ({ source }) => {
      const re = new RegExp(source, "i");
      const root = document.querySelector("main");
      if (!root) return true;
      return [...root.querySelectorAll("input, textarea")].some((el) =>
        re.test(el.value ?? ""),
      );
    },
    { source: SECRET_PATTERN.source },
  );
  if (holdsSecret)
    return log("screenshot skipped (form value looks secret):", name);
  const png = await main.screenshot({
    mask: [main.locator("*").filter({ hasText: SECRET_PATTERN })],
  });
  await writeArtifact(OUT, `${name}.png`, png);
  log("screenshot:", `${name}.png`);
}

async function dump(page, name) {
  if (!onDemoBrief(page))
    return log("dump skipped (not the demo brief):", name);
  const text = await page.evaluate(
    () => document.querySelector("main")?.innerText ?? "",
  );
  await writeArtifact(OUT, `${name}.txt`, text);
}

async function getJson(url) {
  const res = await fetch(url);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function getBrief(briefId) {
  const qs = new URLSearchParams({ briefId });
  return getJson(`${BASE}/_agent-native/actions/get-brief?${qs}`);
}

async function pollBrief(briefId, predicate, timeoutMs, everyMs = 3000) {
  const start = Date.now();
  let last = null;
  for (;;) {
    last = await getBrief(briefId);
    if (last.status === 200 && last.body?.brief && predicate(last.body))
      return last.body;
    if (Date.now() - start > timeoutMs) return null;
    await sleep(everyMs);
  }
}

async function listThreads() {
  const { status, body } = await getJson(
    `${BASE}/_agent-native/agent-chat/threads`,
  );
  if (status !== 200) return [];
  const list = Array.isArray(body) ? body : (body.threads ?? []);
  return list
    .slice()
    .sort(
      (a, b) =>
        new Date(b.updatedAt ?? b.createdAt ?? 0) -
        new Date(a.updatedAt ?? a.createdAt ?? 0),
    );
}

async function runActive(threadId) {
  const { status, body } = await getJson(
    `${BASE}/_agent-native/agent-chat/runs/active?threadId=${threadId}`,
  );
  if (status !== 200) return false;
  return Boolean(
    body &&
    (body.active === true ||
      body.status === "running" ||
      body.run?.status === "running"),
  );
}

async function threadDetail(threadId) {
  return getJson(`${BASE}/_agent-native/agent-chat/threads/${threadId}`);
}

// Wait for the agent turn that carries `marker` (substring of the user
// message) posted at or after `turnStartedAt`, in a thread this run created
// (at or after `runStartedAt`). A turn is "done" when the run has been inactive
// for a few consecutive polls and the marker is confirmed in the thread.
// Returns { threadId, sawActive, markerConfirmed }; threadId is null unless the
// marker was confirmed.
async function waitForTurn(
  marker,
  runStartedAt,
  turnStartedAt,
  timeoutMs = 420_000,
) {
  const start = Date.now();
  let confirmed = null;
  let sawActive = false;
  let inactiveStreak = 0;

  for (;;) {
    if (!confirmed) {
      const fresh = freshThreadIds(await listThreads(), runStartedAt);
      for (const id of fresh) {
        const { status, body } = await threadDetail(id);
        if (status === 200 && threadHasMarker(body, marker, turnStartedAt)) {
          confirmed = id;
          break;
        }
      }
    }
    if (confirmed) {
      if (await runActive(confirmed)) {
        sawActive = true;
        inactiveStreak = 0;
      } else {
        inactiveStreak += 1;
        if (inactiveStreak >= 3)
          return { threadId: confirmed, sawActive, markerConfirmed: true };
      }
    }
    if (Date.now() - start > timeoutMs) {
      return {
        threadId: confirmed,
        sawActive,
        markerConfirmed: Boolean(confirmed),
      };
    }
    await sleep(3000);
  }
}

async function writeTranscript(threadId, label) {
  const { status, body } = await threadDetail(threadId);
  if (status !== 200) {
    log(`transcript: thread fetch failed (${status})`);
    return;
  }
  const text = formatTranscript(body, {
    threadId,
    label,
    startedAt: runStartedAt,
  });
  const name = `transcript-${threadId.slice(0, 8)}.txt`;
  await writeArtifact(OUT, name, text);
  log("transcript:", name);
}

// A citation raw can absorb trailing words after the cited body («… dispone»,
// «… permite al»). The trailing suffix = run of lowercase word tokens at the
// end of the raw.
function trailingWords(raw) {
  const tokens = String(raw).trim().split(/\s+/);
  const suffix = [];
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    if (/^\p{Ll}+$/u.test(tokens[i])) suffix.unshift(tokens[i]);
    else break;
  }
  return suffix;
}

const consoleErrors = [];

// ---------- run ----------

const runStartedAt = new Date();
const summary = {
  base: BASE,
  startedAt: runStartedAt.toISOString(),
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  locale: "en-US",
  viewport: { width: 1600, height: 950 },
  acceptDownloads: true,
});
const page = await context.newPage();
page.on("console", (m) => {
  if (m.type() === "error") {
    const t = redactText(m.text()).slice(0, 400);
    consoleErrors.push(t);
    log("[console.error]", t);
  }
});
page.on("pageerror", (e) => {
  const t = redactText(String(e)).slice(0, 500);
  consoleErrors.push(t);
  log("[pageerror]", t);
});

const threads = { comment60: null, accept: null, comment9999: null };
let aborted = false;

try {
  // --- step 1: /briefs, load synthetic demo (single client-side navigation) ---
  await page.goto(`${BASE}/briefs`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /synthetic demo/i }).click();
  await page.waitForURL(/\/briefs\/[^/]+$/, { timeout: 15_000 });
  const briefId = page.url().split("/briefs/")[1];
  summary.briefId = briefId;
  log("briefId:", briefId);
  await page.waitForLoadState("networkidle");
  await shot(page, "02-demo-loaded");
  hard("demoBriefLoaded", Boolean(briefId), briefId);
  if (!briefId) throw new Error("no brief id after demo load");

  // --- step 2: verify with Diké, expect 4/6 ---
  await page
    .getByRole("button", { name: "Verify with Diké", exact: true })
    .click();
  const afterVerify = await pollBrief(
    briefId,
    (b) => b.brief.meta && b.brief.meta.total_citas > 0,
    180_000,
  );
  if (
    !hard(
      "verifyRan",
      Boolean(afterVerify),
      afterVerify ? "brief.meta present" : "brief.meta never appeared",
    )
  )
    throw new Error("verify-brief did not produce meta");
  const meta0 = afterVerify.brief.meta;
  summary.verifiedBefore = {
    verified: meta0.citas_verificadas,
    total: meta0.total_citas,
  };
  summary.packHash = meta0.pack_hash;
  summary.asOf = meta0.as_of;
  hard(
    "verifiedBeforeIs4of6",
    meta0.citas_verificadas === 4 && meta0.total_citas === 6,
    `${meta0.citas_verificadas}/${meta0.total_citas} pack ${meta0.pack_hash} as_of ${meta0.as_of}`,
  );
  await writeArtifact(OUT, "get-brief-after-verify.json", afterVerify);
  await shot(page, "03-after-verify");
  await dump(page, "03-after-verify");

  const findCit = (body, needle) =>
    (body.citations ?? []).find((c) => c.raw.includes(needle));
  const cit60 = findCit(afterVerify, "artículo 60");
  const cit9999 = findCit(afterVerify, "artículo 9999");
  hard("foundArt60", Boolean(cit60), cit60?.raw);
  hard("foundArt9999", Boolean(cit9999), cit9999?.raw);
  if (!cit60 || !cit9999) throw new Error("expected citations not found");

  summary.art60 = { rawBefore: cit60.raw };
  summary.rawsWithTrailingWords = (afterVerify.citations ?? [])
    .map((c) => c.raw)
    .filter((raw) => trailingWords(raw).length > 0);

  const cardByRaw = (raw) =>
    page
      .locator("aside article")
      .filter({ has: page.locator("strong").filter({ hasText: raw }) });

  // --- step 3: comment on «artículo 60», expect a pending suggestion ---
  const card60 = cardByRaw("artículo 60");
  await card60.locator("input").fill("esto es el Código del Trabajo");
  const t1 = new Date();
  await card60.getByRole("button", { name: "Send to agent" }).click();
  const turn1 = await waitForTurn(
    "esto es el Código del Trabajo",
    runStartedAt,
    t1,
  );
  if (
    !hard(
      "comment60TurnConfirmed",
      isConfirmedTurn(turn1),
      "current-run marker required",
    )
  )
    throw new Error("comment60 turn was not confirmed");
  threads.comment60 = turn1.threadId;
  log("comment60 turn:", JSON.stringify(turn1));
  const afterComment = await pollBrief(
    briefId,
    (b) =>
      (b.review ?? []).some(
        (r) =>
          r.kind === "suggestion" &&
          r.citationId === cit60.id &&
          r.state === "pending",
      ),
    90_000,
  );
  hard(
    "pendingSuggestionOnArt60",
    Boolean(afterComment),
    turn1.threadId ? "thread confirmed" : "no confirmed thread",
  );
  if (!afterComment) throw new Error("no pending suggestion on artículo 60");
  const sugg60 = (afterComment.review ?? []).find(
    (r) =>
      r.kind === "suggestion" &&
      r.citationId === cit60.id &&
      r.state === "pending",
  );
  summary.art60.suggestionReplacement = sugg60?.replacement ?? null;
  await writeArtifact(OUT, "get-brief-after-comment60.json", afterComment);
  await shot(page, "05-pending-suggestion");
  await dump(page, "05-pending-suggestion");

  // --- step 4: accept in the UI; the page auto-sends the re-verify message ---
  const t2 = new Date();
  await card60.getByRole("button", { name: "Accept" }).click();
  const turn2 = await waitForTurn("accepted the suggestion", runStartedAt, t2);
  if (
    !hard(
      "acceptTurnConfirmed",
      isConfirmedTurn(turn2),
      "current-run marker required",
    )
  )
    throw new Error("accept turn was not confirmed");
  threads.accept = turn2.threadId;
  log("accept turn:", JSON.stringify(turn2));
  const afterAccept = await pollBrief(
    briefId,
    (b) =>
      b.brief.meta?.citas_verificadas === 5 &&
      (b.citations ?? []).some(
        (c) => c.raw.includes("artículo 60") && c.status === "verified",
      ),
    120_000,
  );
  hard(
    "verifiedAfterIs5of6AndArt60Verified",
    Boolean(afterAccept),
    afterAccept
      ? `${afterAccept.brief.meta.citas_verificadas}/${afterAccept.brief.meta.total_citas}`
      : "expected 5/6 with artículo 60 verified",
  );
  if (!afterAccept) throw new Error("re-verify after accept did not reach 5/6");
  const cit60After = findCit(afterAccept, "artículo 60");
  summary.art60.rawAfter = cit60After?.raw ?? null;
  summary.verifiedAfter = {
    verified: afterAccept.brief.meta.citas_verificadas,
    total: afterAccept.brief.meta.total_citas,
  };
  await writeArtifact(OUT, "get-brief-after-accept.json", afterAccept);
  await shot(page, "06-after-accept");
  await dump(page, "06-after-accept");

  // keepsTrailingWords: if the raw ended with lowercase trailing words, the
  // accepted replacement must end with the same last word.
  {
    const suffix = trailingWords(summary.art60.rawBefore);
    const last = summary.art60.rawBefore.trim().split(/\s+/).pop();
    const repl = summary.art60.suggestionReplacement ?? "";
    const applicable = suffix.length > 0;
    const ok = !applicable || repl.trim().split(/\s+/).pop() === last;
    summary.art60.trailingSuffix = suffix;
    summary.keepsTrailingWords = { applicable, ok, rawLastWord: last };
    soft(
      "keepsTrailingWords",
      ok,
      applicable
        ? `raw «…${last}» -> replacement «${repl}»`
        : `raw «${summary.art60.rawBefore}» has no trailing words (vacuous); replacement «${repl}»`,
    );
  }

  // --- step 5: comment on «artículo 9999» ---
  const card9999 = cardByRaw("artículo 9999");
  await card9999.locator("input").fill("¿qué hacemos con esta cita?");
  const t3 = new Date();
  await card9999.getByRole("button", { name: "Send to agent" }).click();
  const turn3 = await waitForTurn(
    "qué hacemos con esta cita",
    runStartedAt,
    t3,
  );
  if (
    !hard(
      "comment9999TurnConfirmed",
      isConfirmedTurn(turn3),
      "current-run marker required",
    )
  )
    throw new Error("comment9999 turn was not confirmed");
  threads.comment9999 = turn3.threadId;
  log("comment9999 turn:", JSON.stringify(turn3));
  await shot(page, "07-comment-9999");
  await dump(page, "07-comment-9999");
  const after9999 = await getBrief(briefId);
  await writeArtifact(
    OUT,
    "get-brief-after-9999.json",
    after9999.body ?? after9999,
  );
  const body9999 = after9999.body;
  const cit9999After = findCit(body9999, "artículo 9999");
  const agentReplies = (body9999.review ?? []).filter(
    (r) =>
      r.kind === "comment" &&
      r.author === "agent" &&
      r.citationId === cit9999After?.id,
  );
  summary.reply9999 = agentReplies.at(-1)?.body ?? null;
  summary.agentComments9999 = agentReplies.map((r) => r.body);
  soft(
    "agentRepliedOn9999",
    Boolean(summary.reply9999),
    summary.reply9999 ? scrub(summary.reply9999).slice(0, 200) : undefined,
  );
  summary.suggestions = (body9999.review ?? [])
    .filter((r) => r.kind === "suggestion")
    .map((r) => ({
      citationId: r.citationId,
      citationRaw:
        (body9999.citations ?? []).find((c) => c.id === r.citationId)?.raw ??
        null,
      replacement: r.replacement,
      state: r.state,
      body: scrub(r.body).slice(0, 200),
    }));

  // --- step 6: emit commitment, download the three artifacts ---
  await page
    .getByRole("button", { name: "Emit commitment", exact: true })
    .click();
  const withCommitment = await pollBrief(
    briefId,
    (b) => Boolean(b.brief.commitment),
    120_000,
  );
  hard(
    "commitmentEmitted",
    Boolean(withCommitment),
    withCommitment ? "" : "brief.commitment never appeared",
  );
  if (!withCommitment) throw new Error("no commitment emitted");
  const commitmentData = withCommitment.brief.commitment;
  summary.commitment = {
    signatureEnvelopePresent: Boolean(commitmentData.signature),
    cryptographicallyVerified: null,
    key_id: commitmentData.signature?.key_id ?? null,
    algorithm: commitmentData.signature?.algorithm ?? null,
    pack_hash: commitmentData.commitment?.pack_hash ?? null,
    as_of: commitmentData.commitment?.as_of ?? null,
    citas_verificadas: commitmentData.commitment?.citas_verificadas ?? null,
    total_citas: commitmentData.commitment?.total_citas ?? null,
  };
  hard(
    "signatureEnvelopePresent",
    summary.commitment.signatureEnvelopePresent,
    `key_id ${summary.commitment.key_id}`,
  );
  await writeArtifact(OUT, "get-brief-after-commitment.json", withCommitment);
  await shot(page, "08-commitment-panel");
  await dump(page, "08-commitment-panel");

  async function download(nameRe, filename) {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 30_000 }),
      page.getByRole("button", { name: nameRe }).click(),
    ]);
    const stream = await download.createReadStream();
    if (!stream) throw new Error("download has no content");
    const text = await readBoundedStream(stream, SIGNED_ARTIFACTS[filename]);
    await writeSignedArtifact(OUT, filename, text);
    log("downloaded:", filename);
  }
  try {
    await download(/download commitment\.json/i, "commitment.json");
    await download(/download commitment\.sig\.json/i, "commitment.sig.json");
    await download(/download \.pub/i, "content-signing-key.pub");
    hard("downloadsCaptured", true);
  } catch (e) {
    hard(
      "downloadsCaptured",
      false,
      redactText(e.message ?? "download failed").slice(0, 200),
    );
    throw e;
  }

  // --- step 7: third-party verifier (positive + negative control) ---
  if (VERIFIER) {
    const runVerifier = async (files, outFile) => {
      const report = (code, stdout, stderr) =>
        writeArtifact(
          OUT,
          outFile,
          `command: python3 ${path.basename(VERIFIER)} ${files.join(" ")}\nexit: ${code}\n\n${stdout}${stderr}`.replaceAll(
            homedir(),
            "~",
          ),
          { maxChars: 200_000 },
        );
      try {
        const { stdout, stderr } = await execFileP(
          "python3",
          [VERIFIER, ...files],
          { cwd: OUT, maxBuffer: 4 * 1024 * 1024 },
        );
        await report(0, stdout, stderr);
        return { code: 0, stdout, stderr };
      } catch (e) {
        const stdout = String(e.stdout ?? "");
        const stderr = String(e.stderr ?? "");
        await report(e.code ?? -1, stdout, stderr);
        return { code: e.code ?? -1, stdout, stderr };
      }
    };

    const pos = await runVerifier(
      ["commitment.json", "commitment.sig.json", "content-signing-key.pub"],
      "verifier.txt",
    );
    summary.verifierExitCode = pos.code;
    const verified =
      pos.code === 0 && /RESULTADO:\s*VERIFICADO/.test(pos.stdout ?? "");
    summary.commitment.cryptographicallyVerified = verified;
    soft("signatureCryptographicallyVerified", verified, `exit ${pos.code}`);
    hard("verifierVerified", verified, `exit ${pos.code}`);

    // Negative control: tamper one value; the signature must not verify.
    const tampered = JSON.parse(
      await readFile(path.join(OUT, "commitment.json"), "utf8"),
    );
    tampered.citas_verificadas = (tampered.citas_verificadas ?? 0) + 1;
    await writeArtifact(OUT, "commitment.tampered.json", tampered);
    const neg = await runVerifier(
      [
        "commitment.tampered.json",
        "commitment.sig.json",
        "content-signing-key.pub",
      ],
      "verifier-tampered.txt",
    );
    summary.verifierTamperedExitCode = neg.code;
    soft("verifierRejectsTampered", neg.code === 1, `exit ${neg.code}`);
  } else {
    soft("signatureCryptographicallyVerified", false, "no --verifier given");
  }

  // --- step 8: es-ES detail screenshot in a second context (view-only, no agent) ---
  try {
    const esCtx = await browser.newContext({
      locale: "es-ES",
      viewport: { width: 1600, height: 950 },
    });
    const esPage = await esCtx.newPage();
    await esPage.goto(`${BASE}/briefs/${briefId}`, {
      waitUntil: "networkidle",
    });
    const before = existsSync(path.join(OUT, "21-es-brief.png"));
    await shot(esPage, "21-es-brief");
    const produced = !before && existsSync(path.join(OUT, "21-es-brief.png"));
    await esCtx.close();
    soft(
      "esScreenshots",
      produced,
      produced ? "21-es-brief.png" : "21-es-brief.png was not produced",
    );
  } catch (e) {
    soft("esScreenshots", false, redactText(String(e)).slice(0, 200));
  }
} catch (e) {
  aborted = true;
  summary.error = scrub(String(e?.message ?? e)).slice(0, 1000);
  log("FATAL:", summary.error);
  try {
    await shot(page, "99-fatal");
  } catch {}
} finally {
  // --- always: threads, transcripts, summary ---
  const touched = [
    ["comment60", threads.comment60],
    ["accept", threads.accept],
    ["comment9999", threads.comment9999],
  ].filter(([, id]) => id);
  const labelsByThread = new Map();
  for (const [label, id] of touched) {
    labelsByThread.set(id, [...(labelsByThread.get(id) ?? []), label]);
  }
  summary.threads = {
    comment60: threads.comment60,
    accept: threads.accept,
    comment9999: threads.comment9999,
    singleThread:
      touched.length === 3 &&
      threads.comment60 === threads.accept &&
      threads.accept === threads.comment9999,
  };
  soft(
    "singleThread",
    summary.threads.singleThread,
    JSON.stringify(summary.threads),
  );
  for (const [id, labels] of labelsByThread) {
    try {
      await writeTranscript(id, labels.join(", "));
    } catch (e) {
      log(
        "transcript failed:",
        redactText(String(e.message ?? e)).slice(0, 200),
      );
    }
  }
  try {
    await writeArtifact(
      OUT,
      "threads.json",
      [...labelsByThread].map(([id, labels]) => ({ id, labels })),
    );
  } catch {}
  if (consoleErrors.length) {
    await writeArtifact(OUT, "console-errors.txt", consoleErrors.join("\n"));
  }
  await browser.close();

  summary.finishedAt = new Date().toISOString();
  summary.hardChecks = hardChecks;
  summary.softChecks = softChecks;
  summary.pass = !aborted && hardChecks.every((c) => c.ok);
  await writeArtifact(OUT, "summary.json", summary);
  log("summary: summary.json");
  log(summary.pass ? "RESULT: PASS" : "RESULT: FAIL");
  process.exit(summary.pass ? 0 : 1);
}
