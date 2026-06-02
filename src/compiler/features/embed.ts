import * as compiler from "@/compiler";

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
        labels: string[];
        conflict?: boolean;
    }[];
}

export const embed =
    (options: EmbedOptions): compiler.Feature =>
    (context) => {
        const nodes = new Map<string, compiler.Node>();
        for (const node of options.nodes) {
            nodes.set(
                node.id,
                new compiler.Node({
                    id: node.id,
                    type: "embedded",
                    text: node.span.source,
                    startIndex: node.span.start.index,
                    endIndex: node.span.end.index,
                    children: [],
                    components: [],
                }),
            );
        }

        context.nodes = new Set(nodes.values());

        for (const edge of options.edges) {
            context.edge(nodes.get(edge.from)!, nodes.get(edge.to)!, edge.label);
        }

        for (const group of options.groups) {
            if (group.nodes.length === 0) {
                continue;
            }

            const representative = nodes.get(group.nodes[0])!;

            context.group(...group.nodes.map((id) => nodes.get(id)!));
            for (const type of group.labels) {
                context.type(representative, {
                    tag: type,
                    children: [],
                    display: () => type,
                });
            }

            if (group.conflict) {
                context.conflict(representative);
            }
        }
    };
