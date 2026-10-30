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
//   node scripts/demo-e2e.mjs --out <dir> [--base http://localhost:8080]
//          [--verifier <path to verificar_tercero.py>]
//
// All artifacts land in --out (screenshots, get-brief snapshots, per-thread
// transcripts, commitment files, verifier.txt, summary.json). The script
// refuses to run without --out or with --out inside this repository, so
// evidence can never end up in git.

import { execFile } from "node:child_process";
import { existsSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { chromium } from "playwright";

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
    else throw new Error(`unknown argument: ${a}`);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.out) {
  console.log(
    "usage: node scripts/demo-e2e.mjs --out <dir> [--base <url>] [--verifier <verificar_tercero.py>]",
  );
  process.exit(args.help ? 0 : 2);
}
const OUT = path.resolve(args.out);
const BASE = args.base.replace(/\/$/, "");
const repoReal = realpathSync(REPO_ROOT);
const outParent = path.dirname(OUT);
if (!existsSync(outParent)) {
  console.error(`--out parent does not exist: ${outParent}`);
  process.exit(2);
}
const outRealBase = realpathSync(outParent);
if (
  path.resolve(outRealBase, path.basename(OUT)) === repoReal ||
  path.resolve(outRealBase, path.basename(OUT)).startsWith(repoReal + path.sep)
) {
  console.error(`refusing to write artifacts inside the repo: ${OUT}`);
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
const VERIFIER = args.verifier ? path.resolve(args.verifier) : null;
if (VERIFIER && !existsSync(VERIFIER)) {
  console.error(`--verifier not found: ${VERIFIER}`);
  process.exit(2);
}

// ---------- helpers ----------

const log = (...a) => console.log(`[${new Date().toISOString()}]`, ...a);
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

async function shot(page, name) {
  const p = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  log("screenshot:", p);
}

async function dump(page, name) {
  const text = await page.evaluate(() => document.body.innerText);
  await writeFile(path.join(OUT, `${name}.txt`), text);
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

function threadMessages(detailBody) {
  const td = detailBody?.threadData;
  if (!td) return [];
  const parsed = typeof td === "string" ? JSON.parse(td) : td;
  return parsed?.messages ?? [];
}

async function threadHasMarker(threadId, marker, since) {
  const { status, body } = await threadDetail(threadId);
  if (status !== 200) return false;
  return threadMessages(body).some(
    (m) =>
      m.message?.role === "user" &&
      // Older threads can contain the same marker text from a previous run;
      // only a message newer than `since` belongs to this turn.
      (!since || new Date(m.message.createdAt ?? 0) >= since) &&
      JSON.stringify(m.message.content ?? "").includes(marker),
  );
}

// Wait for the agent turn that carries `marker` (substring of the user
// message) posted at or after `since`. Polls the threads list and
// /runs/active; a turn is "done" when the run has been inactive for a few
// consecutive polls (the endpoint can briefly report inactive between run
// phases) and the marker is visible in the thread.
// Returns { threadId, sawActive, markerConfirmed }.
async function waitForTurn(marker, since, timeoutMs = 420_000) {
  const start = Date.now();
  let candidate = null;
  let sawActive = false;
  let inactiveStreak = 0;

  for (;;) {
    const threads = (await listThreads()).slice(0, 6);
    const activeIds = [];
    for (const t of threads) {
      if (await runActive(t.id)) activeIds.push(t.id);
    }
    if (activeIds.length > 0) {
      sawActive = true;
      inactiveStreak = 0;
      if (!candidate || !activeIds.includes(candidate)) {
        // Prefer an active thread that already shows our marker.
        for (const id of activeIds) {
          if (await threadHasMarker(id, marker, since)) {
            candidate = id;
            break;
          }
        }
        if (!candidate || !activeIds.includes(candidate))
          candidate = candidate ?? activeIds[0];
      }
    } else if (candidate) {
      inactiveStreak += 1;
      if (
        inactiveStreak >= 3 &&
        (await threadHasMarker(candidate, marker, since))
      ) {
        return { threadId: candidate, sawActive, markerConfirmed: true };
      }
      if (inactiveStreak >= 3 && sawActive) {
        // Marker not visible yet; keep waiting a little longer.
        inactiveStreak = 1;
      }
    } else {
      // No active run yet: the turn may have finished between polls. Look for
      // the marker in the newest threads.
      for (const t of threads) {
        if (await threadHasMarker(t.id, marker, since)) {
          candidate = t.id;
          break;
        }
      }
      if (candidate) {
        inactiveStreak += 1;
        if (inactiveStreak >= 3)
          return { threadId: candidate, sawActive, markerConfirmed: true };
      }
    }
    if (Date.now() - start > timeoutMs) {
      return {
        threadId: candidate,
        sawActive,
        markerConfirmed: candidate
          ? await threadHasMarker(candidate, marker, since)
          : false,
      };
    }
    await sleep(3000);
  }
}

async function writeTranscript(threadId, label) {
  const { status, body } = await threadDetail(threadId);
  if (status !== 200) {
    log(`transcript: thread ${threadId} fetch failed (${status})`);
    return;
  }
  const lines = [
    `# Thread ${threadId}`,
    `# title: ${body.title ?? ""}`,
    `# label: ${label}`,
    "",
  ];
  for (const m of threadMessages(body)) {
    const msg = m.message ?? {};
    lines.push(`===== ${msg.role ?? "?"} ${msg.createdAt ?? ""}`);
    for (const part of msg.content ?? []) {
      if (part.type === "text") {
        lines.push(part.text ?? "");
      } else if (part.type === "tool-call") {
        lines.push(
          `>> tool-call ${part.toolName}(${part.argsText ?? JSON.stringify(part.args ?? {})})`,
        );
        if (part.result !== undefined) {
          const r =
            typeof part.result === "string"
              ? part.result
              : JSON.stringify(part.result, null, 2);
          lines.push(`<< result ${r.slice(0, 2000)}${r.length > 2000 ? " …[truncated]" : ""}`);
        }
      } else {
        lines.push(`[part ${part.type}]`);
      }
    }
    lines.push("");
  }
  const file = path.join(OUT, `transcript-${threadId.slice(0, 8)}.txt`);
  await writeFile(file, lines.join("\n"));
  log("transcript:", file);
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

const summary = {
  base: BASE,
  out: OUT,
  startedAt: new Date().toISOString(),
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
    const t = m.text().slice(0, 400);
    consoleErrors.push(t);
    log("[console.error]", t);
  }
});
page.on("pageerror", (e) => {
  const t = String(e).slice(0, 500);
  consoleErrors.push(t);
  log("[pageerror]", t);
});

const threads = { comment60: null, accept: null, comment9999: null };
let aborted = false;

try {
  // --- step 1: /briefs, load synthetic demo (single client-side navigation) ---
  await page.goto(`${BASE}/briefs`, { waitUntil: "networkidle" });
  await shot(page, "01-briefs");
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
  await writeFile(
    path.join(OUT, "get-brief-after-verify.json"),
    JSON.stringify(afterVerify, null, 2),
  );
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
  const t1 = new Date(Date.now() - 30_000);
  await card60.getByRole("button", { name: "Send to agent" }).click();
  const turn1 = await waitForTurn("esto es el Código del Trabajo", t1);
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
    turn1.threadId ? `thread ${turn1.threadId}` : "no thread detected",
  );
  if (!afterComment) throw new Error("no pending suggestion on artículo 60");
  const sugg60 = (afterComment.review ?? []).find(
    (r) =>
      r.kind === "suggestion" && r.citationId === cit60.id && r.state === "pending",
  );
  summary.art60.suggestionReplacement = sugg60?.replacement ?? null;
  await writeFile(
    path.join(OUT, "get-brief-after-comment60.json"),
    JSON.stringify(afterComment, null, 2),
  );
  await shot(page, "05-pending-suggestion");
  await dump(page, "05-pending-suggestion");

  // --- step 4: accept in the UI; the page auto-sends the re-verify message ---
  const t2 = new Date(Date.now() - 30_000);
  await card60.getByRole("button", { name: "Accept" }).click();
  const turn2 = await waitForTurn("accepted the suggestion", t2);
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
  await writeFile(
    path.join(OUT, "get-brief-after-accept.json"),
    JSON.stringify(afterAccept, null, 2),
  );
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
  const t3 = new Date(Date.now() - 30_000);
  await card9999.getByRole("button", { name: "Send to agent" }).click();
  const turn3 = await waitForTurn("qué hacemos con esta cita", t3);
  threads.comment9999 = turn3.threadId;
  log("comment9999 turn:", JSON.stringify(turn3));
  await shot(page, "07-comment-9999");
  await dump(page, "07-comment-9999");
  const after9999 = await getBrief(briefId);
  await writeFile(
    path.join(OUT, "get-brief-after-9999.json"),
    JSON.stringify(after9999.body ?? after9999, null, 2),
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
    summary.reply9999?.slice(0, 200),
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
      body: r.body.slice(0, 200),
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
    signed: Boolean(commitmentData.signature),
    key_id: commitmentData.signature?.key_id ?? null,
    algorithm: commitmentData.signature?.algorithm ?? null,
    pack_hash: commitmentData.commitment?.pack_hash ?? null,
    as_of: commitmentData.commitment?.as_of ?? null,
    citas_verificadas: commitmentData.commitment?.citas_verificadas ?? null,
    total_citas: commitmentData.commitment?.total_citas ?? null,
  };
  hard(
    "commitmentSigned",
    summary.commitment.signed,
    `key_id ${summary.commitment.key_id}`,
  );
  await writeFile(
    path.join(OUT, "get-brief-after-commitment.json"),
    JSON.stringify(withCommitment, null, 2),
  );
  await shot(page, "08-commitment-panel");
  await dump(page, "08-commitment-panel");

  async function download(nameRe, filename) {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 30_000 }),
      page.getByRole("button", { name: nameRe }).click(),
    ]);
    const dest = path.join(OUT, filename);
    await download.saveAs(dest);
    log("downloaded:", dest);
    return dest;
  }
  try {
    await download(/download commitment\.json/i, "commitment.json");
    await download(/download commitment\.sig\.json/i, "commitment.sig.json");
    await download(/download \.pub/i, "content-signing-key.pub");
    hard("downloadsCaptured", true);
  } catch (e) {
    hard("downloadsCaptured", false, String(e).slice(0, 200));
    throw e;
  }

  // --- step 7: third-party verifier (positive + negative control) ---
  if (VERIFIER) {
    const runVerifier = async (files, outFile) => {
      try {
        const { stdout, stderr } = await execFileP(
          "python3",
          [VERIFIER, ...files],
          { cwd: OUT },
        );
        await writeFile(
          path.join(OUT, outFile),
          `command: python3 ${path.basename(VERIFIER)} ${files.join(" ")}\nexit: 0\n\n${stdout}${stderr}`,
        );
        return { code: 0, stdout, stderr };
      } catch (e) {
        await writeFile(
          path.join(OUT, outFile),
          `command: python3 ${path.basename(VERIFIER)} ${files.join(" ")}\nexit: ${e.code}\n\n${e.stdout ?? ""}${e.stderr ?? ""}`,
        );
        return { code: e.code ?? -1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
      }
    };

    const pos = await runVerifier(
      ["commitment.json", "commitment.sig.json", "content-signing-key.pub"],
      "verifier.txt",
    );
    summary.verifierExitCode = pos.code;
    const verified =
      pos.code === 0 && /RESULTADO:\s*VERIFICADO/.test(pos.stdout ?? "");
    hard("verifierVerified", verified, `exit ${pos.code}`);

    // Negative control: tamper one value; the signature must not verify.
    const tampered = JSON.parse(
      await readFile(path.join(OUT, "commitment.json"), "utf8"),
    );
    tampered.citas_verificadas = (tampered.citas_verificadas ?? 0) + 1;
    await writeFile(
      path.join(OUT, "commitment.tampered.json"),
      JSON.stringify(tampered, null, 2),
    );
    const neg = await runVerifier(
      ["commitment.tampered.json", "commitment.sig.json", "content-signing-key.pub"],
      "verifier-tampered.txt",
    );
    summary.verifierTamperedExitCode = neg.code;
    soft("verifierRejectsTampered", neg.code === 1, `exit ${neg.code}`);
  }

  // --- step 8: es-ES screenshots in a second context (view-only, no agent) ---
  try {
    const esCtx = await browser.newContext({
      locale: "es-ES",
      viewport: { width: 1600, height: 950 },
    });
    const esPage = await esCtx.newPage();
    await esPage.goto(`${BASE}/briefs`, { waitUntil: "networkidle" });
    await esPage.screenshot({ path: path.join(OUT, "20-es-briefs.png") });
    await esPage.goto(`${BASE}/briefs/${briefId}`, {
      waitUntil: "networkidle",
    });
    await esPage.screenshot({ path: path.join(OUT, "21-es-brief.png") });
    await esCtx.close();
    soft("esScreenshots", true, "20-es-briefs.png, 21-es-brief.png");
    log("es-ES screenshots saved");
  } catch (e) {
    soft("esScreenshots", false, String(e).slice(0, 200));
  }
} catch (e) {
  aborted = true;
  summary.error = String(e?.stack ?? e).slice(0, 1000);
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
      log("transcript failed for", id, String(e).slice(0, 200));
    }
  }
  try {
    const all = await listThreads();
    await writeFile(
      path.join(OUT, "threads.json"),
      JSON.stringify(all, null, 2),
    );
  } catch {}
  if (consoleErrors.length) {
    await writeFile(
      path.join(OUT, "console-errors.txt"),
      consoleErrors.join("\n"),
    );
  }
  await browser.close();

  summary.finishedAt = new Date().toISOString();
  summary.hardChecks = hardChecks;
  summary.softChecks = softChecks;
  summary.pass = !aborted && hardChecks.every((c) => c.ok);
  await writeFile(
    path.join(OUT, "summary.json"),
    JSON.stringify(summary, null, 2),
  );
  log("summary:", path.join(OUT, "summary.json"));
  log(summary.pass ? "RESULT: PASS" : "RESULT: FAIL");
  process.exit(summary.pass ? 0 : 1);
}
