/** Team colors (body, trim) keyed "sport:TEAM". A drawn jersey stands in for a player photo. */
const C: Record<string, [string, string]> = {};
const add = (sport: string, rows: string) => {
  for (const r of rows.trim().split("\n")) {
    const [t, a, b] = r.trim().split(/\s+/) as [string, string, string];
    C[`${sport}:${t}`] = [`#${a}`, `#${b}`];
  }
};
add("nba", `
ATL E03A3E FDB927
BOS 007A33 FFFFFF
BKN 000000 FFFFFF
CHA 1D1160 00788C
CHI CE1141 000000
CLE 860038 FDBB30
DAL 00538C B8C4CA
DEN 0E2240 FEC524
DET C8102E 1D42BA
GSW 1D428A FFC72C
HOU CE1141 000000
IND 002D62 FDBB30
LAC C8102E 1D428A
LAL 552583 FDB927
MEM 5D76A9 12173F
MIA 98002E F9A01B
MIL 00471B EEE1C6
MIN 0C2340 236192
NOP 0C2340 C8102E
NYK 006BB6 F58426
OKC 007AC1 EF3B24
ORL 0077C0 C4CED4
PHI 006BB6 ED174C
PHX 1D1160 E56020
POR E03A3E 000000
SAC 5A2D81 63727A
SAS C4CED4 000000
TOR CE1141 000000
UTA 002B5C F9A01B
WAS 002B5C E31837`);
add("nfl", `
ARI 97233F 000000
ATL A71930 000000
BAL 241773 000000
BUF 00338D C60C30
CAR 0085CA 101820
CHI 0B162A C83803
CIN FB4F14 000000
CLE 311D00 FF3C00
DAL 003594 869397
DEN FB4F14 002244
DET 0076B6 B0B7BC
GB 203731 FFB612
HOU 03202F A71930
IND 002C5F A2AAAD
JAX 006778 D7A22A
KC E31837 FFB81C
LV 000000 A5ACAF
LAC 0080C6 FFC20E
LAR 003594 FFA300
MIA 008E97 FC4C02
MIN 4F2683 FFC62F
NE 002244 C60C30
NO D3BC8D 101820
NYG 0B2265 A71930
NYJ 125740 000000
PHI 004C54 A5ACAF
PIT FFB612 101820
SF AA0000 B3995D
SEA 002244 69BE28
TB D50A0A 34302B
TEN 4B92DB 0C2340
WAS 5A1414 FFB612
WSH 5A1414 FFB612`);
add("nhl", `
ANA F47A38 000000
BOS FFB81C 000000
BUF 003087 FFB81C
CGY C8102E F1BE48
CAR CC0000 000000
CHI CF0A2C 000000
COL 6F263D 236192
CBJ 002654 CE1126
DAL 006847 8F8F8C
DET CE1126 FFFFFF
EDM 041E42 FF4C00
FLA 041E42 C8102E
LAK 111111 A2AAAD
MIN 154734 A6192E
MTL AF1E2D 192168
NSH FFB81C 041E42
NJD CE1126 000000
NYI 00539B F47D30
NYR 0038A8 CE1126
OTT C52032 000000
PHI F74902 000000
PIT FCB514 000000
SEA 001628 99D9D9
SJS 006D75 000000
STL 002F87 FCB514
TBL 002868 FFFFFF
TOR 00205B FFFFFF
UTA 71AFE5 000000
VAN 00205B 00843D
VGK B4975A 333F42
WSH 041E42 C8102E
WPG 041E42 004C97`);

function ink(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? "#111111" : "#ffffff";
}

/** SVG markup for a team jersey with the team code on the chest. Colors come from the table above, never from data. */
export function jerseySvg(sport: string, team: string): string {
  const [body, trim] = C[`${sport}:${team}`] ?? ["#d9d9d9", "#111111"];
  const code = /^[A-Z]{2,4}$/.test(team) ? team : "";
  const size = code.length > 3 ? 8 : 10;
  return (
    `<svg viewBox="0 0 48 44" width="44" height="40" role="img" aria-label="${code} jersey" focusable="false">` +
    `<path d="M16 3 L4 9 L1 21 L10 23 L11 41 L37 41 L38 23 L47 21 L44 9 L32 3 C30 8 18 8 16 3 Z" fill="${body}" stroke="#111111" stroke-width="2.5" stroke-linejoin="round"/>` +
    `<path d="M16 3 C18 8 30 8 32 3" fill="none" stroke="${trim}" stroke-width="3"/>` +
    `<path d="M10.5 30 H37.5" stroke="${trim}" stroke-width="2.5"/>` +
    `<text x="24" y="24" text-anchor="middle" font-family="Archivo Black, sans-serif" font-size="${size}" fill="${ink(body)}">${code}</text>` +
    `</svg>`
  );
}

export function jersey(sport: string, team: string): HTMLElement {
  const el = document.createElement("span");
  el.className = "jersey";
  el.innerHTML = jerseySvg(sport, team);
  return el;
}
