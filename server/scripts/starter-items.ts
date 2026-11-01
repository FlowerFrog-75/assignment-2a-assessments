// Loads a starter question bank: 28 questions (four per skill) for the subject
// "General Capabilities", suitable for Years 7 to 12. They arrive as
// "pending review": a teacher must read and approve each one in the web app
// (Question Bank screen) before it can appear on a paper.
//
//   pnpm db:starter-items
//
// Safe to run more than once: questions already in the bank are skipped.
import "./load-env";
import type { SkillKey } from "../db/constants";
import { connectToDatabase, disconnectFromDatabase } from "../db/connect";
import { AssessmentItemModel, appendAuditLog } from "../db/models";

const SUBJECT = "General Capabilities";

type Mc = { skill: SkillKey; complexity: number; prompt: string; options: string[]; correct: number };
type Sr = { skill: SkillKey; complexity: number; prompt: string; modelAnswer: string; rubric: string; points: number };

const multipleChoice: Mc[] = [
  // Analytical thinking
  { skill: "analytical-thinking", complexity: 1, prompt: "A class recorded how long 20 students slept and their test scores. Students who slept more tended to score higher. What is the most accurate conclusion?", options: ["More sleep causes higher scores", "Sleep and test scores are linked in this group, but this alone doesn't show cause", "Test scores cause students to sleep longer", "There is no relationship"], correct: 1 },
  { skill: "analytical-thinking", complexity: 2, prompt: "A canteen's sales fell by 30% in the same month it raised prices and a new shop opened next door. What should you do before deciding why sales fell?", options: ["Assume the price rise was the cause", "Assume the new shop was the cause", "Look for data that separates the two causes, such as sales of items whose price didn't change", "Lower the prices immediately"], correct: 2 },
  { skill: "analytical-thinking", complexity: 3, prompt: "An experiment tests whether a fertiliser helps plants grow. Group A gets fertiliser and sunlight; Group B gets neither. Group A grows taller. What is the main flaw?", options: ["The groups are too small", "Two variables changed at once, so the effect of the fertiliser can't be isolated", "Plants should have been measured in centimetres", "There should have been a third group with water only"], correct: 1 },
  // Research
  { skill: "research", complexity: 1, prompt: "Which source is most reliable for statistics on Australia's population?", options: ["A social media post with many shares", "The Australian Bureau of Statistics website", "A blog post from 2009", "A comment on a news article"], correct: 1 },
  { skill: "research", complexity: 2, prompt: "You find two articles that disagree about the effects of screen time. What is the best next step?", options: ["Choose the one that agrees with your view", "Check who wrote each one, their evidence, and when they were published", "Use whichever is shorter", "Ignore the topic"], correct: 1 },
  { skill: "research", complexity: 3, prompt: "A website cites a study to support its claim, but the link goes to a different study on another topic. What does this most suggest?", options: ["The claim is definitely false", "The claim is definitely true", "The claim's evidence can't be confirmed, so you should find the original study or other sources", "Websites never make mistakes with links"], correct: 2 },
  // Critical thinking
  { skill: "critical-thinking", complexity: 1, prompt: "\"Everyone at my school uses this app, so it must be the best app.\" What is wrong with this reasoning?", options: ["Nothing; popularity proves quality", "It assumes that being popular means being the best", "It uses too few words", "It doesn't name the app"], correct: 1 },
  { skill: "critical-thinking", complexity: 2, prompt: "An advertisement says \"9 out of 10 dentists recommend our toothpaste.\" Which question best tests this claim?", options: ["What colour is the toothpaste?", "How many dentists were asked, who paid for the survey, and what were they asked to compare?", "Is the advertisement funny?", "Do you like the brand?"], correct: 1 },
  { skill: "critical-thinking", complexity: 3, prompt: "A council proposes closing a park to build a car park, saying it will \"help local business.\" What should a critical thinker do first?", options: ["Support it because business is important", "Oppose it because parks are always more important", "Identify the assumptions, the evidence for each claim, and who gains or loses", "Wait to see what most people think"], correct: 2 },
  // Creativity
  { skill: "creativity", complexity: 1, prompt: "Your group must design a poster but disagrees about the idea. Which approach is most likely to produce a creative result?", options: ["Use the first idea suggested", "Brainstorm many ideas without judging them, then combine and refine the best", "Let the teacher choose", "Copy a poster from the internet"], correct: 1 },
  { skill: "creativity", complexity: 2, prompt: "A designer is asked to make a water bottle for people with limited hand strength. What should they do first?", options: ["Make the bottle more colourful", "Talk to and observe people with limited hand strength using bottles", "Make the bottle as cheap as possible", "Copy the most popular bottle"], correct: 1 },
  { skill: "creativity", complexity: 3, prompt: "Which best describes creative problem solving?", options: ["Finding the one correct answer quickly", "Generating original options, testing them, and improving them based on feedback", "Avoiding ideas that might fail", "Following the same steps that worked last time"], correct: 1 },
  // Decision-making
  { skill: "decision-making", complexity: 1, prompt: "You have an assignment due tomorrow and a friend invites you out tonight. What is the best first step in deciding?", options: ["Go out and hope it works out", "Work out how much of the assignment is left and what each choice would cost you", "Ask someone else to decide", "Ignore the assignment"], correct: 1 },
  { skill: "decision-making", complexity: 2, prompt: "A sports club has money for either new equipment or a coaching course. Which method leads to the best decision?", options: ["Pick whichever the president likes", "List the benefits, costs and risks of each, and check them against the club's goals", "Toss a coin", "Choose the cheaper one without discussion"], correct: 1 },
  { skill: "decision-making", complexity: 3, prompt: "The day before a project is due, you find a serious error in your data. Which approach shows the best decision-making?", options: ["Submit as is and hope nobody notices", "Weigh how serious the error is and the time needed to fix it, then either fix it or tell your teacher and ask for more time", "Delete the data", "Copy a classmate's data"], correct: 1 },
  // Collaboration
  { skill: "collaboration", complexity: 1, prompt: "In a group task, one member is quiet and hasn't shared ideas. What is the best thing to do?", options: ["Ignore them", "Invite them to share and listen to their ideas", "Do their part for them without asking", "Tell the teacher they aren't working"], correct: 1 },
  { skill: "collaboration", complexity: 2, prompt: "Two group members strongly disagree about the direction of a project. What is the most effective response?", options: ["Vote immediately and move on", "Have each explain their reasons, look for common goals, and agree on a way to decide", "Let the louder person decide", "Split the project in two"], correct: 1 },
  { skill: "collaboration", complexity: 3, prompt: "Your team keeps missing deadlines because tasks are unclear. What would help most?", options: ["Work longer hours", "Agree who does what by when, and check progress regularly", "Let one person do everything", "Stop having meetings"], correct: 1 },
  // Adaptability
  { skill: "adaptability", complexity: 1, prompt: "Your planned outdoor science experiment is rained out. What shows the most adaptability?", options: ["Cancel the experiment", "Find a way to run a version of it indoors or reschedule, keeping the same aim", "Complain about the weather", "Make up the results"], correct: 1 },
  { skill: "adaptability", complexity: 2, prompt: "Halfway through a project, your teacher changes the requirements. What is the best response?", options: ["Ignore the change", "Review what still fits, adjust your plan, and ask questions about anything unclear", "Start again from scratch without checking", "Give up on the project"], correct: 1 },
  { skill: "adaptability", complexity: 3, prompt: "You join a new team that uses tools you've never used. What is the most adaptable approach?", options: ["Insist they use your tools", "Learn the basics quickly, ask for help, and share ideas from your experience where useful", "Avoid tasks that need the new tools", "Wait for training before doing anything"], correct: 1 },
];

