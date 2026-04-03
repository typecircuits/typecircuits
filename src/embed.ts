import * as compiler from "@/compiler";

class EmbedNode extends compiler.Node {
    constructor(span: compiler.Span) {
        super(undefined as any, undefined as any, () => span);
    }

    lower() {}
}

export const parseEmbed = (data: any): compiler.CompilerOutput => {
    const nodes = Object.fromEntries<compiler.Node>(
        data.nodes.map((node: any) => {
            const embedNode = new EmbedNode(node.span);
            embedNode.id = node.id;
            return [node.id, embedNode];
        }),
    );

    return {
        nodes: Object.values(nodes),
        edges: (data.edges as any[]).map((edge) => ({
            from: nodes[edge.from],
            to: nodes[edge.to],
            label: edge.label,
        })),
        groups: new compiler.Groups(
            new Map(
                (data.groups as any[]).map((group): [compiler.Node, compiler.Group] => [
                    nodes[group.nodes[0]],
                    {
                        nodes: new Set((group.nodes as any[]).map((id: any) => nodes[id])),
                        types: (group.labels as any[]).map(
                            (label: any): compiler.Type => ({
                                tag: "embed",
                                children: [],
                                display: () => label,
                                isFunction: label.includes("->"),
                            }),
                        ),
                    },
                ]),
            ),
        ),
    };
};
