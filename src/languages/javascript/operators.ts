import type { Node } from "@/compiler/lower/node";
import type { TypeConstraint } from "@/compiler/typecheck/solve";
import * as types from "./types";
import type { BuiltinConstraints } from "./builtins";

type OperatorConstraints = (left: Node, right: Node, result: Node) => BuiltinConstraints;

const mathOverload = (left: Node, right: Node, result: Node): TypeConstraint[] => [
    { node: left, type: types.number },
    { node: right, type: types.number },
    { node: result, type: types.number },
];

const comparisonTypes = (left: Node, right: Node, result: Node): TypeConstraint[] => [
    { node: left, type: types.number },
    { node: right, type: left },
    { node: result, type: types.boolean },
];

const logicOperatorTypes = (left: Node, right: Node, result: Node): TypeConstraint[] => [
    { node: left, type: types.boolean },
    { node: right, type: left },
    { node: result, type: left },
];

const equalityTypes = (left: Node, right: Node, result: Node): TypeConstraint[] => [
    { node: right, type: left },
    { node: result, type: types.boolean },
];

export const operators: Record<string, OperatorConstraints> = {
    "+": (left, right, result) => ({
        overloads: [
            mathOverload(left, right, result),
            [
                { node: left, type: types.string },
                { node: right, type: types.string },
                { node: result, type: types.string },
            ],
        ],
    }),
    "-": (left, right, result) => ({ overloads: [mathOverload(left, right, result)] }),
    "*": (left, right, result) => ({ overloads: [mathOverload(left, right, result)] }),
    "/": (left, right, result) => ({ overloads: [mathOverload(left, right, result)] }),
    "%": (left, right, result) => ({ overloads: [mathOverload(left, right, result)] }),
    "**": (left, right, result) => ({ overloads: [mathOverload(left, right, result)] }),
    "==": (left, right, result) => ({ types: equalityTypes(left, right, result) }),
    "!=": (left, right, result) => ({ types: equalityTypes(left, right, result) }),
    "===": (left, right, result) => ({ types: equalityTypes(left, right, result) }),
    "!==": (left, right, result) => ({ types: equalityTypes(left, right, result) }),
    "<": (left, right, result) => ({ types: comparisonTypes(left, right, result) }),
    "<=": (left, right, result) => ({ types: comparisonTypes(left, right, result) }),
    ">": (left, right, result) => ({ types: comparisonTypes(left, right, result) }),
    ">=": (left, right, result) => ({ types: comparisonTypes(left, right, result) }),
    "&&": (left, right, result) => ({ types: logicOperatorTypes(left, right, result) }),
    "||": (left, right, result) => ({ types: logicOperatorTypes(left, right, result) }),
};
