/**
 * Model-specific best practice: "I can get exact models so we can query
 * against best practices."
 *
 * The library is generic; a Kubota L2501 and a John Deere 1025R do not share
 * a service interval. Once an asset has a make and model, this asks for the
 * manufacturer's own schedule and returns it as suggestions — never as
 * schedules. Nothing becomes a task until Eric presses Add, because a model
 * that has invented an interval is wrong in a way that looks exactly right.
 *
 * The result is stored on the asset (`research`) so opening the page does not
 * re-run and re-pay for it.
 */

import { callOpenAI } from '@/lib/openai';
import { parseRRule } from '@/lib/tasks/recurrence';
import { CATEGORIES, itemsFor, type Category } from './library';

export type ResearchItem = {
  title: string;
  rule: string;
  meter_interval: number | null;
  instructions: string;
  why: string;
};

export type Research = {
  summary: string;
  parts: Array<{ part: string; spec: string }>;
  items: ResearchItem[];
  caveat: string;
  model: string;
};

export async function researchAsset(asset: {
  name: string;
  category: Category;
  make: string | null;
  model: string | null;
  model_year: number | null;
  meter_unit: string | null;
  location: string | null;
}): Promise<Research> {
  const model = process.env.OPENAI_MODEL || 'gpt-5.2';
  const generic = itemsFor(asset.category).map((i) => `- ${i.title} (${i.rule})`).join('\n');

  const system = [
    'You are a service manager writing a maintenance schedule for one specific machine or appliance a homeowner owns, from the manufacturer\'s published owner\'s manual and service schedule.',
    'Answer ONLY with JSON, no prose around it, in this shape:',
    '{"summary": string (2-3 sentences, US English), "parts": [{"part": string, "spec": string}], "items": [{"title": string, "rule": string, "meter_interval": number|null, "instructions": string, "why": string}], "caveat": string}',
    '"rule" MUST be an RFC 5545 RRULE using only FREQ (DAILY|WEEKLY|MONTHLY|YEARLY), INTERVAL, BYDAY, BYMONTHDAY, BYMONTH. Example: "FREQ=MONTHLY;INTERVAL=6".',
    `"meter_interval" is in ${asset.meter_unit ?? 'none — use null'} when the manual gives an hours or miles interval.`,
    'Parts: oil grade and capacity, filter part numbers, spark plug, belts, bulbs — whatever this model takes. Only list a part number you are confident of; otherwise describe the spec.',
    'If you do not recognize the exact model, say so in "caveat", and give the closest family\'s schedule rather than inventing one.',
    'Assume a humid, hot US Southeast climate (northeast Florida) where it changes intervals.',
  ].join('\n');

  const user = [
    `Item: ${asset.name}`,
    `Type: ${CATEGORIES[asset.category].label}`,
    `Make: ${asset.make ?? 'unknown'}`,
    `Model: ${asset.model ?? 'unknown'}`,
    `Year: ${asset.model_year ?? 'unknown'}`,
    asset.location ? `Kept: ${asset.location}` : '',
    '',
    'Our generic schedule for this type already covers the items below. Return the model-specific schedule; where the manual differs from these, the manual wins and "why" should say what differs.',
    generic || '(none)',
  ].join('\n');

  const text = await callOpenAI({ model, system, user });
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = JSON.parse((fenced ? fenced[1] : text).trim()) as Partial<Research>;

  // Drop any item whose rule our recurrence engine cannot run, rather than
  // letting it become a task that never rolls forward.
  const items = (raw.items ?? [])
    .filter((i) => i && typeof i.title === 'string' && typeof i.rule === 'string' && parseRRule(i.rule))
    .map((i) => ({
      title: i.title.trim(),
      rule: i.rule.trim(),
      meter_interval: typeof i.meter_interval === 'number' && i.meter_interval > 0 ? i.meter_interval : null,
      instructions: String(i.instructions ?? ''),
      why: String(i.why ?? ''),
    }));

  return {
    summary: String(raw.summary ?? ''),
    parts: Array.isArray(raw.parts) ? raw.parts.filter((p) => p && p.part).slice(0, 20) : [],
    items,
    caveat: String(raw.caveat ?? ''),
    model,
  };
}
