import { expect } from "vitest";
import { makeCompiler, Node } from "./compiler";
import type { Language } from "./languages";

expect.addSnapshotSerializer({
    test: (value) => value instanceof Node,
    serialize: (node: Node) => `<${node.id}>`,
});

export const run = async <T>(language: Language<T>, code: string) => {
    const parsed = await language.parse(code);
    if (parsed == null) {
        expect.fail("failed to parse");
    }

    const compiler = makeCompiler({});
    await language.compile(parsed, compiler);
    const { nodes, edges, groups } = compiler.finish();

    expect({
        code,
        nodes: new Map(nodes.map((node) => [node, node.code])),
        edges,
        groups,
    }).toMatchSnapshot();
};
