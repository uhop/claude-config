# Contributing to claude-config

This repository is one person's working configuration, public so it can be read and borrowed from.

## Discuss significant changes first

Every significant change starts as a conversation. Before you write code, open an
[issue](https://github.com/uhop/claude-config/issues) that describes the problem and the change you
propose, and wait for a maintainer to approve it explicitly. A pull request for a significant change
that wasn't discussed and approved first isn't merged, and may be closed without review.

A significant change is anything beyond a small fix: a new feature or option, a change to documented
behavior, a new dependency, a refactor, or a change to the tests or CI. Small fixes can go straight
to a pull request: a typo, a broken link, or a bug fix of a few lines with a test that fails without
it.

The discussion saves your time as much as ours: a change that doesn't fit the project is cheaper to
turn down before it is written. Approval covers the plan you described, and the pull request is
still reviewed against it.

### What a change has to fit

Read the [README](./README.md) first: it says what claude-config is and how it is installed.

- **The project's purpose.** claude-config is the Claude Code configuration its author runs day to
  day. A change that serves another setup belongs in a fork you maintain yourself. The license
  allows it, and for a different setup it is the better path.
- **The cost of keeping it.** A merged change is maintained here from then on, by the maintainer:
  its author rarely comes back to fix what turns up later. Each skill and rule also adds to what
  every session loads and reads. A change has to be worth that cost, and a feature can be declined
  for that reason alone.
- **One concern per pull request.** A pull request that mixes several changes goes back to its
  author to be split.

## License

This project is distributed under the [BSD-3-Clause license](./LICENSE). External contributions are
accepted only under licenses compatible with BSD-3-Clause; submissions under fundamentally
incompatible licenses cannot be merged.
