export type SyntaxNode = {
  readonly type: string;
  readonly text: string;
  readonly startPosition: { row: number; column: number };
  readonly endPosition: { row: number; column: number };
  readonly startIndex: number;
  readonly endIndex: number;
  readonly namedChildren: SyntaxNode[];
  readonly children: SyntaxNode[];
  readonly childCount: number;
  readonly namedChildCount: number;
  readonly parent?: SyntaxNode | null;
  childForFieldName(name: string): SyntaxNode | null;
  descendantForPosition?(pos: { row: number; column: number }): SyntaxNode;
};

export type SyntaxTree = {
  readonly rootNode: SyntaxNode;
};

export function rootOf(tree: unknown): SyntaxNode {
  return (tree as SyntaxTree).rootNode;
}

export function line1Based(node: SyntaxNode): number {
  return node.startPosition.row + 1;
}

export function walk(node: SyntaxNode, visitor: (n: SyntaxNode) => boolean | void): void {
  const stop = visitor(node);
  if (stop === false) return;
  for (const child of node.namedChildren) walk(child, visitor);
}

export function findAll(
  node: SyntaxNode,
  predicate: (n: SyntaxNode) => boolean,
): SyntaxNode[] {
  const result: SyntaxNode[] = [];
  walk(node, (n) => {
    if (predicate(n)) result.push(n);
  });
  return result;
}

export function firstNamedChildOfType(node: SyntaxNode, type: string): SyntaxNode | null {
  for (const child of node.namedChildren) if (child.type === type) return child;
  return null;
}

export function namedChildrenOfType(node: SyntaxNode, type: string): SyntaxNode[] {
  return node.namedChildren.filter((c) => c.type === type);
}

export function childText(node: SyntaxNode, fieldName: string): string | null {
  const child = node.childForFieldName(fieldName);
  return child ? child.text : null;
}
