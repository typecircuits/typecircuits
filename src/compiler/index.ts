import * as treesitter from "web-tree-sitter";
import treeSitterWasmUrl from "web-tree-sitter/web-tree-sitter.wasm?url";
import { isConstructedType, type ConstructedType, type Type } from "./solver/type";
import { Solver, type Group } from "./solver/solve";
import type { Show } from "@/App.svelte";
import type { Selector, SelectorValue } from "./selector";

await treesitter.Parser.init({ locateFile: () => treeSitterWasmUrl });

export class Node {
    public id = "";
    public type = "";
    public text = "";
    public startIndex = 0;
    public endIndex = 0;
    public fields: Record<string, (Node | string)[]> = {};
    public childNodes: Node[] = [];
    public parent?: Node;
    public fieldName?: string;

    toString() {
        return this.text.replace(/\n.*/s, " ⋯");
    }

    child(fieldName: string): Node | undefined {
        const value = this.fields[fieldName]?.[0];
        return value instanceof Node ? value : undefined;
    }

    string(fieldName: string): string | undefined {
        const value = this.fields[fieldName]?.[0];
        return typeof value === "string" ? value : undefined;
    }

    children(fieldName?: string): Node[] {
        if (fieldName === undefined) {
            return this.childNodes;
        }

        return this.fields[fieldName]?.filter((value) => value instanceof Node) ?? [];
    }
}

const convertNode = (
    input: treesitter.Node | null | undefined,
    id: { next: number },
    cache: Map<number, Node> = new Map(),
): string | Node | undefined => {
    if (input == null) {
        return undefined;
    }

    if (!input.isNamed) {
        return input.text;
    }

    if (cache.has(input.id)) {
        return cache.get(input.id);
    }

    const nodeId = `node${id.next++}`;

    const childNodes: Node[] = [];
    const fields: Record<string, (Node | string)[]> = {};
    input.children.forEach((child, index) => {
        const node = convertNode(child, id, cache);
        if (node == null) return;

        if (node instanceof Node) {
            childNodes.push(node);
        }

        const fieldName = input.fieldNameForChild(index);
        if (fieldName != null) {
            if (node instanceof Node) {
                node.fieldName = fieldName;
            }

            (fields[fieldName] ??= []).push(node);
        }
    });

    const node = new Node();
    node.id = nodeId;
    node.startIndex = input.startIndex;
    node.endIndex = input.endIndex;
    node.type = input.type;
    node.text = input.text;
    node.childNodes = childNodes;
    node.fields = fields;

    for (const child of childNodes) {
        child.parent = node;
    }

    cache.set(input.id, node);

    return node;
};

export const debugTree = (node: Node, indent = 0) => {
    let s = "  ".repeat(indent);

    if (node.fieldName != null) {
        s += `${node.fieldName}: `;
    }

    s += `(${node.type}) ${node.text}`;

    for (const child of node.childNodes) {
        s += "\n" + debugTree(child, indent + 1);
    }

    return s;
};

export interface Edge {
    from: Node;
    to: Node;
    label: string;
}

export interface Replacement {
    from: Node;
    to: Node | undefined;
}

export type { Group } from "./solver/solve";
export type { Type, ConstructedType } from "./solver/type";

export * from "./selector";

export type Feature = (context: Context) => void;

export class Context {
    edges: Edge[] = [];
    replacements: Replacement[] = [];
    groups: Node[][] = [];
    conflicts: Node[] = [];
    types: [Node, ConstructedType][] = [];
    overloads: [Node, Type][][][] = [];

    constructor(
        public root: Node | undefined,
        public show: Show,
    ) {}

    edge(from: Node, to: Node, label: string) {
        this.edges.push({ from, to, label });
    }

    replace(from: Node, to: Node | undefined) {
        if (to != null) {
            this.group(from, to);
        }

        this.replacements.push({ from, to });
    }

    transparent(node: Node) {
        this.replace(node, undefined);
    }

    atomic(node: Node) {
        for (const child of node.childNodes) {
            this.transparent(child);
            this.atomic(child);
        }
    }

    group(...nodes: Node[]) {
        this.groups.push(nodes);
    }

    conflict(representative: Node) {
        this.conflicts.push(representative);
    }

    type(node: Node, type: Type) {
        if (type == null) {
            // Do nothing
        } else if (isConstructedType(type)) {
            this.types.push([node, type]);
        } else {
            this.group(node, type);
        }
    }

