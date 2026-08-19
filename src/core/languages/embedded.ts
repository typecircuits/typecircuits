import type { Language } from ".";
import { makeNode, type Node } from "../compiler";
import { ConcreteType, type Type } from "../solver";

export interface EmbedOptions {
    nodes: {
        id: string;
        span: {
            start: { index: number };
            end: { index: number };
            source: string;
        };
    }[];
    edges: {
        from: string;
        to: string;
        label: string;
    }[];
    groups: {
        nodes: string[];
        labels: {
            kind?: string;
            display: string;
        }[];
        conflict?: boolean;
    }[];
}

export const embeddedLanguage: Language<EmbedOptions> = {
    name: "JavaScript",
    parse: async (code) => JSON.parse(code),
    compile: async (options, compiler) => {
        const types = new Map<string, ConcreteType>();

        const getType = (kind: string | undefined, display: string) => {
            const key = display;

            if (types.has(key)) {
                return types.get(key)!;
            }

            const type = new (class extends ConcreteType {
                kind = kind;

                render(): string {
                    return display;
                }
            })();

            types.set(key, type);

            return type;
        };

        const nodes = new Map<string, Node>();
        for (const nodeOptions of options.nodes) {
            nodes.set(
                nodeOptions.id,
                makeNode({
                    id: nodeOptions.id,
                    type: "embedded",
                    code: nodeOptions.span.source,
                    pos: {
                        start: nodeOptions.span.start.index,
                        end: nodeOptions.span.end.index,
                    },
                    parent: undefined,
                    children: [],
                    fields: {},
                    strings: {},
                }),
            );
        }

        for (const edgeOptions of options.edges) {
            const from = nodes.get(edgeOptions.from)!;
            const to = nodes.get(edgeOptions.to)!;

            compiler.edge(from, to, edgeOptions.label);
        }

        for (const groupOptions of options.groups) {
            if (groupOptions.nodes.length === 0) {
                continue;
            }

            const [representative, ...others] = groupOptions.nodes.map((id) => nodes.get(id)!);

            for (const other of others) {
                compiler.solver.unifyAt(representative, [representative, other]);
            }

            for (const labelOptions of groupOptions.labels) {
                const type = getType(labelOptions.kind, labelOptions.display);
                compiler.solver.unifyAt(representative, [representative, type]);
            }
        }
    },
};
