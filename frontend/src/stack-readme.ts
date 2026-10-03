import MarkdownIt from "markdown-it";

const markdown = new MarkdownIt({ html: false,
    linkify: true });

export function renderStackReadme(source: string): string {
    return markdown.render(source);
}
