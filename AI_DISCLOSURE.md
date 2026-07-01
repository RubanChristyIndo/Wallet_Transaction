# AI_DISCLOSURE.md

## Tools used

Claude (Anthropic), used conversationally throughout development.

## How it was used

I worked through this assessment in an extended conversation with Claude,
functioning as a pair-programming/mentoring session rather than a
single-prompt generation. Specifically:

- **Architecture decisions** (MVC + explicit service layer, Postgres choice,
  idempotency-key pattern, conditional-UPDATE for atomic debits) were
  proposed by Claude with reasoning; I asked follow-up questions to
  understand the trade-offs before accepting them.
- **Code**: the majority of the initial implementation (models, services,
  controllers, routes, middleware) was written by Claude and reviewed/
  adapted by me. I did not write this layer from scratch, but I read and
  understood each function before using it.
- **Debugging**: I encountered and diagnosed real issues independently,
  including a `.env`/`DATABASE_URL` misconfiguration causing a Postgres SASL
  auth error, and setting up a separate `wallet_test_db` with a conditional
  `.env.test` load via `jest.setup.js`. These were troubleshot with Claude's
  guidance but I ran the diagnostic steps myself and interpreted the actual
  error output.
- **Tests**: the three test files (idempotency, concurrency, crash-recovery)
  were written by Claude; I ran them, read the output, and confirmed
  passing behavior (8/8 tests passing) myself.
- **Docs** (this file, DESIGN.md, RESILIENCE.md, README.md): drafted with
  Claude's help;  Before submission, I reviewed each document, updated sections to accurately reflect my implementation, corrected API behavior where necessary, and ensured the documentation matched the final codebase.
