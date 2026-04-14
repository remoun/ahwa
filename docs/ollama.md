# Running Ahwa with Ollama

Ahwa can run entirely locally using [Ollama](https://ollama.ai) — no
external API calls, no costs, no data leaving your machine.

## Setup

1. Install Ollama: https://ollama.ai/download

2. Pull a model. Recommended models for deliberation:

   ```bash
   # Good balance of quality and speed
   ollama pull qwen2.5:14b

   # Smaller/faster (less nuanced output)
   ollama pull llama3.1:8b

   # Largest/best quality (needs ~32GB RAM)
   ollama pull qwen2.5:32b
   ```

3. Start Ollama (it usually runs as a service after install):

   ```bash
   ollama serve
   ```

4. Start Ahwa without any API keys — it will auto-detect Ollama:

   ```bash
   bun run dev
   ```

   Or with Docker, set the Ollama URL:

   ```bash
   OLLAMA_BASE_URL=http://host.docker.internal:11434/api docker compose up -d
   ```

## Per-council model selection

You can assign specific Ollama models to specific councils. In the
council editor UI, select "ollama" as the provider and enter the model
name (e.g., `qwen2.5:14b`).

Or edit the council JSON directly:

```json
{
  "model_config": {
    "provider": "ollama",
    "model": "qwen2.5:14b"
  }
}
```

## Tips

- Deliberation quality scales with model size. The default council's
  prompts are tuned for frontier models; smaller models may produce
  shorter, less nuanced output.
- The synthesis step benefits most from a capable model. Consider using
  a larger model for synthesis and a smaller one for persona turns.
- Ollama auto-detects your GPU (NVIDIA via CUDA, Apple Silicon via
  Metal) — no configuration needed. GPU acceleration cuts response
  times from ~30s to ~3s for 8B models. See
  [Ollama GPU docs](https://docs.ollama.com/gpu) for supported
  hardware and troubleshooting.

## Troubleshooting

**"Connection refused" errors**: Make sure Ollama is running
(`ollama serve`) and accessible at the configured URL.

**Docker can't reach Ollama on the host**: Use
`OLLAMA_BASE_URL=http://host.docker.internal:11434/api` on macOS/Windows.
On Linux, use `--network host` or the host's IP address.
