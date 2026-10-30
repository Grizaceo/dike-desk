import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { IconFileText, IconSparkles } from "@tabler/icons-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { VerdictBadge } from "@/components/briefs/StatusBadge";

export default function BriefsIndexRoute() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const { data, isPending } = useActionQuery("list-briefs", {});
  const create = useActionMutation("create-brief", {
    onSuccess: (result) => navigate(`/briefs/${result.id}`),
    onError: (error) =>
      toast.error(actionErrorMessage(error) ?? "Could not create the brief."),
  });

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 sm:p-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Briefs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste a brief. Diké checks every statutory citation against a dated,
          hash-identified corpus and refuses what it cannot prove. You decide
          every fix.
        </p>
      </header>

      <form
        className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!body.trim()) return;
          create.mutate({ title: title.trim() || undefined, body });
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="brief-title">Title</Label>
          <Input
            id="brief-title"
            value={title}
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="brief-body">Text</Label>
          <textarea
            id="brief-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={8}
            className="w-full rounded-md border border-input bg-background px-3 py-2 font-serif text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="EN LO PRINCIPAL: …"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!body.trim() || create.isPending}>
            Create brief
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={create.isPending}
            onClick={() => create.mutate({ demo: true })}
          >
            <IconSparkles className="size-4" />
            Load synthetic demo
          </Button>
        </div>
      </form>

      <section className="flex flex-col gap-2">
        {isPending ? (
          <Skeleton className="h-16 rounded-xl" />
        ) : data?.briefs.length ? (
          data.briefs.map((brief) => (
            <Link
              key={brief.id}
              to={`/briefs/${brief.id}`}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 hover:bg-accent"
            >
              <IconFileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {brief.title}
              </span>
              <VerdictBadge verdict={brief.verdict} />
            </Link>
          ))
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No briefs yet.
          </p>
        )}
      </section>
    </main>
  );
}
