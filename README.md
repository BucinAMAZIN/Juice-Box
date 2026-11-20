# Juice Box

A pick tracker that prices props against the vig, logs every pick **before** the game, and grades itself honestly.

"Juice" is the book's cut on every bet. To profit, your edge has to be bigger than the juice, so this app removes it first and then asks whether your number is actually better than the book's.

It does not place bets, connect to a sportsbook, or tell you what to wager. Anything it flags is a lean, not a sure thing.

## What it does

- **Price a prop.** Enter a player's line, the book's over and under odds, and your projected count. Juice Box removes the vig, compares your probability to the book's, and shows the edge, expected value and a capped quarter-Kelly stake.
- **Log it before puck drop.** Picks are frozen when logged and cannot be edited. A pick for a game that has already started is refused.
- **Grade it.** Grade by hand, or pull the final box score from the NHL API. Grades are write-once.
- **Judge the model, not the streak.** The Stats tab shows record, profit and ROI, plus closing line value, Brier score, log loss and a calibration table. It warns while the sample is small.

## How the model works

Expected count = per-60 rate × projected minutes, summed over game states (5v5, power play, penalty kill). Opponent, pace and similar adjustments are multiplied in and clamped to ±30%. Counts are modeled as a negative binomial, since shots are more spread out than a Poisson allows.

Starting dispersion values are assumptions to calibrate against your own logged results, not measured constants. See `src/core/model.ts`.

Counts are right-skewed, so the median sits below the mean. A 3.5-shot line is roughly fair at a projected mean near 3.8, not 3.5. The model accounts for this; a quick mental "my number is over the line" does not.

## Run

```bash
npm install
npm test        # unit and UI tests
npm run dev     # local dev server
npm run build   # typecheck and build to dist/
```

## Layout

| Path | What it is |
| --- | --- |
| `src/core/odds.ts` | American odds, implied probability, de-vigging (multiplicative and power), EV, Kelly, closing line value |
| `src/core/dist.ts` | Poisson and negative binomial, over/under with pushes |
| `src/core/model.ts` | Rate × opportunity projection, shrinkage, adjustment clamping |
| `src/core/evaluate.ts` | Price both sides of a prop and flag plays that clear the bar |
| `src/core/grade.ts` | Grading, profit, Brier, log loss, calibration, summary |
| `src/data/ledger.ts` | Append-only pick and grade record (localStorage) |
| `src/data/nhl.ts` | NHL API parsers and loaders |
| `src/data/autograde.ts` | Grade open picks from final box scores |
| `src/data/quote.ts` | Parse hand-typed prop lines |
| `src/ui/` | One small module per screen |

## Known limits

- **The NHL adapter is untested against the live API.** Parsers were written from the community-documented response shapes and tested against small hand-written fixtures in `tests/fixtures/`. Check them against real responses before relying on auto-grading. Anything it cannot settle is left open and reported, never guessed.
- **No odds feed yet.** Prop prices are entered by hand. Free public sources do not carry live prop odds, so an odds source would be the next thing to add.
- **No projection pipeline yet.** You supply the projected count, or build it from rates and ice time in the form. Pulling rates, lines and power-play units automatically is the next milestone.
- **Data lives in your browser.** Download a backup from the Stats tab before clearing site data.

## Privacy

Everything stays on your device. There are no accounts, no analytics and no push subscriptions.
