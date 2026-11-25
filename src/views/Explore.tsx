"use client";

/**
 * Stream Explorer — "Where could you explore next?"
 * All seven streams with fit indices, bands and the WHY panel.
 * Wording is deliberately non-deterministic about destiny: fits are
 * possibilities to explore. Data: GET /candidate/results (streams).
 */
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAsyncData } from "@/lib/AppContext";
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Modal,
  SkeletonCard,
  EmptyState,
} from "@/components/psych/ui";
import { ExplainabilityPanel, StreamCard } from "@/components/psych/dataviz";
import { V2ExploreView } from "@/components/psych/v2-results";
import { contributionLabel } from "@/lib/format";
import type { CanonicalResult, ResultsPayload, StreamResult, V2ResultEnvelope } from "@/lib/types";

interface CareerArea {
  cluster: string;
  streams: string[];
  strengths: string[];
}

/** Group backend career_clusters by cluster name (pure grouping, no invention). */
function buildCareerAreas(result: CanonicalResult): CareerArea[] {
  const map = new Map<string, CareerArea>();
  for (const s of result.streams || []) {
    const strengths = [...(s.contributions || [])]
      .sort((a, b) => (b.contribution ?? 0) - (a.contribution ?? 0))
      .slice(0, 2)
      .map((c) => contributionLabel(c.component));
    for (const cluster of s.career_clusters || []) {
      const existing = map.get(cluster) ?? { cluster, streams: [], strengths: [] };
      if (!existing.streams.includes(s.name)) existing.streams.push(s.name);
      for (const st of strengths) {
        if (!existing.strengths.includes(st)) existing.strengths.push(st);
      }
      map.set(cluster, existing);
    }
  }
  return Array.from(map.values());
}

export default function Explore() {
  const [whyStream, setWhyStream] = useState<StreamResult | null>(null);
  const res = useAsyncData(async () => {
    const [v2, v1] = await Promise.all([
      api.v2.myResults().catch(() => null),
      api.candidate.results().catch(() => null) as Promise<ResultsPayload | null>,
    ]);
    return { v2, v1 };
  }, []);

  const v2Envelope =
    res.data?.v2?.available && res.data.v2.result && res.data.v2.assessment_id
      ? ({
          assessment_id: res.data.v2.assessment_id,
          completed_at: res.data.v2.completed_at,
          version_code: res.data.v2.version_code,
          result: res.data.v2.result,
        } as V2ResultEnvelope)
      : null;

  const result = res.data?.v1?.result as CanonicalResult | undefined;
  const streams = useMemo(
    () => (result ? [...result.streams].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)) : []),
    [result]
  );
  const careerAreas = useMemo(() => (result ? buildCareerAreas(result) : []), [result]);

  if (res.loading) {
    return (
      <div className="max-w-5xl mx-auto px-5 py-10">
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <SkeletonCard key={i} lines={2} />
          ))}
        </div>
      </div>
    );
  }

  if (res.error) {
    return (
      <div className="max-w-2xl mx-auto px-5 py-12">
        <ErrorState message={res.error.message} onRetry={res.reload} />
      </div>
    );
  }

  if (v2Envelope) {
    return (
      <V2ExploreView
        envelope={v2Envelope}
        onOpenResults={() => window.location.assign("#/results")}
      />
    );
  }

  if (!result) {
    return (
      <div className="max-w-2xl mx-auto px-5 py-16">
        <EmptyState
          title="No assessment completed yet"
          body="Complete your assessment to see how each stream fits your profile — every fit comes with the numbers behind it."
          action={<Button onClick={() => window.location.assign("#/assessment")}>Start assessment</Button>}
        />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-5 py-8 sm:py-10">
      <div className="max-w-2xl">
        <h1 className="font-display text-[28px] sm:text-[34px] font-bold tracking-[-0.02em]">
          Where could you explore next?
        </h1>
        <p className="mt-3 text-[15px] text-ink-2 leading-relaxed">
          All seven post-Grade-10 streams, shown as fit indices calculated from your responses. A
          strong fit is a starting point for exploration — not a destination, and no low score closes
          any door.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge tone="ok" dot>Strong Fit</Badge>
          <Badge tone="warn" dot>Possible Fit</Badge>
          <Badge tone="neutral" dot>Explore Further</Badge>
        </div>
      </div>

      <div className="mt-8 grid md:grid-cols-2 xl:grid-cols-3 gap-4 items-stretch">
        {streams.map((s) => (
          <StreamCard key={s.id} stream={s} onWhy={setWhyStream} />
        ))}
      </div>

      {/* ---------------- career areas ---------------- */}
      <section className="mt-14" aria-labelledby="career-heading">
        <h2 id="career-heading" className="font-display text-[22px] sm:text-[26px] font-bold tracking-[-0.02em]">
          Career areas worth exploring
        </h2>
        <p className="mt-2 text-[14.5px] text-ink-2 max-w-2xl leading-relaxed">
          Groupings of work areas connected to the streams above — places where your strongest
          dimensions are often used. Treat these as windows to look through, not boxes to fit into.
        </p>

        {careerAreas.length === 0 ? (
          <Card className="mt-6 p-6">
            <p className="text-[14px] text-ink-2 leading-relaxed">
              This assessment version doesn't attach career clusters to stream results. A good next
              step: open the <strong>Why</strong> panel on your top streams, note the dimensions that
              contribute most, and bring them to a conversation with a counselor — they can map
              specific careers to those strengths with you.
            </p>
          </Card>
        ) : (
          <div className="mt-6 grid md:grid-cols-2 gap-4">
            {careerAreas.map((a) => (
              <Card key={a.cluster} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display font-bold text-[15.5px]">{a.cluster}</h3>
                  <Badge tone="brand">Explore</Badge>
                </div>
                <p className="text-[13px] text-ink-2 mt-2 leading-relaxed">
                  Appears via: {a.streams.join(", ")}
                </p>
                {a.strengths.length > 0 && (
                  <p className="text-[12.5px] text-ink-3 mt-1.5 leading-relaxed">
                    Related strengths: {a.strengths.join(" · ")}
                  </p>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ---------------- why panel ---------------- */}
      <Modal
        open={whyStream !== null}
        onClose={() => setWhyStream(null)}
        title={whyStream ? `${whyStream.name} · fit ${whyStream.score === null ? "—" : Number(whyStream.score).toFixed(1)}` : ""}
        wide
      >
        {whyStream && <ExplainabilityPanel stream={whyStream} />}
      </Modal>
    </div>
  );
}
