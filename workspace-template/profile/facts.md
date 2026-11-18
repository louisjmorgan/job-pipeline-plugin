---
# Machine-checked by `jp lint` against every tailored CV, cover letter and answers draft.
# Patterns are case-insensitive JavaScript regexes. level: error (fails) or warn. Default: error.

# Technologies or experience you don't have. Any mention in a draft fails the lint.
# To state a gap on purpose ("I haven't used Kubernetes, but…"), end that line with
# <!-- lint-ok: reason --> so you have decided it, not the model.
never_claim: []

rules:
  - pattern: '\[[A-Z][A-Z0-9 _/-]{2,}\]'
    case_sensitive: true
    message: Unfilled placeholder, e.g. [START DATE]. Fill it or cut the sentence.
  # - pattern: 'line[- ]manag'
  #   message: No formal line management, only mentoring.
---

# Settled facts

Decisions already made about how things are described. They override anything older in
`cv.md`, `evidence.md` or a past application. The rules above check the ones a regex can catch;
the rest are for whoever writes the next draft to read.

- (none yet)
