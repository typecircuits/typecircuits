import * as treesitter from "web-tree-sitter";
import treeSitterWasmUrl from "web-tree-sitter/tree-sitter.wasm?url";
import { isConstructedType, type ConstructedType, type Type } from "./solver/type";
import { Solver, type Group } from "./solver/solve";
import type { Options } from "@/App.svelte";

await treesitter.Parser.init({ locateFile: () => treeSitterWasmUrl });

export class Node {
    public id?: string;
    public startIndex?: number;
    public endIndex?: number;
    public type!: string;
    public text!: string;
    public children!: Node[];
    public components!: (string | Node)[];
    public parent?: Node;
    public key?: string;

    constructor(options: { [K in keyof Node]: Node[K] }) {
        Object.assign(this, options);
    }

    toString() {
        return this.text.replace(/\n.*/s, " ⋯");
    }
}

const convertNode = (input: treesitter.Node | null | undefined): Node | undefined => {
    if (input == null || !input.isNamed) {
        return undefined;
    }

    const indices = new Map<Node, number>();

    const node = new Node({
        startIndex: input.startIndex,
        endIndex: input.endIndex,
        type: input.type,
        text: input.text,
        children: input.children
            .map((node, index) => [index, convertNode(node)] as const)
            .filter(([_, node]) => node != null)
            .map(([index, node]) => {
                indices.set(node!, index);
                return node!;
            }),
        components: input.children
            .filter((node) => node != null)
            .map((child) => convertNode(child) ?? child.text),
    });

    for (const child of node.children) {
        child.parent = node;

        const index = indices.get(child);
        if (index != null) {
            const fieldName = input.fieldNameForChild(index);
            child.key = fieldName ?? undefined;
        }
    }

    return node;
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

export type Selector<T> = (node: Node, callback: (value: T) => void) => void;

type SelectorValue<S> = S extends Selector<infer T> ? T : never;

export const node =
    <T = Node>(type: string | undefined, value?: (node: Node) => T | undefined): Selector<T> =>
    (node, callback) => {
        if (node.type === type) {
            const result = value != null ? value(node) : (node as T);

            if (result != null) {
                callback(result);
            }
        }
    };

export const event =
    <E extends string, T>(type: E, selector: Selector<T>): Selector<{ type: E; value: T }> =>
    (node, callback) => {
        selector(node, (value) => callback({ type, value }));
    };

export type Feature = (context: Context) => void;

export class Context {
    nodes = new Set<Node>();
    edges: Edge[] = [];
    replacements: Replacement[] = [];
    groups: Node[][] = [];
    conflicts: Node[] = [];
    types: [Node, ConstructedType][] = [];
    overloads: [Node, Type][][][] = [];

    constructor(
        public root: Node | undefined,
        public options: Options,
    ) {
        this.select([], () => {}); // populate `nodes`
    }

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
        for (const child of node.children) {
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
        const node = new Node({ type: "", text: "", children: [], components: [] });
        this.transparent(node);
        return node;
    }

    select<S extends Selector<any>>(selectors: S[], callback: (value: SelectorValue<S>) => void) {
        const visit = (node: Node | undefined) => {
            if (node == null) return;

            this.nodes.add(node);

            for (const selector of selectors) {
                selector(node, callback);
            }

            for (const child of node.children) {
                visit(child);
            }
        };

        visit(this.root);
    }

    hasChild(parent: Node, child: Node): boolean {
        if (parent === child) {
            return true;
        }

        for (const c of parent.children) {
            if (this.hasChild(c, child)) {
                return true;
            }
        }

        return false;
    }
}

const compile = (root: Node | undefined, features: Feature[], options: Options) => {
    const context = new Context(root, options);

    for (const feature of features) {
        feature(context);
    }

    const replace = (node: Node | undefined) => {
        for (const replacement of context.replacements) {
            if (replacement.from === node) {
                node = replacement.to;
            }
        }

        return node;
    };

    const solver = new Solver(context);

    const groups = solver.run();

    if (!options.showFunctions) {
        for (const group of groups.groups.values()) {
            const hasFunctionType = group.types.some(
                (type) => isConstructedType(type) && type.tag === "function",
            );

            if (hasFunctionType) {
                for (const node of group.nodes) {
                    context.transparent(node);
                }
            }
        }
    }

    const result = {
        nodes: new Set(
            context.nodes
                .values()
                .map(replace)
                .filter((node) => node != null),
        ),
        edges: context.edges
            .map((edge) => {
                const from = replace(edge.from);
                const to = replace(edge.to);

                if (from == null || to == null) {
                    return undefined;
                }

                return { from, to, label: edge.label };
            })
            .filter((edge) => edge != null),
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
    compile: (input: string, options: Options) => CompileResult | undefined;
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
                compile: (source, options) => {
                    if (parser == null) {
                        return;
                    }

                    const root = parser.parse(source)?.rootNode;
                    if (root == null) {
                        return undefined;
                    }

                    return compile(convertNode(root), language.features, options);
                },
            };
        },
    };
};

export const customLanguage = (language: { name: string; features: Feature[] }): Language => ({
    name: language.name,
    editorExtensions: [],
    init: async () => ({
        compile: (_source, options) => compile(undefined, language.features, options),
    }),
});
