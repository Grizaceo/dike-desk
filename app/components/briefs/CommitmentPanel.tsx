import { useT } from "@agent-native/core/client/i18n";
import {
  IconAlertTriangle,
  IconCertificate,
  IconCheck,
  IconCopy,
  IconDownload,
  IconExternalLink,
  IconShieldCheck,
} from "@tabler/icons-react";
import { toast } from "sonner";

/** The public commitment as emitted by `dike constancia --emit-commitment`. */
export type DikeCommitment = {
  schema_version: string;
  pack_hash: string;
  as_of: string;
  fecha_constancia: string;
  total_citas: number;
  citas_verificadas: number;
  citas_fallidas: number;
  normas_verificadas: Array<{
    gid: string;
    cuerpo: string;
    estado: string;
    texto_hash: string;
    vigencia: string;
    vigencia_legible?: string;
    fuente_url: string;
  }>;
  alcance: string;
  advertencias: string[];
};

/** The signature envelope as emitted by `dike constancia --emit-commitment --sign`. */
export type DikeSignature = {
  algorithm: string;
  commitment_hash: string;
  key_id: string;
  role: string;
  schema_version: string;
  signature: string;
};

export type CommitmentData = {
  commitment: DikeCommitment;
  signature: DikeSignature | null;
  pubkey: string | null;
};

const PUBLISHED_DIKE_KEY_ID = "3c7b3fde075efbe3";
const DIKE_REPO_KEYS_URL =
  "https://github.com/Grizaceo/dike/blob/main/docs/hackathon/KEYS.md";
const DIKE_REPO_VERIFIER_URL =
  "https://raw.githubusercontent.com/Grizaceo/dike/main/docs/hackathon/verificar_tercero.py";
const VERIFY_COMMAND =
  "python3 verificar_tercero.py commitment.json commitment.sig.json content-signing-key.pub";

function downloadFile(
  name: string,
  content: string,
  mime = "application/json",
) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking in the click turn cancels the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function CopyButton({ text }: { text: string }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        toast.success(t("brief.copySuccess"));
      }}
      className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs font-medium opacity-60 hover:opacity-100"
    >
      <IconCopy className="size-3" /> {t("brief.copy")}
    </button>
  );
}

