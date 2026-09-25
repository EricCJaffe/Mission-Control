/*
 * The how-to guides, as markdown. Edit the text between the backticks; each
 * `## [id] Title` heading is one guide. Kept in a .ts file rather than a .md
 * because Next does not import raw text without a loader, and a runtime file
 * read is not reliably traced into the Vercel bundle.
 */
export const GUIDES_MD = String.raw`# How-To Guides (SOP Library)

Worked out in this project's chats. Each guide = one record in the **Guides** screen (id in brackets). Link checklist items to guides where noted.

---

## [black-tank] Black Tank — Dump, Flush, Maintain
*Link from: Departure → "Dump and flush" section; Arrival → "Sewer" section.*

**Your hardware:** Driver-side wet bay. **Left port (yellow CAUTION label) = black tank flush inlet.** Right port = city water (blue potable hose only). 32-gal black tank; two people ≈ 3–5 days to ⅔ full.

**Dumping routine**
1. Wait until the tank is ⅔–¾ full — volume and weight carry solids out.
2. Keep the black valve **closed** at full-hookup sites. Open valve = liquids drain, solids "pyramid."
3. Gloves on. Dump **black first**, then gray (soapy gray rinses the hose).
4. Watch the clear elbow; close when it runs clear.

**Flushing (built-in flush port)**
1. **Black valve OPEN first.** Flushing into a closed tank backs sewage into the toilet.
2. Connect the dedicated non-potable flush hose (with backflow preventer) to the **left** port.
3. Run 5–10 minutes. Stay with it. Stop when the elbow runs clear.
4. Close black valve → drain gray → close gray.
5. Add 2–3 gal water + enzyme treatment to the black tank.

**Daily habits**
- Enzyme treatment; skip formaldehyde products (many parks are on septic).
- RV-rated or quick-dissolve toilet paper; plenty of water per flush.
- Tank sensors misread often — trust flow and routine over the gauge.

**Deep clean (every few trips)** — Before a travel day add ~10 gal water, a bag of ice, and some dish soap. Driving sloshes and scrubs the walls. Dump on arrival.

**Before storage/winterizing** — Flush thoroughly, leave valves closed, drain everything before freezing temps (exposed undercarriage lines).

**Gear:** nitrile gloves · 20' sewer hose + clear elbow · hose support · dedicated flush hose + backflow preventer · enzyme treatment · sewer donut.

---

## [fresh-water-valves] Fresh Water — Numbered Valve Positions
*Link from: Arrival → Water; Departure → "Decide on fresh water for travel."*

The wet bay uses **numbered** positions. Read the **pointed tip** of each handle, not the flat end. Photograph the valve label and keep it in the app.

| Mode | Left handle | Right handle | Pump |
|---|---|---|---|
| **Fill fresh tank from city water** | **1** (points left) | **6** (points right) | Off |
| **City water to fixtures** (normal hookup) | **2** | **6** | Off |
| **Tank + pump** (boondocking / traveling) | **3** | **5** | On |

**Filling the tank**
1. Pressure regulator + filter at the spigot; blue potable hose to city water.
2. Set 1 & 6. Turn spigot on.
3. Full tank (47 gal) takes ~10–20 min depending on park pressure and filter. **Set a timer; don't walk away** (overflow).
4. When full, move the left handle back to **2** for city-fixtures mode.

**Travel water:** carry ⅓ tank or less to save weight unless the next stop is dry camping.

---

## [flat-tow] Flat-Tow the Jeep JK (automatic) — Summary
*Full step lists live in the Departure (section 8) and Arrival (section 2) checklists.*

**Into flat-tow mode:** key to ACC · foot on brake, parking brake set · transmission N · transfer case N · **verify:** start engine, shift to D, release brake — Jeep must not move · engine OFF, key in unlocked OFF (steering free) · transmission P · **release parking brake** · Demco ON · test lights · plug in Coach Link and test (Brakes Applied light + beep) · pull forward until both Avail arms click locked.

**Never** shift into Park with the transfer case in Neutral while the engine is running.

**Out of flat-tow mode:** foot on brake, start engine · transmission N · transfer case firmly to 2H · transmission P · drive. Check for warning lights and normal steering.

**Unhook on level ground, coach straight** — a bound tow bar is hard to release on a curve or slope.

---

## [generator] Onan QG 4000 Generator — Use & Fault Codes

**Running A/C while driving:** Yes — start the generator while moving to run the roof A/C. It draws from the 55-gal chassis tank (the generator typically cuts off around ¼ tank to protect driving fuel — confirm in the manual).

**Reading faults**
- Fault codes are **blink sequences on the red status light** — on the interior remote panel and on the generator itself.
- The blinking "H"/hourglass on the LCD is the **hour meter**, not a fault.
- Basic checks: oil level (dipstick), fuel above cutoff level, prime (hold stop/prime ~30 sec) before retrying.

**Known fault on this coach (Sept 22, 2026): Code 45 — "speed sense lost."** Ran ~1 min then shut down; then immediate shutdown with solid red light. Oil was full. ~15.6 hrs on the meter.
- Controller-level issue → **authorized Onan dealer service, not a roadside fix.**
- Stop restart attempts. Use shore power and dash A/C meanwhile.
- Warranty: **Cummins 1-800-CUMMINS** (1-800-286-6467) + Entegra owner support.
- Tracked in Maintenance → Open Issues.

**Exercise:** run under load (A/C on) ~2 hrs/month once repaired.

---

## [obd-scanner] Check-Engine Light & OBD-II Scanner

**Solid vs flashing:** Solid = get codes read soon; usually safe to drive gently. **Flashing = active misfire — reduce load, stop driving soon** (catalyst damage risk).

**Port location:** under the dash on the driver side of the E-450.

**Tool of choice: OBDLink MX+** — reads Ford-specific modules (transmission, ABS, body via MS-CAN), works with the **OBDLink app** or **FORScan Lite** for deeper Ford diagnostics. Free alternative: parking-lot read at an auto-parts store.

**Rules:** screenshot codes (and freeze-frame data) **before** clearing. Loose gas cap (EVAP codes) is a common nuisance cause; misfire, transmission, and overheating codes are urgent.

**Status:** Check-engine light seen Sept 23, 2026 — outcome not recorded. Tracked in Open Issues.

---

## [tpms] Tire Pressure & TPMS

- Cold pressures: **coach 75 front / 80 rear (duals), Jeep 37.** Check cold, before driving.
- Coach tires LT225/75R16E, metal valve stems → TST 507 **flow-through** sensors (can still air up without removing).
- Jeep tires LT255/75R17C, rubber stems → TST **cap** sensors.
- 10 sensors total + repeater (long rig). Confirm all 10 reporting on the display before every travel day.
- Check tire DOT date codes; RV tires age out (~6–7 years) before they wear out.

---

## [tolls] Tolls — SunPass PRO

- SunPass PRO works across the E-ZPass network (CBBT, NJ Turnpike, GWB, Mass Pike, etc.).
- Register **both plates** (RV + Jeep). Turn on **auto-replenish** — motorhome + toad bills as 4-axle, $40–90 per crossing up north.
- Only one active transponder in the rig — pouch or remove any others to avoid double charges.

---

## [propane] Propane

- Service valve: gray knob in the tank bay; open slowly counterclockwise.
- Close for tunnels (Baltimore I-95/I-895, CBBT) and ferries.
- Fridge on shore power (AUTO/electric) at camp saves propane.
- Open item: the coach's LP quick-connect (for a grill/griddle) hasn't been located; the tank bay has no outbound port.

---

## [shore-power] Shore Power (30-amp)

- Pedestal breaker OFF → plug EMS/surge protector in and wait for green → plug in coach cord → breaker ON → confirm shore power at the monitor panel.
- 50-amp-only pedestal: use the **50→30 dogbone** (Cape Charles on the fall trip).

---

## [door-lock] Keypad Door Lock (pending purchase)

- **RVLock Atlas** = most likely fit for the Esteem 29V; **RVLock Charter** = alternative, depending on door cutout.
- **Measure the door cutout first.** A vinyl decal from RVLock.com may be needed to cover the paint line left by the factory handle.
`;