const shortResponse: Sr[] = [
  { skill: "analytical-thinking", complexity: 3, points: 3, prompt: "A school claims its new homework policy improved results because average marks rose after it started. Describe two other explanations for the rise, and how you could test the claim.", modelAnswer: "Other explanations: easier tests, a different group of students, new teachers, more revision time. Test: compare with a similar class or school without the policy, or compare results on the same test across years.", rubric: "1 mark for each plausible alternative explanation (max 2). 1 mark for a fair test such as a comparison group." },
  { skill: "research", complexity: 3, points: 3, prompt: "Explain how you would decide whether a website is a trustworthy source for a school report. Give three checks.", modelAnswer: "Who wrote it and their expertise; whether it cites evidence; how recent it is; whether other reliable sources agree; whether it has a commercial or political bias.", rubric: "1 mark for each relevant, distinct check (max 3)." },
  { skill: "critical-thinking", complexity: 3, points: 3, prompt: "\"Video games make teenagers violent, because a teenager who committed a crime played video games.\" Identify the flaw in this argument and explain why it matters.", modelAnswer: "It generalises from one case and assumes cause from a link. Most teenagers play games without becoming violent; other factors may explain the crime.", rubric: "1 mark for naming the flaw (generalising from one case, or correlation versus causation). 1 mark for explaining it. 1 mark for a counter-example or an alternative factor." },
  { skill: "creativity", complexity: 3, points: 3, prompt: "Suggest two original ways to reduce the amount of food wasted in your school canteen. For one of them, explain how you would test whether it works.", modelAnswer: "Ideas such as smaller portion options, a share table, composting, pre-ordering. Test: measure waste before and after for a few weeks.", rubric: "1 mark for each original, practical idea (max 2). 1 mark for a reasonable test." },
  { skill: "decision-making", complexity: 3, points: 3, prompt: "Your class must choose between a museum excursion and a guest speaker. Describe a fair process for making the decision.", modelAnswer: "Set criteria (learning value, cost, time, access); gather information; compare the options against the criteria; involve the class; decide and explain why.", rubric: "1 mark for criteria. 1 mark for comparing the options. 1 mark for a fair way to involve people and decide." },
  { skill: "collaboration", complexity: 3, points: 3, prompt: "Describe a time a group you worked in had a problem. What did the group do, and what would you do differently next time?", modelAnswer: "A clear description of the problem, the actions taken, and a sensible improvement such as clearer roles, earlier check-ins or better listening.", rubric: "1 mark for describing the problem. 1 mark for the group's actions. 1 mark for a realistic improvement." },
  { skill: "adaptability", complexity: 3, points: 3, prompt: "Describe how you would cope if you had to learn a new subject online, without a teacher in the room. Give at least two strategies.", modelAnswer: "A routine or schedule, breaking work into steps, asking questions online, finding extra resources, checking progress.", rubric: "1 mark for each relevant strategy (max 2). 1 mark for explaining why one of them would help." },
];

