/** The leagues the line tracker follows, and where ESPN keeps their scoreboards and closing lines. */
export interface League {
  id: string;
  label: string;
  /** ESPN's "sport/league" path. */
  path: string;
  /** Scoreboard group filter that picks the top division (FBS, Division I). */
  groups?: string;
  /** Regular season and playoffs, as [month, day] in the season's starting year through the next year when it wraps. */
  start: [number, number];
  end: [number, number];
  /** Seasons to read back, by the year they start. */
  seasons: number[];
}

export const LEAGUES: League[] = [
  { id: "nba", label: "NBA", path: "basketball/nba", start: [10, 15], end: [6, 25], seasons: [2022, 2023, 2024, 2025, 2026] },
  { id: "nfl", label: "NFL", path: "football/nfl", start: [9, 1], end: [2, 15], seasons: [2021, 2022, 2023, 2024, 2025, 2026] },
  { id: "nhl", label: "NHL", path: "hockey/nhl", start: [10, 1], end: [6, 30], seasons: [2022, 2023, 2024, 2025, 2026] },
  { id: "ncaaf", label: "NCAAF", path: "football/college-football", groups: "80", start: [8, 20], end: [1, 14], seasons: [2021, 2022, 2023, 2024, 2025, 2026] },
  { id: "ncaab", label: "NCAAB", path: "basketball/mens-college-basketball", groups: "50", start: [11, 1], end: [4, 10], seasons: [2024, 2025, 2026] },
  { id: "mlb", label: "MLB", path: "baseball/mlb", start: [3, 20], end: [11, 5], seasons: [2023, 2024, 2025, 2026] },
];

export const leagueById = (id: string): League | undefined => LEAGUES.find((l) => l.id === id);
export const siteUrl = (l: League): string => `https://site.api.espn.com/apis/site/v2/sports/${l.path}`;
export const coreUrl = (l: League): string => {
  const [sport, league] = l.path.split("/");
  return `https://sports.core.api.espn.com/v2/sports/${sport}/leagues/${league}`;
};
