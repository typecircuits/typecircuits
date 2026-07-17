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
        labels: {
            kind?: string;
            display: string;
        }[];
        conflict?: boolean;
    }[];
}

export const embed =
    (options: EmbedOptions): compiler.Feature =>
    (context) => {
        const nodes = new Map<string, compiler.Node>();
        for (const entry of options.nodes) {
            const node = new compiler.Node();
            node.id = entry.id;
            node.type = "embedded";
            node.text = entry.span.source;
            node.startIndex = entry.span.start.index;
            node.endIndex = entry.span.end.index;

            nodes.set(entry.id, node);
        }

        for (const edge of options.edges) {
            context.edge(nodes.get(edge.from)!, nodes.get(edge.to)!, edge.label);
        }

        for (const group of options.groups) {
            if (group.nodes.length === 0) {
                continue;
            }

            const representative = nodes.get(group.nodes[0])!;

            context.group(...group.nodes.map((id) => nodes.get(id)!));
            for (const { kind, display } of group.labels) {
                context.type(representative, {
                    tag: display,
                    kind,
                    children: [],
                    display: () => display,
                });
            }

            if (group.conflict) {
                context.conflict(representative);
            }
        }
    };
