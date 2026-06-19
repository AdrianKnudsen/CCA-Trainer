/* ============================================================
   CCA Trainer · logic
   ------------------------------------------------------------
   Question bank, state + storage, rendering and the exam clock.
   Loaded at the bottom of index.html — i.e. AFTER #app exists in the DOM —
   so we don't have to wait for any "ready" event.

   The styles live in cca-trainer.css.

   Note: the small anti-flash theme script is still INLINE in the
   <head> of index.html. It must run before first paint to avoid flashing
   the wrong theme, and therefore can't wait for this file to download.
   The rest of the theme logic (the toggle button itself) lives down here.
   ============================================================ */

/* ---------- Domains (weights from a community guide, NOT confirmed by Anthropic) ---------- */
const DOMAINS = [
  {
    id: "d1",
    name: "Agentic architecture & orchestration",
    short: "Agentic",
    weight: 27,
    color: "var(--d1)",
    hex: "#B0455D",
  },
  {
    id: "d2",
    name: "Claude Code · config & workflows",
    short: "Claude Code",
    weight: 20,
    color: "var(--d2)",
    hex: "#C98A2E",
  },
  {
    id: "d3",
    name: "Prompt engineering & structured output",
    short: "Prompt",
    weight: 20,
    color: "var(--d3)",
    hex: "#5E7F6E",
  },
  {
    id: "d4",
    name: "Tool design & MCP integration",
    short: "Tool/MCP",
    weight: 18,
    color: "var(--d4)",
    hex: "#4A6B82",
  },
  {
    id: "d5",
    name: "Context management & reliability",
    short: "Context",
    weight: 15,
    color: "var(--d5)",
    hex: "#7A5E8A",
  },
];

