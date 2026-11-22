for (const [sport, id] of [["basketball/nba", "401910030"], ["football/nfl", "401873070"]] as const) {
  const j = (await (await fetch(`https://site.api.espn.com/apis/site/v2/sports/${sport}/summary?event=${id}`)).json()) as any;
  console.log(sport, "top keys", Object.keys(j).join(","));
  console.log("injuries", JSON.stringify(j.injuries)?.slice(0, 1800));
  const inactive = (j.boxscore?.players ?? []).map((p: any) => (p.statistics ?? []).filter((s: any) => s.athletes?.some((a: any) => a.active === false || a.didNotPlay)).length);
  console.log("dnp flags", JSON.stringify(inactive));
}
