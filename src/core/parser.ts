import * as treesitter from "web-tree-sitter";
import treeSitterWasmUrl from "web-tree-sitter/web-tree-sitter.wasm?url";
import { makeNode, type Node } from "./compiler";
import { Mutex } from "async-mutex";

await treesitter.Parser.init({ locateFile: () => treeSitterWasmUrl });

export const languageLoader = (wasmUrl: string) => {
    if (import.meta.env.VITEST) {
        wasmUrl = "." + wasmUrl;
    }

    const mutex = new Mutex();
    let cached: treesitter.Language | undefined;

    return () =>
        mutex.runExclusive(async () => {
            if (cached == null) {
                cached = await treesitter.Language.load(wasmUrl);
            }

            return cached!;
        });
};

export interface Parser {
    root: Node;
    traverse: (node: Node, types: Record<string, (node: Node) => void>) => void;
    nodes: Iterable<Node>;
    ast: () => string;
}

export const parse = (code: string, language: treesitter.Language): Parser | undefined => {
    const treesitterParser = new treesitter.Parser();
    treesitterParser.setLanguage(language);

    const tree = treesitterParser.parse(code);
    if (tree == null) {
        return undefined;
    }

    const nodes = new Map<treesitter.Node, Node>();

    const nodeFromTreesitter = (treesitterNode: treesitter.Node) => {
        if (nodes.has(treesitterNode)) {
            return nodes.get(treesitterNode)!;
        }

        const node = makeNode({
            id: `node${nodes.size}`,
            type: treesitterNode.type,
            code: treesitterNode.text,
            pos: { start: treesitterNode.startIndex, end: treesitterNode.endIndex },
            parent: undefined,
            children: [],
            fields: {},
            strings: {},
        });

        nodes.set(treesitterNode, node);

        treesitterNode.children.forEach((child, index) => {
            let childNode: Node | undefined;
            if (child.isNamed) {
                childNode = nodeFromTreesitter(child);
                childNode.parent = node;

                node.children.push(childNode);
            }

            const fieldName = treesitterNode.fieldNameForChild(index);
            if (fieldName != null) {
                if (childNode != null) {
                    node.fields[fieldName] = childNode;
                } else {
                    node.strings[fieldName] = child.text;
                }
            }
        });

        return node;
    };

    const ast = (node: Node, indent = 0) => {
        const prefix = "  ".repeat(indent + 1);

        let s = `(${node.type}) ${node.toString()}`;

        const visited = new Set<Node>();
        for (const [field, child] of Object.entries(node.fields)) {
            visited.add(child);
            s += "\n" + prefix + `${field}: ${ast(child, indent + 1)}`;
        }

        for (const child of node.children) {
            if (visited.has(child)) {
                continue;
            }

            s += "\n" + prefix + ast(child, indent + 1);
        }

        return s;
    };

    const root = nodeFromTreesitter(tree.rootNode);

    return {
        root,
        traverse: (node, types) => {
            const visit = (node: Node) => {
                if (node.type in types) {
                    try {
                        types[node.type](node);
                    } catch (error) {
                        console.error(error);
                    }
                }

                for (const childNode of node.children) {
                    visit(childNode);
                }
            };

            visit(node);
        },
        get nodes() {
            return nodes.values().toArray();
        },
        ast: () => ast(root),
    };
};
