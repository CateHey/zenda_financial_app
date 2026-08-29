# Vinay's journey — from the whiteboard to the roadmap

> The first real run of the product loop on a real profile. The whiteboard was **module 1
> (discover)**; this document is **module 2 (the roadmap)** computed the way the rules engine
> will: deterministic arithmetic, honest distances, every milestone with a `why`. Vinay becomes
> the demo persona behind the landing page's "See Vinay's journey" CTA.
>
> Start date assumed: **1 September 2026**. Figures in AUD. Education, not advice.

---

## 1 · Discover — the profile (ZendaProfile)

```
goal:    primary  { text: "A $1M house",  targetYears: 7,  priority: 1 }
         second   { text: "A $50k car",   targetYears: 2,  priority: 2 }
         third    { text: "$4k trip (Peru)", targetMonths: 4, priority: 3 }
money:   takeHome 57,000/yr  (70k gross − 13k tax)  ≈ $1,096/wk
         payCycle weekly
         essentials  590/wk  (rent 400 · food 120 · petrol 60 · internet 10)
         lifestyle   250/wk  (discretionary)
         bufferLine  100/wk  (already set aside — counted as savings capacity)
         savings     0 (assumed)
         debts       [{ amount 30,000, rate 2.8%, minimum: unknown }]
context: riskComfort HIGH · assumes 12% nominal on growth assets · 5% on cash savings
         parked: insurance? super?
```

**Data gaps the engine must ask about (module 1 failure-mode rules):**
- The $30k at 2.8% — HECS, or a loan with a required repayment? If HECS, the repayment
  (~$40/wk on this income) is already inside the $13k tax line and the budget is complete. If
  it's a loan with a minimum, the $940/wk budget is missing a line and capacity shrinks.
- Current savings assumed $0. Any existing balance shortens every milestone below.

---

## 2 · The engine — what the numbers mean

| | per week |
|---|---|
| Take-home | $1,096 |
| Essentials | −$590 |
| Lifestyle | −$250 |
| Buffer line | −$100 |
| **Unallocated surplus** | **$156** |
| **Savings engine** (surplus + buffer line, banked) | **≈ $260/wk** |

`$260/wk` is the number the whole roadmap runs on. Everything below is "at $260".
The what-if slider moves this one number and every date recomputes.

**Planning rates.** Vinay's 12% nominal assumption is shown as the *upside* case; the roadmap
plans at **9%** for money invested 5+ years, and **5%** (cash) for anything needed inside
3 years. Short-horizon money does not get the long-run average — it gets whatever the next two
years happen to be.

---

## 3 · The roadmap — milestones in date order (Roadmap)

| # | When | Milestone | Amount | Why | The one action |
|---|---|---|---|---|---|
| 1 | **Wk 2 · mid-Sep 2026** | Breathing room | $500 | A floor under everything. One bad week stops becoming debt. | Move $260 on payday, twice. |
| 2 | **Wk 18 · early Jan 2027** | Peru, funded | $4,000 | Needs $231/wk for 15 weeks — 90% of the engine. Tight, real, on time. | Trip fund in the 5% saver. Book the flights when it hits $4k. |
| 3 | **Wk 27 · early Mar 2027** | Emergency fund | $2,360 | Four weeks of essentials. From here, a lost job is a problem, not a crisis. | Same saver, separate bucket. |
| 4 | **Month 6 · Mar 2027** | **The car decision** | — | The honest math is below. Choose the number, and the date follows. | Pick a car target on the what-if slider. |
| 5 | **Month 28 · ~Jan 2029** | The car (chosen: $25k) | $25,000 | $260/wk in the saver reaches $25k in ~94 weeks. A good used car, no loan. | Keep the buffer and emergency fund untouched. |
| 6 | **2029 → 2033** | House deposit engine | $75k–$130k by mid-2033 | This is where the whole engine points for four years. The honest distance to $1M is below. | Move deposit money to growth assets once the horizon is 5+ years. |
| 7 | **Mid-2033** | The house conversation | — | With the deposit above, Vinay walks into a broker's office knowing the real number. | See the levers. |

