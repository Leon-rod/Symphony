# OpenCode

Es el runner pensado para modelos locales (Ollama, LM Studio, etc.) en los niveles bajos. `sym launch` usa `runners.opencode` en `symphony.yaml`; el `model` se pasa tal cual, así que usá el identificador con el que OpenCode conoce al modelo (por ejemplo `ollama/qwen3.6:27b`). OpenCode lee `AGENTS.md`. Ajustá el template a los flags de tu versión.
