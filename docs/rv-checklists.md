# RV Checklists — Mission Control Module

Source of truth for the Arrival Setup and Departure Breakdown checklists for the Esteem 29V + Jeep JK rig. Hand this file (and `rv-checklists.json`) to a Claude Code session to build the module.

## Rig reference

| Item | Value |
|---|---|
| Coach | 2026 Entegra Esteem 29V, Ford E-450 |
| Toad | 2017 Jeep Wrangler Unlimited Rubicon (JK), automatic |
| Tow bar | Blue Ox Avail BX7420 |
| Toad brakes | Demco Stay-IN-Play DUO + Coach Link monitor |
| Tire pressure (cold) | Coach 75 front / 80 rear · Jeep 37 |

## Build spec (for Claude Code)

**Goal:** Two run-able checklists (Arrival, Departure) inside Mission Control whose state survives closing the app, and clears only on Reset.

**Requirements**
- Load checklist content from `rv-checklists.json` (content is data, not hard-coded UI).
- Each checklist shows sections in order; items are tap-to-check with the note shown under the item text.
- Section warnings render as a highlighted callout above the section's items.
- Progress bar + `done / total` count per checklist.
- **Persist check state server-side** (Supabase table), keyed by checklist run — not browser storage. This is the fix for the artifact resetting.
- **Reset** requires an in-page confirm, then archives the completed run (timestamp, duration, items checked) and starts a fresh run.
- Works one-handed on a phone: large tap targets, sticky header with progress and Reset.

**Suggested data model**

```sql
create table checklist_runs (
  id uuid primary key default gen_random_uuid(),
  checklist_id text not null,          -- 'arrival' | 'departure'
  started_at timestamptz default now(),
  completed_at timestamptz,
  location text                         -- optional: campground name
);

create table checklist_checks (
  run_id uuid references checklist_runs(id) on delete cascade,
  item_id text not null,               -- matches item ids in rv-checklists.json
  checked_at timestamptz default now(),
  primary key (run_id, item_id)
);
```

**Mission Control framing**
- Goal: zero missed steps on arrival and departure.
- Metrics: runs completed, items skipped per run, average departure time.
- Cadence: every travel day; review skipped items monthly.
- Owner: Eric (Mary Jo as second checker on hookup and walk-around).
- Next action: build the module, then run it on the next Florida trip.

---

## Arrival Setup

### 1. Before you pull in

