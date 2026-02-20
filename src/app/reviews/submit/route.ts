import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

function num(value: string) {
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function avg(values: Array<number | null>) {
  const filtered = values.filter((v): v is number => v !== null);
  if (filtered.length === 0) return null;
  return filtered.reduce((a, b) => a + b, 0) / filtered.length;
}

function clampScore(score: number | null) {
  if (score === null) return null;
  return Math.max(0, Math.min(10, score));
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const periodStart = String(form.get("period_start") || "").trim();
  if (!periodStart) return NextResponse.redirect(new URL("/reviews/new", req.url));

  const survey: Record<string, unknown> = Object.fromEntries(form.entries());

  const godScore = clampScore(avg([
    num(String(form.get("god_prayer") || "")),
    num(String(form.get("god_realign") || "")),
    num(String(form.get("god_obedience") || "")),
  ]));

  const healthScore = clampScore(avg([
    num(String(form.get("health_training_days") || "")),
    num(String(form.get("health_nutrition") || "")),
    num(String(form.get("health_sleep") || "")),
  ]));

  const prioritized = String(form.get("family_prioritized") || "yes") === "yes";
  const confidence = num(String(form.get("family_prioritized_confidence") || ""));
  const presence = num(String(form.get("family_presence") || ""));

  const familyScore = clampScore(avg([
    prioritized ? 10 : 3,
    confidence,
    presence,
  ]));

  const impactScore = clampScore(avg([
    num(String(form.get("impact_kingdom") || "")),
    num(String(form.get("impact_deepwork_hours") || "")),
    num(String(form.get("impact_teaching") || "")),
  ]));

  const stewardshipScore = clampScore(avg([
    num(String(form.get("steward_generosity") || "")),
    num(String(form.get("steward_ego") || "")),
    num(String(form.get("steward_commitments") || "")),
    num(String(form.get("focus_phone") || "")),
    num(String(form.get("focus_learning") || "")),
    num(String(form.get("focus_anxiety") || "")),
  ]));

  const weighted = (
    (godScore ?? 0) * 0.3 +
    (healthScore ?? 0) * 0.2 +
    (familyScore ?? 0) * 0.25 +
    (impactScore ?? 0) * 0.2 +
    (stewardshipScore ?? 0) * 0.05
  );

  const alignmentScore = Math.round(weighted * 10) / 10;
  const driftFlags: string[] = [];

  const domains = [
    { name: "God First", score: godScore },
    { name: "Health", score: healthScore },
    { name: "Family", score: familyScore },
    { name: "Impact", score: impactScore },
    { name: "Stewardship/Focus", score: stewardshipScore },
  ];

  for (const domain of domains) {
    if (domain.score === null) continue;
    if (domain.score < 4) driftFlags.push(`${domain.name} <4`);
    else if (domain.score < 6) driftFlags.push(`${domain.name} <6`);
  }

  let alignmentStatus: string = "aligned";
  if (driftFlags.some((flag) => flag.includes("<4"))) alignmentStatus = "off-track";
  else if (driftFlags.length > 0) alignmentStatus = "drifting";

  const periodEnd = new Date(periodStart);
  periodEnd.setMonth(periodEnd.getMonth() + 1);
  periodEnd.setDate(0);

  await supabase.from("monthly_reviews").upsert(
    {
      user_id: user.id,
      period_start: periodStart,
      period_end: periodEnd.toISOString().slice(0, 10),
      alignment_score: alignmentScore,
      alignment_status: alignmentStatus,
      drift_flags: driftFlags,
      survey,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,period_start" }
  );

  const tasksToCreate: string[] = [];

  const phoneDiscipline = num(String(form.get("focus_phone") || ""));
  if (phoneDiscipline !== null && phoneDiscipline < 6) {
    tasksToCreate.push("Digital Sabbath plan (phone discipline reset)");
  }

  if (!prioritized) {
    tasksToCreate.push("Plan date night and write a connection note");
  }

  const trainingDays = num(String(form.get("health_training_days") || ""));
  if (trainingDays !== null && trainingDays < 3) {
    tasksToCreate.push("Schedule 3 training blocks for next week");
  }

  const deepWorkHours = num(String(form.get("impact_deepwork_hours") || ""));
  if (deepWorkHours !== null && deepWorkHours < 5) {
    tasksToCreate.push("Block 3x 90-min deep work sessions");
  }

  const idolDetected = String(form.get("god_idol") || "").trim();
  if (idolDetected) {
    tasksToCreate.push(`Reflection + Scripture meditation on: ${idolDetected}`);
  }

  if (tasksToCreate.length > 0) {
    await supabase.from("tasks").insert(
      tasksToCreate.map((title) => ({
        user_id: user.id,
        title,
        status: "todo",
        priority: 3,
      }))
    );
  }

  return NextResponse.redirect(new URL("/reviews", req.url));
}