export default function CommitmentPanel({ data }: { data: CommitmentData }) {
  const t = useT();
  const { commitment, signature, pubkey } = data;
  const isSigned = Boolean(signature);
  const jsonText = JSON.stringify(commitment, null, 2);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <IconCertificate className="size-4 text-emerald-600" />
          <span className="text-sm font-medium">{t("commitment.emitted")}</span>
        </div>
        <div className="flex items-center gap-1">
          {isSigned ? (
            <>
              <IconShieldCheck className="size-4 text-emerald-600" />
              <span className="text-xs text-muted-foreground">
                {t("commitment.signedBadge", { key_id: signature!.key_id })}
              </span>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">
              {t("commitment.unsignedBadge")}
            </span>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">{t("commitment.summary")}</h3>
          <button
            type="button"
            onClick={() => downloadFile("commitment.json", jsonText)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <IconDownload className="size-3" /> {t("commitment.downloadJson")}
          </button>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-1.5 text-xs">
          <dt className="text-muted-foreground">
            {t("commitment.labelPackHash")}
          </dt>
          <dd className="font-mono">{commitment.pack_hash}</dd>
          <dt className="text-muted-foreground">{t("commitment.labelAsOf")}</dt>
          <dd>{commitment.as_of}</dd>
          <dt className="text-muted-foreground">
            {t("commitment.labelConstanciaAt")}
          </dt>
          <dd>{commitment.fecha_constancia}</dd>
          <dt className="text-muted-foreground">
            {t("commitment.labelVerified")}
          </dt>
          <dd>
            {commitment.citas_verificadas}/{commitment.total_citas}{" "}
            <span className="text-muted-foreground">
              {t("commitment.labelRefused", {
                failures: commitment.citas_fallidas,
              })}
            </span>
          </dd>
          <dt className="text-muted-foreground">
            {t("commitment.labelScope")}
          </dt>
          <dd className="text-muted-foreground">{commitment.alcance}</dd>
        </dl>

        <details className="mt-2 text-xs">
          <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
            {t("commitment.showJson")}
          </summary>
          <pre className="mt-2 overflow-x-auto rounded-md bg-muted/50 p-3 font-mono text-[10px] leading-tight">
            {jsonText}
          </pre>
        </details>
      </div>

      {/* Signature envelope */}
      {isSigned && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">
              {t("commitment.sigEnvelope")}
            </h3>
            <button
              type="button"
              onClick={() =>
                downloadFile(
                  "commitment.sig.json",
                  JSON.stringify(signature!, null, 2),
                )
              }
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <IconDownload className="size-3" /> {t("commitment.downloadSig")}
            </button>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-1.5 text-xs">
            <dt className="text-muted-foreground">
              {t("commitment.labelKeyId")}
            </dt>
            <dd className="font-mono">{signature!.key_id}</dd>
            <dt className="text-muted-foreground">
              {t("commitment.labelAlgorithm")}
            </dt>
            <dd>{signature!.algorithm}</dd>
            <dt className="text-muted-foreground">
              {t("commitment.labelRole")}
            </dt>
            <dd>{signature!.role}</dd>
            <dt className="text-muted-foreground">
              {t("commitment.labelCommitmentHash")}
            </dt>
            <dd className="font-mono break-all">
              {signature!.commitment_hash}
            </dd>
          </dl>

          {signature!.key_id !== PUBLISHED_DIKE_KEY_ID && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
              <p className="flex items-center gap-2 text-xs font-medium">
                <IconAlertTriangle className="size-4 shrink-0 text-amber-600" />
                {t("commitment.differentKeyTitle")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("commitment.differentKeyDesc", {
                  key_id: signature!.key_id,
                  published: PUBLISHED_DIKE_KEY_ID,
                })}
              </p>
            </div>
          )}

          {pubkey && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <dt className="text-xs text-muted-foreground">
                  {t("commitment.labelPubkey")}
                </dt>
                <button
                  type="button"
                  onClick={() =>
                    downloadFile(
                      "content-signing-key.pub",
                      pubkey,
                      "text/plain",
                    )
                  }
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <IconDownload className="size-3" />{" "}
                  {t("commitment.downloadPub")}
                </button>
              </div>
              <pre className="overflow-x-auto rounded-md bg-muted/50 p-3 font-mono text-[10px] leading-tight">
                {pubkey.trim()}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Offline verification. Without a signature there is nothing a third
          party can check, and the panel says so instead of offering a recipe. */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        {isSigned ? (
          <>
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <IconCheck className="size-4 text-emerald-600" />
              {t("commitment.offlineTitle")}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t("commitment.offlineDesc")}
            </p>
            <div className="space-y-2">
              <p className="text-xs font-medium">
                {t("commitment.offlineStep1")}
              </p>
              <a
                href={DIKE_REPO_VERIFIER_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground underline"
              >
                verificar_tercero.py <IconExternalLink className="size-3" />
              </a>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium">
                {t("commitment.offlineStep2")}
              </p>
              <pre className="overflow-x-auto rounded-md bg-muted/50 p-3 font-mono text-[11px] leading-tight">
                {VERIFY_COMMAND}
              </pre>
              <CopyButton text={VERIFY_COMMAND} />
            </div>
          </>
        ) : (
          <>
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <IconAlertTriangle className="size-4 text-amber-600" />
              {t("commitment.unsignedTitle")}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t("commitment.unsignedDesc")}
            </p>
          </>
        )}
        <p className="text-xs text-muted-foreground">
          <a
            href={DIKE_REPO_KEYS_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 underline"
          >
            {t("commitment.offlineDocs")}{" "}
            <IconExternalLink className="size-3" />
          </a>
        </p>
      </div>
    </section>
  );
}