/* ---------- Question bank (practice questions, not real exam items) ---------- */
const Q = [
  // D1 — Agentic (10)
  {
    d: "d1",
    q: "A task is well-scoped and deterministic — the same input always produces the same steps. What argues for using a single tool-augmented call instead of a multi-agent system?",
    a: [
      "A multi-agent setup gives higher accuracy on any task, so it's the safest choice",
      "Orchestration adds failure surface and latency with no payoff when the task doesn't need coordination",
      "Agents are cheaper per call, so more agents lower the total cost over time",
      "A single call can't use tools, so an agent is required for anything beyond plain text",
    ],
    c: 1,
    e: "The principle is 'don't add agents you don't need.' Every extra link in an orchestration is one more thing that can fail and cost tokens/time. When the task is well-scoped, the simplest thing that solves it wins.",
  },
  {
    d: "d1",
    q: "An agent loop gets stuck and repeats the same failing tool call over and over. What's the best architectural countermeasure?",
    a: [
      "Increase max_tokens so the agent has more room to think its way out of the situation",
      "Remove the tool from the agent entirely so it can't make the failing call again",
      "Set an iteration limit and detect repeated identical calls, so the loop breaks and escalates",
      "Add an instruction in the prompt telling the agent not to repeat itself unnecessarily",
    ],
    c: 2,
    e: "You need to bound the loop and detect lack of progress. A max-iteration cap plus catching 'same call again' and breaking/escalating is deterministic; a prompt instruction alone is not.",
  },
  {
    d: "d1",
    q: "In an orchestrator/subagent setup you give each subagent its own isolated context. What's the main reason?",
    a: [
      "It reduces the number of API keys you need because each agent reuses the same session",
      "It keeps each agent's context focused and free of context pollution",
      "It lets the agents share memory automatically so they don't have to pass state between them",
      "It's a formal requirement in the MCP specification for all multi-agent systems",
    ],
    c: 1,
    e: "Focused context per agent = less noise, fewer tokens, more reliable answers. When everything shares one growing context, the relevant drowns in the irrelevant.",
  },
  {
    d: "d1",
    q: "You need to classify 100,000 independent documents. It's not urgent — the results can come in a few hours. What's most cost-effective?",
    a: [
      "Send them all as regular real-time calls at once, so the whole job finishes as fast as possible",
      "Use the Batch API — asynchronous processing at lower cost when you can tolerate some delay",
      "Build one big prompt with all the documents, so you avoid the per-call overhead",
      "Run a single autonomous agent that loops through the documents and classifies one at a time",
    ],
    c: 1,
    e: "Match the shape of the workload to the API mode. The Batch API trades latency for lower cost — perfect for high volume of independent tasks with no urgency. (Check the current discount in the live docs.)",
  },
  {
    d: "d1",
    q: "You're designing for graceful failure when an agent can't complete. What's the best pattern?",
    a: [
      "Let the agent keep retrying until it eventually manages to complete the task",
      "Let the agent respond as if it succeeded, so the user doesn't notice anything went wrong",
      "Define an explicit fallback path or escalation, and return a partial result",
      "Crash the process immediately and restart the whole run from the first step",
    ],
    c: 2,
    e: "A reliable system knows what to do when it doesn't know. An explicit fallback + a structured partial result beats both infinite retrying and hallucinated 'success.'",
  },
  {
    d: "d1",
    q: "When do you reach for an orchestrator-worker pattern instead of a single autonomous agent?",
    a: [
      "When the task is small and linear, so the orchestrator can drive the steps in a fixed order",
      "When the subtasks are heterogeneous and each benefits from a specialized worker or parallelism",
      "Always — orchestrator-worker is the most modern pattern and should be the default choice",
      "When you want to save tokens on simple tasks by splitting them into smaller calls",
    ],
    c: 1,
    e: "Orchestrator-worker pays off when you have distinct subtasks that each benefit from a specialized worker, or that can run in parallel. For small linear tasks it's overkill.",
  },
  {
    d: "d1",
    q: "An agent calls tools in a loop. What best prevents the cost from running away?",
    a: [
      "Pick a cheaper model for the agent and trust that the cost stays low enough",
      "Cap the iterations and set a budget for tokens and tool calls, with clear stopping conditions",
      "Turn off logging during the run, since logging is a big part of the cost in long loops",
      "Give the agent fewer tools to choose from, so it makes fewer calls overall",
    ],
    c: 1,
    e: "Explicit budgets and stopping conditions are the architectural brake. Without a cap, a loop can in theory call tools indefinitely.",
  },
  {
    d: "d1",
    q: "An agent occasionally produces an invalid action (wrong arguments). Which safeguard is most robust?",
    a: [
      "Validate tool input and output against a schema, and request a retry on a validation error",
      "Trust raw model output since modern models rarely produce invalid arguments",
      "Log the error for the record and let the agent continue without correcting it",
      "Switch to a larger model, which is less prone to producing invalid actions",
    ],
    c: 0,
    e: "Guardrails: validate against a schema and re-prompt on error. You treat the model's output as something to be verified, not something you can trust blindly.",
  },
  {
    d: "d1",
    q: "When should you NOT use an autonomous agent?",
    a: [
      "When the task is creative and open-ended, because agents can't handle tasks without a single right answer",
      "When you need a deterministic, auditable result every time",
      "When you have many tools available, since that confuses the agent's choice of action",
      "When the user is technical and would rather drive each step of the process themselves",
    ],
    c: 1,
    e: "Autonomy costs predictability. If you need the same auditable output every time (compliance, fixed pipelines), a deterministic flow gives more reliability than an agent that chooses freely.",
  },
  {
    d: "d1",
    q: "Parallelizing independent subtasks across multiple agents primarily improves what?",
    a: [
      "The accuracy of each individual answer, because the agents can check each other's work",
      "Latency and throughput for work that is genuinely independent across the subtasks",
      "The model's underlying knowledge, since more agents cover more subject areas",
      "The security of the system, because the work is spread across several isolated processes",
    ],
    c: 1,
    e: "Parallelism gives you speed/throughput when the tasks don't depend on each other. It doesn't make each individual answer more correct — it just gets you many answers faster.",
  },

  // D2 — Claude Code (7)
  {
    d: "d2",
    q: "What is the main purpose of a CLAUDE.md file in a project?",
    a: [
      "To store API keys, tokens and other secrets the project needs at startup",
      "To give Claude Code persistent project context that's loaded automatically at startup",
      "To replace the project's README so end users have a single file to deal with",
      "To define the CI/CD pipeline that runs automatically when code is pushed to the main branch",
    ],
    c: 1,
    e: "CLAUDE.md is the persistent context layer: how this project fits together, which conventions and commands apply. Never put secrets there.",
  },
  {
    d: "d2",
    q: "A team of 20 works on a monorepo. Where should shared conventions live versus personal preferences?",
    a: [
      "Everything in each developer's personal config, so no one overrides anyone else's setup",
      "Shared conventions in a project-scoped CLAUDE.md committed to the repo, personal ones in user scope",
      "Everything in one global file on a shared server that the whole team points at",
      "Conventions don't need to be written down — experienced developers figure out the pattern on their own",
    ],
    c: 1,
    e: "Shared and committed = the whole team gets the same context. User-scoped config (e.g. ~/.claude) keeps personal preferences private without forcing them on others.",
  },
  {
    d: "d2",
    q: "What are hooks in Claude Code for?",
    a: [
      "To help you write better prompts by suggesting improvements as you work",
      "To run deterministic commands automatically on specific lifecycle events",
      "To connect Claude Code to the internet so it can fetch updated packages itself",
      "To save the conversation history between sessions so context survives a restart",
    ],
    c: 1,
    e: "Hooks are deterministic automation/guardrails tied to events. They're code that's guaranteed to run — not an instruction the model can choose to ignore.",
  },
  {
    d: "d2",
    q: "You want to guarantee that no one edits a sensitive folder. Best mechanism?",
    a: [
      "Write clearly in CLAUDE.md that the folder must not be touched under any circumstances",
      "A hook that catches the action and deterministically denies it before it can happen",
      "Explicitly ask Claude to leave the folder alone at the start of each session",
      "Delete the folder entirely and restore it manually when you actually need it",
    ],
    c: 1,
    e: "A prompt instruction is non-deterministic — it can slip. A hook that blocks the action gives a guarantee, and is the right tool when the requirement is absolute.",
  },
  {
    d: "d2",
    q: "What is MCP server setup in Claude Code for?",
    a: [
      "To host the Claude model locally on your machine so you avoid sending data out",
      "To connect Claude Code to external tools and data sources through a standardized protocol",
      "To compress the context window automatically when a long conversation starts to fill up",
      "To set up a website design with ready-made components Claude can build on",
    ],
    c: 1,
    e: "MCP standardizes how Claude Code reaches out to external systems (databases, APIs, tools). It's the 'plug' between the model and the outside world.",
  },
  {
    d: "d2",
    q: "How are skills best described, conceptually?",
    a: [
      "Third-party language models you download and run alongside Claude locally",
      "Packages of knowledge that Claude loads in when they're relevant",
      "A paid subscription that unlocks extra features in Claude Code",
      "A type of hook that runs automatically before every single tool call",
    ],
    c: 1,
    e: "Skills are on-demand 'folders' of procedure and context that load when the task matches. They expand what Claude *knows how* to do, without filling the context all the time.",
  },
  {
    d: "d2",
    q: "Compliance requirement: every AI change to the codebase must be logged and auditable. Best approach?",
    a: [
      "Trust that the model remembers to log every change it makes along the way",
      "Hooks for deterministic logging and review gates, combined with limited (scoped) access",
      "Turn off the AI tools entirely, since compliance and automation can't be reconciled",
      "Ask the developers to manually write down what was changed after each session",
    ],
    c: 1,
    e: "When the requirement is auditability, you can't rely on the model remembering. Hooks give guaranteed logging/gating, and scoped access limits what can happen at all.",
  },

  // D3 — Prompt engineering (7)
  {
    d: "d3",
    q: "What's the most reliable way to get machine-readable, structured output?",
    a: [
      "Ask the model in prose to respond in JSON, and parse what it returns as text",
      "Use tool use / structured output with an input_schema that forces the right shape",
      "Ask for the answer in Markdown and extract the fields you need from the formatting",
      "Set temperature to 0 and trust that the output is then valid JSON every time",
    ],
    c: 1,
    e: "A schema (via tool use / structured output) gives the model a shape to fill in, and you get a parseable result. Asking for JSON in free text is far more fragile at scale.",
  },
  {
    d: "d3",
    q: "What is prefilling the assistant turn used for?",
    a: [
      "To make the answer longer by giving the model an intro it can build on",
      "To steer the start of the answer — for example forcing JSON by prefilling an opening brace",
      "To hide the system prompt from the model so it can't reveal its instructions",
      "To cache the answer so identical questions later are answered without a new call",
    ],
    c: 1,
    e: "By seeding the start of the assistant's reply you steer the format from the first token. A classic trick: prefill '{' to lock the model into a JSON answer.",
  },
  {
    d: "d3",
    q: "What are XML tags in the prompt primarily good for?",
    a: [
      "Making the prompt nicer to look at without affecting how the model interprets it",
      "Delimiting the input so the model separates instructions, context and data",
      "Saving tokens, because tags compress the text the model has to read through",
      "Enabling tool use, since the model recognizes tags as tool calls",
    ],
    c: 1,
    e: "Clear delimiters (like <context>…</context>) help the model know what's what. It reduces the chance it mixes up your instruction with the data you pasted in.",
  },
  {
    d: "d3",
    q: "Where do durable role and behavior instructions belong?",
    a: [
      "In every single user message, so the model is reminded of the rules each time",
      "In the system prompt; the user message carries the concrete task",
      "In a dedicated tool the model calls to fetch the rules when it needs them",
      "In CLAUDE.md, which applies regardless of what context the call runs in",
    ],
    c: 1,
    e: "The system prompt sets the stable frame (who the model is and which rules apply). The user message is the specific task or input for this particular call.",
  },
  {
    d: "d3",
    q: "When does prompt caching give the most value?",
    a: [
      "On short, unique prompts that never repeat, where every call is completely different",
      "On large, stable prefix content that's reused unchanged across many calls",
      "Only on images and other binary content, not on regular text in the prompt",
      "When you want more creative answers by reusing previously generated answers",
    ],
    c: 1,
    e: "Caching pays off when you send the same heavy prefix (a long system prompt, documents) over and over — then you avoid paying full price for it every time. (Check the current terms in the live docs.)",
  },
  {
    d: "d3",
    q: "You're answering questions based on attached documents and want to reduce hallucination. Best move?",
    a: [
      "Tell the model to be more confident so it stops hesitating and guessing at answers",
      "Instruct it to answer only from the given context, cite the source, and say 'I don't know' when it's missing",
      "Increase temperature for more variation, so it finds several possible answers to choose from",
      "Remove the system prompt so the model isn't unnecessarily constrained by your instructions",
    ],
    c: 1,
    e: "Grounding: tie the answer to the given context, require citation, and give the model an explicit way out ('I don't know') when the answer isn't there. Then it stops making things up.",
  },
  {
    d: "d3",
    q: "When is chain-of-thought / 'thinking' most useful?",
    a: [
      "On simple lookups that need one short factual answer with no intermediate work",
      "On multi-step reasoning tasks where the model needs to think before answering",
      "When you want to make the answer shorter by letting the model summarize along the way",
      "Never — explicit reasoning just wastes tokens without making the answer better",
    ],
    c: 1,
    e: "Explicit reasoning helps on multi-step tasks. You can also separate the thinking from the final, structured answer so the user sees only the conclusion.",
  },

  // D4 — Tool/MCP (7)
  {
    d: "d4",
    q: "What characterizes a good tool description?",
    a: [
      "As short as possible, ideally just the name, to save space in the context",
      "Clear on what the tool does AND when to use it, with well-typed, described parameters",
      "A thorough technical description of how the tool is implemented under the hood",
      "No description is needed as long as the tool's name is descriptive enough",
    ],
    c: 1,
    e: "The model picks tools based on the description. 'What it does + when to use it + clear parameters' produces the right choice and the right arguments. Vague descriptions produce wrong calls.",
  },
  {
    d: "d4",
    q: "What is MCP, in one sentence?",
    a: [
      "A dedicated Claude model specialized for coding and tool use in the terminal",
      "An open protocol that standardizes how apps give models context and tools",
      "A billing system that meters and invoices API usage across tools",
      "A frontend framework for building user interfaces around language models",
    ],
    c: 1,
    e: "The Model Context Protocol is the standardized 'plug' (often compared to USB-C for AI) between a host app and the tools/data sources it exposes.",
  },
  {
    d: "d4",
    q: "What is the role of a tool's input schema?",
    a: [
      "To document the tool for the humans who'll read the code later",
      "To constrain and validate the arguments (JSON schema) so the model produces valid calls",
      "To decide which model should handle the call when the tool is used",
      "To cache the result of the tool call so identical calls don't have to run again",
    ],
    c: 1,
    e: "The schema is the contract for the arguments. It reduces invalid actions by making it clear — and machine-verifiable — what a valid call looks like.",
  },
  {
    d: "d4",
    q: "An MCP server exposes powerful actions (delete, transfer money). Best practice?",
    a: [
      "Expose all actions openly so the model is completely free to solve the task",
      "Limit and scope access, require auth, grant least privilege, and confirm destructive actions",
      "Trust that the model never chooses to do anything dangerous without a good reason",
      "Hide the dangerous tools by leaving them out of the description the model sees",
    ],
    c: 1,
    e: "Least privilege and explicit confirmation on destructive actions. You design for things going wrong — not for the model always behaving.",
  },
  {
    d: "d4",
    q: "In MCP: what does the host/client side do, and what exposes the tools?",
    a: [
      "The server connects to clients, which are the ones that actually provide the model itself",
      "The host/client connects to servers; the servers expose the tools and resources",
      "Both sides do the same thing — the distinction is just a name with no practical meaning",
      "The client exposes the tools, while the server runs the language model itself",
    ],
    c: 1,
    e: "The host app (the client) connects to one or more MCP servers. It's the servers that offer the tools and resources the model can use.",
  },
  {
    d: "d4",
    q: "You've built many overlapping tools. What's the main risk?",
    a: [
      "Higher server cost, because each extra tool has to be kept running all the time",
      "The model picks the wrong tool — keep them distinct, well-scoped and clearly named",
      "Slower responses, since the model has to load all the tools before every single call",
      "No real risk — the more tools the model has, the better it solves tasks",
    ],
    c: 1,
    e: "Overlapping tools confuse the choice. Few, distinct, clearly named tools give more reliable selection than a large, fuzzy arsenal.",
  },
  {
    d: "d4",
    q: "A tool returns an enormous payload. What's the architectural concern?",
    a: [
      "It looks messy in the log, but doesn't affect how the model actually works",
      "It eats context and tokens — return only what's needed, paginate or summarize",
      "Nothing — more data always makes the model respond faster and more precisely",
      "The model automatically ignores what it doesn't need, so the size is irrelevant",
    ],
    c: 1,
    e: "Everything the tool returns ends up in the context and costs tokens and focus. Return what's relevant, paginate or summarize — don't dump raw data.",
  },

  // D5 — Context (5)
  {
    d: "d5",
    q: "A long conversation starts to degrade because the context window is filling up. Best strategy?",
    a: [
      "Send the entire history unchanged every time, so nothing important is ever lost",
      "Summarize and compress older turns, keep what's relevant and drop the noise",
      "Start a brand-new conversation at every message to keep the context as short as possible",
      "Switch to a smaller model, which handles long conversations more efficiently",
    ],
    c: 1,
    e: "Active context management: keep what matters, compress or drop the rest. Just shoving everything in fills the window with noise and weakens the answers.",
  },
  {
    d: "d5",
    q: "What is the main purpose of RAG (retrieval-augmented generation)?",
    a: [
      "To make the model faster by fetching answers from a cache instead of reasoning",
      "To pull relevant external knowledge into the context at query time, so the answer is grounded in sources",
      "To replace the system prompt with documents that drive the model's behavior",
      "To retrain the model on your data so the knowledge is baked in permanently",
    ],
    c: 1,
    e: "RAG retrieves only the relevant part of a large corpus and puts it in the context when needed — that's how you get past the window limit and ground the answer in actual sources.",
  },
  {
    d: "d5",
    q: "Where should the most important instructions be placed in a very long context?",
    a: [
      "In the middle of the biggest chunk of data, where the model reads most carefully",
      "Clearly up front, ideally reinforced — not buried in the middle of an enormous context",
      "Placement doesn't matter — the model weights all context exactly equally",
      "Right at the end, after all the data, since the model remembers what it read last best",
    ],
    c: 1,
    e: "Position matters. Critical instructions belong up front, and can be repeated/reinforced. Buried in a sea of data, they're more likely to be missed.",
  },
  {
    d: "d5",
    q: "What does token budgeting mean in a multi-step workflow?",
    a: [
      "Paying for a certain number of tokens up front to lock in a lower price per call",
      "Deliberately allocating the context — input, reasoning and output — and trimming between steps",
      "Using as few models as possible in the chain to keep total token consumption down",
      "Setting max_tokens to the highest possible value so the answer is never cut off",
    ],
    c: 1,
    e: "You treat the context as a budget you allocate deliberately across the steps, and clean up between them. Otherwise it grows until it hits the ceiling and breaks down.",
  },
  {
    d: "d5",
    q: "Why cache a stable prefix in the context?",
    a: [
      "To make answers more creative by reusing earlier phrasings",
      "To cut repeated cost and latency on content that doesn't change between calls",
      "To extend the context window beyond the model's usual upper limit",
      "To avoid tool use by fetching the answer from cache instead of calling",
    ],
    c: 1,
    e: "An unchanged prefix (a long system prompt, fixed documents) sent over and over doesn't need to be paid for again each time — caching cuts both cost and latency.",
  },

  /* ===== Extended set ===== */

  // D1 — Agentic (10 more)
  {
    d: "d1",
    q: "A complex task has several clearly separate steps. What gives the most reliable result?",
    a: [
      "One big prompt that asks the model to do all the steps at once in a single call",
      "Prompt chaining — break it into discrete steps, each with scoped responsibility and validatable",
      "Let an autonomous agent improvise freely through the steps with no fixed structure",
      "Run the same prompt many times and let the majority of answers decide the result",
    ],
    c: 1,
    e: "Prompt chaining trades a little latency for a lot of reliability: each step is simpler, easier to verify, and errors are caught where they occur instead of propagating through one unwieldy call.",
  },
  {
    d: "d1",
    q: "You want to raise the quality of a generated draft automatically. Which pattern fits?",
    a: [
      "Generate ten drafts in parallel and pick the longest as the most thorough answer",
      "Evaluator-optimizer — one role generates, another critiques in a loop",
      "Crank temperature to max so the model gets more creative on each new attempt",
      "Ask the model to confirm the draft is good enough before it hands it over",
    ],
    c: 1,
    e: "The generator-critic loop pays off when quality can be measured against clear criteria. The critique gives concrete, actionable feedback that the next iteration corrects against — with a stopping condition so it doesn't loop forever.",
  },
  {
    d: "d1",
    q: "Incoming requests are very different (invoice, complaint, technical question). What's a good pattern?",
    a: [
      "One shared prompt that tries to handle all the request types in exactly the same way",
      "Routing — classify the input first, then send it to a handler specialized for each type",
      "Reject anything that isn't an invoice, and ask the user to rephrase the rest of the requests",
      "Run all the handlers in parallel on each request and merge all the answers",
    ],
    c: 1,
    e: "Routing separates classification from handling. Each type gets a prompt/flow tailored to it, instead of one general prompt that does everything halfway.",
  },
  {
    d: "d1",
    q: "An agent can perform an irreversible action (e.g. send money). Where should a human-in-the-loop checkpoint go?",
    a: [
      "After the action is performed, as a log of what the agent actually did",
      "Before the irreversible action is performed — require explicit approval right there",
      "No checkpoint is needed as long as the model is large and capable enough",
      "Only if the user explicitly asks to approve actions in advance",
    ],
    c: 1,
    e: "The checkpoint belongs in front of the irreversible step. Approval after the fact is just a log of something you can no longer stop.",
  },
  {
    d: "d1",
    q: "A business rule MUST apply every time, without exception. Where do you put it?",
    a: [
      "In the prompt, worded clearly enough that the model follows it every single time",
      "In deterministic code around the model, not left to the model's own judgment",
      "As an example in the prompt that the model can imitate in similar cases",
      "In CLAUDE.md, where it's loaded automatically and therefore always applies to the call",
    ],
    c: 1,
    e: "If something must hold absolutely, it can't be left to a probabilistic model. Critical rules belong in code; the model is used where judgment is actually wanted.",
  },
  {
    d: "d1",
    q: "In an agent loop — what's the correct order per step?",
    a: [
      "Call several tools in sequence and read all the results together at the end of the loop",
      "Observe the previous tool result, reason, and choose the next action — then repeat",
      "Choose all the actions in advance and run them through in a fixed order",
      "Skip the result from the previous call and go straight to the next call",
    ],
    c: 1,
    e: "A working agent loop is observe → think → act. Firing off the next call without reading the previous result is acting blind — the agent can't course-correct then.",
  },
  {
    d: "d1",
    q: "A tool an agent uses has side effects and may be called again on retry. What should you design for?",
    a: [
      "Building the tool so robustly that it never fails and therefore never needs a retry",
      "Idempotency — that a repeated call with the same input is safe and doesn't double the effect",
      "Configuring the agent to never retry a failed tool call again",
      "Having the user clean up manually if an action gets performed twice",
    ],
    c: 1,
    e: "Retries happen. If you design side-effecting tools to be idempotent (e.g. with a unique key per operation), a repeat becomes harmless instead of sending the money twice.",
  },
  {
    d: "d1",
    q: "How do you maintain state across turns in an agent flow?",
    a: [
      "The model remembers on its own what was said earlier in the conversation between each call",
      "You pass the relevant state and history explicitly into each call — the model is stateless",
      "State is stored automatically in the model's weights as the conversation develops",
      "It isn't possible in practice to retain state in an agent across multiple turns",
    ],
    c: 1,
    e: "The model has no memory between calls. Any state you need going forward you must carry explicitly in the context for the next call.",
  },
  {
    d: "d1",
    q: "A subagent does a big piece of work. What should it return to the orchestrator?",
    a: [
      "Its entire conversation transcript, so the orchestrator sees everything that happened along the way",
      "A focused summary or result — not its entire internal context",
      "Nothing — the orchestrator guesses the result from the task it originally gave",
      "All intermediate work raw, so nothing is lost on the way back",
    ],
    c: 1,
    e: "The point of isolated subagents is lost if they dump their entire context back. Have them return a compressed result so the orchestrator's context stays clean.",
  },
  {
    d: "d1",
    q: "You have a simple classification and a heavy reasoning task in the same system. Smart cost move?",
    a: [
      "Use the largest model for everything, so you're sure of good quality everywhere in the system",
      "Use a smaller, faster model for the simple part and reserve the large one for the heavy part",
      "Use the smallest model for everything and accept slightly lower quality on the heavy part",
      "Switch models randomly per call to spread the load evenly across the system",
    ],
    c: 1,
    e: "Match model size to task difficulty. Sending trivial routing through the most expensive model is wasteful; save the horsepower for the steps that need it.",
  },

  // D2 — Claude Code (7 more)
  {
    d: "d2",
    q: "Why should CLAUDE.md be kept concise and high-signal?",
    a: [
      "Because long files are cumbersome to commit and create unnecessary merge conflicts on the team",
      "Because it sits in the context all the time — bloated content costs tokens and dilutes what matters",
      "Because Claude only reads the first lines of the file and skips the rest anyway",
      "It doesn't really matter how long it is, as long as the content is actually correct",
    ],
    c: 1,
    e: "CLAUDE.md is always in the context. If you fill it with everything, the important conventions drown and you pay tokens for noise on every single call.",
  },
  {
    d: "d2",
    q: "You want to delegate a scoped subtask without filling the main conversation with noise. What fits?",
    a: [
      "Paste everything relevant into the main conversation so Claude has full visibility at all times",
      "A subagent that solves the subtask in its own context and returns only the result",
      "Restart the whole project with the subtask as the very first priority",
      "Temporarily turn off CLAUDE.md so the context doesn't fill up while you work",
    ],
    c: 1,
    e: "A subagent gets its own context for the subtask and delivers a result back. The main conversation stays clean for what it's actually about.",
  },
  {
    d: "d2",
    q: "What does a permission/allowlist configuration control in Claude Code?",
    a: [
      "Which model is used, depending on how sensitive the task at hand is",
      "Which tools and commands Claude Code is allowed to run without asking permission first",
      "The color theme and general appearance in the terminal while Claude Code runs the session",
      "How fast the response comes, by prioritizing the approved commands highest",
    ],
    c: 1,
    e: "Permissions decide what can run automatically versus what requires confirmation. It's a security and control layer, especially important in teams and automated setups.",
  },
  {
    d: "d2",
    q: "You have conventions that apply to the whole repo, and some that apply to just one subfolder. How is that best solved?",
    a: [
      "Everything in one CLAUDE.md at the root, with clear headings for each folder",
      "A CLAUDE.md at the root for the shared parts, and a more specific one in the subfolder for the local parts",
      "Repeat the whole set of conventions in a separate CLAUDE.md in every single folder of the repo",
      "Put the subfolder rules as comments in the code where they're meant to apply",
    ],
    c: 1,
    e: "CLAUDE.md files can live in a hierarchy. The general stuff belongs at the root; what applies only to part of the codebase goes closer to where it applies.",
  },
  {
    d: "d2",
    q: "What is a plugin in Claude Code, conceptually?",
    a: [
      "A single reusable prompt you can call up with a short command when needed",
      "A package that bundles commands, subagents, hooks and/or MCP setup for distribution",
      "A pricing plan that unlocks extra capacity and features in Claude Code",
      "A model variant optimized for a particular programming language or framework",
    ],
    c: 1,
    e: "A plugin bundles related functionality (commands, agents, hooks, MCP) so a team can install and share an entire setup in one package.",
  },
  {
    d: "d2",
    q: "An MCP server setup should be available to the whole team in one specific project. Which scope?",
    a: [
      "User scope, which makes the server available to you across all your projects",
      "Project scope committed to the repo, so everyone on the project gets the server where it belongs",
      "A global scope on the machine that no one else on the team can change afterward",
      "MCP servers can't be shared, and must be set up again by each developer",
    ],
    c: 1,
    e: "Project scope committed to the repo gives the whole team the same MCP server exactly where it belongs. User scope would only give it to you.",
  },
  {
    d: "d2",
    q: "What's the practical difference between a hook and an instruction in CLAUDE.md?",
    a: [
      "No real difference — both control Claude Code's behavior in exactly the same way",
      "A hook is code that's guaranteed to run; CLAUDE.md is guidance the model can deviate from",
      "CLAUDE.md runs code automatically, while a hook is just plain text the model reads",
      "Hooks apply only to design tasks, while CLAUDE.md applies only to pure coding tasks",
    ],
    c: 1,
    e: "If you need a guarantee, use a hook — it runs no matter what. CLAUDE.md shapes behavior, but it's still instructions a probabilistic model can interpret or slip on.",
  },

  // D3 — Prompt engineering (7 more)
  {
    d: "d3",
    q: "You want consistent format and behavior on a tricky edge case. What helps most?",
    a: [
      "Ask the model to 'be accurate' and pay extra attention to the difficult special cases",
      "Few-shot — show a few concrete examples of the desired input→output, including the edge case",
      "Turn up temperature so the model explores more ways to handle the case",
      "Make the prompt shorter so the model isn't distracted by too many details at once",
    ],
    c: 1,
    e: "Examples steer more strongly than explanations. A couple of good few-shot examples — especially of the tricky case — show the model precisely what you want, instead of it having to guess.",
  },
  {
    d: "d3",
    q: "What gives the most reliable behavior?",
    a: [
      "Vague instructions that leave the model free to interpret the task however it likes",
      "Explicit, specific instructions about exactly what you want and how",
      "Assuming the model already knows your context and preferences in advance",
      "Leaving out format requirements so the model picks the format it thinks fits best",
    ],
    c: 1,
    e: "The model doesn't read your mind. Whatever you leave unspecified, it fills in by its own judgment — be explicit about format, scope and requirements when it matters.",
  },
  {
    d: "d3",
    q: "You have a very long document and one question about it. What's a good order in the prompt?",
    a: [
      "The question first and the document after, so the model knows what to look for",
      "The long document first, and the question or instruction at the very end",
      "Interleave the document and question so they stay tightly connected throughout the prompt",
      "The order has no bearing on how well the model can answer the question",
    ],
    c: 1,
    e: "With long inputs it pays to put the bulk of the material at the top and the question at the end. That way the model has the instruction fresh in mind as it answers.",
  },
  {
    d: "d3",
    q: "What's an effective way to lock the output to a specific format?",
    a: [
      "Hope the model hits the right format from the context it gets in the question",
      "Give an explicit template or structure, and optionally prefill the start of the answer",
      "Ask for the answer to be 'nice' and neatly formatted when delivered",
      "Set temperature to 1 so the model finds the format that fits best itself",
    ],
    c: 1,
    e: "Show the shape you want — a template, a skeleton, or a prefill of the start. Concrete structure produces consistent output; 'nice' is not a specification.",
  },
  {
    d: "d3",
    q: "What does the temperature parameter control?",
    a: [
      "How long the answer is, by controlling how many tokens the model is allowed to use",
      "The degree of randomness — low gives more consistent answers, high gives more variation",
      "How many tools the model has access to during a single call",
      "The size of the context window and how much the model can read at once",
    ],
    c: 1,
    e: "Temperature is the randomness dial. Low for tasks that need consistency and precision; higher for brainstorming and variation.",
  },
  {
    d: "d3",
    q: "Why set a clear role in the system prompt (e.g. 'you are an experienced auditor')?",
    a: [
      "It makes the answers longer because the model explains more when given a role",
      "It frames the domain, tone and expectations, and raises the relevance of the answers",
      "It's a required field in the API that the call simply fails without",
      "It reduces token cost by cutting down how much the model has to read",
    ],
    c: 1,
    e: "A precise role gives the model a vocabulary and a perspective to answer from. It steers both content and tone toward what you actually need.",
  },
  {
    d: "d3",
    q: "A complex prompt mixes instructions, context, examples and the input itself. What helps?",
    a: [
      "Write it all in one long, flowing sentence so it hangs together as naturally as possible",
      "Split it into clearly labeled sections, for example with XML tags, so the model sees what's what",
      "Remove all structure and let the model figure out the connections entirely on its own",
      "Send just the input without instructions, so the model isn't confused by requirements",
    ],
    c: 1,
    e: "Clear sectioning — instruction, context, examples, input each on their own — keeps the model from confusing your data with the task. XML tags are a common trick for exactly this.",
  },

  // D4 — Tool/MCP (7 more)
  {
    d: "d4",
    q: "An MCP server wants to offer read-only reference data the model can look things up in. Which primitive fits?",
    a: [
      "A tool, since anything the model fetches from the server counts as an action it performs",
      "A resource — contextual, read-only data the server exposes to the model",
      "A hook that runs and pulls the data in automatically before every call to the model",
      "A plugin that bundles the reference data together with the commands that use it",
    ],
    c: 1,
    e: "MCP separates tools (actions the model can perform) from resources (data it can read). Static reference material fits as a resource; actions with effects are tools.",
  },
  {
    d: "d4",
    q: "What characterizes good tool names?",
    a: [
      "Short, cryptic abbreviations that save space in the overall tool list",
      "Clear, action-oriented and unambiguous names that don't overlap with other tools",
      "Random names for variety, so the model doesn't fixate on a single tool",
      "The same name on several related tools so they naturally group together in the list",
    ],
    c: 1,
    e: "The model picks tools partly by name. Unambiguous, descriptive names reduce wrong choices; cryptic or overlapping names invite confusion.",
  },
  {
    d: "d4",
    q: "How should a tool handle an error (e.g. invalid input)?",
    a: [
      "Return nothing and let the model notice on its own that something went wrong with the call",
      "Return a structured, descriptive error message the model can understand and correct against",
      "Crash the whole agent so the error can't propagate further in the run",
      "Pretend everything went fine and return an empty but technically valid result",
    ],
    c: 1,
    e: "A good error message is actionable for the model: it says what was wrong, so the agent can correct and retry. Silent failures leave the model blind.",
  },
  {
    d: "d4",
    q: "What's the difference between MCP over stdio and over HTTP, conceptually?",
    a: [
      "There's no real difference — the choice is just personal preference for the developer",
      "stdio suits local servers on the same machine; HTTP/SSE suits remote servers over the network",
      "stdio is used for images and binary data, while HTTP is used for plain-text communication",
      "HTTP is always insecure, so stdio is the only safe choice in practice",
    ],
    c: 1,
    e: "The transport follows where the server runs: stdio for a local process on the same machine, HTTP-based transport for a server you reach over the network.",
  },
  {
    d: "d4",
    q: "How do you reduce invalid arguments to a tool?",
    a: [
      "Make all parameters free strings so the model is completely free to fill them in",
      "Use precise types and enums in the schema where the values are known and limited",
      "Drop the schema entirely and instead validate the arguments inside the tool code itself",
      "Ask the model to be extra careful when filling in the tool's parameters",
    ],
    c: 1,
    e: "A tight schema makes invalid calls harder. Enums and precise types limit what the model can send, so errors are caught by the contract instead of at runtime.",
  },
  {
    d: "d4",
    q: "When should something be exposed as a resource rather than a tool in MCP?",
    a: [
      "Almost always a resource, since tools are reserved for a few rare special cases",
      "When it's data to read or reference; tools are for actions that actually do something",
      "Almost always a tool, because the model works best when absolutely everything is an action",
      "It's arbitrary which you choose — MCP treats resources and tools exactly the same anyway",
    ],
    c: 1,
    e: "Rule of thumb: data you read → resource; an action that has an effect → tool. The distinction helps both the model and you keep track of what's safe to fetch and what changes something.",
  },
  {
    d: "d4",
    q: "An MCP server needs to authenticate against an external API. Where do the credentials belong?",
    a: [
      "Passed through the model's context in plain text so it can use the key when needed",
      "Handled on the server and integration side — not routed through the model's context",
      "Written into every prompt so the right key is always available for the call",
      "Stored in the tool description the model reads before calling the tool itself",
    ],
    c: 1,
    e: "Secrets should never pass through the model's context. Auth is handled where the server talks to the external system, outside of what the model sees.",
  },

  // D5 — Context (5 more)
  {
    d: "d5",
    q: "Why does the placement of key info in a long context matter?",
    a: [
      "Models in practice only read the very last sentence before they start answering",
      "Models latch on less to info in the middle of a long context than at the start and end",
      "Placement has no real effect — the model weights the entire context exactly equally",
      "Models read the context back to front, so the most important thing should be at the very bottom",
    ],
    c: 1,
    e: "'Lost in the middle': what's buried in the middle of a long window is easier to overlook than what's first or last. Put the critical stuff where it gets seen.",
  },
  {
    d: "d5",
    q: "What's a good chunking strategy for RAG?",
    a: [
      "Chunks as large as possible, so each piece contains as much context as possible",
      "Semantically coherent chunks — large enough to carry meaning, small enough to avoid noise",
      "One word per chunk to give maximum precision in the search for relevant matches",
      "Random splitting, since the content gets ranked on relevance afterward anyway",
    ],
    c: 1,
    e: "Chunk size is a trade-off: too large brings noise and cost, too small loses coherence. The goal is pieces that hang together in meaning, so retrieval fetches something usable.",
  },
  {
    d: "d5",
    q: "A RAG pipeline gives poor answers. What's the most likely root cause to check first?",
    a: [
      "That the model is simply too small, and that a larger model would solve most of it",
      "The quality of what's retrieved — irrelevant retrieval gives irrelevant answers regardless of model",
      "That temperature is set wrong, so the answers are more random than they should be",
      "That the system prompt is too short to give the model enough to go on in its answer",
    ],
    c: 1,
    e: "RAG is only as good as what it retrieves. If the model gets wrong or irrelevant context, it matters little how strong the model is — start debugging at the retrieval stage.",
  },
  {
    d: "d5",
    q: "A large context window means you should fill it completely. True or false?",
    a: [
      "True — more context always gives better answers, so fill as much space as you can",
      "False — excess context can dilute what's relevant and cost unnecessarily, so be selective",
      "True, as long as all the content actually fits within the window's limit",
      "False, because the model ignores everything except the very first tokens anyway",
    ],
    c: 1,
    e: "Space is not an obligation to fill it. Irrelevant filler competes with the important stuff for the model's attention and costs tokens — quality of context beats quantity.",
  },
  {
    d: "d5",
    q: "How do you make a RAG answer verifiable for the user?",
    a: [
      "Tell the model to answer more confidently, so the user feels assured of the result",
      "Return the sources or citations the answer is built on, so the user can verify it themselves",
      "Hide where the information came from, so the answer appears more authoritative and clean",
      "Increase temperature to get the model to phrase the answer more convincingly",
    ],
    c: 1,
    e: "When the answer points back to its sources, the user can check it themselves. Citation makes RAG answers verifiable and builds trust — and makes hallucinations easier to spot.",
  },
];

