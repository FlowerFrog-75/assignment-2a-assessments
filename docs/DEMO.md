# Showing the Digital Skills Wallet: student, staff and admin views

A 15–20 minute demo that shows the same school from three sides. The student
does something, the teacher reacts to it, and the administrator sees the
whole picture, including the blockchain record.

Run it on a **test installation** (your laptop is fine), never on a school's
real one.

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

### b. Build the demo school

```bash
pnpm demo:setup --school "Demo School"     # or your own name, e.g. "Kelvin Grove (demo)"
```

In under a minute it creates the following, all through the app's real
sign-up, assessment and marking flows:

| Who | Sign in as | Notes |
| --- | --- | --- |
| **Administrator** Jordan Lee | `admin@school.example` | 2FA |
| **Teacher** Sam Rivera | `teacher@school.example` | 2FA. Teaches *10 Thinking A* |
| **Student** Mia Chen | `student@school.example` | Has one assessment waiting to sit **live** |
| 11 more students | listed in `demo-accounts.txt` | Noah Nguyen **hasn't given consent**; Leo Rossi joined late (no results) |

It also creates:
- **Three past assessments**, marked and released over the last five weeks, so the trend charts have history.
- **A current assessment**, *Term Check-in: All Seven Skills*. Most of the class has submitted it, so the teacher's marking queue isn't empty.
- **Skill coins on the blockchain**, plus Mia's consent to her teacher and a verification link for an employer.

The passwords, the class code, the staff code and Mia's verification link are
printed at the end and saved in **`demo-accounts.txt`**. Keep that file open.

### c. Start the app

```bash
pnpm dev:full          # then open http://localhost:8443
```

### d. Open three separate browser sessions, side by side

Each role needs its own session, and cookies are shared within one browser
profile, so use three different ones:

| Window | Browser | Sign in as |
| --- | --- | --- |
| **Student** | Chrome (normal window) | `student@school.example` |
| **Teacher** | Chrome **Incognito** (or a second Chrome profile) | `teacher@school.example` |
| **Admin** | Edge or Firefox | `admin@school.example` |

**Two-factor codes for the teacher and admin:** in a spare terminal run

```bash
pnpm demo:code --watch      # prints the current 6-digit codes every 30 seconds
```

(Or scan the QR codes `demo:setup` printed with an authenticator app on your
phone, which looks more real.)

Sign in to all three **before** the audience arrives. Sessions last 12 hours.

---

## 2. The run (talk track)

### Act 1: The student (Mia), about 5 minutes

1. **Dashboard.** "This is Mia's skills wallet. The headline tells her where
   she's strongest and what to focus on. Each bar is a skill against four
   levels, Beginning to Advanced."
2. **My Assessments → Term Check-in → Start.** Sit it live: answer a few
   questions, flag one for review, point out *"All answers saved"* (it
   autosaves) and the timer, then **Submit**.
   "Every student gets their own paper, drawn from teacher-approved questions.
   The paper can always be rebuilt from its seed."
3. **Results.** Pick an earlier result from the drop-down. "She sees each skill
   compared with her class on the same assessment, every question, and her
   teacher's feedback."
4. **Skills Wallet.** "Coins come from results: 10 per mark. Note *on
   blockchain*: every coin is a transaction recorded by both the school and
   Kanavoogle."
5. **Sharing & Privacy.** "Mia decides which teachers can see her individual
   results, and creates links for employers that show only the skills she
   picks." Show that her teacher is **Allowed**.

### Act 2: The teacher (Sam), about 6 minutes

6. **Class Results.** "The title states the finding: the class is strongest
   in this skill and weakest in that one. *Where students are* shows who
   needs support. The heatmap is every student and every skill. Filter by
   level or export to CSV."
7. **Class code** (top of the page). "Students join with this code or a link.
   The teacher can turn it off or change it."
8. **Drill-down on Mia.** "Because Mia consented, Sam sees her individual
   profile against the class average and her results over time." Add a note.
9. **Drill-down on Noah Nguyen.** "Noah hasn't consented, so it's refused,
   and the refusal is logged where Noah can see it."
10. **Marking & Release.** Mia's paper from step 2 is in *To mark* (if it had
    written answers) or *Ready to release*. Open it, mark the written answers
    against the marking guide, add feedback, then **Save and release to
    student**. "Releasing issues her coins and writes them to the blockchain."
11. (Optional) **Question Bank** and **Assessment Templates**: questions must
    be approved before use; a template's blueprint says how many questions per
    skill and complexity.

### Back to the student, 30 seconds

12. Refresh Mia's window: her new result is on the dashboard and **Results**,
    and her coin total went up.

### Act 3: The administrator (Jordan), about 5 minutes

13. **Overview.** Everything that needs attention: marking, unsynced coins,
    and whether the audit log's tamper check passes.
14. **Users.** "Create accounts or import a class list. Reset a lost phone's
    2FA in one click."
15. **School Settings → Staff sign-up code**, and **Classes**: "This is how
    teachers and students sign themselves up, and the admin controls it."
16. **Skill Coins.** Mia's new coins are at the top, each with its **block
    number**. (Optionally revoke a few with a reason: the original stays on the
    blockchain and a revocation is added. Nothing is ever deleted.)
17. **Blockchain Ledger.** "Two organisations keep a full copy each. Every
    coin needs both to sign. Section 3 recomputes each result's fingerprint
    and checks it against the blockchain: ✓ Genuine."
18. **Audit Log.** "Every view and change is recorded and hash-chained, so
    tampering shows up. Here's the teacher's refused attempt to see Noah."

### Act 4: The employer, 1 minute

19. Open **Mia's verification link** (from `demo-accounts.txt`) in a private
    window: no login needed. "Only the skills Mia chose, checked live against
    the blockchain."

### Optional: sign someone up live

Open `http://localhost:8443/join/<class code>` in a private window, create a
student, and show them appear in the teacher's **Class Results**.

---

## 3. Questions people usually ask

- **Can the school change results after the fact?** It can edit its own
  database, but the blockchain holds each result's fingerprint, so the
  Ledger screen, `pnpm ledger:verify` and the employer's link would all show
  *changed after recording*.
- **Why not Ethereum?** Fabric is permissioned: only known organisations
  take part, there are no fees, and nothing is public. Student data stays
  off-chain; the ledger holds wallet IDs, coins and fingerprints.
- **Who can see a student's results?** The student; teachers they consent
  to; administrators (and every view is logged); employers only through a
  link the student made.
- **Is this hosted somewhere?** No. It runs on the school's own server
  (see `deploy/README.md`).
- **Is the history real?** The demo's past three assessments were sat,
  marked and released by the app, then dated over the last five weeks so the
  trend charts have something to show. Everything else happened live.

---

## 4. Reset after the demo

```bash
docker compose -f mongodb/docker-compose.yml down -v && pnpm db:up
pnpm fabric:clean && pnpm fabric:up
rm -f demo-accounts.txt demo-accounts.json
```

Then `pnpm demo:setup` again for the next demo.

## Presenting to a group on their own devices

Deploy to a server first (`deploy/README.md`), run `pnpm demo:setup` there
(it needs `--i-understand` when `NODE_ENV=production`), and put the **class
code** on the screen. Everyone can then sign up as a student and sit the
current assessment, and their results appear in your teacher view as you
watch. (The layout is designed for laptops and desktops.)
