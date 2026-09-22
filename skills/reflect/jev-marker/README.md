# Jev arm on the reflect marker

A measurement harness, not a part of `/reflect`: can typesafe.ai's System One model (`jev-latest`) carry the turn classification `reflect.mjs` does with regex cues? Numbers and the hand reads are in the vault, `projects/claude-config/measurements/2026-09-22-jev-reflect-marker`.

```
node run.mjs build --scan scan.json        # states from a reflect.mjs scan (needs the transcripts)
node run.mjs ask --arm before|after|rule   # one request per askable turn; needs TYPESAFE_API_KEY
node run.mjs ask --arm rule --all          # also the private-repository sessions
node run.mjs score --arm rule
```

`labels.json` is the pre-registered label set: every turn a reflect report cited since 2026-08-25, the reports' false positives, and hand labels for the withheld class, written before any answer. The scan, the states, the responses and the scores hold session text and stay out of this repository (`.gitignore`).
