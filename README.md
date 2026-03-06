# DISCLAIMER: FULLY VIBE CODED
# Offline Ollama Chat (SolidJS)

A ChatGPT-style local frontend app (SolidJS + Vite) for Ollama that runs offline and renders:

- Markdown
- LaTeX via KaTeX (`$...$`, `$$...$$`, `\\(...\\)`, `\\[...\\]`)
- Fenced code blocks with syntax highlighting

Configured for local model: `qwen2.5-coder:14b`.

## Prerequisites

- Node.js 20+
- Ollama installed
- Model downloaded locally

```bash
ollama pull qwen2.5-coder:14b
```

## Run

```bash
ollama serve
npm install
npm run dev
```

Open `http://localhost:5173`.

## Build

```bash
npm run build
npm run preview
```

## Offline flight use

Once dependencies are installed and model is pulled, it works without internet as long as Ollama is running locally.
