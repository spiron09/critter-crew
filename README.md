# 🐾 critter-crew

**See who's working on what, at a glance.**

When Claude hands work to subagents (helpers), it's easy to lose track of who is doing what. critter-crew is a Claude Code mod that gives every agent a little pixel critter and puts them all on a live board beside your chat.

- **Claude** is a clay-coloured spark ✻
- **Every helper** gets a critter, a name and a pastel colour: a cat, fox, bunny, panda, owl or frog

```
3 on the job                                    ✻ 🐱 🦊 🐰

╭──────────────────────────────────────────────────────────╮
│ 🐱  Map the learning library                        0:41 │
│     Reading index.html…                                  │
│     bruno · explore · haiku · 53k tok          Activity  │
╰──────────────────────────────────────────────────────────╯
```

## What you get

**A Crew pane beside the chat**

- One card per agent: what it was asked to do, what it's doing right now ("Reading index.html…"), how long it's been at it, its model and token use.
- A working card has an outline in its critter's colour. Finished cards go quiet.
- The critter bobs while it works and falls asleep when it's done. A ring around it fills up as its context gets used.
- Each critter says "done" in its own voice: the fox *sniffed it out*, the frog *hopped through it*, the cat *pounced on it*.
- Click **Activity** on any card to see every step the agent took, plus the report it handed back. A failed step shows in red.

**A line above the prompt** (only while helpers are working)

- Who's working and what they're on, one dot per helper (○ working, ● done), and a count like `2/4`.
- When the whole batch finishes it says how long it took, then gets out of the way.

**`/crew`** opens the pane if you've closed it.

## Install

You need [Claude Code](https://claude.com/claude-code).

**In a Claude Code terminal session**, type:

```
/plugin install critter-crew --marketplace spiron09/critter-crew
```

Answer `y` to add the marketplace, then press Enter to install for your user. It starts working right away.

**From your shell** instead:

```bash
claude plugin install critter-crew --marketplace spiron09/critter-crew
```

**In the Claude desktop app** (where `/plugin` doesn't run): click **+** next to the prompt box → **Plugins** → **Add marketplace**, enter `spiron09/critter-crew`, then **Add plugin**.

## Try it

Ask Claude to do something with a few helpers in parallel, for example:

> Use three subagents to summarise the README, the tests and the main source file of this repo.

Open the **Crew** pane (or type `/crew`) and watch the critters get to work.

## Notes

- **Best in the desktop app.** That's where the critters, outlines and colours are drawn. The terminal gets a simpler text version of the same board.
- **Colours** are tuned for dark mode. They work in light mode too, just softer.
- **The context ring** assumes a 200k-token window unless the agent has clearly used more, because Claude Code doesn't report each model's exact limit.
- **Reduced motion** is respected: critters stop bobbing, and the live dot fades gently instead.

## Uninstall

```
/plugin uninstall critter-crew
```

## Development

The mod is a single hooks module:

- `hooks/register.tsx` holds the board's logic and layout.
- `hooks/art.ts` holds the pixel critters and the colour palette.
- `tests/` holds the tests.

```bash
claude plugin validate .
claude plugin test .
```

To run your local copy instead of the installed one, start Claude Code with `claude --plugin-dir .`.