/* ---------- State + persistence ---------- */
const STORE_KEY = "cca:stats:v1";
const SESSION_KEY = "cca:session:v1";
let mem = {}; // last-resort fallback when neither window.storage nor localStorage works
/* Storage adapter: prefer the host's window.storage; otherwise localStorage so progress
   and a paused session survive a page refresh in a normal browser; finally in-memory.
   Values are always JSON strings, matching the window.storage {value} shape. */
const store = {
  async get(k) {
    if (window.storage) {
      try {
        return await window.storage.get(k);
      } catch (e) {}
    }
    try {
      return { value: localStorage.getItem(k) };
    } catch (e) {
      return { value: k in mem ? mem[k] : null };
    }
  },
  async set(k, v) {
    if (window.storage) {
      try {
        await window.storage.set(k, v);
        return;
      } catch (e) {}
    }
    try {
      localStorage.setItem(k, v);
    } catch (e) {
      mem[k] = v;
    }
  },
  async delete(k) {
    if (window.storage) {
      try {
        await window.storage.delete(k);
        return;
      } catch (e) {}
    }
    try {
      localStorage.removeItem(k);
    } catch (e) {
      delete mem[k];
    }
  },
};
function blankStats() {
  const s = {};
  DOMAINS.forEach((d) => (s[d.id] = { seen: 0, correct: 0 }));
  return s;
}
let stats = blankStats();
let savedSession = null; // paused session loaded from storage

