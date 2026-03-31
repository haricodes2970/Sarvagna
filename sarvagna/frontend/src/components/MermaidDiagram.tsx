import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  suppressErrors: true,
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

    // Validate first before rendering to avoid mermaid injecting error bombs
    mermaid.parse(code).then((valid) => {
      if (!valid) { setError(true); return; }
      return mermaid.render(id, code).then(({ svg }) => {
        if (ref.current) ref.current.innerHTML = svg;
        // Remove any stray mermaid error elements from the body
        document.querySelectorAll("#" + id).forEach((el) => {
          if (el !== ref.current?.firstElementChild) el.remove();
        });
      });
    }).catch(() => {
      setError(true);
      // Clean up any error elements mermaid may have injected
      document.querySelectorAll(`[id^="mermaid-"]`).forEach((el) => {
        if (!ref.current?.contains(el)) el.remove();
      });
    });
  }, [code, id]);

  if (error) {
    return (
      <pre className="bg-zinc-800 rounded-lg p-3 text-xs text-amber-400 overflow-x-auto whitespace-pre-wrap">
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
