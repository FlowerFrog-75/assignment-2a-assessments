// The offline stand-in: runs the same agent workflow as Claude without an API
// key, so the workflow can be shown and tested. Everything it produces is
// labelled "offline-demo" and shown as "Offline demo (not real AI)".
//
// - Author: picks questions from a hand-written pool (separate from the starter
//   bank), covering every skill at every complexity. For each skill it deliberately drafts one flawed version first, so
//   the validator and revision steps have something real to do.
// - Validator: genuine rule checks (options, answer key, duplicates, length).
// - Marking: overlap between the answer and the model answer / marking guide.
// - Feedback: assembled from the strongest and weakest skills in the result.
import type { SkillKey } from "../db/constants";
import { similarity } from "./provider";

export type PoolItem = {
  skill: SkillKey;
  complexity: number;
  type: "multiple_choice" | "short_response";
  prompt: string;
  options?: string[];
  correct?: number;
  modelAnswer?: string;
  rubric?: string;
  points: number;
};

const mc = (skill: SkillKey, complexity: number, prompt: string, options: string[], correct: number): PoolItem => ({ skill, complexity, type: "multiple_choice", prompt, options, correct, points: 1 });
const sr = (skill: SkillKey, prompt: string, modelAnswer: string, rubric: string, complexity = 3, points = 3): PoolItem => ({ skill, complexity, type: "short_response", prompt, modelAnswer, rubric, points });