**The debt ($30k at 2.8%) is deliberately not a milestone.** It costs 2.8%; the saver pays 5%.
Every extra dollar earns more in the saver than it saves on the debt, so the engine pays the
minimum and puts the surplus where it earns more. (Recomputes instantly if the rate is higher
than assumed.)

**Super is already running.** Employer contributions at 12% of $70k ≈ $8,400/yr — the long-game
engine Vinay never has to touch. Not counted in any milestone above.

---

## 4 · The two honest walls

### The car — $50k in 2 years

| Path | Needs | Verdict |
|---|---|---|
| $50k by Sep 2028 | **$481/wk** from today (1.9× the engine); $650/wk once the trip and emergency fund take the first 27 weeks | Out of reach at $260 |
| $50k invested at 12% for 2 years | Still only ~$30k — and a 2-year horizon is the wrong place for growth-asset risk | Out of reach |
| **$25k by ~Jan 2029** | $260/wk in the 5% saver | **Lands** |
| $50k by ~mid-2030 | $260/wk in the saver, ~4 years | Lands, but the house engine starts a year later |

> The sentence the product shows: *"At $260 a week, a $50k car is four years away. At $25k,
> it's January 2029. Want to see what changes that?"*

### The house — $1M in 7 years

$1M is the price, not the target. The target is the **deposit**, and the wall is
**borrowing capacity**, not savings:

| Fact | Number |
|---|---|
| 20% deposit + purchase costs on $1M | ≈ **$240k** |
| Needs, at 9% over 7 years | **$474/wk** (1.8× the engine) |
| At $260/wk, $240k lands | **~2037**, not 2033 |
| Deposit actually reachable by mid-2033 | **$75k** (with the $25k car) → **$130k** (no car purchase, 9–12%) |
| Borrowing capacity on $70k solo | roughly **$330k–$380k** |
| Purchase power in 2033 at $260/wk | roughly **$420k–$500k** |

> The sentence the product shows: *"At $260 a week, the deposit for a $1M home lands around
> 2037. By 2033 you'll have $75k–$130k — enough for a first place around $450k. Here's what
> moves the $1M closer."*

**The levers, in order of size:**

1. **Income.** Every extra $10k gross ≈ +$130/wk ≈ **+$43k** of deposit over five years — and
   it lifts borrowing capacity at the same time. Nothing else moves both numbers.
2. **Joint income.** A second income roughly doubles borrowing capacity. It is the single
   biggest determinant of whether $1M is a 2033 number or a 2037 number.
3. **Time.** Same engine, 2037.
4. **The car.** Skipping or shrinking it adds ~$45k–$55k to the 2033 deposit.
5. **A first place, not the last one.** A ~$450k entry property in 2033, with equity growth
   and income growth, is the conventional route to $1M — the roadmap can be re-run then.

---

## 5 · Flags for the person (education, not advice)

- **12% is optimistic.** Long-run diversified growth assets have averaged roughly 8–10%
  nominal; the roadmap plans at 9% and shows 12% as upside. Planning at 12% makes every date
  look closer than it is.
- **Match the money to the horizon.** Trip and car money (inside 3 years) belongs in cash
  savings at 5%. Deposit money with 5+ years belongs in growth assets. Never the reverse.
- **Insurance (parked on the whiteboard).** The engine only works while the income does;
  income protection is the question to answer next. Not scoped here.
- **The buffer line is doing double duty.** The $100/wk "buffer" is counted as savings
  capacity above. If it is actually spent most weeks, the true engine is $156/wk and every date
  above moves out by ~65%. Track it for four weeks and let the engine recompute.

---

## 6 · What this run teaches the product

- The first milestone rule held: $500 in two paychecks, reachable, real.
- The **priority order (house › car › trip) and the date order (trip › car › house) are
  different** — the roadmap must sequence by date and *weight* by priority, not sort by one.
- Two of three goals hit an honest wall. The out-of-reach copy (§1.2 of the brief) is not an
  edge case; it is the main case. It needs to be the best-written sentence in the app.
- "Buffer" meant two different things to the person and to the engine. Module 1 must ask.
- The debt-vs-saver comparison was the single most useful `why` — and it is pure arithmetic.
