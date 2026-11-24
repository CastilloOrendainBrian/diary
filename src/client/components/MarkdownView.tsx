import Markdown from "react-markdown";

/**
 * Renders note content as Markdown. `skipHtml` drops raw HTML from the source, so user text
 * can never inject markup or scripts; links with unsafe protocols are neutralized by
 * react-markdown's default URL transform.
 */
export function MarkdownView({ source }: { source: string }) {
  return (
    <div className="break-words leading-relaxed text-stone-800 [&_a]:text-emerald-700 [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-stone-300 [&_blockquote]:pl-3 [&_blockquote]:text-stone-600 [&_code]:rounded [&_code]:bg-stone-100 [&_code]:px-1 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:text-lg [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:my-2 [&_strong]:font-semibold">
      <Markdown skipHtml>{source}</Markdown>
    </div>
  );
}