export const OFFLINE_POOL: PoolItem[] = [
  // Analytical thinking
  mc("analytical-thinking", 1, "A bar graph shows library visits for each month of the year. What is the first thing to check before comparing the months?", ["Which month has the tallest bar", "What the axes and units are", "Whether the colours look good", "Who made the graph"], 1),
  mc("analytical-thinking", 2, "Your class finds that students who eat breakfast get higher maths scores. Which question best helps you analyse this finding?", ["Is breakfast tasty?", "Could something else, such as sleep or routine, explain both?", "How many students like maths?", "Should the canteen open earlier?"], 1),
  mc("analytical-thinking", 3, "A school's attendance rose from 88% to 93% after it introduced a reward scheme. The same year, a flu outbreak ended early. What is the most reasonable conclusion?", ["The reward scheme caused the whole rise", "The flu ending caused the whole rise", "Both may have contributed; the data alone can't separate them", "Attendance figures are unreliable"], 2),
  sr("analytical-thinking", "A survey found that 70% of students who use a homework app say they enjoy school. Explain why this does not prove the app makes students enjoy school, and describe one better way to find out.", "Students who already enjoy school may be more likely to use the app (self-selection), and the survey shows a link, not a cause. A better test compares similar groups with and without the app over time, or measures enjoyment before and after.", "1 mark for identifying correlation versus causation or self-selection. 1 mark for explaining it in context. 1 mark for a fair test (comparison group or before/after)."),
  // Research
  mc("research", 1, "You need the population of your town for an assignment. Which source is best to start with?", ["A friend's guess", "The national statistics office website", "A meme about your town", "A ten-year-old newspaper ad"], 1),
  mc("research", 2, "Two websites give different figures for the height of a mountain. What should you do next?", ["Use the bigger number", "Find a third, authoritative source and check how each figure was measured", "Leave the figure out", "Average the two numbers"], 1),
  mc("research", 3, "An article quotes 'experts' but names none and gives no links. How should you treat its claims?", ["As reliable, because experts are quoted", "As unverified until you can trace the original sources", "As false", "As reliable if it has many likes"], 1),
  sr("research", "You are researching whether school gardens improve students' diets. Describe how you would find trustworthy evidence, naming two types of source and one check you would make on each.", "Peer-reviewed studies or reports from health departments and universities; check the author's expertise, the date, sample size and method, and whether other sources agree.", "1 mark for each appropriate type of source (max 2). 1 mark for a relevant credibility check."),
  // Critical thinking
  mc("critical-thinking", 1, "'Our team has won three games in a row, so we will definitely win the next one.' What is the flaw in this reasoning?", ["It assumes past results guarantee future ones", "It doesn't name the team", "Three wins is not many", "There is no flaw"], 0),
  mc("critical-thinking", 2, "A company that sells energy drinks funds a study saying energy drinks improve focus. What is the most important question to ask?", ["Is the drink popular?", "Could the funding have influenced how the study was designed or reported?", "What flavour was tested?", "Was the study long?"], 1),
  mc("critical-thinking", 3, "A petition says a new skate park 'will reduce youth crime'. Which response shows the strongest critical thinking?", ["Sign it, because reducing crime is good", "Reject it, because skate parks are noisy", "Ask what evidence supports the claim and whether other towns saw that effect", "Ask how many people have signed"], 2),
  sr("critical-thinking", "A news headline says 'Phones are ruining teenagers' sleep'. Identify two questions you would ask before accepting the headline, and explain why each matters.", "Who did the research and how (sample, method)? Does it show cause or only a link? Are other factors involved? Is the headline exaggerating the study's findings?", "1 mark for each relevant question (max 2). 1 mark for explaining why one of them matters."),
  // Creativity
  mc("creativity", 1, "Your class must raise money for a charity without selling food. Which approach is most likely to produce a creative idea?", ["Do what last year's class did", "List as many ideas as possible first, then combine and improve the best", "Vote on the first idea", "Ask the teacher to choose"], 1),
  mc("creativity", 2, "You are designing a poster to encourage recycling. What would most improve its originality?", ["Copying a famous poster", "Talking to students about why they don't recycle, then designing for that", "Using more colours", "Making the text smaller"], 1),
  mc("creativity", 3, "A design team's first prototype of a lunchbox fails testing. What shows the most creative response?", ["Abandon the project", "Use the test results to try several different redesigns", "Make the same lunchbox in a new colour", "Argue that the test was unfair"], 1),
  sr("creativity", "Suggest two original ways your school could make the library more welcoming for students who rarely visit. Explain how you would test whether one of them works.", "Ideas such as student-curated displays, quiet gaming or study zones, events, a reading challenge. Test by comparing visitor numbers or a survey before and after.", "1 mark for each original, practical idea (max 2). 1 mark for a sensible test."),
  // Decision-making
  mc("decision-making", 1, "You can join one club after school: debating or robotics. What is a good first step?", ["Pick the one your friend picks", "List what you hope to get from a club and compare both against it", "Flip a coin", "Join neither"], 1),
  mc("decision-making", 2, "Your group has $200 for an end-of-term event and two options. Which approach leads to the best decision?", ["The loudest person decides", "Compare costs, benefits and risks of each against what the group wants", "Choose the more expensive one", "Delay until next term"], 1),
  mc("decision-making", 3, "You realise the evening before an assessment that you studied the wrong chapter. Which is the best decision process?", ["Panic and stay up all night", "Check what the assessment covers, prioritise the most important topics, and rest enough to perform", "Skip the assessment", "Study the chapter you already know"], 1),
  sr("decision-making", "Your class must choose between a beach clean-up and a visit to a science museum. Describe a fair way to make this decision and explain why it is fair.", "Agree on criteria (learning, cost, safety, interest), gather information, compare options against the criteria, and let everyone have input (e.g. a vote after discussion).", "1 mark for criteria. 1 mark for comparing the options. 1 mark for explaining why the process is fair."),
  // Collaboration
  mc("collaboration", 1, "One member of your group always finishes their part late. What is the best first step?", ["Complain to others", "Talk with them privately to understand why and agree on a plan", "Do their part without telling them", "Remove them from the group"], 1),
  mc("collaboration", 2, "Your group can't agree on a project topic. Which approach is most collaborative?", ["The group leader decides alone", "Each person explains their idea, then the group looks for a topic that combines strengths", "Pick randomly", "Split up and work alone"], 1),
  mc("collaboration", 3, "In an online group project, messages are getting lost and work is duplicated. What would help most?", ["Send more messages", "Agree on one shared plan with clear roles and deadlines, and check in regularly", "Let each person do everything", "Stop communicating"], 1),
  sr("collaboration", "Describe two things that make a group project work well, and explain how you would handle a disagreement about how to divide the work.", "Clear roles, regular check-ins, listening, shared goals. For disagreements: discuss each person's strengths and workload, agree on a fair split, and record it.", "1 mark for each relevant feature (max 2). 1 mark for a respectful, practical way to resolve the disagreement."),
  // Adaptability
  mc("adaptability", 1, "Your presentation slides won't load on the classroom computer. What shows adaptability?", ["Refuse to present", "Present from your notes and share the slides later", "Ask to present next month", "Blame the computer"], 1),
  mc("adaptability", 2, "Your sports team's usual coach is away and a new coach changes the training plan. What is the best response?", ["Ignore the new plan", "Give the new plan a fair try and ask questions about the changes", "Quit the team", "Complain to the old coach"], 1),
  mc("adaptability", 3, "Halfway through a science investigation, your equipment breaks. What is the most adaptable approach?", ["Make up the remaining results", "Adjust the method with available equipment, record the change, and explain its effect", "Start a completely different topic", "Stop and hand in what you have"], 1),
  sr("adaptability", "Describe a time you had to change your plans because something unexpected happened. What did you do, and what did you learn about adapting?", "A specific situation, the actions taken (re-planning, asking for help, trying a new approach), and a reflection on what they would do next time.", "1 mark for describing the situation. 1 mark for the actions taken. 1 mark for a thoughtful reflection."),
  // ---- More questions, so every skill has offline questions at every complexity (1 Recall to 5 Create).
  // Analytical thinking
  mc("analytical-thinking", 1, "A table shows the number of students in each year level: Year 7 has 182, Year 8 has 175, Year 9 has 190 and Year 10 has 168. Which year level is largest?", ["Year 7", "Year 8", "Year 9", "Year 10"], 2),
  mc("analytical-thinking", 2, "The canteen sold 120 pies on Monday and 60 on Friday. A student says pies are only half as popular on Fridays. What else would you need to know to judge this?", ["The price of the pies", "How many students were at school each day and what else was on sale", "The colour of the packaging", "Who cooked the pies"], 1),
  mc("analytical-thinking", 4, "Report A on bike helmets surveyed 40 riders at one skate park. Report B analysed five years of hospital records across the state. They reach different conclusions. Which evaluation is most reasonable?", ["Report A is better because it talked to real riders", "Report B is stronger evidence because its data is larger and more representative, though it may miss injuries that were never treated", "Both are equally strong", "Neither can be used because they disagree"], 1),
  sr("analytical-thinking", "Your school's data shows that students who do more practice quizzes get higher exam marks. The principal wants to make quizzes compulsory. Evaluate this proposal: what does the data support, what doesn't it show, and what would you recommend?", "The data shows a link between quizzes and marks, but not that quizzes cause higher marks: motivated students may simply do both. Compulsory quizzes might help some students but add workload for others. A trial comparing similar classes with and without compulsory quizzes would show whether they make a difference before deciding.", "1 mark for stating what the data supports (a link). 1 mark for explaining why it doesn't prove cause. 1 mark for weighing a benefit against a drawback. 1 mark for a justified recommendation such as a trial.", 4, 4),
  mc("analytical-thinking", 5, "You want to find out whether a new seating plan reduces noise in class. Which investigation design is strongest?", ["Ask the teacher whether it feels quieter", "Measure noise levels with a sound app for two weeks before and two weeks after the change, at the same times of day", "Try it for one lesson and decide", "Ask students which seating they prefer"], 1),
  sr("analytical-thinking", "Design an investigation to find out whether students learn new vocabulary better with paper flashcards or with a quiz app. Describe your groups, what you would measure, how you would keep the test fair, and how you would analyse the results.", "Randomly split similar students into two groups, give both the same word list and the same study time, and test them on the words before and after. Keep everything else the same (time of day, teacher, word difficulty). Compare the average improvement of each group, look at how spread out the results are, and repeat with the groups swapped if possible.", "1 mark each for: comparable groups; a clear measure such as a before-and-after test; controls that keep the test fair; a sensible way to analyse the results.", 5, 4),
  // Research
  mc("research", 1, "Which of these is a primary source for a report on a local flood?", ["A photo taken by a resident during the flood", "A textbook chapter on weather", "An encyclopedia entry about rivers", "A summary written ten years later"], 0),
  mc("research", 2, "You find a useful fact on a website. What should you record so you can reference it properly?", ["The website's colour scheme", "The author or organisation, the title, the date and the web address", "Only the first sentence", "Nothing, as long as the fact is true"], 1),
  mc("research", 4, "You are researching whether a local creek is polluted. Which combination of sources would give the most trustworthy picture?", ["Social media posts from people who swim there", "Council water-testing data, a university study of the creek, and samples you measure yourself", "A single news story", "An advertisement for water filters"], 1),
  sr("research", "Two sources disagree about whether plastic rubbish in the ocean near Australia is increasing. Explain how you would judge which is more reliable, using at least three criteria, and what you would conclude if both seemed reliable.", "Check who wrote each source and their expertise, how recent it is, how the data was collected (sample size, location, method), whether it has a purpose or bias, and whether other sources agree. If both seem reliable, look for why they differ, such as different areas, time periods or ways of measuring, and report the disagreement with the evidence for each.", "1 mark for each relevant reliability criterion (max 3). 1 mark for a sensible conclusion when both sources seem reliable.", 4, 4),
  mc("research", 5, "You are writing a survey to find out how students travel to school. Which question is best written?", ["Don't you agree that driving to school is bad?", "How did you travel to school today? (walk, bike, bus, car, other)", "Do you travel?", "Why do you dislike the bus?"], 1),
  sr("research", "Plan a small research project to find out what stops students from using the school library. Describe your research question, two ways you would collect information, how you would choose who takes part, and one ethical step you would take.", "A focused question such as 'What are the main reasons Year 9 students don't use the library?'. Methods: an anonymous survey, short interviews, and the library's visit records. Choose participants from every class or at random, not just friends. Ethics: ask for consent, keep answers anonymous and let people opt out.", "1 mark for a clear research question. 1 mark for two suitable methods. 1 mark for a fair way to choose participants. 1 mark for an ethical step.", 5, 4),
  // Critical thinking
  mc("critical-thinking", 1, "'Everyone at my school uses this app, so it must be safe.' What kind of weak reasoning is this?", ["An appeal to popularity", "A fair test", "Expert evidence", "A reliable statistic"], 0),
  mc("critical-thinking", 2, "An advertisement says '9 out of 10 dentists recommend this toothpaste'. What is the best question to ask?", ["How many dentists were asked, and what exactly were they asked?", "What colour is the toothpaste?", "Is the advertisement funny?", "How long is the advertisement?"], 0),
  mc("critical-thinking", 4, "A council says a new bike lane caused a 20% drop in accidents on one road. Accidents also fell 18% in nearby suburbs with no new lanes. What is the strongest evaluation?", ["The bike lane caused the whole drop", "The bike lane probably made little extra difference, because a similar drop happened elsewhere", "The figures must be wrong", "Bike lanes increase accidents"], 1),
  sr("critical-thinking", "A student argues: 'Homework should be banned because a study found that students in countries with less homework are happier.' Evaluate this argument. Identify its main assumption, one weakness in the evidence, and say whether you find it convincing overall.", "It assumes homework is what causes the difference in happiness. Countries differ in many ways (culture, school hours, wealth), so the comparison doesn't isolate homework, and a link is not proof of cause. Overall it isn't convincing without better evidence, such as a comparison of similar schools, although it raises a fair question.", "1 mark for identifying the assumption. 1 mark for a weakness in the evidence. 1 mark for explaining why that weakness matters. 1 mark for a justified overall judgement.", 4, 4),
  mc("critical-thinking", 5, "You want to persuade the school to install more water fountains. Which argument is strongest?", ["Everyone wants them", "Data on how much the existing fountains are used, the cost of each new fountain, and health advice on drinking water", "Other schools have them, so we should too", "It would look nicer"], 1),
  sr("critical-thinking", "Write a short, balanced argument for or against a later school start time. Include a clear claim, two reasons or pieces of evidence, one counter-argument, and your response to it.", "A clear position, supported by reasons such as research on teenagers' sleep patterns or effects on attendance and focus. A fair counter-argument, such as clashes with after-school jobs, sport or parents' work, followed by a reasoned response, such as adjusting the timetable or running a trial first.", "1 mark for a clear claim. 1 mark for two relevant reasons. 1 mark for a fair counter-argument. 1 mark for a reasoned response to it.", 5, 4),
  // Creativity
  mc("creativity", 1, "Which of these is an example of brainstorming?", ["Writing down every idea without judging it, then sorting them later", "Choosing the first idea anyone suggests", "Copying a classmate's work", "Waiting for the teacher's idea"], 0),
  mc("creativity", 2, "Your group needs a name for a new school band. Which approach will most likely lead to an original name?", ["Use the name of a famous band", "Combine words from things the band members care about, then test a shortlist with friends", "Pick the shortest word you know", "Leave the band without a name"], 1),
  mc("creativity", 4, "Three ideas have been suggested to cut queue times at the canteen. Which is the best way to choose between them?", ["Pick the most unusual idea", "Judge each against agreed criteria such as cost, speed and fairness, then trial the strongest", "Pick the cheapest without testing it", "Ask one student"], 1),
  sr("creativity", "A classmate has an idea for an app that helps students plan their homework. Give feedback that would help them improve it: name one strength, one problem, and one specific change, and explain how the change would make the idea better.", "A strength such as reminders or a clear weekly view. A real problem such as too many features, privacy, or students forgetting to enter tasks. A specific change such as linking it to the school calendar so tasks appear automatically, which makes it easier to use and more likely to be used.", "1 mark for a strength. 1 mark for a real problem. 1 mark for a specific change. 1 mark for explaining how the change improves the idea.", 4, 4),
  mc("creativity", 5, "You are designing a game to teach Year 7 students about saving water. What should you do first?", ["Choose the colours", "Find out what Year 7 students already know and enjoy, then sketch several different game ideas", "Write the instructions", "Choose a prize for winners"], 1),
  sr("creativity", "Invent a new event or activity that would bring together students from different year levels at your school. Describe the idea, explain what makes it original, how you would test it on a small scale, and how you would improve it after the test.", "A clear, practical idea such as a mixed-year design challenge or a buddy project, with a reason it is different from existing events. A small trial with one or two classes, collecting feedback and attendance, then specific changes based on what was learned.", "1 mark for a clear idea. 1 mark for explaining what makes it original. 1 mark for a small-scale test. 1 mark for how feedback would improve it.", 5, 4),
  // Decision-making
  mc("decision-making", 1, "Which of these is a decision based on evidence?", ["Choosing a laptop after comparing battery life and reviews", "Choosing a laptop only because of its colour", "Choosing whatever is on the top shelf", "Letting someone else decide without asking why"], 0),
  mc("decision-making", 2, "You have two assignments due on the same day. What is the best way to decide which to start first?", ["Start with whichever is more fun", "Compare how long each will take and how much each is worth, then plan your time", "Leave both until the night before", "Ask for both to be cancelled"], 1),
  mc("decision-making", 4, "The student council must choose between new sports equipment and a quiet study room. Most students surveyed want equipment, but a smaller group says they have nowhere to study. What is the strongest decision approach?", ["Equipment, because more people want it", "Weigh how many people benefit against how much each group needs it, and look for a way to meet both needs", "The study room, because studying matters more", "Spend nothing this year"], 1),
  sr("decision-making", "Your family is choosing between two second-hand bikes for you: one cheaper but older, one newer but more expensive. Evaluate the options using at least three criteria, and make a justified recommendation.", "Compare both bikes on price, condition and safety, likely repair costs and how long each will last, size and fit, and features. Then recommend one, with reasons drawn from the comparison (for example, the newer bike if lower repair costs make up for the higher price).", "1 mark for each relevant criterion applied to both bikes (max 3). 1 mark for a recommendation justified by the comparison.", 4, 4),
  mc("decision-making", 5, "Your class is planning how to cut the school's electricity use. Which plan shows the best decision-making?", ["Switch everything off at 9 am", "Measure where electricity is used, choose the biggest practical savings, set a target and review the results each term", "Ask students to feel guilty", "Buy new equipment straight away"], 1),
  sr("decision-making", "Create a decision guide (a set of steps or questions) that a Year 7 student could use when choosing elective subjects. Explain why each step is useful.", "Steps such as: list your interests; think about your strengths; consider future study or career goals; check the workload; talk to teachers and older students; compare options against what matters to you; decide, then review after a term. Each step has a reason.", "1 mark for a clear sequence of steps. 1 mark for covering interests and future goals. 1 mark for gathering information from other people. 1 mark for explaining why the steps are useful.", 5, 4),
  // Collaboration
  mc("collaboration", 1, "In a group discussion, what is the best thing to do while someone else is speaking?", ["Listen and wait for them to finish", "Start typing your own ideas", "Talk over them", "Leave the group"], 0),
  mc("collaboration", 2, "Your group has four tasks and four members with different strengths. What is the best way to share the work?", ["Give everything to the strongest member", "Match tasks to strengths, agree on deadlines and check in halfway", "Let each person pick at random", "Do it all yourself"], 1),
  mc("collaboration", 4, "After a group project, one member says they felt left out of decisions. What is the most useful response for the group?", ["Ignore it, because the project is finished", "Talk about what happened and agree on changes for next time, such as taking turns to lead", "Tell them it was their own fault", "Never work together again"], 1),
  sr("collaboration", "Your group's project got a lower mark than expected. Evaluate how well the group worked together: describe two teamwork problems (real or likely) and two changes you would make next time.", "Problems such as unclear roles, poor communication, an uneven workload or starting too late. Matching changes such as a shared plan with named roles, regular check-ins, agreed deadlines and giving each other feedback before handing in.", "1 mark for each teamwork problem identified (max 2). 1 mark for each matching change (max 2).", 4, 4),
  mc("collaboration", 5, "You are setting up a group of students from three schools to run a joint environmental project online. What should you organise first?", ["A logo", "Shared goals, roles, a way to communicate and a meeting schedule", "A prize for the best school", "Separate projects for each school"], 1),
  sr("collaboration", "Design a set of group rules (a team charter) for a four-person project. Include at least three rules, how the group will make decisions, and what it will do if someone doesn't do their share.", "Specific rules such as replying within a day, meeting once a week and respecting every idea. Decisions made by discussion and then a vote. If someone falls behind: talk to them privately first, rearrange tasks if needed, and tell the teacher if it continues.", "1 mark for at least three sensible rules. 1 mark for a fair way to make decisions. 1 mark for a clear plan when work is uneven. 1 mark for rules that are specific and workable.", 5, 4),
  // Adaptability
  mc("adaptability", 1, "Your bus is cancelled on the morning of a school excursion. What is the most adaptable first step?", ["Go back to bed", "Tell your teacher and find another way to get there", "Wait until the next day", "Blame the bus driver"], 1),
  mc("adaptability", 2, "Your teacher changes an assignment from a poster to a short video. What is the best response?", ["Make the poster anyway", "Ask what's expected in the video and adjust your plan", "Refuse to do it", "Wait until the last day"], 1),
  mc("adaptability", 4, "Your group's survey got very few responses, so your planned graphs won't mean much. Which response is most adaptable?", ["Make up extra responses", "Explain the small sample, add interviews or observations, and adjust your conclusions", "Hand in the graphs without mentioning the problem", "Give up on the project"], 1),
  sr("adaptability", "Your school moves classes online for a week with little notice. Evaluate two challenges this creates for students and suggest a practical strategy for each, explaining why it would work.", "Challenges such as losing a routine, staying motivated, access to a device or internet, communicating with teachers, or distractions at home. Strategies such as a daily timetable, regular check-ins with a friend or teacher, borrowing a school device, or setting up a quiet work space, each with a reason.", "1 mark for each challenge (max 2). 1 mark for each matching strategy with a reason (max 2).", 4, 4),
  mc("adaptability", 5, "You are planning an outdoor school event in a month when the weather is unpredictable. Which plan is most adaptable?", ["Plan only for sunshine", "Book an indoor backup venue, set a time to decide, and choose activities that work in both places", "Cancel the event now", "Hold it whenever it happens to be sunny"], 1),
  sr("adaptability", "Create a backup plan for a class performance in case the lead performer is sick on the day. Describe at least three parts of the plan and explain how everyone would know what to do.", "Parts such as a rehearsed understudy, scripts on hand, roles that can be adjusted, and a rehearsal of the backup version. Communication through a group message or the teacher, a simple checklist, and a set time to decide.", "1 mark for each part of the plan (max 3). 1 mark for a clear way to communicate the plan.", 5, 4),
];

