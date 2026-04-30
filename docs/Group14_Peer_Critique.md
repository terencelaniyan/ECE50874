# ECE 50874 / 595 – Advanced Software Engineering

*Last modified: 30 March 2026*

## Homework – Peer Critique

> As a Boilermaker pursuing academic excellence, I pledge to be honest and true in all that I do.
> Accountable together – We are Purdue.

**Names:** Vedant Prabhu, Yash Tembhurnikar, and Rushali Dhar

**Date:** 5th April 2026

---

## Assignment Goal

This assignment asks your team to critically review another group's Project Update. It aims to develop your ability to evaluate engineering/research plans and provide constructive feedback, while also helping your peers improve their final project report.

*Note: This is a group assignment. You will coordinate with your team to submit a single PDF.*

## Resources

The following resources will help you complete this assignment:

1. **Peer group assignment sheet:** Check the last tab of this spreadsheet to see which group's report your team is assigned to review: Peer group spreadsheet
2. **Project Reports Folder:** Access and read your assigned group's report here: Spring_2026_ECE 50874_59500_PR

## Assignment

For this critique, you must review all the sections worked on so far in your assigned peer group's report.

### Part 1: Independent Critique

Before discussing as a group, each individual team member must read the assigned report and formulate their own critique.

### Part 2: Group Consensus & Recommendations

After everyone has completed their individual review, meet as a team to discuss your findings. Synthesize these perspectives into a unified group consensus.

---

## Part 1: Independent Critique

**Assigned Peer Group:** *< [Insert Group Number] >*

### Vedant Prabhu

Overall, I think Group 14 did a solid job with this project. The core idea: building a unified bowling ball decision support tool; is pretty well motivated and they explained the problem clearly in the introduction. What stood out to me was how they structured their backend with FastAPI and kept the recommendation logic separate from the frontend, which is good software engineering practice. The fact that they have 108 backend tests and 112 frontend tests shows they took testing seriously.

That said, I noticed a few things that could be improved. The biggest one for me is that their CI pipeline doesn't actually run the database-backed tests or the Playwright E2E tests. So even though those tests exist, they're not being enforced automatically, which kind of defeats the purpose of having CI in the first place. Also, some of the claims they make about the simulation and pose analysis feel a bit overstated given that the validation for those parts is pretty weak. I'd have liked to see clearer separation between "we built this" and "we proved this works well."

### Yash Tembhurnikar

Reading through this report, I thought the Background and Related Work section was one of the stronger parts. They didn't just dump a bunch of citations; they actually explained why existing tools like Bowling This Month or Powerhouse Blueprint fall short and connected that gap to what their system is trying to do. That kind of structured comparison is something a lot of project reports skip over.

Where I think they struggled is with scope management. They admit it themselves in the postmortem; the project grew way beyond the original proposal. And you can feel that in the report. Some sections like the simulation and pose analysis parts feel rushed and under-validated compared to the catalog and recommendation core.

The documentation also seems to have fallen behind the actual code, which they acknowledge. I think if they had locked in the core features earlier and spent more time validating the advanced ones, the report would have felt more balanced. But the architecture decisions they made were smart; keeping the experimental stuff on the client side was a good call.

### Rushali Dhar

My take on this report is that it's genuinely one of the impressive semester projects I've read. The system they built, a web app with a FastAPI backend, PostgreSQL database, React frontend, and 1360+ bowling balls in the catalog, represents a serious amount of work, and it actually solves a real problem rather than being a toy demo. I especially appreciated how honest they were in the analysis section about distinguishing what's mature versus what's still exploratory; a lot of project reports gloss over that, but they addressed it head-on.

One small area for improvement is the documentation consistency. There are a few spots where docs describe something as "planned" when it's already in the code, which they acknowledge themselves in the limitations. A quick cleanup pass would make the report even stronger and easier to trust at face value.

The evaluation section is also solid, though it would've been even more compelling with a small usability test or informal user feedback alongside the quantitative counts. That's a minor addition that could really round out an already strong project.

---

## Part 2: Group Consensus & Recommendations

After discussing our individual reviews, we came to a general agreement on both the strengths and the areas that need work in Group 14's report.

The part we all appreciated the most was the core decision-support pipeline, the catalog search, arsenal management, recommendation logic, and gap analysis. These components are well-built, properly tested, and solve a real problem.

The architectural decision to keep the experimental features (simulation and pose analysis) on the client side, separate from the stable backend, was smart and showed good engineering thinking. It meant the core system stayed functional even when the advanced stuff wasn't fully ready.

That said, we all had the same concern after reading through the report: there's a noticeable gap between what was implemented and what was validated. The simulation and pose analysis modules are presented as part of the system, but the evidence backing them up is thin compared to the rest. On top of that, the CI pipeline skips the database-backed integration tests and doesn't run the Playwright end-to-end tests at all, which is a significant gap for a system that depends so heavily on full-stack behavior.

We also noticed the documentation inconsistencies they mention in their own limitations section. There are spots where the docs describe something as "planned" when it's already in the code or contradict themselves on how complete a feature is. That kind of drift makes it harder to trust the report's claims at face value.

### Our collective recommendations for improvement are:

1. **First**, integrate the Playwright E2E tests and database-backed integration tests into the CI pipeline. The tests exist; they just need to run automatically.
2. **Second**, do a documentation cleanup pass so that what's written matches what's in the codebase. This would make the report much more credible.
3. **Third**, for future work, prioritize validating the simulation and pose analysis modules properly rather than adding more features. The architecture is already there; it just needs stronger empirical backing for the advanced components.

Overall, this is a genuinely impressive semester project with a solid foundation. The main thing holding it back is the unevenness between the mature core and the less-validated extensions.
