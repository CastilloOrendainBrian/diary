import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownView } from "../../src/client/components/MarkdownView";

const TABLE = `| a1 | b1 | 1 | 1 | 1 |
|----|----|----|----|----|
| a2 | b2 | c2 | d2 | e2 |`;

describe("MarkdownView", () => {
  it("renders GitHub-style tables", () => {
    const html = renderToStaticMarkup(<MarkdownView source={TABLE} />);

    expect(html).toContain("<table");
    expect(html.match(/<th[ >]/g)).toHaveLength(5);
    expect(html.match(/<tr/g)).toHaveLength(2);
    expect(html).toContain("e2");
  });

  it("drops raw HTML from note content", () => {
    const html = renderToStaticMarkup(
      <MarkdownView source={'<img src=x onerror="alert(1)"> **ok**'} />,
    );

    expect(html).not.toContain("onerror");
    expect(html).toContain("<strong>ok</strong>");
  });
});