/** A deliberately flawed copy (two identical options), so the validator has something to catch. */
export function flawedCopy(item: PoolItem): PoolItem {
  if (item.type !== "multiple_choice" || !item.options) return { ...item, rubric: "" };
  const options = [...item.options];
  const wrong = options.findIndex((_, i) => i !== item.correct);
  const other = options.findIndex((_, i) => i !== item.correct && i !== wrong);
  if (wrong >= 0 && other >= 0) options[other] = options[wrong];
  return { ...item, options };
}

/** Rule-based checks: the offline validator. */
export function offlineVerdict(item: PoolItem, bankPrompts: string[]) {
  const issues: string[] = [];
  if (item.prompt.trim().length < 25) issues.push("The question is too short to be clear.");
  if (item.type === "multiple_choice") {
    const options = item.options ?? [];
    if (options.length < 3) issues.push("Multiple-choice questions need at least three options.");
    if (new Set(options.map((o) => o.trim().toLowerCase())).size !== options.length) issues.push("Two options are identical, so there isn't a single best answer.");
    if (item.correct === undefined || item.correct < 0 || item.correct >= options.length) issues.push("The answer key doesn't point to one of the options.");
  } else if (!item.rubric?.trim() || !item.modelAnswer?.trim()) {
    issues.push("A written question needs both a model answer and a marking guide.");
  }
  const closest = Math.max(0, ...bankPrompts.map((p) => similarity(p, item.prompt)));
  if (closest > 0.6) issues.push("It is too similar to a question already in the bank.");
  return {
    passed: issues.length === 0,
    answerKeyCorrect: !issues.some((i) => i.includes("answer key") || i.includes("identical")),
    singleBestAnswer: !issues.some((i) => i.includes("identical")),
    skillAlignment: "strong" as const,
    complexityEstimate: item.complexity,
    ageAppropriate: true,
    issues,
    suggestedFix: issues.length ? "Rewrite the question to fix the issues listed." : "",
  };
}