async function main() {
  await connectToDatabase();
  let added = 0;
  for (const q of multipleChoice) {
    if (await AssessmentItemModel.exists({ subject: SUBJECT, prompt: q.prompt })) continue;
    await AssessmentItemModel.create({
      subject: SUBJECT,
      skill: q.skill,
      complexity: q.complexity,
      type: "multiple_choice",
      prompt: q.prompt,
      options: q.options.map((text, i) => ({ key: String.fromCharCode(65 + i), text })),
      answer: { correctOption: String.fromCharCode(65 + q.correct) },
      points: 1,
      source: "teacher",
      status: "pending_review",
    });
    added += 1;
  }
  for (const q of shortResponse) {
    if (await AssessmentItemModel.exists({ subject: SUBJECT, prompt: q.prompt })) continue;
    await AssessmentItemModel.create({
      subject: SUBJECT,
      skill: q.skill,
      complexity: q.complexity,
      type: "short_response",
      prompt: q.prompt,
      answer: { modelAnswer: q.modelAnswer, rubric: q.rubric },
      points: q.points,
      source: "teacher",
      status: "pending_review",
    });
    added += 1;
  }
  if (added) await appendAuditLog({ actorRole: "system", action: "item.import", status: "success", details: { label: `Starter question bank loaded (${added} questions)` } });
  console.log(`Added ${added} questions to "${SUBJECT}" (${multipleChoice.length + shortResponse.length - added} were already there).`);
  console.log("A teacher must approve them on the Question Bank screen before they can be used.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => disconnectFromDatabase());
