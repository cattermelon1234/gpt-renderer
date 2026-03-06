declare module 'katex/contrib/auto-render' {
  type Delimiter = {
    left: string;
    right: string;
    display: boolean;
  };

  type RenderMathInElementOptions = {
    delimiters?: Delimiter[];
    throwOnError?: boolean;
  };

  export default function renderMathInElement(element: HTMLElement, options?: RenderMathInElementOptions): void;
}
