# Writing Your Own Council

A council is a JSON file that defines a group of AI personas, a
deliberation structure, and a synthesis prompt. Councils live in the
`councils/` directory and are loaded on startup.

## Schema

```json
{
  "id": "my-council",
  "name": "My Council",
  "description": "Optional description shown in the UI.",
  "personas": [
    {
      "id": "persona-1",
      "name": "The Philosopher",
      "emoji": "🤔",
      "system_prompt": "You are a philosopher. You ask deep questions..."
    },
    {
      "id": "persona-2",
      "name": "The Pragmatist",
      "emoji": "🔨",
      "system_prompt": "You are a pragmatist. Focus on what works..."
    }
  ],
  "round_structure": {
    "rounds": [
      {
        "kind": "opening",
        "prompt_suffix": "Give a 2-3 paragraph opening take."
      },
      {
        "kind": "cross_examination",
        "prompt_suffix": "Push back on what's wrong, concede what's right."
      }
    ],
    "synthesize": true
  },
  "synthesis_prompt": "You are a neutral synthesizer. Produce: 1) Areas of convergence, 2) Live disagreements, 3) Recommendation, 4) Confidence level.",
  "model_config": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-20250514"
  }
}
```

## Fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier (used as filename stem) |
| `name` | Yes | Display name in the UI |
| `description` | No | Shown in the council picker |
| `personas` | Yes | Array of persona objects (minimum 1) |
| `round_structure` | Yes | Defines the deliberation rounds |
| `synthesis_prompt` | Yes | System prompt for the synthesizer |
| `model_config` | No | Provider and model override |

### Persona fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier |
| `name` | Yes | Display name |
| `emoji` | Yes | Single emoji for the persona |
| `system_prompt` | Yes | The persona's instructions |
| `requires` | No | Array of feature flags (e.g., `["memory"]`) |

### Round structure

Each round has:
- `kind`: A label for the round type (e.g., `"opening"`, `"cross_examination"`, `"closing"`)
- `prompt_suffix`: Appended to the user message for that round, telling personas how to respond

Set `synthesize: true` to run the synthesis step after all rounds.

### Model config

Optional. If omitted, the council uses the auto-detected default provider.

```json
"model_config": {
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514"
}
```

Supported providers: `anthropic`, `openai`, `openrouter`, `ollama`.

## Tips for writing good councils

1. **Give each persona a distinct lens**, not just a different opinion.
   The Elder thinks in decades; the Engineer thinks in systems; the
   Weaver thinks in relationships. Different lenses produce richer
   deliberation than different conclusions.

2. **Make the synthesis prompt specific.** Generic "summarize the
   discussion" prompts produce mush. Tell the synthesizer exactly what
   to produce: convergence, disagreements, recommendation, confidence.

3. **Include at least one dissenter.** The Instigator, Trickster, or
   Skeptic — someone whose job is to question the premise. Without this,
   councils converge too quickly.

4. **Cross-examination matters.** The second round is where the real
   thinking happens. The opening is just throat-clearing.

5. **Test with a real dilemma.** Run your council against a decision
   you actually faced. If the output is generic, the prompts need work.

## Contributing councils

Community-contributed councils are welcome. To add yours:

1. Create a JSON file in `councils/`
2. Test it against a few real dilemmas
3. Open a pull request

Good candidates: councils for specific communities, traditions, or
domains. See the existing councils for examples.
