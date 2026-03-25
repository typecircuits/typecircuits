import type * as ts from "web-tree-sitter";

export interface Span {
    source: string;
    start: Location;
    end: Location;
}

export interface Location {
    index: number;
    line: number;
    column: number;
}

export const span = (syntaxNode: ts.Node): Span => {
    let nodeSource = syntaxNode.text;
    const lineBreakIndex = nodeSource.indexOf("\n");
    if (lineBreakIndex !== -1) {
        nodeSource = nodeSource.slice(0, lineBreakIndex);

        if (nodeSource.endsWith("{")) {
            nodeSource = nodeSource + "⋯}";
        } else {
            nodeSource += "⋯";
        }
    }

    return {
        source: nodeSource,
        start: {
            index: syntaxNode.startIndex,
            line: syntaxNode.startPosition.row + 1,
            column: syntaxNode.startPosition.column + 1,
        },
        end: {
            index: syntaxNode.endIndex,
            line: syntaxNode.endPosition.row + 1,
            column: syntaxNode.endPosition.column + 1,
        },
    };
};
