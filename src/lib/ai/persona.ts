import { supabaseServer } from "@/lib/supabase/server";

export async function getPersonaProfile(orgId: string) {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("persona_profiles")
    .select("id,title,voice_style,tone,audience,theological_guardrails,mission_alignment")
    .eq("org_id", orgId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data) return data;

  return {
    id: null,
    title: "Default Persona",
    voice_style: "Direct, urgent, hopeful, practical",
    tone: "Mobilizer energy",
    audience: "Faith-based leaders",
    theological_guardrails: "Scripture-first, mission-aligned, integrity-driven",
    mission_alignment: "God First, Health, Family, Impact",
  };
}
