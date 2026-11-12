# Showing the Digital Skills Wallet: the sample school

A 15–20 minute demo of one school from three sides. The student does
something, the teacher reacts to it (with help from the AI), and the
administrator sees the whole picture, including the blockchain record.

It uses a ready-made **sample school**, Riverside High School (Sample), with
simple logins. Run it on a **test installation** (your laptop is fine), never
on a real school's server.

---

## 1. Before people arrive (about 10 minutes)

### a. Start from a clean test install

On the machine you're presenting from (in WSL, in the project folder):

```bash
git pull && pnpm install

# Wipe the test database and blockchain (deletes all data on THIS machine)
docker compose -f mongodb/docker-compose.yml down -v && pnpm db:up
pnpm fabric:clean && pnpm fabric:up
```

### b. Build the sample school

```bash
pnpm sample:school
```

In about a minute it builds the school through the app's real sign-up,
assessment, marking and AI flows. Everyone's password is **`password123`**:

| Who | Email | Notes |
| --- | --- | --- |
| **Administrator** Alex Morgan | `admin@sample.school` | |
| **Teacher** Sam Rivera | `teacher@sample.school` | Teaches *10 Thinking A* |
| **Student** Mia Chen | `student@sample.school` | Has one assessment waiting to sit **live** |
| 11 classmates | `<first name>@sample.school`, e.g. `noah@sample.school` | Noah **hasn't given consent**; Leo joined late (no results) |

It also creates:
- **Three past assessments**, marked and released over the last five weeks, so the trend charts have history.
- **A current assessment**, *Term Check-in: All Seven Skills*. Most of the class has submitted it, so the teacher's marking queue isn't empty.
- **Skill coins on the blockchain**, plus Mia's consent to her teacher and a verification link for an employer (printed at the end).
- **Four AI-drafted questions** waiting in the teacher's review queue.

The sample accounts skip two-factor sign-in, and they only work while
**sample mode** is on. It's on by default in development and off in
production, so a forgotten `password123` account can't be used on a real
server.

### c. Start the app

```bash
pnpm dev:full          # then open http://localhost:8443
```

The sign-in page now has a **Try the sample school** card with one button per
role. Each person's screens show a *Sample school · not for real data* tag.

### d. Open three separate browser sessions, side by side

Cookies are shared within one browser profile, so each role needs its own:

| Window | Browser | Click |
| --- | --- | --- |
| **Student** | Chrome (normal window) | *Student · Mia Chen* |
| **Teacher** | Chrome **Incognito** (or a second Chrome profile) | *Teacher · Sam Rivera* |
| **Admin** | Edge or Firefox | *Admin · Alex Morgan* |

Sessions last 12 hours, so sign in before the audience arrives.

### About the AI

Without an API key the app runs the AI screens in **offline demo** mode: a
scripted stand-in goes through the same steps (an author drafts, a validator
checks, failures are revised) and every result is labelled *Offline demo · not
real AI*. To use real Claude, put `ANTHROPIC_API_KEY=...` in `.env.local`
before `pnpm sample:school` and `pnpm dev:full`. The screens are the same;
the labels change to *AI-drafted*.

---

## 2. The run (talk track)

### Act 1: The student (Mia), about 5 minutes

1. **Dashboard.** "This is Mia's skills wallet. The headline tells her where
   she's strongest and what to focus on. Each bar is a skill against four
   levels, Beginning to Advanced."
2. **My Assessments → Term Check-in → Start.** Sit it live: answer a few
   questions (write a sentence or two in the written ones), flag one for
   review, point out *"All answers saved"* and the timer, then **Submit**.
   "Every student gets their own paper, drawn from teacher-approved questions."
3. **Results.** Pick an earlier result from the drop-down. "She sees each skill
   compared with her class, every question, and her teacher's feedback."
4. **Skills Wallet.** "Coins come from results: 10 per mark. *On blockchain*
   means every coin is a transaction recorded by both the school and
   Kanavoogle."
5. **Sharing & Privacy.** "Mia decides which teachers can see her individual
   results, and creates links for employers that show only the skills she
   picks." Show that her teacher is **Allowed**.

### Act 2: The teacher (Sam) and the AI, about 8 minutes

6. **Class Results.** "The title states the finding: the class is strongest
   in this skill and weakest in that one. The heatmap is every student and
   every skill. Filter by level or export to CSV."
7. **Drill-down on Mia**, then **Noah**. "Mia consented, so Sam sees her
   profile against the class. Noah hasn't, so it's refused, and the refusal
   is logged where Noah can see it."