- [ ] **Confirm site number and that it's a pull-through** — Check-in desk or reservation email.
- [ ] **Walk the site before driving in** — Find the pedestal, water spigot, and sewer inlet. Look for low branches (you're 11'8"), posts, and slide clearance on both sides.
- [ ] **Note where hookups sit relative to the coach** — Utilities are on the driver side. Stop so all three reach without extensions.

### 2. Park and unhook the Jeep

> ⚠️ Unhook on level ground with the coach straight. A bound tow bar is hard to release on a curve or slope.

- [ ] **Stop the coach in a straight line on level ground** — Coach in Park, parking brake set.
- [ ] **Set the Jeep's parking brake** — Keeps the Jeep from rolling when the arms release.
- [ ] **Disconnect the lights cord and the breakaway cable**
- [ ] **Unplug the Demco Coach Link from the dash outlet** — It only needs power while towing.
- [ ] **Unhook the crossed safety cables from the baseplate**
- [ ] **Release the Avail arms with the black lock levers** — Pull each lever; the arm unlocks and can telescope.
- [ ] **Pull the pins and clips at the Jeep's baseplate tabs** — Keep the pins and clips together in one pouch.
- [ ] **Fold the Avail arms up and secure them on the coach** — It stays in the coach receiver. Strap or pin the arms so they don't swing.
- [ ] **Unplug and stow the baseplate tabs on the Jeep, if removable**
- [ ] **Put the Jeep back in drive mode (automatic JK)** — Foot on brake, start engine. Shift transmission to N. Shift transfer case firmly to 2H. Shift transmission to P, then drive.
- [ ] **Confirm no warning lights and the steering feels normal**
- [ ] **Park the Jeep clear of the slides and awning**

### 3. Level and open up

> ⚠️ Order matters. Level first, then slides. Extending slides before leveling strains the slide mechanisms.

- [ ] **Auto-level with the hydraulic jacks** — Engine running, Park, brake on. Use pads under jacks on soft ground or asphalt in heat.
- [ ] **Chock the wheels** — Belt and suspenders, especially on any slope.
- [ ] **Check slide clearance, then extend both slides** — Someone outside watches for posts, trees, and the picnic table.
- [ ] **Turn off the engine**

### 4. Electric

> ⚠️ Test before you plug in. A bad pedestal can fry the converter and appliances.

- [ ] **Turn the pedestal breaker OFF**
- [ ] **Plug in the surge protector / EMS and let it test** — Wait for a green light before plugging in the coach.
- [ ] **Plug in the 30-amp cord, then turn the breaker ON**
- [ ] **Confirm shore power inside** — Check the monitor panel and that the charger is running. Generator stays off.

### 5. Water

> ⚠️ Drinking-water hose only. Your city water port sits inches from the black flush port. Blue hose goes to city water, never the left port.

- [ ] **Flush the spigot for a few seconds** — Clears dirt and stale water.
- [ ] **Attach pressure regulator (and filter) at the spigot** — Keeps park pressure under about 50 psi.
- [ ] **Connect the blue potable hose to CITY WATER** — The right-hand port, labeled city water.
- [ ] **Turn the spigot on slowly and check for leaks**
- [ ] **Turn the 12V water pump OFF** — On city water you don't need it.
- [ ] **Open a hot faucet until water runs steadily** — Purges air from the water heater.
- [ ] **Then turn on the water heater** — Never heat an empty or air-filled heater.

### 6. Sewer

> ⚠️ Black valve stays closed until it's ⅔ full. Open black valves let liquids drain and leave solids behind.

- [ ] **Put on gloves**
- [ ] **Connect sewer hose to the coach, then to the inlet** — Use a sewer donut if the park requires it. Set up the hose support so it slopes downhill.
- [ ] **Confirm black valve is CLOSED**
- [ ] **Gray valve: closed or cracked open** — Closed saves gray water to rinse the hose on dump day.

### 7. Propane and appliances

- [ ] **Open the propane service valve (gray knob in the tank bay)** — Turn slowly counterclockwise.
- [ ] **Set the refrigerator to AUTO / electric** — Shore power saves propane.
- [ ] **Set thermostat or A/C as needed**

### 8. Outside setup

> ⚠️ Awning and wind: Retract it any time wind picks up or you leave the site.

- [ ] **Extend the awning** — Check for branches overhead first.
- [ ] **Set out the mat, chairs, and griddle**
- [ ] **Set up the satellite dish** — Needs a clear view of the southern sky. Aim it with the app or auto-seek, then connect the coax to the satellite input.
- [ ] **Walk around once more** — Look for drips at every connection.

### 9. Inside

- [ ] **Open roof vents and turn on fans**
- [ ] **Release fridge and cabinet travel latches**
- [ ] **Set up TV input and check Wi-Fi or cell signal**

## Departure Breakdown

### 1. The night before

- [ ] **Check the weather and route** — Low clearances, propane restrictions (for example, I-695 Baltimore tunnels), and fuel stops with pull-through canopies.
- [ ] **Dump and flush the tanks if leaving early** — Black first, then flush, then gray. Or do it in the morning.
- [ ] **Decide on fresh water for travel** — Carry ⅓ tank or less to save weight, unless your next stop is dry camping.

### 2. Dump and flush

> ⚠️ Black valve open before you run the flush. Flushing into a closed tank backs sewage up into the toilet.

- [ ] **Gloves on**
- [ ] **Open the BLACK valve and drain** — Wait until the clear elbow slows.
- [ ] **Connect the separate flush hose to the LEFT port and flush 5–10 min** — Stay with it. Stop when the elbow runs clear.
- [ ] **Close the black valve**
- [ ] **Open the GRAY valve and drain it** — Soapy water rinses the hose.
- [ ] **Close the gray valve**
- [ ] **Add 2–3 gal of water and enzyme treatment to the black tank**
- [ ] **Rinse, cap, and stow the sewer hose and flush hose** — Keep them apart from the drinking hose.

### 3. Water

- [ ] **Turn off the water heater**
- [ ] **Turn off the spigot**
- [ ] **Relieve pressure by opening a faucet briefly**
- [ ] **Disconnect and drain the blue hose, regulator, and filter; stow**
- [ ] **Cap the city water port**

### 4. Inside

> ⚠️ Everything that can move, will. Walk every room.

- [ ] **Close and latch all cabinets, drawers, and the fridge**
- [ ] **Stow loose items on counters, the table, and the shower**
- [ ] **Close roof vents, windows, and blinds**
- [ ] **Turn off fans, lights, TV, and A/C**
- [ ] **Set the fridge for travel** — Leave it on propane or battery only if your propane plan allows. Many close propane for tunnels and ferries.
- [ ] **Water pump OFF**

### 5. Outside

- [ ] **Retract the awning**
- [ ] **Stow the satellite dish and disconnect its coax**
- [ ] **Stow chairs, mat, griddle, and any tools**
- [ ] **Close the propane service valve if required for your route** — Required for some tunnels and ferries.

### 6. Electric

- [ ] **Turn the pedestal breaker OFF**
- [ ] **Unplug the coach cord and the surge protector; stow both**
- [ ] **Confirm the coach batteries are charged**

### 7. Slides and jacks

> ⚠️ Slides in before jacks up. Keep people and the dog clear.

- [ ] **Engine running, Park, brake set**
- [ ] **Retract both slides fully** — Watch for anything caught in the slide seals.
- [ ] **Retract the leveling jacks** — Confirm on the panel that all jacks are up.
- [ ] **Pull the wheel chocks and jack pads**

### 8. Hook up the Jeep

> ⚠️ Order matters on the JK. Never shift into Park with the transfer case in Neutral while the engine is running.

- [ ] **Line up the Jeep behind the coach** — Straight and close enough for the Avail arms to reach the baseplate tabs.
- [ ] **Unfold the Avail arms and pin them to the baseplate tabs** — Insert both pins and lock both clips.
- [ ] **Attach the safety cables, crossed under the tow bar**
- [ ] **Connect the lights cord and the breakaway cable** — The lights cord also powers the Demco brake system in the Jeep.
- [ ] **Put the Jeep in flat-tow mode (automatic JK)** — Key to ACC. Foot on brake, parking brake set. Transmission to N. Transfer case to N.
- [ ] **Verify the transfer case is in Neutral** — Start the engine. Shift the transmission to D and release the brake. The Jeep must not move.
- [ ] **Finish flat-tow mode** — Engine OFF, key in the unlocked OFF position so the steering turns. Transmission to P.
- [ ] **Release the Jeep's parking brake** — Easy to forget. It will destroy the rear brakes.
- [ ] **Switch ON the Demco brake unit in the Jeep** — Controller faces the direction of travel, switch toward the driver's seat.
- [ ] **Test the Jeep's brake lights and turn signals** — Have someone watch.
- [ ] **Plug the Demco Coach Link into the coach's 12V outlet** — Power light on. Press the coach brake: the Brakes Applied lights should light and beep. No lights means no toad brakes.
- [ ] **Pull forward slowly until both Avail arms lock** — You'll hear them click. Check both lock indicators.

### 9. Final walk-around

> ⚠️ Last lap saves the most money. Do it every single time.

- [ ] **All compartments closed and locked**
- [ ] **Entry step retracted**
- [ ] **Tire check** — Coach 75 psi front / 80 psi rear, Jeep 37 psi, all cold. Check the TPMS display for all 10 tires.
- [ ] **Nothing left at the site** — Check the pedestal, spigot, sewer inlet, and picnic table.
- [ ] **Mirrors, GPS with the RV profile, and seatbelts**
