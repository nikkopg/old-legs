// Shared run data + Pak Har verdict copy for all three design directions.
// This is the SAME run visualized three ways, so we can honestly compare.

const RUN = {
  title: 'Sunday Easy',
  date: 'Sun 12 Apr 2026',
  startTime: '06:42',
  route: 'Senayan loop × 2',
  weather: '27°C, humid, light rain 2nd half',
  distance_km: 10.4,
  moving_time: '58:12',
  avg_pace: '5:36',
  avg_hr: 162,
  max_hr: 181,
  cadence: 174,
  elev_gain: 64,
  // splits — km, pace string, hr, cadence, elev
  splits: [
    { km: 1, pace: '5:12', hr: 148, cad: 176, elev: +4 },
    { km: 2, pace: '5:18', hr: 154, cad: 177, elev: +6 },
    { km: 3, pace: '5:24', hr: 158, cad: 175, elev: +8 },
    { km: 4, pace: '5:31', hr: 161, cad: 174, elev: +5 },
    { km: 5, pace: '5:38', hr: 164, cad: 173, elev: +7 },
    { km: 6, pace: '5:42', hr: 166, cad: 173, elev: +9 },
    { km: 7, pace: '5:48', hr: 169, cad: 172, elev: +8 },
    { km: 8, pace: '5:55', hr: 172, cad: 171, elev: +6 },
    { km: 9, pace: '6:02', hr: 174, cad: 170, elev: +6 },
    { km: 10, pace: '5:44', hr: 178, cad: 175, elev: +5 },
  ],
  // HR zones — minutes in each
  hr_zones: [
    { z: 'Z1', range: '<130', min: 2, pct: 3 },
    { z: 'Z2', range: '130–147', min: 8, pct: 14 },
    { z: 'Z3', range: '148–162', min: 22, pct: 38 },
    { z: 'Z4', range: '163–176', min: 21, pct: 36 },
    { z: 'Z5', range: '177+', min: 5, pct: 9 },
  ],
  // Weekly context — last 4 weeks km
  weeks: [
    { label: 'W-3', km: 28.0, runs: 4 },
    { label: 'W-2', km: 34.2, runs: 5 },
    { label: 'W-1', km: 31.5, runs: 4 },
    { label: 'This', km: 26.8, runs: 3, current: true },
  ],
};

// Three progressively harder verdicts. This is the product. Read them.
const PAK_HAR_VERDICT = {
  headline: 'You went out too hard. Again.',
  byline: 'Pak Har — Sun 12 Apr, 07:48',
  body: [
    'First kilometre 5:12 on an easy day. What were you training for, the bus?',
    "By km 7 you were in Z4 and pretending it was still easy. It was not. The last kilometre — the sudden 5:44 — that is ego, not fitness. You saw the finish and tried to be someone.",
    "Three runs this week against five last week. The rain on Thursday is not a reason. You know this.",
    "Tomorrow: 35 minutes, heart rate under 148. If you cannot hold it, slow down until you can. This is not a punishment. This is the work.",
  ],
  // short pull-quote for the broadsheet
  pull: '"The last kilometre — that is ego, not fitness."',
  // stamped single word for the dossier
  stamp: 'PACED POORLY',
  // one-line dispatch for the receipt
  dispatch: 'EASY DAY RUN HARD — NOT THE PLAN.',
};

window.RUN = RUN;
window.PAK_HAR_VERDICT = PAK_HAR_VERDICT;
