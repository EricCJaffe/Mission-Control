-- Seed persona note for Eric Jaffe if the user exists.
with target_user as (
  select id from auth.users where email = 'ejaffejax@gmail.com'
)
, purge as (
  delete from public.notes
  where user_id in (select id from target_user) and title = 'persona'
)
insert into public.notes (user_id, title, content_md, tags)
select id,
       'persona',
       $$# CODEX_PERSONA.md
# Eric Jaffe - Persona + Operating System (Codex Pack)

## 0) Quick identity snapshot
Eric Jaffe is a Christ-centered entrepreneur, strategist, teacher/visionary who helps churches, faith-based nonprofits, and faith-based businesses scale mission impact by implementing digital automation and AI--without drifting from Scripture, mission, or family priorities.

Eric is coming out of a recovery/wilderness chapter into a season of action and service. His life is structured by a priority matrix:
1) God First
2) Health
3) Family
4) Impact (make a difference in others' lives)

He preaches in a variety of venues (not tied to any single church) and writes for blog + social.

---

## 1) Mission (non-negotiable)
Put God first in all things, love and lead family well, and live to make a difference in the lives of others by bringing every area under Christ's lordship:
- relationships, finances, time, family, health, technology, social media, influence.

Decision rule: If an opportunity compromises "God First / Health / Family," it is likely misaligned no matter how impressive it looks.

---

## 2) Vision (directional)
Live a life that glorifies God, builds a thriving family rooted in love and faith, and leaves a lasting legacy of transformed lives through:
- selfless service
- biblical teaching
- compassionate leadership
- systems that scale impact

Retirement is not an end-state; mission is.

---

## 3) Core values (how Eric evaluates choices)
- God First (war on idols; lordship over every domain)
- Identity in Christ (worth not rooted in role, platform, possessions)
- Healthy Spirit / Soul / Body (stewardship for longevity of mission)
- Family First (after God)
- Great Commission Living (disciple-making, evangelism as normal)
- Fruits of the Spirit (character > charisma; integrity > influence)
- Stewardship (time, talent, treasure -- "give it away to keep it")
- Seek Wisdom (Scripture + counsel + patience > impulse)
- Self Reflection (monthly/quarterly/annual alignment reviews)
- Humility (teachability, repentance, others-first leadership)
- God's Timing (prepare, then move--don't rush release)

---

## 4) Calling & wiring
Primary: Entrepreneur
Strong: Strategist
Equal: Teacher + Visionary
Last: Shepherd (still present, but not default mode)

Implications for collaboration:
- Eric likes actionable plans, systems, dashboards, clear next steps.
- He values teaching that produces transformation, not trivia.
- He prefers clarity + movement over maintenance + ambiguity.

---

## 5) What Eric is building now (season of action)
Primary impact focus:
Help churches / faith-based nonprofits / faith-based businesses optimize operations and stay aligned to mission and vision while scaling, using:
- digital automation
- AI workflows
- SOPs / systems design
- data + dashboards
- "mission control" style governance rhythms

Eric's differentiator:
Mission fidelity + spiritual formation + operational excellence.

---

## 6) Communication style (writing and speaking "as Eric")
### Tone
- Direct, urgent, hopeful, practical
- "Mobilizer energy" (calls people to action, not spectatorship)
- Uses humor to lower defenses, then goes for the heart

### Structure signature
- Macro -> micro: big idea / mission vision -> personal application
- Bullet/outline-friendly
- Repetition of anchor themes
- Always land with: Next steps + challenge + invitation

### Language preferences
- Strong verbs
- Clear, simple sentences
- Minimal fluff
- Concrete examples / analogies
- Scripture as authority (not merely as decoration)

### Avoid
- Vague encouragement with no action step
- Soft "comfort-only" tone
- Overly academic detours
- Performative virtue signaling
- Anything that fuels passive consumer Christianity

---

## 7) Red lines (Eric will push back)
- Systems that scale attendance but not disciples
- "Brand" over integrity
- Mission drift into comfort/maintenance
- Tech/AI that replaces human discipleship instead of enabling it
- Overwork that damages health or family
- Ego-driven platforms

---

## 8) Eric's story (condensed, for context)
- Raised by single mom; later adopted into blended family.
- Long season of addiction (marijuana, alcohol, cocaine).
- Met Jesus with wife Mary Jo on May 31, 1992.
- Rehab + sobriety beginning July 23, 1996; nearly 30 years sober.
- Ordained pastor; planted churches; preached/led ~20+ years (bivocational).
- Founded and scaled an IT/services business; exited in 2025 with financial freedom.
- Open-heart quintuple bypass on Nov 1, 2022 -> deepened stewardship convictions.
- Wilderness/recovery season post-surgery and exit; now transitioning to action/impact season.

---

## 9) Collaboration instructions for Codex/agents
When supporting Eric:
1) Start with alignment to values and the priority matrix.
2) Offer 2-4 options maximum, each with tradeoffs.
3) Provide concrete deliverables (templates, checklists, SOPs, dashboards).
4) Keep outputs in markdown; crisp headings; no filler.
5) If building software, emphasize:
   - mission alignment
   - monthly review cadence
   - automation that reduces admin burden
   - data visibility without vanity metrics

---

## 10) Output formatting rules
- Prefer markdown
- Use short sections + bullets
- Include "Next steps" at the end of plans
- For "Mission Control" work: always define
  - goal
  - metrics
  - cadence
  - owner
  - next action
$$,
       array['knowledge','persona']
from target_user;
