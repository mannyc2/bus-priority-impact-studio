type DirectiveNode = {
  type: string;
  name?: string;
  attributes?: Record<string, string | null | undefined> | null;
  data?: { hName?: string; hProperties?: Record<string, unknown> };
  children?: DirectiveNode[];
};

const DIRECTIVE_TYPES = new Set(["textDirective", "leafDirective", "containerDirective"]);

function cleanAttributes(attributes: DirectiveNode["attributes"]): Record<string, string> {
  const out: Record<string, string> = {};
  if (!attributes) return out;
  for (const [key, value] of Object.entries(attributes)) {
    // `ref` (a block-embed's id) is renamed to `blockref`: React reserves the
    // `ref` prop, so it would be intercepted and never reach the component.
    if (typeof value === "string") out[key === "ref" ? "blockref" : key] = value;
  }
  return out;
}

function walk(node: DirectiveNode, allow: ReadonlySet<string>): void {
  if (DIRECTIVE_TYPES.has(node.type)) {
    const data = node.data ?? (node.data = {});
    if (node.name && allow.has(node.name)) {
      // Allowlisted → become the registry's custom element; attributes → props.
      data.hName = node.name;
      data.hProperties = cleanAttributes(node.attributes);
    } else {
      // Unknown directive → render its content inertly (drop directive semantics),
      // never a custom element and never raw HTML.
      data.hName = node.type === "textDirective" ? "span" : "div";
    }
  }
  if (node.children) {
    for (const child of node.children) walk(child, allow);
  }
}

/**
 * A remark transform that turns allowlisted `remark-directive` nodes into the
 * brief-primitive custom elements (mapped to components in the registry), and
 * degrades any unknown directive to inert text. The allowlist is passed in so the
 * registry stays the single source of truth.
 */
export function remarkBriefDirectives(allow: ReadonlySet<string>) {
  return () => (tree: unknown) => {
    walk(tree as DirectiveNode, allow);
  };
}
