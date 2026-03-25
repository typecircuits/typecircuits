import * as ts from "web-tree-sitter";
import treeSitterWasmUrl from "web-tree-sitter/tree-sitter.wasm?url";
import { Node, type Parse } from "./lower/node";
import { LowerContext } from "./lower";
import type { Edge, CompilerOutput } from "./lower";
import type { Span } from "./lower/span";
import { type Group, Groups } from "./typecheck/solve";
import { type Type, displayType } from "./typecheck/type";

await ts.Parser.init({ locateFile: () => treeSitterWasmUrl });

export type Compiler = (source: string, options: Record<string, boolean>) => CompilerOutput;

export const compiler = async (
    treeSitterUrl: string,
    defaultOptions: Record<string, boolean>,
    rules: Record<string, typeof Node>,
): Promise<Compiler> => {
    const parser = new ts.Parser();
    parser.setLanguage(await ts.Language.load(treeSitterUrl));

    return (source, options) => {
        for (const key in defaultOptions) {
            options[key] ??= defaultOptions[key];
        }

        const ctx = new LowerContext(options);

        const cursor = parser.parse(source);
        if (cursor == null) {
            return ctx.finish();
        }

        const parse: Parse = (syntaxNode) => {
            if (syntaxNode == null) {
                return [];
            } else if (Array.isArray(syntaxNode)) {
                return syntaxNode.flatMap(parse);
            } else if (syntaxNode.type in rules) {
                const node = new (rules[syntaxNode.type] as any)(syntaxNode, parse);
                return [node];
            } else {
                // Pass through
                return parse(syntaxNode.namedChildren);
            }
        };

        const file = parse(cursor.rootNode);
        for (const statement of file) {
            ctx.lower(statement);
        }

        return ctx.finish();
    };
};

export {
    Node,
    type Span,
    type Edge,
    type Group,
    Groups,
    type Type,
    displayType,
    type CompilerOutput,
};
