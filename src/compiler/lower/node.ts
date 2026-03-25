import type * as ts from "web-tree-sitter";
import type { LowerContext } from "./index";
import { span, type Span } from "./span";

export type NodeDisplay = "hidden" | "untyped" | undefined;
export type Parse = (syntaxNode: ts.Node | null | (ts.Node | null)[]) => Node[];

export abstract class Node {
    id?: string;
    span: Span;

    constructor(syntaxNode: ts.Node, parse: Parse, getSpan = span) {
        this.span = getSpan(syntaxNode);
    }

    abstract lower(ctx: LowerContext): Node | void;

    display?: NodeDisplay;
}
