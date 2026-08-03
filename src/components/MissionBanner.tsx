import { Compass } from "lucide-react";
import {
  missionHeadline,
  valueOfTheDay,
  type MissionContent,
} from "@/lib/persona/mission";

/**
 * Mission across the top, with one value highlighted per day.
 *
 * The value is keyed to the date rather than randomised, so it holds steady
 * all day and across devices — a banner that changes on refresh is decoration
 * rather than a reminder. Eleven values means it cycles fully before repeating.
 */
export default function MissionBanner({
  content,
  today,
}: {
  content: MissionContent;
  today: string;
}) {
  const headline = missionHeadline(content.mission);
  const value = valueOfTheDay(content.values, today);
  if (!headline && !value) return null;

  return (
    <section className="rounded-2xl border-2 border-blue-800 bg-blue-700 p-4 text-white shadow-sm">
      <div className="flex items-start gap-3">
        <Compass className="mt-0.5 h-5 w-5 shrink-0 text-blue-200" />
        <div className="min-w-0">
          {headline && (
            <p className="text-sm font-semibold leading-snug text-white">{headline}.</p>
          )}
          {value && (
            <p className="mt-1.5 text-sm text-blue-100">
              <span className="font-bold text-white">Today: {value.title}</span>
              {value.gloss && <span className="text-blue-200"> — {value.gloss}</span>}
            </p>
          )}
          {content.decisionRule && (
            <p className="mt-1 text-xs italic text-blue-200">{content.decisionRule}</p>
          )}
        </div>
      </div>
    </section>
  );
}
