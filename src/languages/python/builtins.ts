import type { Node } from "@/compiler/lower/node";
import type { TypeConstraint } from "@/compiler/typecheck/solve";
import * as types from "./types";
import type { LowerContext } from "@/compiler/lower";

export interface BuiltinConstraints {
    types?: TypeConstraint[]; // must satisfy all constraints
    overloads?: TypeConstraint[][]; // must satisfy one candidate
}

const builtinFunctions: Record<string, (node: Node) => BuiltinConstraints> = {
    print: (node) => ({
        overloads: [
            [{ node, type: types.function([], types.none) }],
            [{ node, type: types.function([null], types.none) }],
        ],
    }),
    len: (node) => ({
        types: [{ node, type: types.function([null], types.int) }],
    }),
    randint: (node) => ({
        types: [{ node, type: types.function([], types.int) }],
    }),
    range: (node) => ({
        types: [{ node, type: types.function([types.int], types.list(types.int)) }],
    }),
    str: (node) => ({
        types: [{ node, type: types.str }],
    }),
    int: (node) => ({
        types: [{ node, type: types.int }],
    }),
    float: (node) => ({
        types: [{ node, type: types.float }],
    }),
    bool: (node) => ({
        types: [{ node, type: types.bool }],
    }),
};

export const tryBuiltin = (name: string, node: Node, ctx: LowerContext) => {
    if (!(name in builtinFunctions)) {
        return false;
    }

    const { types = [], overloads = [] } = builtinFunctions[name](node);

    for (const { node, type } of types) {
        ctx.typeConstraint(node, type);
    }

    if (overloads.length > 0) {
        ctx.overloadConstraint(overloads);
    }

    return true;
};