    overload(overloads: [Node, Type][][]) {
        this.overloads.push(overloads);
    }

    temporary() {
        const node = new Node();
        this.transparent(node);
        return node;
    }

    select<S extends Selector<any>>(selectors: S[], callback: (value: SelectorValue<S>) => void) {
        const visit = (node: Node | undefined) => {
            if (node == null) return;

            for (const selector of selectors) {
                selector(node, callback);
            }

            for (const child of node.childNodes) {
                visit(child);
            }
        };

        visit(this.root);
    }

    hasChild(parent: Node, child: Node): boolean {
        if (parent === child) {
            return true;
        }

        for (const node of parent.childNodes) {
            if (this.hasChild(node, child)) {
                return true;
            }
        }

        return false;
    }
}

const compile = (root: Node | undefined, features: Feature[], show: Show) => {
    const context = new Context(root, show);

    for (const feature of features) {
        try {
            feature(context);
        } catch (error) {
            console.error(error);
        }
    }

    const replace = (node: Node | undefined) => {
        while (true) {
            let progress = false;

            for (const replacement of context.replacements) {
                if (replacement.from === node) {
                    node = replacement.to;
                    progress = true;
                }
            }

            if (!progress) {
                break;
            }
        }

        return node;
    };

    const solver = new Solver(context);

    const groups = solver.run();

    if (!show.functions) {
        for (const group of groups.groups.values()) {
            const hasFunctionType = group.types.some(
                (type) => isConstructedType(type) && type.kind === "function",
            );

            if (hasFunctionType) {
                for (const node of group.nodes) {
                    context.transparent(node);
                }
            }
        }
    }

    const nodes = [
        ...new Set(
            groups
                .nodes()
                .map(replace)
                .filter((node) => node != null),
        ),
    ];

    // Sort nodes by source location
    nodes.sort((a, b) => {
        if (a.startIndex !== b.startIndex) {
            return a.startIndex - b.startIndex;
        }

        return a.endIndex - b.endIndex;
    });

    // Collapse edges
    let edges = [...context.edges];
    while (true) {
        let progress = false;
        edges = edges.flatMap((edge) => {
            const from = replace(edge.from);
            const to = replace(edge.to);

            if (from != null && to != null) {
                return [{ from, to, label: edge.label }];
            } else if (to != null) {
                const other = edges.find((other) => other !== edge && other.to === edge.from);
                if (other == null) return [];

                progress = true;
                return [{ from: other.from, to, label: other.label }];
            } else {
                return [];
            }
        });

        if (!progress) {
            break;
        }
    }

    const result = {
        root,
        nodes,
        edges,
        groups: groups.groups
            .values()
            .map(
                (group): Group => ({
                    ...group,
                    nodes: new Set(
                        group.nodes
                            .values()
                            .map(replace)
                            .filter((node) => node != null),
                    ),
                }),
            )
            .filter((group) => group.nodes.size > 0)
            .toArray(),
    };

    return result;
};

export type CompileResult = ReturnType<typeof compile>;

export type Language = {
    name: string;
    editorExtensions: any[];
    init: () => Promise<ResolvedLanguage>;
};

export interface ResolvedLanguage {
    compile: (input: string, show: Show) => CompileResult | undefined;
}

export const treesitterLanguage = (language: {
    name: string;
    editorExtensions: any[];
    treesitterUrl: string;
    features: Feature[];
}): Language => {
    let parser: treesitter.Parser | undefined;
    return {
        name: language.name,
        editorExtensions: language.editorExtensions,
        init: async () => {
            if (!parser) {
                parser = new treesitter.Parser();
                parser.setLanguage(await treesitter.Language.load(language.treesitterUrl));
            }

            return {
                compile: (source, show) => {
                    if (parser == null) {
                        return;
                    }

                    const root = parser.parse(source)?.rootNode;
                    if (root == null) {
                        return undefined;
                    }

                    return compile(convertNode(root, { next: 0 }) as Node, language.features, show);
                },
            };
        },
    };
};

export const customLanguage = (language: { name: string; features: Feature[] }): Language => ({
    name: language.name,
    editorExtensions: [],
    init: async () => ({
        compile: (_source, show) => compile(undefined, language.features, show),
    }),
});
