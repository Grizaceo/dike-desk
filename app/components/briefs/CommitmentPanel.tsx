import { useT } from "@agent-native/core/client/i18n";
import {
  IconAlertTriangle,
  IconCertificate,
  IconCheck,
  IconCopy,
  IconDownload,
  IconShieldCheck,
  IconX,
} from "@tabler/icons-react";
import { toast } from "sonner";

import { StatusBadge, type CitationStatus } from "@/components/briefs/StatusBadge";
import type { VerificationCertificate } from "../../../server/lib/certificate.js";
import { normalizeBriefText } from "../../../shared/brief-text.js";

/** The public commitment as emitted by `dike constancia --emit-commitment`. */
export type DikeCommitment = {
  schema_version: string;
  pack_hash: string;
  as_of: string;
  fecha_constancia: string;
  total_citas: number;
  citas_verificadas: number;
  citas_fallidas: number;
  normas_verificadas?: Array<Record<string, unknown>>;
  alcance: string;
  advertencias?: string[];
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
  certificate?: VerificationCertificate | undefined;
};

const PUBLISHED_DIKE_KEY_ID = "3c7b3fde075efbe3";
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
      onClick={() => {
        const write = navigator.clipboard?.writeText(text);
        if (!write) {
          toast.error(t("brief.copyFailed"));
          return;
        }
        void write.then(
          () => toast.success(t("brief.copySuccess")),
          () => toast.error(t("brief.copyFailed")),
        );
      }}
      className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs font-medium opacity-60 hover:opacity-100"
    >
      <IconCopy className="size-3" /> {t("brief.copy")}
    </button>
  );
}

function DownloadLink({
  name,
  label,
  content,
  mime,
}: {
  name: string;
  label: string;
  content: string;
  mime?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => downloadFile(name, content, mime)}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
    >
      <IconDownload className="size-3" /> {label}
    </button>
  );
}