8. **Question Bank → Needs review.** "These four were drafted by the AI. One
   agent writes each question using the school's approved questions as
   examples. A *second* agent, which never sees the first one's reasoning,
   checks the answer key, that there's one best answer, the skill and the
   difficulty." Open one: the validator's notes are on it. **Approve** it.
   "Nothing the AI writes reaches a student until a teacher approves it."
9. **✦ Generate with AI.** Pick a skill or two and a topic (e.g. *"Planning
   the school fete"*), then generate 3 questions. The timeline shows the agents
   working: searching the question bank, checking for duplicates, drafting,
   validating, revising. When it finishes, **Review** jumps to the new ones.
10. **Marking & Release → Mia's paper** (from step 2). Click **✦ Suggest
    marks with AI**: each written answer gets a suggested mark with the
    reason, checked against the marking guide. "The AI sees the answer, never
    Mia's name." Change one mark to show the teacher decides. Then **✦ Draft
    feedback with AI**, edit a word, and **Save and release to student**.
    "Releasing issues her coins and writes them to the blockchain."
11. (Optional) **Assessment Templates**: a template's blueprint says how many
    questions per skill and complexity. If the bank is short, **✦ Draft the
    missing questions with AI** fills exactly the gaps.

### Back to the student, 30 seconds

12. Refresh Mia's window: her new result and feedback are on **Results**, and
    her coin total went up.

### Act 3: The administrator (Alex), about 5 minutes

13. **Overview.** Everything that needs attention: marking, unsynced coins,
    and whether the audit log's tamper check passes.
14. **Users** and **Classes.** "Create accounts or import a class list. Teachers
    and students can also sign themselves up with a staff or class code."
15. **School Settings → AI assistant.** "The admin decides whether teachers
    may use AI for marking. When it's on, written answers go to the AI provider
    without names or IDs." Show the switch and the status.
16. **Skill Coins.** Mia's new coins are at the top, each with its **block
    number**. (Optionally revoke a few with a reason: the original stays on the
    blockchain and a revocation is added.)
17. **Blockchain Ledger.** "Two organisations keep a full copy each. Every
    coin needs both to sign. Each result's fingerprint is checked against the
    blockchain: ✓ Genuine."
18. **Audit Log.** "Every view and change is recorded and hash-chained. Here's
    the teacher's refused attempt to see Noah, and every AI request."

### Act 4: The employer, 1 minute

19. Open **Mia's verification link** (printed by `pnpm sample:school`) in a
    private window: no login needed. "Only the skills Mia chose, checked live
    against the blockchain."

### Optional: sign someone up live

The class code is printed at the end of `pnpm sample:school`. Open
`http://localhost:8443/join/<class code>` in a private window, create a
student, and show them appear in the teacher's **Class Results**.

---

## 3. Questions people usually ask

- **Does the AI mark the students?** No. It suggests marks and drafts
  feedback; the teacher changes what they like and decides when to save and
  release. Multiple-choice questions are marked automatically without AI.
- **Can the AI put a bad question in front of students?** No. A second agent
  checks every question, failures stay as drafts, and only questions a teacher
  approves are ever used.
- **What does the AI see?** For questions: the request and the school's
  approved questions. For marking: the question, marking guide and answer
  text, with no name, email or wallet ID, and only if the admin turned AI
  marking on.
- **Can the school change results after the fact?** It can edit its own
  database, but the blockchain holds each result's fingerprint, so the Ledger
  screen, `pnpm ledger:verify` and the employer's link would show *changed
  after recording*.
- **Why not Ethereum?** Fabric is permissioned: only known organisations take
  part, there are no fees, and nothing is public. Student data stays
  off-chain; the ledger holds wallet IDs, coins and fingerprints.
- **Is this hosted somewhere?** No. It runs on the school's own server (see
  `deploy/README.md`). The only outside service is the AI provider, and only
  when a key is added.
- **Is the history real?** The three past assessments were sat, marked and
  released by the app, then dated over the last five weeks so the trend charts
  have something to show. Everything else happened live.

---

## 4. Reset after the demo

```bash
docker compose -f mongodb/docker-compose.yml down -v && pnpm db:up
pnpm fabric:clean && pnpm fabric:up
pnpm sample:school
```

`pnpm sample:school` refuses to run on a database that already has accounts,
so it can't overwrite anything.

## Presenting to a group on their own devices

Deploy to a **separate demo server** (`deploy/README.md`), set
`SAMPLE_SCHOOL=on` in its `deploy/.env`, and run `pnpm sample:school
--i-understand` there. Put the class code on the screen: everyone can sign up
as a student and sit the current assessment, and their results appear in your
teacher view as you watch. Never turn sample mode on for a real school.
