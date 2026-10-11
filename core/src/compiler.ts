import { makeSolver, type Solver } from "./solver";

export class Node {
    toString(): string {
        return this.code.replace(/\n.*/s, " ⋯");
    }
}

export interface Node {
    id: string;
    type: string;
    code: string;
    pos: { start: number; end: number };
    parent: Node | undefined;
    children: Node[];
    fields: Record<string, Node>;
    strings: Record<string, string>;
}

export const makeNode = (options: Omit<Node, "constructor">): Node => {
    const node = new Node();
    Object.assign(node, options);
    return node;
};

export const compareNodes = (a: Node, b: Node): number => {
    if (a.pos.start !== b.pos.start) {
        return a.pos.start - b.pos.start;
    }

    return a.pos.end - b.pos.end;
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

export interface CompilerOptions {
    show?: Record<string, boolean>;
}

export interface CompileResult {
    ast?: () => string;
    nodes: Node[];
    displayNodes: Node[];
    edges: Edge[];
    groups: CompiledGroup[];
}

export interface CompiledGroup {
    nodes: Node[];
    displayNodes: Node[];
    types: string[];
    conflict: boolean;
}

export interface Compiler {
    readonly options: CompilerOptions;
    ast?: () => string;
    readonly edges: Edge[];
    readonly replacements: Replacement[];
    temporaryAt: (representative: Node) => Node;
    edge: (from: Node, to: Node, label: string) => void;
    replaceAt: (representative: Node, from: Node, to: Node | undefined) => void;
    show: (node: Node, kind: string) => void;
    readonly solver: Solver;
    finish: () => CompileResult;
}

export const makeCompiler = (options: CompilerOptions): Compiler => {
    let ast: (() => string) | undefined = undefined;
    const edges: Edge[] = [];
    const replacements: Replacement[] = [];

    const solver = makeSolver();

    let nextTemporaryId = 0;

    return {
        get options() {
            return options;
        },
        get ast() {
            return ast;
        },
        set ast(newValue) {
            ast = newValue;
        },
        get edges() {
            return edges;
        },
        get replacements() {
            return replacements;
        },
        temporaryAt: (representative) => {
            const node = makeNode({
                id: `temporary${nextTemporaryId++}`,
                type: "temporary",
                code: "",
                pos: representative.pos,
                parent: undefined,
                children: [],
                fields: {},
                strings: {},
            });

            replacements.push({ from: node, to: undefined });

            return node;
        },
        edge: (from, to, label) => {
            edges.push({ from, to, label });
        },
        replaceAt: (representative, from, to) => {
            replacements.push({ from, to });

            if (to != null) {
                solver.unifyAt(representative, [from, to]);
            }
        },
        show: (node, kind) => {
            if (!options.show?.[kind]) {
                replacements.push({ from: node, to: undefined });
            }
        },
        solver,
        finish: () => {
            solver.run();

            if (!options.show?.functions) {
                for (const group of solver.groups) {
                    const hasFunctionType = group.types.some((type) => type.kind === "function");

                    if (hasFunctionType) {
                        for (const node of group.nodes) {
                            replacements.push({ from: node, to: undefined });
                        }
                    }
                }
            }

            const replaceNode = (node: Node | undefined) => {
                const trace = node != null ? [node] : [];

                const seen = new Set();
                while (!seen.has(node)) {
                    seen.add(node);

                    let progress = false;

                    for (const replacement of replacements) {
                        if (replacement.from === node && replacement.to !== replacement.from) {
                            node = replacement.to;
                            if (node != null) {
                                trace.push(node);
                            }

                            progress = true;
                        }
                    }

                    if (!progress) {
                        break;
                    }
                }

                return { node, trace: node != null ? trace : [] };
            };

            const splitNodes = (input: Node[]) => {
                const nodes = new Set<Node>();
                const displayNodes = new Set<Node>();

                for (const node of input) {
                    const replacement = replaceNode(node);

                    for (const node of replacement.trace) {
                        nodes.add(node);
                    }

                    if (replacement.node != null) {
                        displayNodes.add(replacement.node);
                    }
                }

                const sortedNodes = [...nodes];
                sortedNodes.sort(compareNodes);

                const sortedDisplayNodes = [...displayNodes];
                sortedDisplayNodes.sort(compareNodes);

                return { nodes: sortedNodes, displayNodes: sortedDisplayNodes };
            };

            const { nodes, displayNodes } = splitNodes(solver.nodes);

            // Collapse edges
            let collapsedEdges = [...edges];
            while (true) {
                let progress = false;
                collapsedEdges = collapsedEdges.flatMap((edge) => {
                    const from = replaceNode(edge.from).node;
                    const to = replaceNode(edge.to).node;

                    if (from != null && to != null) {
                        return [{ from, to, label: edge.label }];
                    } else if (to != null) {
                        const other = collapsedEdges.find(
                            (other) => other !== edge && other.to === edge.from,
                        );
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

            return {
                ast,
                nodes,
                displayNodes,
                edges: collapsedEdges,
                groups: solver.groups
                    .map((group) => {
                        const { nodes, displayNodes } = splitNodes(group.nodes);

                        const types = group.types.map((type) => solver.renderType(type));

                        if (types.length === 0) {
                            types.push("_");
                        }

                        return {
                            nodes: [...nodes],
                            displayNodes: [...displayNodes],
                            types,
                            conflict: types.length > 1,
                        };
                    })
                    .filter((group) => group.nodes.length > 0),
            };
        },
    };
};