export default function CommitmentPanel({
  data,
  certificateCheck,
  body,
}: {
  data: CommitmentData;
  certificateCheck?: { textMatches: boolean } | null | undefined;
  body: string;
}) {
  const t = useT();
  const { commitment, signature, pubkey, certificate } = data;
  const isSigned = Boolean(signature);
  const commitmentJson = JSON.stringify(commitment, null, 2);
  const partial = certificate?.parcial === true;
  const notVerified = certificate?.totales.no_verificadas ?? 0;

  return (
    <section className="space-y-3">
      <div
        className={
          partial
            ? "rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40"
            : "rounded-xl border border-border bg-card p-4"
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <IconCertificate className="size-4 text-emerald-600" />
            <span className="text-sm font-medium">
              {t("commitment.emitted")}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {isSigned ? (
              <>
                <IconShieldCheck className="size-4 text-emerald-600" />
                <span className="text-xs text-muted-foreground">
                  {t("commitment.badgeSealed", {
                    key_id: signature!.key_id,
                  })}
                </span>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">
                {t("commitment.badgeUnsealed")}
              </span>
            )}
          </div>
        </div>
        {partial ? (
          <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
            <IconAlertTriangle className="size-3.5 shrink-0" />
            {t(
              notVerified === 1
                ? "commitment.partialHeaderOne"
                : "commitment.partialHeaderMany",
              { count: notVerified },
            )}
          </p>
        ) : null}
      </div>

      {/* Certificate: every detected citation, the brief fingerprint, scope. */}
      {certificate ? (
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium">{t("commitment.title")}</h3>
            <DownloadLink
              name="certificado.json"
              label={t("commitment.downloadCertificate")}
              content={JSON.stringify(certificate, null, 2)}
            />
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-1.5 text-xs">
            <dt className="text-muted-foreground">
              {t("commitment.labelPackHash")}
            </dt>
            <dd className="font-mono break-all">{certificate.pack_hash}</dd>
            <dt className="text-muted-foreground">
              {t("commitment.labelAsOf")}
            </dt>
            <dd>{certificate.as_of}</dd>
            <dt className="text-muted-foreground">
              {t("commitment.labelAsOfOrigen")}
            </dt>
            <dd>{certificate.as_of_origen}</dd>
            <dt className="text-muted-foreground">
              {t("commitment.labelEmittedAt")}
            </dt>
            <dd>{certificate.fecha_emision}</dd>
            <dt className="text-muted-foreground">
              {t("commitment.labelCommitmentHash")}
            </dt>
            <dd className="font-mono break-all">
              {certificate.commitment_hash}
            </dd>
          </dl>

          <div className="space-y-1">
            <p className="text-xs font-medium">
              {t("commitment.hashLabel")}
            </p>
            <p className="font-mono text-[11px] break-all">
              {certificate.escrito.sha256}
            </p>
            {certificateCheck ? (
              <p
                className={
                  certificateCheck.textMatches
                    ? "flex items-center gap-1 text-xs text-muted-foreground"
                    : "flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-300"
                }
              >
                {certificateCheck.textMatches ? (
                  <IconCheck className="size-3.5 shrink-0 text-emerald-600" />
                ) : (
                  <IconX className="size-3.5 shrink-0" />
                )}
                {certificateCheck.textMatches
                  ? t("commitment.textMatchOk")
                  : t("commitment.textMismatch")}
              </p>
            ) : null}
            <DownloadLink
              name="escrito-verificado.txt"
              label={t("commitment.downloadText")}
              content={normalizeBriefText(body)}
              mime="text/plain"
            />
          </div>

          <p className="text-xs font-medium">
            {t("commitment.listHeading")}
          </p>
          <ul className="space-y-1.5">
            {certificate.citas.map((cita: VerificationCertificate["citas"][number]) => (
              <li
                key={cita.posicion}
                className="rounded-lg border border-border p-2 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 font-medium">
                    {cita.posicion}. {cita.cita}
                  </span>
                  <StatusBadge status={cita.estado as CitationStatus} />
                </div>
                {cita.estado !== "verified" &&
                (cita.resolucion || cita.vigencia) ? (
                  <p className="mt-1 text-muted-foreground">
                    <code>
                      {[cita.resolucion, cita.vigencia]
                        .filter(Boolean)
                        .join(" · ")}
                    </code>
                  </p>
                ) : null}
              </li>
            ))}
          </ul>

          <p className="text-xs text-muted-foreground">{certificate.alcance}</p>
          <p className="text-xs text-muted-foreground">
            {t("commitment.hashPrivacy")}
          </p>
        </div>
      ) : (
        /* Legacy rows emitted before certificates existed. */
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <dl className="grid grid-cols-[auto_1fr] gap-1.5 text-xs">
            <dt className="text-muted-foreground">
              {t("commitment.labelPackHash")}
            </dt>
            <dd className="font-mono break-all">{commitment.pack_hash}</dd>
            <dt className="text-muted-foreground">
              {t("commitment.labelAsOf")}
            </dt>
            <dd>{commitment.as_of}</dd>
            <dt className="text-muted-foreground">
              {t("commitment.labelScope")}
            </dt>
            <dd className="text-muted-foreground">{commitment.alcance}</dd>
          </dl>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium">
            {t("commitment.labelCommitmentHash")}
          </h3>
          <DownloadLink
            name="commitment.json"
            label={t("commitment.downloadJson")}
            content={commitmentJson}
          />
        </div>
        <details className="text-xs">
          <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
            {t("commitment.showJson")}
          </summary>
          <pre className="mt-2 overflow-x-auto rounded-md bg-muted/50 p-3 font-mono text-[10px] leading-tight">
            {commitmentJson}
          </pre>
        </details>
      </div>

      {/* Integrity seal. */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-2">
        <h3 className="text-sm font-medium">{t("commitment.sealTitle")}</h3>
        <p className="text-xs text-muted-foreground">
          {t("commitment.sealExplanation")}
        </p>
        {isSigned ? (
          <>
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
            </dl>
            <p className="text-xs text-muted-foreground">
              {signature!.key_id === PUBLISHED_DIKE_KEY_ID
                ? t("commitment.declaredKey")
                : t("commitment.demoKey", {
                    key_id: signature!.key_id,
                    published: PUBLISHED_DIKE_KEY_ID,
                  })}
            </p>
            {pubkey ? (
              <div className="space-y-1">
                <DownloadLink
                  name="content-signing-key.pub"
                  label={t("commitment.downloadPub")}
                  content={pubkey}
                  mime="text/plain"
                />
                <p className="text-xs text-muted-foreground">
                  {t("commitment.pubKeyCaveat")}
                </p>
              </div>
            ) : null}
            <DownloadLink
              name="commitment.sig.json"
              label={t("commitment.downloadSig")}
              content={JSON.stringify(signature, null, 2)}
            />
            <div className="space-y-1">
              <p className="text-xs font-medium">
                {t("commitment.offlineStep2")}
              </p>
              <pre className="overflow-x-auto rounded-md bg-muted/50 p-3 font-mono text-[11px] leading-tight">
                {VERIFY_COMMAND}
              </pre>
              <CopyButton text={VERIFY_COMMAND} />
            </div>
            <p className="text-xs text-muted-foreground">
              {t("commitment.independentVerifier")}
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            {t("commitment.unsealed")}
          </p>
        )}
      </div>
    </section>
  );
}
