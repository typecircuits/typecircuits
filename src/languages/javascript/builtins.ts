import type { Node } from "@/compiler/lower/node";
import type { TypeConstraint } from "@/compiler/typecheck/solve";
import * as types from "./types";
import type { LowerContext } from "@/compiler/lower";

export interface BuiltinConstraints {
    types?: TypeConstraint[]; // must satisfy all constraints
    overloads?: TypeConstraint[][]; // must satisfy one candidate
}

const builtinFunctions: Record<string, (node: Node) => BuiltinConstraints> = {
    "console.log": (node) => ({
        overloads: [
            [{ node, type: types.function([], types.void) }],
            [{ node, type: types.function([null], types.void) }],
        ],
    }),
    "Math.random": (node) => ({
        types: [{ node, type: types.function([], types.number) }],
    }),
    String: (node) => ({
        types: [{ node, type: types.function([types.string], types.string) }],
    }),
    Number: (node) => ({
        types: [{ node, type: types.function([types.number], types.number) }],
    }),
    Boolean: (node) => ({
        types: [{ node, type: types.function([types.boolean], types.boolean) }],
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
