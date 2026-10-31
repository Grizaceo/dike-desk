#!/usr/bin/env node
// Diké Desk end-to-end demo driver.
//
// Runs the demo guion in ONE browser page (client-side navigation only, like
// a normal session): load the synthetic demo, verify at the lawyer-chosen
// reference date 2026-09-15, comment on «artículo 60» so the agent checks
// pertinence and proposes a withdrawal (accepted in the UI, re-verified),
// fix the art. 168 paraphrase with «Editar texto» and verify again, comment
// on «artículo 640 del Código del Trabajo», then issue the partial
// certificate (lawyer-only confirmation) and check the fingerprint with
// verifier/verificar_certificado.py. With --verifier, a sealed run is also
// checked with the engine's independent verifier.
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

const threads = { comment60: null, accept: null, comment640: null };
let aborted = false;

try {
  // --- step 1: load the demo, set the reference date, verify ---
  await page.goto(`${BASE}/briefs`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /synthetic demo|demo sint/i }).click();
  await page.waitForURL(/\/briefs\/[^/]+$/, { timeout: 15_000 });
  const briefId = page.url().split("/briefs/")[1];
  summary.briefId = briefId;
  log("briefId:", briefId);
  await page.waitForLoadState("networkidle");
  await shot(page, "02-demo-loaded");
  hard("demoBriefLoaded", Boolean(briefId), briefId);
  if (!briefId) throw new Error("no brief id after demo load");

  await page.locator("#brief-as-of").fill("2026-09-15");
  await page
    .getByRole("button", { name: /Verify with Diké|Verificar con Diké/ })
    .first()
    .click();
  const afterVerify = await pollBrief(
    briefId,
    (b) => b.brief.meta && b.brief.meta.total_citas > 0,
    240_000,
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
  hard(
    "asOfIsChosen",
    meta0.as_of === "2026-09-15" && meta0.as_of_source === "abogado",
    `as_of ${meta0.as_of} source ${meta0.as_of_source}`,
  );
  await writeArtifact(OUT, "get-brief-after-verify.json", afterVerify);
  await shot(page, "03-after-verify");
  await dump(page, "03-after-verify");

  const findCit = (body, needle) =>
    (body.citations ?? []).find((c) => c.raw.includes(needle));
  const cit60 = findCit(afterVerify, "artículo 60");
  const cit640 = findCit(afterVerify, "artículo 640");
  hard("foundArt60", Boolean(cit60), cit60?.raw);
  hard(
    "art60Ambiguous",
    cit60?.status === "ambiguous",
    `${cit60?.raw} -> ${cit60?.status} (${cit60?.resolution})`,
  );
  hard("foundArt640", Boolean(cit640), cit640?.raw);
  hard(
    "art640Refused",
    cit640?.status === "refused",
    `${cit640?.raw} -> ${cit640?.status} (${cit640?.resolution})`,
  );
  if (!cit60 || !cit640) throw new Error("expected citations not found");

  const cardByRaw = (raw) =>
    page
      .locator("aside article")
      .filter({ has: page.locator("strong").filter({ hasText: raw }) });

  // --- step 2: comment on «artículo 60»; the agent checks pertinence ---
  const card60 = cardByRaw("artículo 60");
  await card60
    .locator("input")
    .fill(
      "esto es el Código del Trabajo. Antes de corregirla, pide al contradictor que revise si el artículo sostiene la frase.",
    );
  const turn60StartedAt = new Date();
  await card60
    .getByRole("button", { name: /Send to agent|Enviar al agente/ })
    .click();
  const turn60 = await waitForTurn(
    "esto es el Código del Trabajo",
    runStartedAt,
    turn60StartedAt,
  );
  hard("comment60TurnConfirmed", turn60.markerConfirmed);
  threads.comment60 = turn60.threadId;
  log("comment60 turn:", JSON.stringify(turn60));
  await shot(page, "04-comment-60");
  await dump(page, "04-comment-60");

  const after60 = await pollBrief(
    briefId,
    (b) =>
      (b.review ?? []).some(
        (r) => r.citationId === cit60.id && r.author === "agent",
      ),
    120_000,
  );
  const reply60 = (after60?.review ?? [])
    .filter((r) => r.citationId === cit60.id && r.author === "agent")
    .at(-1)?.body;
  hard(
    "art60AgentReply",
    Boolean(reply60),
    reply60 ? scrub(reply60).slice(0, 200) : "no agent reply on the citation",
  );
  if (reply60) {
    soft("reply60CitesContent", /fallec/i.test(reply60));
    soft(
      "reply60Pertinence",
      /no sostiene|no respalda|no es pertinente|impertinen/i.test(reply60),
    );
  }
  const sugg60 = (after60?.review ?? []).find(
    (r) =>
      r.kind === "suggestion" &&
      r.citationId === cit60.id &&
      r.state === "pending",
  );
  summary.art60 = {
    suggestionReplacement: sugg60?.replacement ?? null,
  };
  const isWithdrawal = sugg60 && sugg60.replacement === "";

  if (isWithdrawal) {
    const acceptStartedAt = new Date();
    await card60
      .getByRole("button", { name: /^Accept$|^Aceptar$/ })
      .click();
    const afterAccept = await pollBrief(
      briefId,
      (b) =>
        (b.review ?? []).some(
          (r) => r.id === sugg60.id && r.state === "accepted",
        ),
      120_000,
    );
    hard(
      "withdrawalAccepted",
      Boolean(afterAccept),
      afterAccept ? "suggestion accepted" : "suggestion stayed pending",
    );
    const acceptTurn = await waitForTurn(
      "accepted",
      runStartedAt,
      acceptStartedAt,
      240_000,
    );
    log("accept turn:", JSON.stringify(acceptTurn));
    threads.accept = acceptTurn.threadId;
    const afterReverify = await pollBrief(
      briefId,
      (b) =>
        b.brief.meta &&
        !(b.citations ?? []).some((c) => c.status === "stale"),
      300_000,
    );
    const finalCits = afterReverify?.citations ?? [];
    hard(
      "art60Withdrawn",
      Boolean(afterReverify) &&
        !finalCits.some((c) => c.raw.includes("artículo 60")) &&
        finalCits.length === 5 &&
        (afterReverify?.brief.meta?.citas_verificadas ?? 0) === 4,
      `${finalCits.length} citations, ${afterReverify?.brief.meta?.citas_verificadas} verified`,
    );
  } else {
    soft(
      "art60NotWithdrawal",
      true,
      sugg60
        ? `pending suggestion replacement: ${JSON.stringify(sugg60.replacement)}`
        : "no pending suggestion",
    );
    if (sugg60) {
      await card60
        .getByRole("button", { name: /^Reject$|^Rechazar$/ })
        .click();
      const afterReject = await pollBrief(
        briefId,
        (b) =>
          (b.review ?? []).some(
            (r) => r.id === sugg60.id && r.state === "rejected",
          ),
        60_000,
      );
      soft("art60SuggestionRejected", Boolean(afterReject));
    }
  }

  // --- step 3: paraphrase (no model): fix «treinta» -> «sesenta» by hand ---
  const warnCount = await cardByRaw("artículo 168")
    .locator("text=/paráfrasis|paraphrase/i")
    .count();
  soft(
    "art168WarningShown",
    warnCount > 0,
    "art. 168 card shows the paraphrase warning",
  );
  await page
    .getByRole("button", { name: /Edit text|Editar texto/ })
    .click();
  const editor = page.locator("textarea#brief-edit-body");
  const draft = await editor.inputValue();
  hard(
    "draftHasTreinta",
    draft.includes("treinta días hábiles"),
    "SEXTO paraphrase present",
  );
  await editor.fill(
    draft.replace("treinta días hábiles", "sesenta días hábiles"),
  );
  await page.getByRole("button", { name: /^Save$|^Guardar$/ }).click();
  await pollBrief(
    briefId,
    (b) => b.brief.body.includes("sesenta días hábiles"),
    60_000,
  );
  await page
    .getByRole("button", { name: /Verify with Diké|Verificar con Diké/ })
    .first()
    .click();
  const afterEdit = await pollBrief(
    briefId,
    (b) =>
      b.brief.meta &&
      b.brief.body.includes("sesenta días hábiles") &&
      !(b.citations ?? []).some((c) => c.status === "stale"),
    300_000,
  );
  const cit168 = findCit(afterEdit ?? {}, "artículo 168");
  hard(
    "art168StillVerified",
    cit168?.status === "verified",
    `${cit168?.raw} -> ${cit168?.status}`,
  );
  hard(
    "bodyHasSesenta",
    (afterEdit?.brief.body ?? "").includes(
      "sesenta días hábiles contado desde la separación",
    ),
    "paraphrase fixed in the stored text",
  );
  hard(
    "asOfKept",
    afterEdit?.brief.meta?.as_of === "2026-09-15",
    `as_of ${afterEdit?.brief.meta?.as_of}`,
  );
  await writeArtifact(OUT, "get-brief-after-paraphrase.json", afterEdit);
  await shot(page, "05-after-paraphrase");
  await dump(page, "05-after-paraphrase");

  // --- step 4: comment on «artículo 640»; the reply must stay prudent ---
  const card640 = cardByRaw("artículo 640");
  await card640.locator("input").fill("¿qué hacemos con esta cita?");
  const turn640StartedAt = new Date();
  await card640
    .getByRole("button", { name: /Send to agent|Enviar al agente/ })
    .click();
  const turn640 = await waitForTurn(
    "¿qué hacemos con esta cita?",
    runStartedAt,
    turn640StartedAt,
  );
  hard("comment640TurnConfirmed", turn640.markerConfirmed);
  threads.comment640 = turn640.threadId;
  const after640 = await pollBrief(
    briefId,
    (b) =>
      (b.review ?? []).some(
        (r) => r.citationId === cit640.id && r.author === "agent",
      ),
    120_000,
  );
  const reply640 = (after640?.review ?? [])
    .filter((r) => r.citationId === cit640.id && r.author === "agent")
    .at(-1)?.body;
  if (reply640) {
    soft(
      "reply640Prudent",
      !/no existe/i.test(reply640) || /no prueba/i.test(reply640),
      scrub(reply640).slice(0, 200),
    );
  } else {
    soft("reply640Prudent", false, "no agent reply on «artículo 640»");
  }
  await shot(page, "06-comment-640");
  await dump(page, "06-comment-640");

  // --- step 5: partial certificate (lawyer-only confirmation) ---
  await page
    .getByRole("button", {
      name: /Issue verification certificate|Emitir certificado de verificación/,
    })
    .click();
  const dialog = page.locator('[role="alertdialog"], [role="dialog"]');
  hard(
    "partialDialogShown",
    (await dialog.count()) > 0,
    "the partial-emission confirmation appeared",
  );
  await shot(page, "07-partial-dialog");
  await page
    .getByRole("button", {
      name: /Issue partial certificate|Emitir certificado parcial/,
    })
    .click();
  const withCert = await pollBrief(
    briefId,
    (b) => Boolean(b.brief.commitment?.certificate),
    180_000,
  );
  hard(
    "certificateEmitted",
    Boolean(withCert),
    withCert ? "" : "brief.commitment.certificate never appeared",
  );
  if (!withCert) throw new Error("no certificate emitted");
  await writeArtifact(OUT, "get-brief-after-certificate.json", withCert);
  const partialHeader = await page
    .locator("text=/Certificado parcial|Partial certificate/i")
    .count();
  hard("partialHeaderShown", partialHeader > 0);
  await shot(page, "08-certificate-panel");
  await dump(page, "08-certificate-panel");

  async function download(nameRe, filename) {
    const [dl] = await Promise.all([
      page.waitForEvent("download", { timeout: 30_000 }),
      page.getByRole("button", { name: nameRe }).first().click(),
    ]);
    const stream = await dl.createReadStream();
    if (!stream) throw new Error("download has no content");
    const text = await readBoundedStream(stream, 2 * 1024 * 1024);
    await writeArtifact(OUT, filename, text);
    log("downloaded:", filename);
    return text;
  }
  const certJson = await download(/certificado/i, "certificado.json");
  const escritoTxt = await download(
    /escrito-verificado|verified text/i,
    "escrito-verificado.txt",
  );
  let commitmentJson = null;
  try {
    commitmentJson = await download(/commitment\.json/i, "commitment.json");
    if (withCert.brief.commitment.signature) {
      await download(/commitment\.sig\.json/i, "commitment.sig.json");
      await download(/\.pub/i, "content-signing-key.pub");
    }
  } catch (e) {
    soft(
      "engineDownloads",
      false,
      redactText(String(e.message ?? e)).slice(0, 200),
    );
  }

  const certObj = JSON.parse(certJson);
  hard("certParcial", certObj.parcial === true);
  hard("certParcialConfirmada", certObj.emision_parcial_confirmada === true);
  hard(
    "certFiveCitas",
    Array.isArray(certObj.citas) && certObj.citas.length === 5,
    `${certObj.citas?.length} citas`,
  );
  const cita640 = (certObj.citas ?? []).find((c) =>
    c.cita.includes("artículo 640"),
  );
  hard("cert640Refused", cita640?.estado === "refused", cita640?.estado);
  const { createHash } = await import("node:crypto");
  const sha = createHash("sha256").update(escritoTxt, "utf8").digest("hex");
  hard(
    "certHashMatches",
    certObj.escrito?.sha256 === sha,
    `cert ${certObj.escrito?.sha256} vs text ${sha}`,
  );

  // Offline fingerprint check with this repo's verifier (positive + tampered).
  try {
    const { stdout: vout } = await execFileP(
      "python3",
      [
        "verifier/verificar_certificado.py",
        "certificado.json",
        "escrito-verificado.txt",
        ...(commitmentJson ? ["commitment.json"] : []),
      ],
      { cwd: OUT, maxBuffer: 4 * 1024 * 1024 },
    );
    await writeArtifact(OUT, "verificador.txt", vout);
    hard("verificadorCoincide", true, "exit 0");
    await writeArtifact(OUT, "escrito-tampered.txt", `${escritoTxt}x`);
    try {
      await execFileP(
        "python3",
        [
          "verifier/verificar_certificado.py",
          "certificado.json",
          "escrito-tampered.txt",
        ],
        { cwd: OUT, maxBuffer: 4 * 1024 * 1024 },
      );
      hard("verificadorRejectsTampered", false, "exit 0 on tampered text");
    } catch (e) {
      await writeArtifact(
        OUT,
        "verificador-tampered.txt",
        String(e.stdout ?? "") + String(e.stderr ?? ""),
      );
      hard("verificadorRejectsTampered", e.code === 1, `exit ${e.code}`);
    }
  } catch (e) {
    if (e.code === "ENOENT") soft("python3Absent", true, "python3 not found");
    else
      hard(
        "verificadorCoincide",
        false,
        redactText(String(e.code ?? e.message)).slice(0, 200),
      );
  }

  // --- optional: engine seal verifier for sealed runs ---
  if (VERIFIER && withCert.brief.commitment.signature) {
    try {
      const { stdout } = await execFileP(
        "python3",
        [
          VERIFIER,
          "commitment.json",
          "commitment.sig.json",
          "content-signing-key.pub",
        ],
        { cwd: OUT, maxBuffer: 4 * 1024 * 1024 },
      );
      await writeArtifact(OUT, "verifier.txt", stdout);
      soft("signatureCryptographicallyVerified", true, "exit 0");
    } catch (e) {
      await writeArtifact(
        OUT,
        "verifier.txt",
        String(e.stdout ?? "") + String(e.stderr ?? ""),
      );
      soft("signatureCryptographicallyVerified", false, `exit ${e.code}`);
    }
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
    ["comment640", threads.comment640],
  ].filter(([, id]) => id);
  const labelsByThread = new Map();
  for (const [label, id] of touched) {
    labelsByThread.set(id, [...(labelsByThread.get(id) ?? []), label]);
  }
  summary.threads = {
    comment60: threads.comment60,
    accept: threads.accept,
    comment640: threads.comment640,
    singleThread:
      touched.length === 3 &&
      threads.comment60 === threads.accept &&
      threads.accept === threads.comment640,
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
