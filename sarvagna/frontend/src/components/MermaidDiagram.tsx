import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  themeVariables: {
    primaryColor: "#7c3aed",
    primaryTextColor: "#f4f4f5",
    primaryBorderColor: "#52525b",
    lineColor: "#a1a1aa",
    secondaryColor: "#18181b",
    tertiaryColor: "#27272a",
    background: "#09090b",
    mainBkg: "#18181b",
    nodeBorder: "#52525b",
    clusterBkg: "#18181b",
    titleColor: "#f4f4f5",
    edgeLabelBackground: "#27272a",
    fontFamily: "ui-monospace, monospace",
  },
});

let _id = 0;

export default function MermaidDiagram({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const id = useRef(`mermaid-${++_id}`).current;

  useEffect(() => {
    if (!ref.current) return;
    setError(false);
    mermaid
      .render(id, code)
      .then(({ svg }) => {
        if (ref.current) ref.current.innerHTML = svg;
      })
      .catch(() => setError(true));
  }, [code, id]);

  if (error) {
    // Fallback: show as plain code block
    return (
      <pre className="bg-zinc-800 rounded-lg p-3 text-xs text-amber-400 overflow-x-auto">
        {code}
      </pre>
    );
  }

  return (
    <div
      ref={ref}
      className="my-3 p-3 bg-zinc-900 rounded-xl border border-zinc-800 overflow-x-auto flex justify-center"
    />
  );
}