async function loadStats() {
  try {
    const r = await store.get(STORE_KEY);
    if (r && r.value) {
      stats = JSON.parse(r.value);
    }
  } catch (e) {
    /* keep blank stats */
  }
  // backfill any new domains
  DOMAINS.forEach((d) => {
    if (!stats[d.id]) stats[d.id] = { seen: 0, correct: 0 };
  });
}
async function saveStats() {
  try {
    await store.set(STORE_KEY, JSON.stringify(stats));
  } catch (e) {}
}
async function resetStats() {
  stats = blankStats();
  try {
    await store.delete(STORE_KEY);
  } catch (e) {}
  render();
}

/* Persist the in-progress session so it survives a reload */
async function persistSession() {
  if (!session) {
    return;
  }
  try {
    await store.set(SESSION_KEY, JSON.stringify({ mode, focus, session }));
  } catch (e) {}
}
async function loadSavedSession() {
  try {
    const r = await store.get(SESSION_KEY);
    if (r && r.value) {
      savedSession = JSON.parse(r.value);
    }
  } catch (e) {}
}
async function clearSavedSession() {
  savedSession = null;
  try {
    await store.delete(SESSION_KEY);
  } catch (e) {}
}

/* ---------- Session ---------- */
let mode = "study"; // "study" | "exam"
let focus = "weighted"; // "weighted" | domain id
let session = null;

