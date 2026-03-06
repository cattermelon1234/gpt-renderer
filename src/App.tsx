import { For, Show, createEffect, createMemo, createSignal, on } from 'solid-js';
import { marked } from 'marked';
import hljs from 'highlight.js';
import DOMPurify from 'dompurify';
import renderMathInElement from 'katex/contrib/auto-render';

type ChatRole = 'user' | 'assistant';

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

const MODEL = 'qwen2.5-coder:14b';
const SYSTEM_PROMPT =
  'Format all mathematical expressions using LaTeX delimiters. Use inline math as $...$ and display math as $$...$$. Do not emit bare math like x^2 without delimiters.';
const SILENT_MATH_SUFFIX =
  '\n\n[Silent instruction: Please write all mathematical expressions in valid LaTeX delimiters using $...$ for inline math and $$...$$ for display math.]';

marked.setOptions({
  gfm: true,
  breaks: true
});

marked.use({
  renderer: {
    code(token) {
      const language = token.lang?.trim() || 'plaintext';
      const rawCode = token.text;
      const highlighted = hljs.getLanguage(language)
        ? hljs.highlight(rawCode, { language }).value
        : hljs.highlightAuto(rawCode).value;
      return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`;
    }
  }
});

function autoWrapBareMath(input: string): string {
  const protectedPattern =
    /(```[\s\S]*?```|`[^`\n]*`|\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$(?:\\.|[^$\n])+\$)/g;
  const parts = input.split(protectedPattern);

  const isProtected = (segment: string): boolean => {
    return /^(?:```[\s\S]*```|`[^`\n]*`|\$\$[\s\S]*\$\$|\\\[[\s\S]*\\\]|\\\([\s\S]*\\\)|\$(?:\\.|[^$\n])+\$)$/.test(
      segment
    );
  };

  const looksLikeMath = (expr: string): boolean => {
    const compact = expr.trim();
    return /\\[a-zA-Z]+|[=^_]|(?:\d+[a-zA-Z]|[a-zA-Z]\d)|[+\-*/]|∫|√|\b(?:sin|cos|tan|log|ln)\b/.test(compact);
  };

  return parts
    .map((part) => {
      if (isProtected(part)) {
        return part;
      }

      let normalized = part;

      // Convert multiline bracketed math blocks to display math.
      normalized = normalized.replace(/(?:^|\n)\s*\[\s*\n([\s\S]*?)\n\s*\](?=\n|$)/g, (_m, expr: string) => {
        if (!looksLikeMath(expr)) {
          return _m;
        }
        return `\n$$\n${expr.trim()}\n$$`;
      });

      // Convert single-line bracketed math like [f'(x)=6x], but avoid markdown links [text](url).
      normalized = normalized.replace(/\[\s*([^\]\n]+?)\s*\](?!\()/g, (m, expr: string) => {
        if (!looksLikeMath(expr)) {
          return m;
        }
        return `$$${expr.trim()}$$`;
      });

      // Convert parenthesized math like (f(x)=3x^2+1) to inline math.
      normalized = normalized.replace(/\(\s*([^\)\n]+?)\s*\)/g, (m, expr: string) => {
        if (!looksLikeMath(expr)) {
          return m;
        }
        return `$${expr.trim()}$`;
      });

      // Wrap bare superscripts like x^2, y^10, n^k as inline math.
      normalized = normalized.replace(
        /(^|[\s(,;:])((?:\d+)?[A-Za-z](?:[A-Za-z0-9]*)\^(?:\{[^}]+\}|[A-Za-z0-9+\-]+))(?=$|[\s).,;:!?])/g,
        '$1$$$2$$'
      );

      return normalized;
    })
    .join('');
}

function MarkdownMessage(props: { content: string }) {
  let containerRef: HTMLDivElement | undefined;

  const sanitizedHtml = createMemo(() => {
    const html = marked.parse(autoWrapBareMath(props.content)) as string;
    return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  });

  createEffect(
    on(sanitizedHtml, () => {
      if (!containerRef) {
        return;
      }

      renderMathInElement(containerRef, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false },
          { left: '\\[', right: '\\]', display: true }
        ],
        throwOnError: false
      });
    })
  );

  return <div ref={containerRef} class="md-body" innerHTML={sanitizedHtml()} />;
}

export default function App() {
  const [messages, setMessages] = createSignal<ChatMessage[]>([
    {
      id: crypto.randomUUID(),
      role: 'assistant',
      content:
        'You are connected to local Ollama. I render Markdown, fenced code blocks, and LaTeX like $E=mc^2$ and $$\\int_0^1 x^2 dx$$ automatically.'
    }
  ]);
  const [input, setInput] = createSignal('');
  const [isLoading, setIsLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  let endRef: HTMLDivElement | undefined;

  const toModelContent = (role: ChatRole, content: string): string => {
    if (role !== 'user') {
      return content;
    }
    return `${content}${SILENT_MATH_SUFFIX}`;
  };

  createEffect(() => {
    messages();
    isLoading();
    queueMicrotask(() => endRef?.scrollIntoView({ behavior: 'smooth', block: 'end' }));
  });

  const appendAssistantChunk = (assistantId: string, token: string) => {
    setMessages((prev) => prev.map((msg) => (msg.id === assistantId ? { ...msg, content: msg.content + token } : msg)));
  };

  const sendMessage = async () => {
    const trimmed = input().trim();
    if (!trimmed || isLoading()) {
      return;
    }

    setError(null);
    setInput('');
    setIsLoading(true);

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed
    };

    const assistantId = crypto.randomUUID();
    const history = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...[...messages(), userMessage].map((msg) => ({ role: msg.role, content: toModelContent(msg.role, msg.content) }))
    ];

    setMessages((prev) => [...prev, userMessage, { id: assistantId, role: 'assistant', content: '' }]);

    try {
      const response = await fetch('/api/ollama/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          stream: true,
          messages: history
        })
      });

      if (!response.ok || !response.body) {
        throw new Error(`Request failed: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }

          const chunk = JSON.parse(line) as {
            message?: { content?: string };
            error?: string;
          };

          if (chunk.error) {
            throw new Error(chunk.error);
          }

          const token = chunk.message?.content ?? '';
          if (token) {
            appendAssistantChunk(assistantId, token);
          }
        }
      }
    } catch (err) {
      const details = err instanceof Error ? err.message : 'Unknown error';
      setError(`Could not reach local Ollama (${details}). Make sure Ollama is running on 127.0.0.1:11434.`);
      setMessages((prev) => prev.filter((msg) => msg.id !== assistantId));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">ChatGPT Local</div>
        <div class="meta">
          <p>Model</p>
          <code>{MODEL}</code>
          <p>Local Endpoint</p>
          <code>http://127.0.0.1:11434</code>
        </div>
      </aside>

      <main class="chat-pane">
        <header class="chat-header">
          <h1>Local Chat</h1>
          <span>{isLoading() ? 'Thinking...' : 'Ready'}</span>
        </header>

        <section class="messages" aria-live="polite">
          <For each={messages()}>
            {(message) => (
              <article class={`message-row ${message.role}`}>
                <div class="message-inner">
                  <Show when={message.role === 'assistant'} fallback={<p>{message.content}</p>}>
                    <MarkdownMessage content={message.content} />
                  </Show>
                </div>
              </article>
            )}
          </For>
          <div ref={endRef} />
        </section>

        <Show when={error()}>
          <div class="error-banner">{error()}</div>
        </Show>

        <form
          class="composer"
          onSubmit={(event) => {
            event.preventDefault();
            void sendMessage();
          }}
        >
          <textarea
            value={input()}
            onInput={(event) => setInput(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void sendMessage();
              }
            }}
            rows={2}
            placeholder="Message qwen2.5-coder:14b"
          />
          <button type="submit" disabled={!input().trim() || isLoading()}>
            Send
          </button>
        </form>
      </main>
    </div>
  );
}
