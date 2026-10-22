// The cost-honesty taxonomy — a single source for the FREE vs $ boundary that the
// Explorer teaches by repetition. Discovery (finding roles) is structurally free:
// it calls no LLM. Only evaluation (scoring a role against your CV) spends tokens,
// and only when the user chooses it. The framing is always local-first: "your key,
// your AI, your machine."

export type CostClass = "free" | "free-network" | "spend" | "free-gemini";

export const COST_META: Record<CostClass, { label: string; tip: string }> = {
  "free-network": {
    label: "Free",
    tip: "Scans the public job boards directly. No AI, so it doesn't count toward your Claude plan, and it writes nothing until you choose to add a role.",
  },
  free: {
    label: "Free",
    tip: "Doesn't use your Claude plan. Reads or writes files on this Mac only.",
  },
  spend: {
    label: "Uses Claude usage",
    tip: "Runs on your own Claude Code login, so it counts toward your Claude plan's usage limits, the same as using Claude Code yourself. It only bills separately if an Anthropic API key is set on this Mac.",
  },
  "free-gemini": {
    label: "Free · Gemini",
    tip: "Evaluate with Google's free Gemini tier. Doesn't use your Claude plan.",
  },
};