function masteryPct(d) {
  const s = stats[d.id];
  return s.seen ? Math.round((100 * s.correct) / s.seen) : 0;
}
function overallReadiness() {
  // weighted by exam weight; only counts domains you've actually practiced
  let num = 0,
    den = 0;
  DOMAINS.forEach((d) => {
    const s = stats[d.id];
    if (s.seen) {
      num += d.weight * (s.correct / s.seen);
      den += d.weight;
    }
  });
  return den ? Math.round((num / den) * 100) : 0;
}
function totalSeen() {
  return DOMAINS.reduce((a, d) => a + stats[d.id].seen, 0);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* Shuffle a question's answer options and remap the correct index,
   so the right answer isn't always in the same position. */
function shuffleOptions(q) {
  const order = shuffle(q.a.map((_, i) => i));
  return { ...q, a: order.map((i) => q.a[i]), c: order.indexOf(q.c) };
}

function buildSession() {
  let pool;
  if (focus === "weighted") {
    // proportional-ish mix across all domains
    pool = shuffle(Q);
    const n = mode === "exam" ? 15 : 10;
    // weighted sampling: roughly follow exam weights
    const picks = [];
    const byDom = {};
    DOMAINS.forEach(
      (d) => (byDom[d.id] = shuffle(Q.filter((q) => q.d === d.id))),
    );
    const targets = DOMAINS.map((d) => ({
      id: d.id,
      t: Math.max(1, Math.round((n * d.weight) / 100)),
    }));
    targets.forEach((tt) => {
      for (let i = 0; i < tt.t && byDom[tt.id].length; i++) {
        picks.push(byDom[tt.id].pop());
      }
    });
    pool = shuffle(picks);
  } else {
    pool = shuffle(Q.filter((q) => q.d === focus));
  }
  // shuffle the answer options for each picked question (stored in the session,
  // so the order stays stable across pause/resume)
  pool = pool.map(shuffleOptions);
  session = {
    items: pool,
    i: 0,
    answered: false,
    lastPick: null,
    correctCount: 0,
    log: [],
    elapsedMs: 0,
  };
}

/* ---------- Rendering ---------- */
const app = document.getElementById("app");
function dom(id) {
  return DOMAINS.find((d) => d.id === id);
}

function render() {
  if (session) {
    renderQuestion();
    return;
  }
  renderHome();
}

function renderHome() {
  const ready = overallReadiness();
  const seen = totalSeen();
  app.innerHTML = `
    <div class="eyebrow">Claude Certified Architect · Foundations</div>
    <h1>CCA Trainer</h1>
    <p class="lede">Active recall beats passive reading. Practice scenario questions weighted across the five domains, see where you stand per domain, and build toward a pass.</p>

    <div class="card">
      <div class="meter-head">
        <h2>Mastery per domain</h2>
        <span class="sub">width = exam weight · fill = your mastery</span>
      </div>
      <div class="barlabels">
        ${DOMAINS.map(
          (d) => `
          <div class="barlabel" style="flex:${d.weight};">
            <div class="nm">${d.short}</div>
            <div class="wt">${d.weight}%</div>
          </div>`,
        ).join("")}
      </div>
      <div class="bar" role="img" aria-label="Mastery per domain, width corresponds to exam weight">
        ${DOMAINS.map(
          (d) => `
          <div class="seg" style="flex:${d.weight}; background:${d.hex}1f;">
            <div class="fill" style="height:${masteryPct(d)}%; background:${d.hex};"></div>
          </div>`,
        ).join("")}
      </div>
      <div class="legend">
        ${DOMAINS.map((d) => {
          const s = stats[d.id];
          return `
          <div class="row"><span class="dot" style="background:${d.hex}"></span>${d.short}
          <span class="pct">${s.seen ? masteryPct(d) + "% · " + s.correct + "/" + s.seen : "–"}</span></div>`;
        }).join("")}
      </div>
      <div class="readiness">
        <span class="num">${seen ? ready + "%" : "–"}</span>
        <span class="cap">weighted readiness${seen ? "" : " · no practice yet"}</span>
      </div>
    </div>

    ${
      savedSession
        ? `
    <div class="card mt resume">
      <h2>Paused session</h2>
      <p class="resume-meta">${dom(savedSession.session.items[savedSession.session.i].d).short} · question ${savedSession.session.i + 1} / ${savedSession.session.items.length} · ${savedSession.mode === "exam" ? "exam sim" : "practice"}</p>
      <div class="btnrow">
        <button class="btn" id="resumeBtn">Resume session →</button>
        <button class="btn ghost sm" id="dropBtn">Discard</button>
      </div>
    </div>`
        : ""
    }

    <div class="card mt">
      <h2>Start a new session</h2>
      <div class="controls">
        <div class="field">
          <label>Mode</label>
          <div class="opts" id="modeOpts">
            <button class="chip" data-v="study" aria-pressed="${mode === "study"}">Practice · explanations as you go</button>
            <button class="chip" data-v="exam" aria-pressed="${mode === "exam"}">Exam sim · answers at the end</button>
          </div>
        </div>
        <div class="field">
          <label>Focus</label>
          <div class="opts" id="focusOpts">
            <button class="chip" data-v="weighted" aria-pressed="${focus === "weighted"}">Weighted mix</button>
            ${DOMAINS.map((d) => `<button class="chip" data-v="${d.id}" aria-pressed="${focus === d.id}"${focus === d.id ? ` style="background:${d.hex};border-color:${d.hex};color:#fff"` : ""}>${d.short}</button>`).join("")}
          </div>
        </div>
      </div>
      <div class="btnrow">
        <button class="btn" id="startBtn">${savedSession ? "Start new (discard paused) →" : "Start session →"}</button>
        ${seen ? `<button class="btn ghost sm" id="resetBtn">Reset progress</button>` : ""}
      </div>
    </div>

    <div class="disclaimer">
      The questions are practice questions written to test the concepts in the five domains — not real exam items, which are secret and proctored. The domain weights (27/20/20/18/15) come from a community guide and are not confirmed by Anthropic. Pricing, rate limits and context sizes change — verify such numbers in the official documentation before the exam.
    </div>
  `;
  document.getElementById("modeOpts").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    mode = b.dataset.v;
    renderHome();
  });
  document.getElementById("focusOpts").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    focus = b.dataset.v;
    renderHome();
  });
  document.getElementById("startBtn").addEventListener("click", async () => {
    await clearSavedSession();
    buildSession();
    await persistSession();
    render();
  });
  const rb = document.getElementById("resetBtn");
  if (rb) rb.addEventListener("click", resetStats);
  const resB = document.getElementById("resumeBtn");
  if (resB)
    resB.addEventListener("click", () => {
      mode = savedSession.mode;
      focus = savedSession.focus;
      session = savedSession.session;
      savedSession = null;
      render();
    });
  const drpB = document.getElementById("dropBtn");
  if (drpB)
    drpB.addEventListener("click", async () => {
      await clearSavedSession();
      renderHome();
    });
}

