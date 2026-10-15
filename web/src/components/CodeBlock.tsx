import type { ReactNode } from "react";

/**
 * Minimal Solidity / TypeScript highlighter with optional diff gutter. No dependency: the
 * snippets are short and fixed, so a line-level tokenizer is enough.
 *
 * Diff mode: each line starts with a 2-char marker, "+ " (added), "- " (removed) or "  " (context).
 */

type Lang = "solidity" | "ts";

const KEYWORDS: Record<Lang, Set<string>> = {
  solidity: new Set([
    "import", "from", "contract", "abstract", "is", "function", "returns", "return", "internal", "external",
    "public", "private", "view", "pure", "override", "virtual", "constructor", "memory", "calldata", "storage",
    "emit", "if", "else", "for", "new", "pragma", "solidity", "initializer", "true", "false",
  ]),
  ts: new Set([
    "import", "from", "const", "let", "await", "async", "new", "return", "export", "function", "if", "else", "true",
    "false",
  ]),
};

const TYPES = new Set(["address", "uint256", "uint64", "uint8", "uint48", "bytes4", "bytes32", "bytes", "bool", "string", "euint64"]);

const TOKEN =
  /(\/\/.*$|\/\*.*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d[\d_]*n?\b)|([A-Za-z_$][\w$]*)(?=\s*\()|([A-Za-z_$][\w$]*)/g;

function highlight(line: string, lang: Lang): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(line))) {
    if (m.index > last) out.push(line.slice(last, m.index));
    const [text, comment, str, num, call, ident] = m;
    let cls = "";
    if (comment) cls = "syn-comment";
    else if (str) cls = "syn-string";
    else if (num) cls = "syn-number";
    else {
      const word = call ?? ident;
      // `from` is only a keyword in import statements; elsewhere it's an identifier (e.g. a parameter).
      const isImportFrom = word !== "from" || /^\s*import\b|^\s*}\s*from\b/.test(line);
      if (KEYWORDS[lang].has(word) && isImportFrom) cls = "syn-keyword";
      else if (TYPES.has(word) || /^[A-Z]/.test(word)) cls = "syn-type";
      else if (call) cls = "syn-fn";
    }
    out.push(cls ? <span key={m.index} className={cls}>{text}</span> : text);
    last = m.index + text.length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

export function CodeBlock({ code, lang, diff = false }: { code: string; lang: Lang; diff?: boolean }) {
  const lines = code.split("\n");
  return (
    <pre className="mt-4 overflow-x-auto rounded-xl border border-line bg-card-2 py-4 font-mono text-[13px] leading-relaxed text-fg">
      {lines.map((raw, i) => {
        const mark = diff ? raw.slice(0, 2) : "  ";
        const text = diff ? raw.slice(2) : raw;
        const kind = mark === "+ " ? "add" : mark === "- " ? "del" : "ctx";
        return (
          <div
            key={i}
            className={`flex min-w-max pr-3 ${kind === "add" ? "diff-add" : kind === "del" ? "diff-del" : ""}`}
          >
            {diff && (
              <span className="w-6 shrink-0 select-none text-center">
                {kind === "add" ? "+" : kind === "del" ? "−" : ""}
              </span>
            )}
            <span className={`${diff ? "" : "pl-4"} whitespace-pre`}>{text ? highlight(text, lang) : " "}</span>
          </div>
        );
      })}
    </pre>
  );
}