/** Offline marking: overlap with the model answer and marking guide. */
export function offlineMarks(questions: { itemId: string; answer: string; modelAnswer: string; rubric: string; maxPoints: number }[]) {
  return questions.map((q) => {
    const answer = q.answer.trim();
    if (!answer) return { itemId: q.itemId, points: 0, rationale: "No answer was written.", confidence: "high" as const };
    const overlap = Math.max(similarity(answer, q.modelAnswer), similarity(answer, `${q.modelAnswer} ${q.rubric}`));
    const ratio = Math.min(1, overlap / 0.25 + (answer.split(/\s+/).length > 25 ? 0.15 : 0));
    const points = Math.round(ratio * q.maxPoints * 2) / 2;
    return {
      itemId: q.itemId,
      points,
      rationale: `Offline estimate from overlap with the model answer (${Math.round(overlap * 100)}%). Check against the marking guide.`,
      confidence: "low" as const,
    };
  });
}

/** Offline feedback: built from the strongest and weakest skills. */
export function offlineFeedback(skills: { skill: string; percent: number }[], percent: number) {
  const sorted = [...skills].sort((a, b) => b.percent - a.percent);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const opener = percent >= 75 ? "Well done on a strong result." : percent >= 50 ? "A solid effort." : "Thank you for your effort.";
  const strength = best ? ` Your strongest area was ${best.skill} (${best.percent}%).` : "";
  const next = worst && worst !== best ? ` Next, focus on ${worst.skill}: explain your reasoning step by step and check each option before choosing.` : " Next, explain your reasoning in more detail.";
  return `${opener}${strength}${next}`;
}