function renderQuestion() {
  const it = session.items[session.i];
  const d = dom(it.d);
  const total = session.items.length;
  app.innerHTML = `
    <div class="qmeta">
      <span class="domtag" style="background:${d.hex}">${d.short}</span>
      <div class="qmeta-right">
        ${mode === "exam" ? '<span class="examclock" id="examTimer" aria-hidden="true"></span>' : ""}
        <span class="progress-mini">${session.i + 1} / ${total} · ${mode === "exam" ? "exam sim" : "practice"}</span>
        <button class="link-btn" id="pauseBtn" title="Save and go to overview">Pause</button>
        <button class="link-btn danger" id="abortBtn" title="Discard this session">Quit</button>
      </div>
    </div>
    <div class="card">
      <div class="qtext">${it.q}</div>
      <div class="answers" id="answers">
        ${it.a.map((opt, k) => `<button class="ans" data-k="${k}"><span class="key">${"ABCD"[k]}</span><span>${opt}</span></button>`).join("")}
      </div>
      <div id="explainSlot"></div>
      <div class="btnrow" id="navSlot"></div>
    </div>
  `;
  const answersEl = document.getElementById("answers");
  answersEl.addEventListener("click", (e) => {
    const b = e.target.closest(".ans");
    if (!b || session.answered) return;
    pick(parseInt(b.dataset.k, 10));
  });
  document.getElementById("pauseBtn").addEventListener("click", async () => {
    timerFreeze(); // stop the exam clock; resumes on continue
    await persistSession(); // already persisted, but ensure latest
    await loadSavedSession(); // refresh savedSession for the home banner
    session = null;
    renderHome();
  });
  document.getElementById("abortBtn").addEventListener("click", async () => {
    timerFreeze();
    await clearSavedSession();
    session = null;
    renderHome();
  });
  // If resuming onto an already-answered question, restore its revealed state
  if (session.answered && session.lastPick != null) {
    revealAnswer(session.lastPick);
  }
  // Exam-sim clock (count-up with target); freezes when leaving this screen.
  if (mode === "exam") {
    session.elapsedMs = session.elapsedMs || 0;
    const t = document.getElementById("examTimer");
    if (t) renderTimerInto(t);
    timerEnsureRunning();
  }
}

function revealAnswer(k) {
  const it = session.items[session.i];
  const correct = k === it.c;
  const btns = [...document.querySelectorAll(".ans")];
  btns.forEach((b, idx) => {
    b.setAttribute("disabled", "true");
    if (idx === it.c) b.classList.add("correct");
    if (idx === k && !correct) b.classList.add("wrong");
  });
  if (mode === "study") {
    document.getElementById("explainSlot").innerHTML = `
      <div class="explain">
        <div class="verdict ${correct ? "ok" : "no"}">${correct ? "Correct" : "Wrong"}</div>
        <p>${it.e}</p>
      </div>`;
  }
  const last = session.i === session.items.length - 1;
  document.getElementById("navSlot").innerHTML =
    `<button class="btn" id="nextBtn">${last ? "See summary →" : "Next →"}</button>`;
  document.getElementById("nextBtn").addEventListener("click", next);
}

function pick(k) {
  const it = session.items[session.i];
  const d = dom(it.d);
  session.answered = true;
  session.lastPick = k;
  const correct = k === it.c;
  if (correct) session.correctCount++;
  session.log.push({ d: it.d, correct });
  stats[d.id].seen++;
  if (correct) stats[d.id].correct++;
  saveStats();
  revealAnswer(k);
  persistSession();
}

function next() {
  if (session.i < session.items.length - 1) {
    session.i++;
    session.answered = false;
    session.lastPick = null;
    persistSession();
    renderQuestion();
  } else {
    timerFreeze();
    clearSavedSession();
    renderSummary();
  }
}

function renderSummary() {
  const total = session.items.length;
  const pct = Math.round((100 * session.correctCount) / total);
  // per-domain breakdown for this session
  const byDom = {};
  DOMAINS.forEach((d) => (byDom[d.id] = { seen: 0, correct: 0 }));
  session.log.forEach((l) => {
    byDom[l.d].seen++;
    if (l.correct) byDom[l.d].correct++;
  });
  const practiced = DOMAINS.filter((d) => byDom[d.id].seen > 0);
  // weakest practiced domain
  let weak = null,
    wv = 2;
  practiced.forEach((d) => {
    const r = byDom[d.id].correct / byDom[d.id].seen;
    if (r < wv) {
      wv = r;
      weak = d;
    }
  });
  // Exam-sim total time vs target (count-up clock)
  const examTime =
    mode === "exam"
      ? `<p class="resume-meta">⏱ Total time: ${fmtClock(session.elapsedMs || 0)} · ${(session.elapsedMs || 0) <= SECS_PER_Q * 1000 * total ? "within target ✓" : "over target (" + fmtClock(SECS_PER_Q * 1000 * total) + ")"}</p>`
      : "";

  app.innerHTML = `
    <div class="eyebrow">Session complete</div>
    <h1>${session.correctCount} / ${total} correct</h1>
    <p class="lede">${pct >= 80 ? "Solid. That's around the level you want going into a proctored exam." : pct >= 60 ? "Getting there. Review the weak domains before moving on." : "Early days. Take the weakest domains one at a time in practice mode."}</p>
    ${examTime}

    <div class="card">
      <h2>This session · per domain</h2>
      <div class="sumgrid">
        ${practiced
          .map((d) => {
            const s = byDom[d.id];
            const r = Math.round((100 * s.correct) / s.seen);
            return `
          <div class="sumrow">
            <span class="nm">${d.short}</span>
            <span class="track"><span class="trackfill" style="width:${r}%; background:${d.hex}"></span></span>
            <span class="sc">${s.correct}/${s.seen}</span>
          </div>`;
          })
          .join("")}
      </div>
      ${weak ? `<div class="focusnote">Next focus: <b>${weak.name}</b>. It was the weakest this session — drill it on its own in practice mode until you're consistent.</div>` : ""}
    </div>

    <div class="btnrow">
      <button class="btn" id="againBtn">New session →</button>
      <button class="btn ghost sm" id="homeBtn">To overview</button>
    </div>
  `;
  document.getElementById("againBtn").addEventListener("click", async () => {
    buildSession();
    await persistSession();
    render();
  });
  document.getElementById("homeBtn").addEventListener("click", () => {
    session = null;
    render();
  });
}

/* ---------- Theme toggle ---------- */
const THEME_KEY = "cca:theme:v1";
const MOON_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
const SUN_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';

function currentTheme() {
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

function applyTheme(theme) {
  const dark = theme === "dark";
  if (dark) document.documentElement.setAttribute("data-theme", "dark");
  else document.documentElement.removeAttribute("data-theme");
  const btn = document.getElementById("themeToggle");
  if (btn) {
    btn.innerHTML = dark ? SUN_SVG : MOON_SVG; // sun while dark (click → light); moon while light
    btn.setAttribute("aria-pressed", String(dark));
    const label = dark ? "Switch to light mode" : "Switch to dark mode";
    btn.setAttribute("aria-label", label);
    btn.setAttribute("title", label);
  }
}

function setupThemeToggle() {
  // Sync the button (icon/aria) with whatever the <head> script already set.
  applyTheme(currentTheme());
  const btn = document.getElementById("themeToggle");
  if (btn) {
    btn.addEventListener("click", () => {
      const next = currentTheme() === "dark" ? "light" : "dark";
      applyTheme(next);
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch (e) {
        /* storage blocked */
      }
    });
  }
  // Live-follow OS changes ONLY while no explicit choice is stored.
  if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e) => {
      let hasChoice = false;
      try {
        hasChoice = !!localStorage.getItem(THEME_KEY);
      } catch (_) {}
      if (!hasChoice) applyTheme(e.matches ? "dark" : "light");
    };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange); // older Safari
  }
}

/* ---------- Exam timer (count-up with target; exam mode only) ---------- */
const SECS_PER_Q = 120; // target time budget per question
let timerRunningSince = null; // ms timestamp while ticking, else null (NOT persisted)
let timerInterval = null;
let timerTickCount = 0;

function examTargetMs() {
  return SECS_PER_Q * 1000 * (session ? session.items.length : 0);
}
function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function renderTimerInto(el) {
  const elapsed = session.elapsedMs || 0;
  el.textContent = `⏱ ${fmtClock(elapsed)} / ${fmtClock(examTargetMs())}`;
  el.classList.toggle("over", elapsed >= examTargetMs());
}
function timerTick() {
  if (!session || timerRunningSince == null) return;
  const now = Date.now();
  session.elapsedMs = (session.elapsedMs || 0) + (now - timerRunningSince);
  timerRunningSince = now;
  const el = document.getElementById("examTimer");
  if (el) renderTimerInto(el);
  if (++timerTickCount % 5 === 0) persistSession(); // light periodic save (~5s)
}
function timerEnsureRunning() {
  if (mode !== "exam" || !session) return;
  if (timerRunningSince == null) timerRunningSince = Date.now();
  if (timerInterval == null) timerInterval = setInterval(timerTick, 1000);
}
function timerFreeze() {
  if (timerRunningSince != null && session) {
    session.elapsedMs =
      (session.elapsedMs || 0) + (Date.now() - timerRunningSince);
  }
  timerRunningSince = null;
  if (timerInterval != null) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (session) persistSession();
}

/* ---------- Clear-progress button ---------- */
function setupClearButton() {
  const btn = document.getElementById("clearBtn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (
      confirm(
        "Reset all progress (mastery per domain)? This can't be undone. Your paused session and theme are kept.",
      )
    ) {
      resetStats(); // clears stored stats + re-renders
    }
  });
}

/* ---------- boot ---------- */
setupThemeToggle();
setupClearButton();
(async function () {
  await loadStats();
  await loadSavedSession();
  render();
})();
